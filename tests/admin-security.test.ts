import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
vi.mock('server-only', () => ({}));
import { adminMfaEnabled, beginAdminMfa, confirmAdminMfa, loginAdmin, validAdminSession, withAdminDb } from '@/lib/server/admin-db';
import { matchingTotpStep, newTotpSecret, totpCode } from '@/lib/server/admin-totp';
import { ADMIN_IDLE_MS, ADMIN_SESSION_SECONDS, requireAdminOrigin } from '@/lib/server/admin-request';
import { POST } from '@/app/api/admin/route';
import { GET as adminStatus } from '@/app/api/admin/status/route';
import { GET as billingGet, PATCH as billingPatch } from '@/app/api/admin/billing/route';

let directory = '';
const password = 'test-only-secure-admin-password';
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'admin-security-'));
  vi.stubEnv('ADMIN_DATABASE_PATH', join(directory, 'admin.sqlite'));
  vi.stubEnv('ADMIN_PASSWORD', password); vi.stubEnv('ADMIN_ENCRYPTION_KEY', 'ab'.repeat(32));
  vi.stubEnv('TURSO_DATABASE_URL', ''); vi.stubEnv('TURSO_AUTH_TOKEN', '');
  vi.stubEnv('VERCEL', ''); vi.stubEnv('APP_BASE_URL', '');
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true }).catch(error => {
    if (process.platform !== 'win32' || !['EBUSY', 'EPERM'].includes(error.code)) throw error;
  });
});
async function session() {
  const result = await loginAdmin(password);
  if (!('token' in result)) throw new Error('Login failed');
  return result.token;
}
function req(body: unknown, token = '') {
  return new NextRequest('http://localhost/api/admin', { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json', Cookie: `lumina_admin=${token}` }, body: JSON.stringify(body) });
}

describe('admin two-factor authentication', () => {
  it.each([[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']])('matches RFC 6238 SHA-1 vector at %s seconds', (seconds, expected) => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(totpCode(secret, Math.floor(Number(seconds) / 30))).toBe(expected);
  });
  it('accepts only adjacent time steps and rejects reused or malformed codes', () => {
    const secret = newTotpSecret(); const now = 1_800_000;
    expect(matchingTotpStep(secret, totpCode(secret, 60), now)).toBe(60);
    expect(matchingTotpStep(secret, totpCode(secret, 59), now)).toBe(59);
    expect(matchingTotpStep(secret, totpCode(secret, 58), now)).toBeNull();
    expect(matchingTotpStep(secret, totpCode(secret, 60), now, 60)).toBeNull();
    expect(matchingTotpStep(secret, '12345', now)).toBeNull();
  });
  it('requires authenticated password confirmation, encrypts setup and expires it', async () => {
    const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(await beginAdminMfa('invalid', password)).toEqual({ error: 'INVALID' });
    const token = await session();
    expect(await beginAdminMfa(token, 'wrong')).toEqual({ error: 'INVALID' });
    const pending = await beginAdminMfa(token, password);
    if (!('secret' in pending) || !pending.secret) throw new Error('Setup failed');
    const raw = await withAdminDb(async db => (await db.execute('SELECT encrypted FROM admin_totp_pending')).rows);
    expect(JSON.stringify(raw)).not.toContain(pending.secret);
    expect(await adminMfaEnabled()).toBe(false);
    clock.mockReturnValue(now + 10 * 60_000);
    expect(await confirmAdminMfa(token, totpCode(pending.secret, Math.floor((now + 10 * 60_000) / 30_000)))).toEqual({ error: 'INVALID' });
  });
  it('enables MFA, revokes old sessions, rejects replay, and consumes recovery codes once', async () => {
    const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const token = await session(); const otherToken = await session();
    const pending = await beginAdminMfa(token, password);
    if (!('secret' in pending) || !pending.secret) throw new Error('Setup failed');
    const step = Math.floor(now / 30_000);
    const result = await confirmAdminMfa(token, totpCode(pending.secret, step));
    if (!('token' in result)) throw new Error('Confirmation failed');
    expect(result.recoveryCodes).toHaveLength(8);
    expect(await adminMfaEnabled()).toBe(true);
    expect(await validAdminSession(token)).toBe(false);
    expect(await validAdminSession(otherToken)).toBe(false);
    expect(await validAdminSession(result.token)).toBe(true);
    expect(await loginAdmin(password)).toEqual({ error: 'INVALID' });
    expect(await loginAdmin(password, totpCode(pending.secret, step))).toEqual({ error: 'INVALID' });
    clock.mockReturnValue(now + 30_000);
    const code = totpCode(pending.secret, step + 1);
    const concurrent = await Promise.all([loginAdmin(password, code), loginAdmin(password, code)]);
    expect(concurrent.filter(value => 'token' in value)).toHaveLength(1);
    const recovery = result.recoveryCodes[0];
    expect(await loginAdmin('wrong', recovery)).toEqual({ error: 'INVALID' });
    expect(await loginAdmin(password, recovery)).toHaveProperty('token');
    expect(await loginAdmin(password, recovery)).toEqual({ error: 'INVALID' });
    expect(await beginAdminMfa(result.token, password)).toEqual({ error: 'ALREADY_ENABLED' });
    const codes = await withAdminDb(async db => (await db.execute('SELECT * FROM admin_recovery_codes')).rows);
    expect(JSON.stringify(codes)).not.toContain(result.recoveryCodes[1]);
  });
  it('does not expose enrollment to a forged or ordinary-user cookie', async () => {
    expect((await POST(req({ action: 'mfa_begin', password }, 'a'.repeat(64)))).status).toBe(401);
    const request = req({ action: 'mfa_begin', password });
    request.headers.set('cookie', `lumina_user=${'a'.repeat(64)}`);
    expect((await POST(request)).status).toBe(401);
  });
  it('completes enrollment through the API and requires the second factor on subsequent sign-in', async () => {
    const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const token = await session();
    const begin = await POST(req({ action: 'mfa_begin', password }, token));
    const { secret } = await begin.json();
    expect(begin.headers.get('cache-control')).toBe('no-store');
    const confirm = await POST(req({ action: 'mfa_confirm', code: totpCode(secret, Math.floor(now / 30_000)) }, token));
    expect(confirm.status).toBe(200);
    expect((await confirm.json()).recoveryCodes).toHaveLength(8);
    const status = await (await adminStatus()).json();
    expect(status.mfaEnabled).toBe(true); expect(status).not.toHaveProperty('secret');
    expect((await POST(req({ action: 'login', password }))).status).toBe(401);
    clock.mockReturnValue(now + 30_000);
    const login = await POST(req({ action: 'login', password, code: totpCode(secret, Math.floor((now + 30_000) / 30_000)) }));
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('Max-Age=7200');
    expect(login.headers.get('set-cookie')).toContain('SameSite=strict');
    // Password rotation must not silently disable the already-enrolled second factor.
    vi.stubEnv('ADMIN_PASSWORD', 'another-long-test-admin-password');
    expect(await loginAdmin('another-long-test-admin-password')).toEqual({ error: 'INVALID' });
    expect(await adminMfaEnabled()).toBe(true);
  });
});

describe('admin session and request protection', () => {
  it('expires idle sessions and prevents activity from extending the absolute deadline', async () => {
    const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const idle = await session();
    clock.mockReturnValue(now + ADMIN_IDLE_MS);
    expect(await validAdminSession(idle)).toBe(false);
    const active = await session();
    for (let elapsed = 20 * 60_000; elapsed < ADMIN_SESSION_SECONDS * 1000; elapsed += 20 * 60_000) {
      clock.mockReturnValue(now + ADMIN_IDLE_MS + elapsed);
      expect(await validAdminSession(active)).toBe(true);
    }
    clock.mockReturnValue(now + ADMIN_IDLE_MS + ADMIN_SESSION_SECONDS * 1000);
    expect(await validAdminSession(active)).toBe(false);
  });
  it('does not store an unkeyed password hash and rejects legacy sessions', async () => {
    const token = await session();
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const rows = await withAdminDb(async db => (await db.execute('SELECT * FROM sessions')).rows);
    expect(rows[0].password_hash).not.toBe(hash(password));
    await withAdminDb(async db => { await db.execute({ sql: 'INSERT INTO sessions VALUES(?,?,?)', args: [hash('a'.repeat(64)), Date.now() + 3600_000, hash(password)] }); });
    expect(await validAdminSession('a'.repeat(64))).toBe(false);
    vi.stubEnv('ADMIN_ENCRYPTION_KEY', 'cd'.repeat(32));
    expect(await validAdminSession(token)).toBe(false);
  });
  it('applies a durable account limit even when callers change forwarded IP headers', async () => {
    const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    for (let i = 0; i < 5; i++) {
      const request = req({ action: 'login', password: 'wrong' });
      request.headers.set('x-forwarded-for', `192.0.2.${i}`);
      expect((await POST(request)).status).toBe(401);
    }
    const blocked = await POST(req({ action: 'login', password }));
    expect(blocked.status).toBe(429); expect(blocked.headers.get('retry-after')).toBe('900');
    clock.mockReturnValue(now + 15 * 60_000);
    expect((await POST(req({ action: 'login', password }))).status).toBe(200);
  });
  it('pins the configured origin, rejects HTTP downgrade and cross-site requests', () => {
    vi.stubEnv('APP_BASE_URL', 'https://lectorai.tech');
    for (const origin of ['https://evil.example', 'http://lectorai.tech', 'https://lectorai.tech:444']) {
      const request = req({}); request.headers.set('origin', origin); request.headers.set('host', new URL(origin).host);
      expect(() => requireAdminOrigin(request)).toThrow();
    }
    const request = req({}); request.headers.set('origin', 'https://lectorai.tech');
    expect(() => requireAdminOrigin(request)).not.toThrow();
    request.headers.set('sec-fetch-site', 'cross-site');
    expect(() => requireAdminOrigin(request)).toThrow();
  });
  it('sets Secure cookies in production and rejects non-JSON login requests', async () => {
    const invalid = req({ action: 'login', password }); invalid.headers.set('content-type', 'text/plain');
    expect((await POST(invalid)).status).toBe(415);
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('APP_BASE_URL', 'https://lectorai.tech');
    const request = req({ action: 'login', password }); request.headers.set('origin', 'https://lectorai.tech');
    const login = await POST(request);
    expect(login.status).toBe(200); expect(login.headers.get('set-cookie')).toContain('Secure');
  });
  it('requires authentication on billing reads and changes, and blocks cross-origin changes', async () => {
    const request = new NextRequest('http://localhost/api/admin/billing');
    expect((await billingGet(request)).status).toBe(401);
    const change = req({ channel: 'paypal', enabled: false, revision: 0 });
    expect((await billingPatch(change)).status).toBe(401);
    const token = await session();
    change.headers.set('cookie', `lumina_admin=${token}`); change.headers.set('origin', 'https://evil.example');
    expect((await billingPatch(change)).status).toBe(403);
  });
});
