import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('server-only', () => ({}));
import { GET, POST } from '@/app/api/auth/route';
import { POST as VERIFY } from '@/app/api/auth/verify/route';
import { GET as list, PUT as save, DELETE as remove } from '@/app/api/study-sessions/route';
import { authClientAddress, USER_SESSION_SECONDS } from '@/lib/server/user-auth';
import { withDatabase } from '@/lib/server/database';

let directory: string;
const password = 'Unit-test-password-48!';
const account = { action: 'register', username: 'Alice', email: 'alice@example.invalid' };
let sentTokens: string[];
function request(body?: unknown, cookie = '', path = '/api/auth', method = body ? 'POST' : 'GET') {
  return new Request(`https://lumina.test${path}`, { method,
    headers: { Origin: 'https://lumina.test', 'Content-Type': 'application/json', Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function register(username = 'Alice') {
  const response = await POST(request({ ...account, username, email: `${username}@example.invalid` }));
  expect(response.status).toBe(202);
  expect(response.headers.get('set-cookie')).toBeNull();
  const token = sentTokens.at(-1);
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  const verified = await VERIFY(request({ token, password }, '', '/api/auth/verify'));
  expect(verified.status).toBe(201);
  return { user: (await verified.json()).user, cookie: verified.headers.get('set-cookie')!.split(';')[0], token: token! };
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'lumina-account-'));
  vi.stubEnv('ADMIN_DATABASE_PATH', join(directory, 'test.sqlite'));
  vi.stubEnv('TURSO_DATABASE_URL', ''); vi.stubEnv('TURSO_AUTH_TOKEN', ''); vi.stubEnv('VERCEL', '');
  vi.stubEnv('AUTH_TRUST_PROXY', '');
  vi.stubEnv('RESEND_API_KEY', 're_test_only');
  vi.stubEnv('RESEND_FROM_EMAIL', 'verify@lumina.test');
  vi.stubEnv('APP_BASE_URL', 'https://lumina.test');
  sentTokens = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer re_test_only' });
    const message = JSON.parse(String(init?.body)) as { text: string; to: string[] };
    const token = message.text.match(/#token=([a-f0-9]{64})/)?.[1];
    expect(token).toBeTruthy();
    sentTokens.push(token!);
    return Response.json({ id: 'test-email' });
  }));
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  try { rmSync(directory, { recursive: true, force: true }); }
  catch (error) {
    if (process.platform !== 'win32' || !['EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
});

describe('real account database and HTTP boundaries', () => {
  it('stores password/session hashes, sets secure cookies, restores identity and revokes logout', async () => {
    const signup = await POST(request(account));
    expect(signup.status).toBe(202);
    expect(signup.headers.get('set-cookie')).toBeNull();
    expect((await GET(request())).status).toBe(200);
    expect(await (await GET(request())).json()).toEqual({ user: null });
    const pending = await withDatabase(async db => (await db.execute('SELECT token_hash FROM pending_registrations')).rows[0]);
    expect(pending.token_hash).not.toBe(sentTokens[0]);
    const response = await VERIFY(request({ token: sentTokens[0], password }, '', '/api/auth/verify'));
    expect(response.status).toBe(201);
    const header = response.headers.get('set-cookie')!;
    expect(header).toContain('HttpOnly'); expect(header).toContain('Secure'); expect(header).toContain('SameSite=lax');
    const cookie = header.split(';')[0];
    const profile = await response.json();
    expect(Object.keys(profile.user).sort()).toEqual(['createdAt', 'email', 'id', 'username']);
    const rows = await withDatabase(async db => ({
      user: (await db.execute('SELECT password_hash FROM app_users')).rows[0],
      session: (await db.execute('SELECT token_hash FROM user_sessions')).rows[0],
    }));
    expect(rows.user.password_hash).toMatch(/^scrypt\$/);
    expect(rows.user.password_hash).not.toContain(password);
    expect(rows.session.token_hash).not.toBe(cookie.split('=')[1]);
    expect(await (await GET(request(undefined, cookie))).json()).toEqual(profile);
    const logout = await POST(request({ action: 'logout' }, cookie));
    expect(logout.status).toBe(200); expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(await (await GET(request(undefined, cookie))).json()).toEqual({ user: null });
    expect((await VERIFY(request({ token: sentTokens[0], password }, '', '/api/auth/verify'))).status).toBe(400);
  });

  it('normalizes identities, gives generic duplicate responses, and rejects wrong passwords', async () => {
    const { user } = await register();
    const sent = sentTokens.length;
    expect((await POST(request({ ...account, username: 'ＡＬＩＣＥ', email: 'another@example.invalid' }))).status).toBe(202);
    expect((await POST(request({ ...account, username: 'another', email: ' ALICE@EXAMPLE.INVALID ' }))).status).toBe(202);
    expect(sentTokens).toHaveLength(sent);
    for (const identifier of [' alice ', 'ALICE@EXAMPLE.INVALID']) {
      const response = await POST(request({ action: 'login', identifier, password }));
      expect(response.status).toBe(200); expect((await response.json()).user.id).toBe(user.id);
    }
    for (const identifier of ['Alice', 'Unknown']) {
      const response = await POST(request({ action: 'login', identifier, password: 'wrong-password' }));
      expect(response.status).toBe(401); expect((await response.json()).code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('rejects expired, malformed and unknown session tokens', async () => {
    const { cookie } = await register();
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + USER_SESSION_SECONDS * 1000 + 1);
    for (const candidate of [cookie, 'lumina_user=invalid', `lumina_user=${'0'.repeat(64)}`, '']) {
      expect(await (await GET(request(undefined, candidate))).json()).toEqual({ user: null });
    }
  });

  it('rejects cross-origin writes, missing origins, invalid schemas and oversized actual bodies', async () => {
    for (const origin of ['', 'https://attacker.test']) {
      const req = request(account); req.headers.set('origin', origin);
      expect((await POST(req)).status).toBe(403);
    }
    const foreign = request(account); foreign.headers.set('sec-fetch-site', 'cross-site');
    expect((await POST(foreign)).status).toBe(403);
    expect((await POST(request({ ...account, role: 'admin' }))).status).toBe(400);
    expect((await POST(request({ ...account, password: 'short' }))).status).toBe(400);
    const foreignVerification = request({ token: 'a'.repeat(64), password }, '', '/api/auth/verify');
    foreignVerification.headers.set('origin', 'https://attacker.test');
    expect((await VERIFY(foreignVerification)).status).toBe(403);
    expect((await POST(request({ ...account, username: 'x'.repeat(20_000) }))).status).toBe(413);
    const invalid = new Request('https://lumina.test/api/auth', { method: 'POST', headers: { Origin: 'https://lumina.test', 'Content-Type': 'application/json' }, body: '{' });
    expect((await POST(invalid)).status).toBe(400);
  });

  it('limits password guessing and ignores untrusted forwarded IP headers', async () => {
    const req = request(); req.headers.set('x-forwarded-for', '203.0.113.1'); req.headers.set('x-real-ip', '203.0.113.2');
    expect(authClientAddress(req)).toBeNull();
    vi.stubEnv('VERCEL', '1'); req.headers.set('x-vercel-forwarded-for', '203.0.113.3');
    expect(authClientAddress(req)).toBe('203.0.113.3'); vi.stubEnv('VERCEL', '');
    await register();
    for (let i = 0; i < 10; i++) expect((await POST(request({ action: 'login', identifier: 'Alice', password: 'wrong-password' }))).status).toBe(401);
    expect((await POST(request({ action: 'login', identifier: 'Alice', password }))).status).toBe(429);
    for (let i = 0; i < 10; i++) expect((await POST(request({ action: 'login', identifier: 'Nobody', password }))).status).toBe(401);
    const limited = await POST(request({ action: 'login', identifier: 'NOBODY', password }));
    expect(limited.status).toBe(429); expect((await limited.json()).code).toBe('RATE_LIMITED');
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 15 * 60 * 1000 + 1);
    expect((await POST(request({ action: 'login', identifier: 'Alice', password }))).status).toBe(200);
  });

  it('shares the login budget across username, email and different source IPs', async () => {
    await register(); vi.stubEnv('AUTH_TRUST_PROXY', 'true');
    for (let i = 0; i < 10; i++) {
      const req = request({ action: 'login', identifier: i % 2 ? 'ALICE@EXAMPLE.INVALID' : 'Alice', password: 'wrong-password' });
      req.headers.set('x-real-ip', `203.0.113.${i + 1}`);
      expect((await POST(req)).status).toBe(401);
    }
    const candidate = request({ action: 'login', identifier: 'alice@example.invalid', password });
    candidate.headers.set('x-real-ip', '203.0.113.20');
    const response = await POST(candidate);
    expect(response.status).toBe(429);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('reserves the password verification budget atomically under concurrent requests', async () => {
    await register();
    const responses = await Promise.all(Array.from({ length: 12 }, () => POST(request({ action: 'login', identifier: 'Alice', password: 'wrong-password' }))));
    expect(responses.filter(response => response.status === 401)).toHaveLength(10);
    expect(responses.filter(response => response.status === 429)).toHaveLength(2);
  });

  it('requires a live email token and lets its owner choose the password', async () => {
    await POST(request(account));
    const token = sentTokens[0];
    expect((await POST(request({ action: 'login', identifier: account.username, password }))).status).toBe(401);
    expect((await VERIFY(request({ token, password: 'short' }, '', '/api/auth/verify'))).status).toBe(400);
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 60 * 1000);
    expect((await VERIFY(request({ token, password }, '', '/api/auth/verify'))).status).toBe(400);
  });

  it('invalidates an earlier link when the mailbox owner requests a new registration', async () => {
    await POST(request(account));
    const first = sentTokens[0];
    await POST(request({ action: 'register', username: 'NewAlice', email: account.email }));
    const second = sentTokens[1];
    expect(second).not.toBe(first);
    expect((await VERIFY(request({ token: first, password }, '', '/api/auth/verify'))).status).toBe(400);
    const response = await VERIFY(request({ token: second, password }, '', '/api/auth/verify'));
    expect(response.status).toBe(201);
    expect((await response.json()).user.username).toBe('NewAlice');
  });

  it('fails closed when Resend is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const response = await POST(request(account));
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('does not create an account when Resend fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'unavailable' }, { status: 503 })));
    expect((await POST(request(account))).status).toBe(503);
    const rows = await withDatabase(async db => ({ users: (await db.execute('SELECT COUNT(*) AS count FROM app_users')).rows[0], pending: (await db.execute('SELECT COUNT(*) AS count FROM pending_registrations')).rows[0] }));
    expect(Number(rows.users.count)).toBe(0); expect(Number(rows.pending.count)).toBe(0);
  });

  it('does not impose a shared direct-client registration bucket', async () => {
    for (let i = 0; i < 12; i++) {
      const response = await POST(request({ action: 'register', username: `Student${i}`, email: `student${i}@example.invalid` }));
      expect(response.status).toBe(202);
    }
  });
});

describe('account study record isolation and concurrent edits', () => {
  it('rejects anonymous access, prevents access to other accounts and detects stale revisions', async () => {
    const alice = await register(); const bob = await register('Bob');
    const path = '/api/study-sessions';
    const session = { id: 'isolation-lecture', title: 'Private lecture', customTitle: false, lecture: 'Private source', outputLanguage: 'en', tab: 'summary', kit: null, updatedAt: Date.now() };
    expect((await list(request(undefined, '', path))).status).toBe(401);
    expect((await save(request({ session, expectedRevision: 0 }, '', path, 'PUT'))).status).toBe(401);
    expect((await save(request({ session, expectedRevision: 0 }, alice.cookie, path, 'PUT'))).status).toBe(200);
    const switched = request({ session: { ...session, id: 'old-tab-record' }, expectedRevision: 0 }, bob.cookie, path, 'PUT');
    switched.headers.set('x-lumina-account', alice.user.id);
    expect((await save(switched)).status).toBe(409);
    const staleRead = request(undefined, bob.cookie, path); staleRead.headers.set('x-lumina-account', alice.user.id);
    expect((await list(staleRead)).status).toBe(409);
    const staleDelete = request({ id: session.id, expectedRevision: 1 }, bob.cookie, path, 'DELETE'); staleDelete.headers.set('x-lumina-account', alice.user.id);
    expect((await remove(staleDelete)).status).toBe(409);
    expect((await (await list(request(undefined, alice.cookie, path))).json()).userId).toBe(alice.user.id);
    expect((await (await list(request(undefined, bob.cookie, path))).json()).sessions).toEqual([]);
    expect((await save(request({ session, expectedRevision: 1 }, bob.cookie, path, 'PUT'))).status).toBe(404);
    expect((await remove(request({ id: session.id, expectedRevision: 1 }, bob.cookie, path, 'DELETE'))).status).toBe(404);
    const writes = await Promise.all([1, 2].map(n => save(request({ session: { ...session, title: `Edit ${n}` }, expectedRevision: 1 }, alice.cookie, path, 'PUT'))));
    expect(writes.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await remove(request({ id: session.id, expectedRevision: 1 }, alice.cookie, path, 'DELETE'))).status).toBe(409);
    expect((await remove(request({ id: session.id, expectedRevision: 2 }, alice.cookie, path, 'DELETE'))).status).toBe(200);
    expect((await save(request({ session, expectedRevision: 3 }, alice.cookie, path, 'PUT'))).status).toBe(409);
    expect((await (await list(request(undefined, alice.cookie, path))).json()).sessions).toEqual([]);
  });
});
