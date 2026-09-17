import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
import { POST } from '@/app/api/admin/route';
import { loginAdmin, saveStoredSettings } from '@/lib/server/admin-db';

let directory: string;
let token: string;
const fetchMock = vi.fn();
const baseURL = 'https://relay.example/v1';

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'study-admin-models-'));
  vi.stubEnv('ADMIN_DATABASE_PATH', join(directory, 'admin.sqlite'));
  vi.stubEnv('ADMIN_PASSWORD', 'test-only-admin-password');
  vi.stubEnv('ADMIN_ENCRYPTION_KEY', 'ab'.repeat(32));
  vi.stubEnv('OPENAI_BASE_URL', baseURL);
  vi.stubEnv('OPENAI_API_KEY', 'test-only-environment-key');
  const login = await loginAdmin('test-only-admin-password');
  if (!('token' in login)) throw new Error('Login failed');
  token = login.token;
  fetchMock.mockReset().mockResolvedValue(Response.json({ data: [{ id: 'test-model' }] }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  try { rmSync(directory, { recursive: true, force: true }); }
  catch (error) {
    // Native libSQL on Windows may retain a closed file handle until process exit.
    if (process.platform !== 'win32' || !['EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
});

function request(url = baseURL, apiKey = '', session = token) {
  return new NextRequest('http://localhost/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: `lumina_admin=${session}` },
    body: JSON.stringify({ action: 'fetch_models', baseURL: url, apiKey }),
  });
}

describe('admin model discovery', () => {
  it('requires an administrator session before querying providers', async () => {
    expect((await POST(request(baseURL, '', ''))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the environment key only for the same normalized destination', async () => {
    const response = await POST(request('https://RELAY.example:443/v1///'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ models: ['test-model'] });
    expect(fetchMock).toHaveBeenCalledWith(`${baseURL}/models`, expect.objectContaining({
      headers: { Accept: 'application/json', Authorization: 'Bearer test-only-environment-key' },
      redirect: 'error',
    }));
  });

  it('uses the saved key for its destination', async () => {
    await saveStoredSettings({ baseURL: 'https://saved.example/v1', apiKey: 'test-only-saved-key', model: 'test-model', apiFormat: 'responses' }, 0);
    const response = await POST(request('https://saved.example/v1/'));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith('https://saved.example/v1/models', expect.objectContaining({
      headers: { Accept: 'application/json', Authorization: 'Bearer test-only-saved-key' },
    }));
  });

  it('does not forward an environment key to a changed URL', async () => {
    expect((await POST(request('https://other.example/v1'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not forward a saved key to a changed URL', async () => {
    await saveStoredSettings({ baseURL, apiKey: 'test-only-saved-key', model: 'test-model', apiFormat: 'responses' }, 0);
    expect((await POST(request('https://other.example/v1'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries a new destination with its explicitly entered key', async () => {
    const response = await POST(request('https://other.example/v1', 'test-only-new-key'));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith('https://other.example/v1/models', expect.objectContaining({
      headers: { Accept: 'application/json', Authorization: 'Bearer test-only-new-key' },
    }));
  });

  it.each(['file:///secret', 'http://relay.example/v1', 'https://user:password@relay.example/v1', 'https://relay.example/v1?key=secret'])('rejects invalid destination %s before sending credentials', async (url) => {
    expect((await POST(request(url, 'test-only-new-key'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed entered key', async () => {
    expect((await POST(request(baseURL, 'invalid\r\nkey'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports upstream failures and releases the timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('Upstream unavailable'));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Upstream unavailable' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
