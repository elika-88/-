import 'server-only';
import { createClient, type Client, type Config } from '@libsql/client';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function databaseConfiguration(): { mode: 'local' | 'turso'; config: Config; path?: string } {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (url || authToken) {
    if (!url || !authToken) throw new Error('Both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured.');
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error('TURSO_DATABASE_URL must be a valid libsql or HTTPS URL.'); }
    if (!['libsql:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('TURSO_DATABASE_URL must be a libsql or HTTPS URL without embedded credentials.');
    }
    return { mode: 'turso', config: { url, authToken } };
  }
  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') {
    throw new Error('Configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on Vercel. Local database storage is not persistent there.');
  }
  const path = resolve(process.env.ADMIN_DATABASE_PATH || '.data/admin.sqlite');
  return { mode: 'local', path, config: { url: pathToFileURL(path).href } };
}

// Native SQLite writes must complete before another in-process transaction starts.
const localQueues = new Map<string, Promise<unknown>>();

export async function withDatabase<T>(action: (db: Client) => Promise<T>): Promise<T> {
  const configuration = databaseConfiguration();
  const run = async () => {
    if (configuration.path) await mkdir(dirname(configuration.path), { recursive: true, mode: 0o700 });
    const db = createClient(configuration.config);
    try {
      await db.execute('PRAGMA foreign_keys = ON');
      if (configuration.mode === 'local') await db.execute('PRAGMA busy_timeout = 5000');
      return await action(db);
    } finally { db.close(); }
  };
  if (configuration.mode === 'turso') return run();
  const key = configuration.config.url;
  const task = (localQueues.get(key) ?? Promise.resolve()).then(run, run);
  localQueues.set(key, task);
  try { return await task; }
  finally { if (localQueues.get(key) === task) localQueues.delete(key); }
}
