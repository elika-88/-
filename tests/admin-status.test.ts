import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { GET } from '@/app/api/admin/status/route';

afterEach(() => vi.unstubAllEnvs());

describe('admin readiness endpoint', () => {
  it('returns a non-error public status when credentials are missing', async () => {
    vi.stubEnv('ADMIN_PASSWORD', undefined);
    vi.stubEnv('ADMIN_ENCRYPTION_KEY', undefined);
    vi.stubEnv('VERCEL', undefined);
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.configured).toBe(false);
    expect(body.setupError).toContain('admin:setup');
    expect(body).not.toHaveProperty('apiKey');
  });

  it('gives Vercel-specific setup instructions instead of local commands', async () => {
    vi.stubEnv('ADMIN_PASSWORD', undefined);
    vi.stubEnv('ADMIN_ENCRYPTION_KEY', undefined);
    vi.stubEnv('VERCEL', '1');
    const body = await (await GET()).json();
    expect(body.setupError).toContain('in Vercel');
    expect(body.setupError).not.toContain('npm run admin:setup');
  });

  it('reports the persistent database requirement after admin secrets are present', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'test-only-password');
    vi.stubEnv('ADMIN_ENCRYPTION_KEY', 'ab'.repeat(32));
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('TURSO_DATABASE_URL', undefined);
    vi.stubEnv('TURSO_AUTH_TOKEN', undefined);
    const body = await (await GET()).json();
    expect(body.configured).toBe(false);
    expect(body.setupError).toContain('TURSO_DATABASE_URL');
  });
});
