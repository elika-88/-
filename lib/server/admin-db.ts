import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import type { Client, Transaction } from '@libsql/client';
import { AdminSettingsSchema, type AdminSettings } from '../admin-schema';
import { withDatabase } from './database';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const passwordHash = () => hash(process.env.ADMIN_PASSWORD!);
const MFA_PERIOD = 30;
const ENROLLMENT_DURATION = 5 * 60_000;

function encryptionKey() {
  const key = process.env.ADMIN_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error('Admin encryption key is not configured.');
  return Buffer.from(key, 'hex');
}

export function adminReady() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 6 && /^[a-f0-9]{64}$/i.test(process.env.ADMIN_ENCRYPTION_KEY ?? ''));
}

export function adminSetupIssue() {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_ENCRYPTION_KEY) return 'Run npm run admin:setup on the server, then restart the app.';
  if (process.env.ADMIN_PASSWORD.length < 6) return 'Administrator password must contain at least 6 characters. Update it on the server, then restart.';
  if (!/^[a-f0-9]{64}$/i.test(process.env.ADMIN_ENCRYPTION_KEY)) return 'The server encryption key is invalid. Restore the original key before restarting.';
  return null;
}

export async function withAdminDb<T>(action: (db: Client) => Promise<T>): Promise<T> {
  return withDatabase(async (db) => {
    await db.batch([
      'CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), encrypted TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, password_hash TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, event TEXT NOT NULL, created_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS login_limit (id INTEGER PRIMARY KEY CHECK(id=1), attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS admin_mfa (id INTEGER PRIMARY KEY CHECK(id=1), encrypted_secret TEXT NOT NULL, last_counter INTEGER NOT NULL, created_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS admin_enrollment (token_hash TEXT PRIMARY KEY, encrypted_secret TEXT NOT NULL, expires_at INTEGER NOT NULL, password_hash TEXT NOT NULL)',
    ], 'write');
    return action(db);
  });
}

function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
}

function decrypt(value: string): unknown {
  const record = JSON.parse(value);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]).toString('utf8'));
}

function readSecret(encrypted: string) {
  const value = decrypt(encrypted);
  if (typeof value !== 'string' || !/^[A-Z2-7]+$/.test(value)) throw new Error('Invalid encrypted authenticator configuration.');
  return value;
}

export async function readStoredSettings(): Promise<{ settings: AdminSettings; revision: number; updatedAt: number } | null> {
  if (!process.env.ADMIN_ENCRYPTION_KEY) return null;
  return withAdminDb(async (db) => {
    const row = (await db.execute('SELECT encrypted,revision,updated_at FROM settings WHERE id=1')).rows[0];
    return row ? { settings: AdminSettingsSchema.parse(decrypt(String(row.encrypted))), revision: Number(row.revision), updatedAt: Number(row.updated_at) } : null;
  });
}

async function writeTransaction<T>(db: Client, action: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = await db.transaction('write');
  try { const result = await action(tx); await tx.commit(); return result; }
  catch (error) { if (!tx.closed) await tx.rollback(); throw error; }
  finally { tx.close(); }
}

export async function saveStoredSettings(settings: AdminSettings, revision: number) {
  const encrypted = encrypt(AdminSettingsSchema.parse(settings));
  return withAdminDb((db) => writeTransaction(db, async (tx) => {
    const current = (await tx.execute('SELECT revision FROM settings WHERE id=1')).rows[0];
    if (Number(current?.revision ?? 0) !== revision) throw new Error('CONFLICT');
    await tx.execute({ sql: 'INSERT INTO settings VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted,revision=excluded.revision,updated_at=excluded.updated_at', args: [encrypted, revision + 1, Date.now()] });
    await tx.execute({ sql: 'INSERT INTO audit(event,created_at) VALUES(?,?)', args: ['settings_updated', Date.now()] });
    return revision + 1;
  }));
}

export function adminTotp(secret: string) {
  return new TOTP({ issuer: 'Lumina', label: 'admin', algorithm: 'SHA1', digits: 6, period: MFA_PERIOD, secret: Secret.fromBase32(secret) });
}

function validCounter(secret: string, code: string, now: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = adminTotp(secret).validate({ token: code, timestamp: now, window: 1 });
  return delta === null ? null : Math.floor(now / (MFA_PERIOD * 1000)) + delta;
}

async function consumeAttempt(tx: Transaction, now: number) {
  const row = (await tx.execute('SELECT attempts,reset_at FROM login_limit WHERE id=1')).rows[0];
  const active = row && Number(row.reset_at) > now;
  if (active && Number(row.attempts) >= 10) return false;
  await tx.execute({ sql: 'INSERT INTO login_limit VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,reset_at=excluded.reset_at', args: [active ? Number(row.attempts) + 1 : 1, active ? Number(row.reset_at) : now + 300_000] });
  return true;
}

const sessionBinding = (secret: string) => hash(`${passwordHash()}:${secret}`);

async function issueSession(tx: Transaction, secret: string, now: number) {
  const token = randomBytes(32).toString('hex');
  await tx.execute({ sql: 'DELETE FROM sessions WHERE expires_at <= ?', args: [now] });
  await tx.execute({ sql: 'INSERT INTO sessions VALUES(?,?,?)', args: [hash(token), now + 8 * 3600_000, sessionBinding(secret)] });
  await tx.execute('DELETE FROM login_limit');
  await tx.execute({ sql: 'INSERT INTO audit(event,created_at) VALUES(?,?)', args: ['login', now] });
  return { token };
}

export type AdminLoginResult = { token: string } | { enrollment: { secret: string; uri: string }; enrollmentToken: string } | { error: 'INVALID' | 'LIMITED' | 'UNCONFIGURED' | 'MFA_REQUIRED' | 'INVALID_CODE' | 'ENROLLMENT_EXPIRED' };

export async function loginAdmin(password: string, code = ''): Promise<AdminLoginResult> {
  if (!adminReady()) return { error: 'UNCONFIGURED' };
  return withAdminDb((db) => writeTransaction(db, async (tx): Promise<AdminLoginResult> => {
    const now = Date.now();
    if (!await consumeAttempt(tx, now)) return { error: 'LIMITED' };
    if (!timingSafeEqual(Buffer.from(hash(password)), Buffer.from(passwordHash()))) return { error: 'INVALID' };
    const mfa = (await tx.execute('SELECT encrypted_secret,last_counter FROM admin_mfa WHERE id=1')).rows[0];
    if (!mfa) {
      const secret = new Secret({ size: 20 }).base32;
      const enrollmentToken = randomBytes(32).toString('hex');
      await tx.execute({ sql: 'DELETE FROM admin_enrollment WHERE expires_at <= ?', args: [now] });
      await tx.execute({ sql: 'INSERT INTO admin_enrollment VALUES(?,?,?,?)', args: [hash(enrollmentToken), encrypt(secret), now + ENROLLMENT_DURATION, passwordHash()] });
      return { enrollment: { secret, uri: adminTotp(secret).toString() }, enrollmentToken };
    }
    if (!code) return { error: 'MFA_REQUIRED' };
    const secret = readSecret(String(mfa.encrypted_secret));
    const counter = validCounter(secret, code, now);
    if (counter === null || counter <= Number(mfa.last_counter)) return { error: 'INVALID_CODE' };
    await tx.execute({ sql: 'UPDATE admin_mfa SET last_counter=? WHERE id=1', args: [counter] });
    return issueSession(tx, secret, now);
  }));
}

export async function confirmAdminTotp(enrollmentToken: string, code: string): Promise<AdminLoginResult> {
  if (!adminReady()) return { error: 'UNCONFIGURED' };
  return withAdminDb((db) => writeTransaction(db, async (tx): Promise<AdminLoginResult> => {
    const now = Date.now();
    if (!await consumeAttempt(tx, now)) return { error: 'LIMITED' };
    if (!/^[a-f0-9]{64}$/.test(enrollmentToken)) return { error: 'ENROLLMENT_EXPIRED' };
    const pending = (await tx.execute({ sql: 'SELECT encrypted_secret FROM admin_enrollment WHERE token_hash=? AND expires_at>? AND password_hash=?', args: [hash(enrollmentToken), now, passwordHash()] })).rows[0];
    const existing = (await tx.execute('SELECT id FROM admin_mfa WHERE id=1')).rows[0];
    if (!pending || existing) return { error: 'ENROLLMENT_EXPIRED' };
    const secret = readSecret(String(pending.encrypted_secret));
    const counter = validCounter(secret, code, now);
    if (counter === null) return { error: 'INVALID_CODE' };
    await tx.execute({ sql: 'INSERT INTO admin_mfa VALUES(1,?,?,?)', args: [String(pending.encrypted_secret), counter, now] });
    await tx.execute('DELETE FROM admin_enrollment');
    await tx.execute('DELETE FROM sessions');
    await tx.execute({ sql: 'INSERT INTO audit(event,created_at) VALUES(?,?)', args: ['authenticator_enrolled', now] });
    return issueSession(tx, secret, now);
  }));
}

export async function adminTotpEnabled() {
  if (!adminReady()) return false;
  return withAdminDb(async (db) => Boolean((await db.execute('SELECT id FROM admin_mfa WHERE id=1')).rows[0]));
}

export async function validAdminSession(token: string) {
  if (!adminReady() || !/^[a-f0-9]{64}$/.test(token)) return false;
  return withAdminDb(async (db) => {
    const mfa = (await db.execute('SELECT encrypted_secret FROM admin_mfa WHERE id=1')).rows[0];
    if (!mfa) return false;
    const binding = sessionBinding(readSecret(String(mfa.encrypted_secret)));
    return Boolean((await db.execute({ sql: 'SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>? AND password_hash=?', args: [hash(token), Date.now(), binding] })).rows[0]);
  });
}

export async function logoutAdmin(token: string) {
  await withAdminDb(async (db) => { await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash=?', args: [hash(token)] }); });
}
