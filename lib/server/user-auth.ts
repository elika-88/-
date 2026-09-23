import 'server-only';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Client, Row, Transaction } from '@libsql/client';
import { z } from 'zod';
import type { UserProfile } from '@/lib/contracts/auth';
import { withDatabase } from '@/lib/server/database';
import { requireVerificationEmailConfiguration, sendVerificationEmail } from '@/lib/server/verification-email';

export const USER_COOKIE = 'lumina_user';
export const USER_SESSION_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_WINDOW = 15 * 60 * 1000;
const REGISTER_WINDOW = 60 * 60 * 1000;
const VERIFICATION_WINDOW = 30 * 60 * 1000;
const usernameSchema = z.string().transform((value) => value.normalize('NFKC').trim())
  .pipe(z.string().min(3).max(32).regex(/^[\p{L}\p{M}\p{N}_.-]+$/u));
const emailSchema = z.string().transform((value) => value.normalize('NFKC').trim().toLowerCase())
  .pipe(z.string().email().max(254));
const passwordSchema = z.string().min(8).max(128);
export const AuthRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('register'), username: usernameSchema, email: emailSchema }),
  z.strictObject({ action: z.literal('login'), identifier: z.string().min(1).max(254), password: z.string().min(1).max(128) }),
  z.strictObject({ action: z.literal('logout') }),
]);

export class AccountError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); }
}

export async function initializeUserTables(db: Client) {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL, email_key TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS user_sessions_owner ON user_sessions(user_id)',
    `CREATE TABLE IF NOT EXISTS user_auth_limits (
      bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS pending_registrations (
      email_key TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL,
      email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    )`,
  ], 'write');
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const identityKey = (value: string) => value.normalize('NFKC').trim().toLowerCase();
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
  });
}
async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$32768$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function verifyPassword(password: string, encoded: string | undefined) {
  const parts = encoded?.split('$');
  const valid = parts?.length === 6 && parts.slice(0, 4).join('$') === 'scrypt$32768$8$1'
    && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{128}$/.test(parts[5]);
  // Unknown usernames still perform the same expensive password derivation.
  const salt = valid ? Buffer.from(parts[4], 'hex') : Buffer.alloc(16);
  const expected = valid ? Buffer.from(parts[5], 'hex') : Buffer.alloc(64);
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected) && Boolean(valid);
}
function profile(row: Row): UserProfile {
  return { id: String(row.id), username: String(row.username), email: String(row.email), createdAt: String(row.created_at) };
}

// Untrusted forwarded headers must not let a caller rotate IPs to evade limits.
// Vercel overwrites x-vercel-forwarded-for; a self-hosted proxy must explicitly
// opt in and overwrite x-real-ip. Direct/local requests share a conservative bucket.
export function authClientAddress(request: Request) {
  const vercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
  const raw = vercel ? request.headers.get('x-vercel-forwarded-for')
    : process.env.AUTH_TRUST_PROXY === 'true' ? request.headers.get('x-real-ip') : null;
  const address = raw?.split(',')[0].trim();
  return address && isIP(address) ? address : null;
}

async function reserveAttempt(buckets: { key: string; limit: number; window: number }[]) {
  await withDatabase(async (db) => {
    await initializeUserTables(db);
    const tx = await db.transaction('write');
    try {
      const now = Date.now();
      await tx.execute({ sql: 'DELETE FROM user_auth_limits WHERE resets_at <= ?', args: [now] });
      for (const bucket of buckets) {
        const key = digest(bucket.key);
        const row = (await tx.execute({ sql: 'SELECT count FROM user_auth_limits WHERE bucket = ?', args: [key] })).rows[0];
        if (row && Number(row.count) >= bucket.limit) throw new AccountError('RATE_LIMITED', 'Too many attempts. Please try again later.', 429);
        await tx.execute({
          sql: 'INSERT INTO user_auth_limits (bucket, count, resets_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1',
          args: [key, now + bucket.window],
        });
      }
      await tx.commit();
    } finally { if (!tx.closed) await tx.rollback(); tx.close(); }
  });
}

async function checkAttemptLimit(bucket: { key: string; limit: number }) {
  await withDatabase(async (db) => {
    await initializeUserTables(db);
    const row = (await db.execute({ sql: 'SELECT count, resets_at FROM user_auth_limits WHERE bucket = ?', args: [digest(bucket.key)] })).rows[0];
    if (row && Number(row.resets_at) > Date.now() && Number(row.count) >= bucket.limit) {
      throw new AccountError('RATE_LIMITED', 'Too many attempts. Please try again later.', 429);
    }
  });
}

async function issueSession(tx: Transaction, userId: string) {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  await tx.execute({ sql: 'DELETE FROM user_sessions WHERE expires_at <= ?', args: [now] });
  await tx.execute({
    sql: 'INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    args: [digest(token), userId, now + USER_SESSION_SECONDS * 1000, now],
  });
  return token;
}

export async function registerUser(input: { username: string; email: string }, request: Request) {
  const parsed = AuthRequestSchema.safeParse({ ...input, action: 'register' });
  if (!parsed.success || parsed.data.action !== 'register') throw new AccountError('INVALID_REQUEST', 'Use a 3–32 character username and a valid email.', 400);
  try { requireVerificationEmailConfiguration(); }
  catch { throw new AccountError('EMAIL_UNAVAILABLE', 'Email verification is unavailable. Contact the site administrator.', 503); }
  const address = authClientAddress(request);
  const { username, email } = parsed.data;
  await reserveAttempt([
    { key: `register:email:${identityKey(email)}`, limit: 5, window: REGISTER_WINDOW },
    ...(address ? [{ key: `register:ip:${address}`, limit: 20, window: REGISTER_WINDOW }] : []),
  ]);
  const token = randomBytes(32).toString('hex');
  const pending = await withDatabase(async (db) => {
    await initializeUserTables(db);
    const tx = await db.transaction('write');
    try {
      const now = Date.now();
      await tx.execute({ sql: 'DELETE FROM pending_registrations WHERE expires_at <= ?', args: [now] });
      const exists = await tx.execute({ sql: 'SELECT id FROM app_users WHERE username_key = ? OR email_key = ?', args: [identityKey(username), identityKey(email)] });
      if (exists.rows.length) { await tx.commit(); return false; }
      await tx.execute({
        sql: `INSERT INTO pending_registrations (email_key, username, username_key, email, token_hash, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email_key) DO UPDATE SET
          username=excluded.username, username_key=excluded.username_key, email=excluded.email,
          token_hash=excluded.token_hash,
          expires_at=excluded.expires_at, created_at=excluded.created_at`,
        args: [identityKey(email), username, identityKey(username), email, digest(token), now + VERIFICATION_WINDOW, now],
      });
      await tx.commit();
      return true;
    } finally { if (!tx.closed) await tx.rollback(); tx.close(); }
  });
  if (pending) {
    try { await sendVerificationEmail(email, token); }
    catch {
      await withDatabase(async (db) => db.execute({ sql: 'DELETE FROM pending_registrations WHERE token_hash = ?', args: [digest(token)] }));
      throw new AccountError('EMAIL_UNAVAILABLE', 'Verification email could not be sent. Try again later.', 503);
    }
  }
  return { pendingVerification: true as const };
}

export async function verifyEmailToken(token: string, password: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AccountError('INVALID_VERIFICATION', 'This verification link is invalid or expired.', 400);
  if (!passwordSchema.safeParse(password).success) throw new AccountError('INVALID_REQUEST', 'Use an 8–128 character password.', 400);
  const exists = await withDatabase(async (db) => {
    await initializeUserTables(db);
    return (await db.execute({ sql: 'SELECT 1 FROM pending_registrations WHERE token_hash = ? AND expires_at > ?', args: [digest(token), Date.now()] })).rows.length > 0;
  });
  if (!exists) throw new AccountError('INVALID_VERIFICATION', 'This verification link is invalid or expired.', 400);
  const passwordHash = await hashPassword(password);
  return withDatabase(async (db) => {
    await initializeUserTables(db);
    const tx = await db.transaction('write');
    try {
      const row = (await tx.execute({ sql: 'SELECT * FROM pending_registrations WHERE token_hash = ? AND expires_at > ?', args: [digest(token), Date.now()] })).rows[0];
      if (!row) throw new AccountError('INVALID_VERIFICATION', 'This verification link is invalid or expired.', 400);
      const user: UserProfile = { id: randomUUID(), username: String(row.username), email: String(row.email), createdAt: new Date().toISOString() };
      const taken = await tx.execute({ sql: 'SELECT id FROM app_users WHERE username_key = ? OR email_key = ?', args: [row.username_key, row.email_key] });
      if (taken.rows.length) throw new AccountError('INVALID_VERIFICATION', 'This verification link is no longer valid. Register again.', 400);
      await tx.execute({
        sql: 'INSERT INTO app_users (id, username, username_key, email, email_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [user.id, user.username, row.username_key, user.email, row.email_key, passwordHash, user.createdAt],
      });
      await tx.execute({ sql: 'DELETE FROM pending_registrations WHERE email_key = ?', args: [row.email_key] });
      const session = await issueSession(tx, user.id);
      await tx.commit();
      return { user, token: session };
    } catch (error) {
      if (!(error instanceof AccountError) && error instanceof Error && /UNIQUE constraint failed: app_users\.(username_key|email_key)/.test(error.message)) {
        throw new AccountError('INVALID_VERIFICATION', 'This verification link is no longer valid. Register again.', 400);
      }
      throw error;
    } finally { if (!tx.closed) await tx.rollback(); tx.close(); }
  });
}

export async function loginUser(identifier: string, password: string, request: Request) {
  const key = identityKey(identifier);
  const address = authClientAddress(request);
  if (address) await checkAttemptLimit({ key: `login:ip:${address}`, limit: 60 });
  const row = await withDatabase(async (db) => {
    await initializeUserTables(db);
    return (await db.execute({ sql: `SELECT * FROM app_users WHERE ${key.includes('@') ? 'email_key' : 'username_key'} = ?`, args: [key] })).rows[0];
  });
  if (!await verifyPassword(password, row ? String(row.password_hash) : undefined) || !row) {
    await reserveAttempt([
      { key: `login:identity:${key}`, limit: 10, window: LOGIN_WINDOW },
      ...(address ? [{ key: `login:ip:${address}`, limit: 60, window: LOGIN_WINDOW }] : []),
    ]);
    throw new AccountError('INVALID_CREDENTIALS', 'Incorrect username, email, or password.', 401);
  }
  return withDatabase(async (db) => {
    const tx = await db.transaction('write');
    try {
      const token = await issueSession(tx, String(row.id));
      await tx.execute({ sql: 'DELETE FROM user_auth_limits WHERE bucket = ?', args: [digest(`login:identity:${key}`)] });
      await tx.commit();
      return { user: profile(row), token };
    } finally { if (!tx.closed) await tx.rollback(); tx.close(); }
  });
}

export function userToken(request: Request) {
  const value = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${USER_COOKIE}=`))?.slice(USER_COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export async function getUserFromRequest(request: Request): Promise<UserProfile | null> {
  const token = userToken(request);
  if (!token) return null;
  return withDatabase(async (db) => {
    await initializeUserTables(db);
    const row = (await db.execute({
      sql: 'SELECT u.id, u.username, u.email, u.created_at FROM user_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
      args: [digest(token), Date.now()],
    })).rows[0];
    return row ? profile(row) : null;
  });
}

export async function logoutUser(request: Request) {
  const token = userToken(request);
  if (!token) return;
  await withDatabase(async (db) => {
    await initializeUserTables(db);
    await db.execute({ sql: 'DELETE FROM user_sessions WHERE token_hash = ?', args: [digest(token)] });
  });
}

export function requireSameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get('origin') ?? '');
    const url = new URL(request.url);
    const vercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
    const protocol = vercel ? 'https:' : url.protocol;
    if (origin.protocol === protocol && origin.host === (request.headers.get('host') ?? url.host)
      && request.headers.get('sec-fetch-site') !== 'cross-site') return;
  } catch { /* Missing or malformed origins cannot authorize writes. */ }
  throw new AccountError('INVALID_ORIGIN', 'Invalid request origin.', 403);
}

export async function readAccountJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AccountError('INVALID_REQUEST', 'Use application/json.', 415);
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new AccountError('REQUEST_TOO_LARGE', 'Request too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AccountError('INVALID_REQUEST', 'Missing request body.', 400);
  const decoder = new TextDecoder();
  let size = 0; let raw = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new AccountError('REQUEST_TOO_LARGE', 'Request too large.', 413); }
      raw += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(raw + decoder.decode()); }
  catch { throw new AccountError('INVALID_REQUEST', 'Invalid JSON.', 400); }
}
