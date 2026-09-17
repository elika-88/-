import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { Secret } from 'otpauth';
vi.mock('server-only', () => ({}));
import { adminTotp, adminTotpEnabled, confirmAdminTotp, loginAdmin, validAdminSession, withAdminDb } from '@/lib/server/admin-db';
import { GET, POST } from '@/app/api/admin/route';

let directory: string;
let now: number;
const password = 'test-admin-password';
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'lumina-mfa-'));
  vi.stubEnv('ADMIN_DATABASE_PATH', join(directory, 'test.sqlite'));
  vi.stubEnv('ADMIN_PASSWORD', password);
  vi.stubEnv('ADMIN_ENCRYPTION_KEY', 'af'.repeat(32));
  vi.stubEnv('TURSO_DATABASE_URL', undefined);
  vi.stubEnv('TURSO_AUTH_TOKEN', undefined);
  vi.stubEnv('VERCEL', undefined);
  now = 1_780_000_020_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  try { rmSync(directory, { recursive: true, force: true }); }
  catch (error) {
    if (process.platform !== 'win32' || (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
  }
});

async function begin() {
  const result = await loginAdmin(password);
  if (!('enrollment' in result)) throw new Error('Expected setup challenge');
  return result;
}

async function enroll() {
  const setup = await begin();
  const code = adminTotp(setup.enrollment.secret).generate({ timestamp: now });
  const session = await confirmAdminTotp(setup.enrollmentToken, code);
  if (!('token' in session)) throw new Error('Expected MFA session');
  return { ...setup, ...session, code };
}

describe('Google Authenticator enrollment and verification', () => {
  it('matches the six-digit RFC 6238 SHA1 test vector', () => {
    const secret = Secret.fromUTF8('12345678901234567890').base32;
    expect(adminTotp(secret).generate({ timestamp: 59_000 })).toBe('287082');
  });

  it('requires the server password before creating enrollment and grants no access before confirmation', async () => {
    expect(await loginAdmin('wrong')).toEqual({ error: 'INVALID' });
    const setup = await begin();
    expect(setup.enrollment.uri).toMatch(/^otpauth:\/\/totp\/Lumina:admin\?/);
    expect(await adminTotpEnabled()).toBe(false);
    expect(await validAdminSession(setup.enrollmentToken)).toBe(false);
    expect(readFileSync(join(directory, 'test.sqlite')).includes(Buffer.from(setup.enrollment.secret))).toBe(false);
  });

  it('uses an HttpOnly enrollment cookie, masks unauthenticated data and refuses a missing challenge', async () => {
    const response = await POST(new NextRequest('http://localhost/api/admin', { method: 'POST', headers: { Origin: 'http://localhost' }, body: JSON.stringify({ action: 'login', password }) }));
    expect(response.cookies.get('lumina_admin')).toBeUndefined();
    expect(response.cookies.get('lumina_admin_enrollment')?.httpOnly).toBe(true);
    const view = await (await GET(new NextRequest('http://localhost/api/admin'))).json();
    expect(view).toMatchObject({ authenticated: false, totpEnabled: false });
    expect(view).not.toHaveProperty('enrollment');
    expect(await confirmAdminTotp('', '123456')).toEqual({ error: 'ENROLLMENT_EXPIRED' });
  });

  it('creates a usable admin session only after successful enrollment, requiring both factors thereafter', async () => {
    const setup = await enroll();
    expect(await adminTotpEnabled()).toBe(true);
    expect(await validAdminSession(setup.token)).toBe(true);
    expect(await loginAdmin(password)).toEqual({ error: 'MFA_REQUIRED' });
    now += 30_000;
    const code = adminTotp(setup.enrollment.secret).generate({ timestamp: now });
    expect(await loginAdmin('wrong', code)).toEqual({ error: 'INVALID' });
    expect(await loginAdmin(password, code)).toHaveProperty('token');
  });

  it('expires enrollment and rejects a challenge after the administrator password changes', async () => {
    const setup = await begin();
    now += 300_001;
    expect(await confirmAdminTotp(setup.enrollmentToken, adminTotp(setup.enrollment.secret).generate({ timestamp: now }))).toEqual({ error: 'ENROLLMENT_EXPIRED' });
    const second = await begin();
    vi.stubEnv('ADMIN_PASSWORD', 'new-test-admin-password');
    expect(await confirmAdminTotp(second.enrollmentToken, adminTotp(second.enrollment.secret).generate({ timestamp: now }))).toEqual({ error: 'ENROLLMENT_EXPIRED' });
  });

  it('rejects replay including enrollment codes and concurrent use of the same time step', async () => {
    const setup = await enroll();
    expect(await loginAdmin(password, setup.code)).toEqual({ error: 'INVALID_CODE' });
    now += 30_000;
    const code = adminTotp(setup.enrollment.secret).generate({ timestamp: now });
    const results = await Promise.all([loginAdmin(password, code), loginAdmin(password, code)]);
    expect(results.filter(result => 'token' in result)).toHaveLength(1);
    expect(results.filter(result => 'error' in result && result.error === 'INVALID_CODE')).toHaveLength(1);
  });

  it('accepts one time step of clock skew and rejects codes outside that window', async () => {
    const setup = await enroll();
    now += 90_000;
    expect(await loginAdmin(password, adminTotp(setup.enrollment.secret).generate({ timestamp: now - 30_000 }))).toHaveProperty('token');
    expect(await loginAdmin(password, adminTotp(setup.enrollment.secret).generate({ timestamp: now + 60_000 }))).toEqual({ error: 'INVALID_CODE' });
    expect(await loginAdmin(password, adminTotp(setup.enrollment.secret).generate({ timestamp: now + 30_000 }))).toHaveProperty('token');
  });

  it('limits MFA guesses and setup challenges even when the password is correct', async () => {
    const setup = await begin();
    for (let i = 0; i < 9; i++) expect(await confirmAdminTotp(setup.enrollmentToken, 'invalid')).toEqual({ error: 'INVALID_CODE' });
    expect(await loginAdmin(password)).toEqual({ error: 'LIMITED' });
    now += 300_001;
    expect(await loginAdmin(password)).toHaveProperty('enrollment');
  });

  it('invalidates sessions when the password changes or MFA is reset', async () => {
    const setup = await enroll();
    vi.stubEnv('ADMIN_PASSWORD', 'another-test-password');
    expect(await validAdminSession(setup.token)).toBe(false);
    vi.stubEnv('ADMIN_PASSWORD', password);
    await withAdminDb(async db => { await db.execute('DELETE FROM admin_mfa'); });
    expect(await validAdminSession(setup.token)).toBe(false);
    await enroll();
    expect(await validAdminSession(setup.token)).toBe(false);
  });

  it('allows only one enrollment challenge to establish the administrator secret', async () => {
    const first = await begin();
    const second = await begin();
    expect(await confirmAdminTotp(first.enrollmentToken, adminTotp(first.enrollment.secret).generate({ timestamp: now }))).toHaveProperty('token');
    expect(await confirmAdminTotp(second.enrollmentToken, adminTotp(second.enrollment.secret).generate({ timestamp: now }))).toEqual({ error: 'ENROLLMENT_EXPIRED' });
  });
});
