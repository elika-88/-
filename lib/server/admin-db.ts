import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AdminSettingsSchema, type AdminSettings } from '../admin-schema';

function encryptionKey() {
  const key = process.env.ADMIN_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error('Admin encryption key is not configured.');
  return Buffer.from(key, 'hex');
}
export function adminReady() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8 && /^[a-f0-9]{64}$/i.test(process.env.ADMIN_ENCRYPTION_KEY ?? ''));
}
export function adminSetupIssue() {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_ENCRYPTION_KEY) return 'Run npm run admin:setup on the server, then restart the app.';
  if (process.env.ADMIN_PASSWORD.length < 8) return 'Administrator password must contain at least 8 characters. Update it on the server, then restart.';
  if (!/^[a-f0-9]{64}$/i.test(process.env.ADMIN_ENCRYPTION_KEY)) return 'The server encryption key is invalid. Restore the original key before restarting.';
  return null;
}
export function withAdminDb<T>(action: (db: DatabaseSync) => T): T {
  const path = resolve(process.env.ADMIN_DATABASE_PATH ?? '.data/admin.sqlite');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  try {
    db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), encrypted TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, event TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS login_limit (id INTEGER PRIMARY KEY CHECK(id=1), attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
      PRAGMA user_version=1;`);
    return action(db);
  } finally { db.close(); }
}
function encrypt(value: AdminSettings) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
}
function decrypt(value: string) {
  const record = JSON.parse(value);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return AdminSettingsSchema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]).toString('utf8')));
}
export function readStoredSettings(): { settings: AdminSettings; revision: number; updatedAt: number } | null {
  // Normal installations keep environment-only configuration until admin setup.
  if (!process.env.ADMIN_ENCRYPTION_KEY) return null;
  return withAdminDb((db) => {
    const row = db.prepare('SELECT encrypted,revision,updated_at FROM settings WHERE id=1').get() as { encrypted: string; revision: number; updated_at: number } | undefined;
    return row ? { settings: decrypt(row.encrypted), revision: row.revision, updatedAt: row.updated_at } : null;
  });
}
export function saveStoredSettings(settings: AdminSettings, revision: number) {
  const encrypted = encrypt(AdminSettingsSchema.parse(settings));
  return withAdminDb((db) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = db.prepare('SELECT revision FROM settings WHERE id=1').get() as { revision: number } | undefined;
      if ((current?.revision ?? 0) !== revision) throw new Error('CONFLICT');
      db.prepare('INSERT INTO settings VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted,revision=excluded.revision,updated_at=excluded.updated_at').run(encrypted, revision + 1, Date.now());
      db.prepare('INSERT INTO audit(event,created_at) VALUES(?,?)').run('settings_updated', Date.now());
      db.exec('COMMIT');
      return revision + 1;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function loginAdmin(password: string): { token: string } | { error: 'INVALID' | 'LIMITED' | 'UNCONFIGURED' } {
  if (!adminReady()) return { error: 'UNCONFIGURED' };
  return withAdminDb((db) => {
    const now = Date.now();
    const limit = db.prepare('SELECT attempts, reset_at FROM login_limit WHERE id=1').get() as { attempts: number; reset_at: number } | undefined;
    if (limit && limit.reset_at > now && limit.attempts >= 10) return { error: 'LIMITED' };
    const reset = limit && limit.reset_at > now ? limit.reset_at : now + 300_000;
    const attempts = limit && limit.reset_at > now ? limit.attempts : 0;
    if (!timingSafeEqual(Buffer.from(hash(password)), Buffer.from(hash(process.env.ADMIN_PASSWORD!)))) {
      db.prepare('INSERT INTO login_limit VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,reset_at=excluded.reset_at').run(attempts + 1, reset);
      return { error: 'INVALID' };
    }
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), now + 8 * 3600_000, hash(process.env.ADMIN_PASSWORD!));
    db.prepare('DELETE FROM login_limit').run();
    db.prepare('INSERT INTO audit(event,created_at) VALUES(?,?)').run('login', now);
    return { token };
  });
}
export function validAdminSession(token: string) {
  if (!adminReady() || !/^[a-f0-9]{64}$/.test(token)) return false;
  return withAdminDb((db) => Boolean(db.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>? AND password_hash=?').get(hash(token), Date.now(), hash(process.env.ADMIN_PASSWORD!))));
}
export function logoutAdmin(token: string) {
  withAdminDb((db) => { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token)); });
}
