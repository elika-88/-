import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
vi.mock('server-only', () => ({}));
vi.mock('@libsql/client', async (original) => {
  const actual = await original<typeof import('@libsql/client')>();
  return { ...actual, createClient: vi.fn(actual.createClient) };
});
import { createClient } from '@libsql/client';
import { databaseConfiguration, withDatabase } from '@/lib/server/database';
import { saveStoredSettings } from '@/lib/server/admin-db';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'lumina-db-'));
  vi.stubEnv('ADMIN_DATABASE_PATH', join(directory, 'test.sqlite'));
  vi.stubEnv('ADMIN_ENCRYPTION_KEY', 'ab'.repeat(32));
  vi.stubEnv('TURSO_DATABASE_URL', undefined);
  vi.stubEnv('TURSO_AUTH_TOKEN', undefined);
  vi.stubEnv('VERCEL', undefined);
  vi.mocked(createClient).mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  try { rmSync(directory, { recursive: true, force: true }); }
  catch (error) {
    if (process.platform !== 'win32' || !['EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
});

describe('persistent local/Turso database selection', () => {
  it('defaults to the existing local SQLite path and preserves data across connections', async () => {
    const legacy = new DatabaseSync(join(directory, 'test.sqlite'));
    legacy.exec("CREATE TABLE existing(value TEXT); INSERT INTO existing VALUES('preserved')");
    legacy.close();
    expect(databaseConfiguration().mode).toBe('local');
    expect(await withDatabase(async db => (await db.execute('SELECT value FROM existing')).rows[0].value)).toBe('preserved');
    await withDatabase(async db => { await db.execute("INSERT INTO existing VALUES('persisted')"); });
    expect(await withDatabase(async db => (await db.execute('SELECT count(*) AS total FROM existing')).rows[0].total)).toBe(2);
  });

  it('automatically selects Turso when both credentials are configured', () => {
    vi.stubEnv('TURSO_DATABASE_URL', 'libsql://unit-test.turso.io');
    vi.stubEnv('TURSO_AUTH_TOKEN', 'test-token');
    expect(databaseConfiguration()).toEqual({ mode: 'turso', config: { url: 'libsql://unit-test.turso.io', authToken: 'test-token' } });
  });

  it('requires cloud configuration on Vercel and rejects incomplete configuration locally', () => {
    vi.stubEnv('VERCEL', '1');
    expect(() => databaseConfiguration()).toThrow('Vercel');
    vi.stubEnv('VERCEL', undefined);
    vi.stubEnv('TURSO_DATABASE_URL', 'libsql://unit-test.turso.io');
    expect(() => databaseConfiguration()).toThrow('Both');
  });

  it.each(['file:secret.sqlite', 'http://example.com', 'https://token@example.com', 'https://example.com?token=secret', 'invalid'])('rejects an invalid remote URL %s', (url) => {
    vi.stubEnv('TURSO_DATABASE_URL', url);
    vi.stubEnv('TURSO_AUTH_TOKEN', 'test-token');
    expect(() => databaseConfiguration()).toThrow();
  });

  it('does not create a local fallback if a configured cloud connection fails', async () => {
    vi.stubEnv('TURSO_DATABASE_URL', 'libsql://unit-test.turso.io');
    vi.stubEnv('TURSO_AUTH_TOKEN', 'test-token');
    vi.mocked(createClient).mockImplementationOnce(() => { throw new Error('Cloud unavailable'); });
    await expect(withDatabase(async db => db.execute('SELECT 1'))).rejects.toThrow('Cloud unavailable');
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({ url: 'libsql://unit-test.turso.io' }));
  });

  it('atomically prevents concurrent configuration writes at the same revision', async () => {
    const settings = { baseURL: 'https://example.com/v1', apiKey: 'test-only-key', model: 'test-model', apiFormat: 'responses' as const };
    const result = await Promise.allSettled([saveStoredSettings(settings, 0), saveStoredSettings(settings, 0)]);
    expect(result.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter(value => value.status === 'rejected')).toHaveLength(1);
  });
});
