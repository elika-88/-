import 'server-only';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Client, Row, Transaction } from '@libsql/client';
import { z } from 'zod';
import type { UserProfile } from '@/lib/contracts/auth';
import { withDatabase } from '@/lib/server/database';

export const USER_COOKIE = 'lumina_user';
export const USER_SESSION_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_WINDOW = 15 * 60 * 1000;
const REGISTER_WINDOW = 60 * 60 * 1000;
const usernameSchema = z.string().transform((value) => value.normalize('NFKC').trim())
  .pipe(z.string().min(3).max(32).regex(/^[\p{L}\p{M}\p{N}_.-]+$/u));
const emailSchema = z.string().transform((value) => value.normalize('NFKC').trim().toLowerCase())
  .pipe(z.string().email().max(254));
const passwordSchema = z.string().min(8).max(128);
export const AuthRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('register'), username: usernameSchema, email: emailSchema, password: passwordSchema }),
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
// opt in and overwrite x-real-ip. Without a trusted IP, account limits still apply.
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

export async function registerUser(input: { username: string; email: string; password: string }, request: Request) {
  const parsed = AuthRequestSchema.safeParse({ ...input, action: 'register' });
  if (!parsed.success || parsed.data.action !== 'register') throw new AccountError('INVALID_REQUEST', 'Use a 3–32 character username, a valid email, and an 8–128 character password.', 400);
  const { username, email, password } = parsed.data;
  const address = authClientAddress(request);
  await reserveAttempt([
    { key: `register:email:${identityKey(email)}`, limit: 5, window: REGISTER_WINDOW },
    ...(address ? [{ key: `register:ip:${address}`, limit: 20, window: REGISTER_WINDOW }] : []),
  ]);
  const passwordHash = await hashPassword(password);
  const user: UserProfile = { id: randomUUID(), username, email, createdAt: new Date().toISOString() };
  return withDatabase(async (db) => {
    await initializeUserTables(db);
    const tx = await db.transaction('write');
    try {
      const exists = await tx.execute({ sql: 'SELECT id FROM app_users WHERE username_key = ? OR email_key = ?', args: [identityKey(username), identityKey(email)] });
      if (exists.rows.length) throw new AccountError('ACCOUNT_EXISTS', 'That username or email is already registered.', 409);
      await tx.execute({
        sql: 'INSERT INTO app_users (id, username, username_key, email, email_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [user.id, username, identityKey(username), email, identityKey(email), passwordHash, user.createdAt],
      });
      const token = await issueSession(tx, user.id);
      await tx.commit();
      return { user, token };
    } catch (error) {
      if (!(error instanceof AccountError) && error instanceof Error && /UNIQUE constraint failed: app_users\.(username_key|email_key)/.test(error.message)) {
        throw new AccountError('ACCOUNT_EXISTS', 'That username or email is already registered.', 409);
      }
      throw error;
    } finally { if (!tx.closed) await tx.rollback(); tx.close(); }
  });
}

export async function loginUser(identifier: string, password: string, request: Request) {
  const key = identityKey(identifier);
  const address = authClientAddress(request);
  const row = await withDatabase(async (db) => {
    await initializeUserTables(db);
    return (await db.execute({ sql: `SELECT * FROM app_users WHERE ${key.includes('@') ? 'email_key' : 'username_key'} = ?`, args: [key] })).rows[0];
  });
  // Reserve atomically before hashing, including concurrent requests. Username
  // and email share the same account budget, even when the source IP changes.
  const bucket = row ? `login:user:${row.id}` : `login:identity:${key}`;
  await reserveAttempt([
    { key: bucket, limit: 10, window: LOGIN_WINDOW },
    ...(address ? [{ key: `login:ip:${address}`, limit: 60, window: LOGIN_WINDOW }] : []),
  ]);
  if (!await verifyPassword(password, row ? String(row.password_hash) : undefined) || !row) {
    throw new AccountError('INVALID_CREDENTIALS', 'Incorrect username, email, or password.', 401);
  }
  return withDatabase(async (db) => {
    const tx = await db.transaction('write');
    try {
      const token = await issueSession(tx, String(row.id));
      await tx.execute({ sql: 'DELETE FROM user_auth_limits WHERE bucket = ?', args: [digest(bucket)] });
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
