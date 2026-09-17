import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
vi.mock('server-only', () => ({}));
import { GET, POST } from '@/app/api/admin/route';
import { loginAdmin, readStoredSettings, saveStoredSettings, validAdminSession } from '@/lib/server/admin-db';
import { readOpenAIEnvironment, readApiFormat } from '@/lib/server/env';
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'study-admin-'));
  vi.stubEnv('ADMIN_DATABASE_PATH', join(directory, 'admin.sqlite'));
  vi.stubEnv('ADMIN_PASSWORD', 'test-only-admin-password');
  vi.stubEnv('ADMIN_ENCRYPTION_KEY', 'ab'.repeat(32));
  vi.stubEnv('OPENAI_API_KEY', 'test-only-environment-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  try { rmSync(directory, { recursive: true, force: true }); }
  catch (error) {
    // Native libSQL on Windows may retain a closed file handle until process exit.
    if (process.platform !== 'win32' || !['EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
});
const settings = { baseURL: 'https://example.com/v1', apiKey: 'test-only-confidential-key', model: 'test-model', apiFormat: 'responses' as const };
function request(body: unknown, token = '', origin = 'http://localhost') {
  return new NextRequest('http://localhost/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: `lumina_admin=${token}` }, body: JSON.stringify(body) });
}
describe('admin database', () => {
  it('accepts an existing nine-character administrator password', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'test-1234');
    expect(await loginAdmin('test-1234')).toHaveProperty('token');
  });
  it('rejects administrator passwords shorter than six characters', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'short');
    expect(await loginAdmin('short')).toEqual({ error: 'UNCONFIGURED' });
  });
  it('encrypts saved secrets and feeds them to the generator', async () => {
    await saveStoredSettings(settings, 0);
    expect(readFileSync(join(directory, 'admin.sqlite')).includes(Buffer.from(settings.apiKey))).toBe(false);
    expect((await readStoredSettings())?.settings).toEqual(settings);
    expect((await readOpenAIEnvironment()).apiKey).toBe(settings.apiKey);
    expect(await readApiFormat()).toBe('responses');
    await expect(saveStoredSettings(settings, 0)).rejects.toThrow('CONFLICT');
    vi.stubEnv('ADMIN_ENCRYPTION_KEY', 'cd'.repeat(32));
    await expect(readStoredSettings()).rejects.toThrow();
  });
  it('requires authentication and rejects foreign-origin writes', async () => {
    expect((await GET(new NextRequest('http://localhost/api/admin'))).status).toBe(401);
    expect((await POST(request({ action: 'save', settings: { ...settings, revision: 0 } }))).status).toBe(401);
    expect((await POST(request({ action: 'login', password: 'test-only-admin-password' }, '', 'https://evil.example'))).status).toBe(403);
  });
  it('accepts the actual browser host when the framework reconstructs localhost', async () => {
    const req = request({ action: 'login', password: 'test-only-admin-password' }, '', 'http://127.0.0.1:3000');
    req.headers.set('host', '127.0.0.1:3000');
    expect((await POST(req)).status).toBe(200);
  });
  it('logs in, saves, masks credentials, keeps a blank key, and revokes logout', async () => {
    const login = await POST(request({ action: 'login', password: 'test-only-admin-password' }));
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('HttpOnly');
    const token = login.cookies.get('lumina_admin')!.value;
    const save = await POST(request({ action: 'save', settings: { ...settings, revision: 0 } }, token));
    expect(save.status).toBe(200);
    expect(await save.text()).not.toContain(settings.apiKey);
    const keep = await POST(request({ action: 'save', settings: { ...settings, apiKey: '', model: 'new-model', revision: 1 } }, token));
    expect(keep.status).toBe(200);
    expect((await readOpenAIEnvironment()).model).toBe('new-model');
    expect((await readOpenAIEnvironment()).apiKey).toBe(settings.apiKey);
    const status = await GET(new NextRequest('http://localhost/api/admin', { headers: { Cookie: `lumina_admin=${token}` } }));
    const view = await status.json();
    expect(view).not.toHaveProperty('users');
    expect(view.audit.length).toBeGreaterThan(0);
    expect(view.audit[0]).toHaveProperty('created_at');
    expect(view.audit[0]).not.toHaveProperty('origin');
    expect(view.audit[0]).not.toHaveProperty('status');
    const changedURL = await POST(request({ action: 'save', settings: { ...settings, baseURL: 'https://other.example/v1', apiKey: '', revision: 2 } }, token));
    expect(changedURL.status).toBe(400);
    await POST(request({ action: 'logout' }, token));
    expect(await validAdminSession(token)).toBe(false);
  });
  it('limits repeated login failures and invalidates sessions after password change', async () => {
    const login = await loginAdmin('test-only-admin-password');
    if (!('token' in login)) throw new Error('Login failed');
    expect(await validAdminSession(login.token)).toBe(true);
    vi.stubEnv('ADMIN_PASSWORD', 'changed-test-only-password');
    expect(await validAdminSession(login.token)).toBe(false);
    for (let i = 0; i < 10; i++) expect(await loginAdmin('wrong')).toEqual({ error: 'INVALID' });
    expect(await loginAdmin('wrong')).toEqual({ error: 'LIMITED' });
  });
});
