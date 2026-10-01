import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Client, Transaction } from '@libsql/client';
import { AdminSettingsSchema, type AdminSettings } from '../admin-schema';
import { withDatabase } from './database';
import { databaseSetupIssue } from './database';
import { ADMIN_IDLE_MS, ADMIN_LOGIN_ATTEMPTS, ADMIN_LOGIN_WINDOW_MS, ADMIN_SESSION_SECONDS } from './admin-request';
import { matchingTotpStep, newTotpSecret } from './admin-totp';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
// A database dump must not contain an unkeyed hash usable to guess the password.
const passwordHash = () => `v2:${createHmac('sha256', encryptionKey()).update(process.env.ADMIN_PASSWORD!).digest('hex')}`;
const passwordMatches = (value: string) => timingSafeEqual(Buffer.from(hash(value)), Buffer.from(hash(process.env.ADMIN_PASSWORD!)));

function encryptionKey() {
  const key = process.env.ADMIN_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error('Admin encryption key is not configured.');
  return Buffer.from(key, 'hex');
}

export function adminReady() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length >= 15 && process.env.ADMIN_PASSWORD.length <= 1024 && /^[a-f0-9]{64}$/i.test(process.env.ADMIN_ENCRYPTION_KEY ?? '') && !databaseSetupIssue());
}

export function adminSetupIssue() {
  const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_ENCRYPTION_KEY) return isVercel ? 'Set ADMIN_PASSWORD and ADMIN_ENCRYPTION_KEY in Vercel, then redeploy.' : 'Run npm run admin:setup on the server, then restart the app.';
  if (process.env.ADMIN_PASSWORD.trim().length < 15 || process.env.ADMIN_PASSWORD.length > 1024) return 'Administrator password must contain 15–1024 characters. Update it on the server, then restart.';
  if (!/^[a-f0-9]{64}$/i.test(process.env.ADMIN_ENCRYPTION_KEY)) return 'The server encryption key is invalid. Restore the original key before restarting.';
  if (databaseSetupIssue()) return databaseSetupIssue();
  return null;
}

export async function withAdminDb<T>(action: (db: Client) => Promise<T>): Promise<T> {
  return withDatabase(async (db) => {
    await db.batch([
      'CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), encrypted TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, password_hash TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, event TEXT NOT NULL, created_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS login_limit (id INTEGER PRIMARY KEY CHECK(id=1), attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS admin_session_activity (token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE, last_seen_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS admin_totp (id INTEGER PRIMARY KEY CHECK(id=1), encrypted TEXT NOT NULL, last_used_step INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS admin_totp_pending (token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE, encrypted TEXT NOT NULL, expires_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS admin_recovery_codes (code_hash TEXT PRIMARY KEY)',
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

async function consumeAttempt(tx: Transaction, now: number) {
  const row = (await tx.execute('SELECT attempts,reset_at FROM login_limit WHERE id=1')).rows[0];
  const active = row && Number(row.reset_at) > now;
  if (active && Number(row.attempts) >= ADMIN_LOGIN_ATTEMPTS) return false;
  await tx.execute({ sql: 'INSERT INTO login_limit VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,reset_at=excluded.reset_at', args: [active ? Number(row.attempts) + 1 : 1, active ? Number(row.reset_at) : now + ADMIN_LOGIN_WINDOW_MS] });
  return true;
}

async function issueSession(tx: Transaction, now: number) {
  const token = randomBytes(32).toString('hex');
  await tx.execute({ sql: 'DELETE FROM sessions WHERE expires_at <= ? OR password_hash <> ?', args: [now, passwordHash()] });
  await tx.execute({ sql: 'INSERT INTO sessions VALUES(?,?,?)', args: [hash(token), now + ADMIN_SESSION_SECONDS * 1000, passwordHash()] });
  await tx.execute({ sql: 'INSERT INTO admin_session_activity VALUES(?,?)', args: [hash(token), now] });
  await tx.execute('DELETE FROM login_limit');
  await tx.execute({ sql: 'INSERT INTO audit(event,created_at) VALUES(?,?)', args: ['login', now] });
  return { token };
}

export type AdminLoginResult = { token: string } | { error: 'INVALID' | 'LIMITED' | 'UNCONFIGURED' };

export async function loginAdmin(password: string, code = ''): Promise<AdminLoginResult> {
  if (!adminReady()) return { error: 'UNCONFIGURED' };
  return withAdminDb((db) => writeTransaction(db, async (tx): Promise<AdminLoginResult> => {
    const now = Date.now();
    if (!await consumeAttempt(tx, now)) return { error: 'LIMITED' };
    const mfa = (await tx.execute('SELECT encrypted,last_used_step FROM admin_totp WHERE id=1')).rows[0];
    if (!passwordMatches(password)) {
      await tx.execute({ sql: 'INSERT INTO audit(event,created_at) VALUES(?,?)', args: ['login_failed', now] });
      return { error: 'INVALID' };
    }
    if (mfa) {
      const step = matchingTotpStep(String(decrypt(String(mfa.encrypted))), code, now, Number(mfa.last_used_step));
      if (step !== null) await tx.execute({ sql: 'UPDATE admin_totp SET last_used_step=? WHERE id=1', args: [step] });
      else {
        const recovery = /^[a-f0-9]{24}$/.test(code)
          ? await tx.execute({ sql: 'DELETE FROM admin_recovery_codes WHERE code_hash=? RETURNING code_hash', args: [hash(code)] }) : null;
        if (!recovery?.rows.length) {
          await tx.execute({ sql: 'INSERT INTO audit(event,created_at) VALUES(?,?)', args: ['login_failed', now] });
          return { error: 'INVALID' };
        }
        await tx.execute({ sql: 'INSERT INTO audit(event,created_at) VALUES(?,?)', args: ['recovery_code_used', now] });
      }
    }
    return issueSession(tx, now);
  }));
}

export async function validAdminSession(token: string) {
  if (!adminReady() || !/^[a-f0-9]{64}$/.test(token)) return false;
  return withAdminDb(async (db) => {
    const now = Date.now();
    // Atomically check both deadlines before touching activity. Expired sessions cannot revive.
    return Boolean((await db.execute({ sql: `UPDATE admin_session_activity SET last_seen_at=?
      WHERE token_hash=? AND last_seen_at>? AND EXISTS
      (SELECT 1 FROM sessions WHERE sessions.token_hash=admin_session_activity.token_hash AND expires_at>? AND password_hash=?)
      RETURNING token_hash`, args: [now, hash(token), now - ADMIN_IDLE_MS, now, passwordHash()] })).rows[0]);
  });
}

export async function adminMfaEnabled() {
  if (!adminReady()) return false;
  return withAdminDb(async db => Boolean((await db.execute('SELECT id FROM admin_totp WHERE id=1')).rows[0]));
}

async function enrollmentSession(tx: Transaction, token: string, now: number) {
  return Boolean((await tx.execute({ sql: `SELECT s.token_hash FROM sessions s JOIN admin_session_activity a ON a.token_hash=s.token_hash
    WHERE s.token_hash=? AND s.expires_at>? AND s.password_hash=? AND a.last_seen_at>?`,
  args: [hash(token), now, passwordHash(), now - ADMIN_IDLE_MS] })).rows[0]);
}

export async function beginAdminMfa(token: string, password: string) {
  if (!adminReady()) return { error: 'UNCONFIGURED' as const };
  return withAdminDb(db => writeTransaction(db, async tx => {
    const now = Date.now();
    if (!await enrollmentSession(tx, token, now)) return { error: 'INVALID' as const };
    if (!await consumeAttempt(tx, now)) return { error: 'LIMITED' as const };
    if (!passwordMatches(password)) return { error: 'INVALID' as const };
    if ((await tx.execute('SELECT id FROM admin_totp WHERE id=1')).rows.length) return { error: 'ALREADY_ENABLED' as const };
    const secret = newTotpSecret();
    await tx.execute({ sql: 'DELETE FROM admin_totp_pending WHERE expires_at<=?', args: [now] });
    await tx.execute({ sql: 'INSERT INTO admin_totp_pending VALUES(?,?,?) ON CONFLICT(token_hash) DO UPDATE SET encrypted=excluded.encrypted,expires_at=excluded.expires_at', args: [hash(token), encrypt(secret), now + 10 * 60_000] });
    return { secret };
  }));
}

export async function confirmAdminMfa(token: string, code: string) {
  if (!adminReady()) return { error: 'UNCONFIGURED' as const };
  return withAdminDb(db => writeTransaction(db, async tx => {
    const now = Date.now();
    if (!await enrollmentSession(tx, token, now)) return { error: 'INVALID' as const };
    if (!await consumeAttempt(tx, now)) return { error: 'LIMITED' as const };
    if ((await tx.execute('SELECT id FROM admin_totp WHERE id=1')).rows.length) return { error: 'ALREADY_ENABLED' as const };
    const pending = (await tx.execute({ sql: 'SELECT encrypted FROM admin_totp_pending WHERE token_hash=? AND expires_at>?', args: [hash(token), now] })).rows[0];
    if (!pending) return { error: 'INVALID' as const };
    const step = matchingTotpStep(String(decrypt(String(pending.encrypted))), code, now);
    if (step === null) return { error: 'INVALID' as const };
    await tx.execute({ sql: 'INSERT INTO admin_totp VALUES(1,?,?)', args: [String(pending.encrypted), step] });
    const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(12).toString('hex'));
    for (const recovery of recoveryCodes) await tx.execute({ sql: 'INSERT INTO admin_recovery_codes VALUES(?)', args: [hash(recovery)] });
    await tx.execute('DELETE FROM sessions');
    await tx.execute({ sql: 'INSERT INTO audit(event,created_at) VALUES(?,?)', args: ['mfa_enabled', now] });
    return { ...await issueSession(tx, now), recoveryCodes };
  }));
}

export async function logoutAdmin(token: string) {
  await withAdminDb(async (db) => { await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash=?', args: [hash(token)] }); });
}
