import { createClient } from '@libsql/client';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import env from '@next/env';

env.loadEnvConfig(process.cwd());
if (!process.argv.includes('--confirm')) {
  console.error('To reset the administrator authenticator and revoke all administrator sessions, run: node scripts/admin-reset-totp.mjs --confirm');
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
let config;
if (url || authToken) {
  if (!url || !authToken) throw new Error('Both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured.');
  const parsed = new URL(url);
  if (!['libsql:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Invalid TURSO_DATABASE_URL.');
  }
  config = { url, authToken };
} else {
  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') throw new Error('Configure Turso on Vercel before resetting the authenticator.');
  const path = resolve(process.env.ADMIN_DATABASE_PATH || '.data/admin.sqlite');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  config = { url: pathToFileURL(path).href };
}

const db = createClient(config);
try {
  const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map(row => String(row.name));
  const statements = ['admin_mfa', 'admin_enrollment', 'sessions', 'login_limit']
    .filter(table => tables.includes(table)).map(table => `DELETE FROM ${table}`);
  if (tables.includes('audit')) statements.push({ sql: 'INSERT INTO audit(event,created_at) VALUES(?,?)', args: ['authenticator_reset', Date.now()] });
  if (statements.length) await db.batch(statements, 'write');
  console.log('Administrator authenticator and sessions reset. Open /admin to enroll Google Authenticator again. Settings and user data were preserved.');
} finally { db.close(); }
