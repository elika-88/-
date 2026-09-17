import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import env from '@next/env';
const file = '.env.local';
let text = existsSync(file) ? readFileSync(file, 'utf8') : '';
env.loadEnvConfig(process.cwd());
const values = { ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, ADMIN_ENCRYPTION_KEY: process.env.ADMIN_ENCRYPTION_KEY };
if (values.ADMIN_PASSWORD && values.ADMIN_PASSWORD.length < 8) {
  console.error('ADMIN_PASSWORD must contain at least 8 characters. Existing values were not changed.');
  process.exit(1);
}
if (values.ADMIN_ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(values.ADMIN_ENCRYPTION_KEY)) {
  console.error('ADMIN_ENCRYPTION_KEY must be 64 hexadecimal characters. Restore the original key; existing values were not changed.');
  process.exit(1);
}
let changed = false;
for (const [name, value] of Object.entries({ ADMIN_PASSWORD: randomBytes(24).toString('base64url'), ADMIN_ENCRYPTION_KEY: randomBytes(32).toString('hex') })) {
  if (!values[name]) {
    text = text.split(/\r?\n/).filter(line => !line.startsWith(name + '=')).join('\n');
    text += '\n' + name + '=' + value + '\n';
    changed = true;
  }
}
if (changed) writeFileSync(file, text, { mode: 0o600 });
console.log('Admin credentials are configured in .env.local or the process environment. Restart the application if values changed. Existing credentials were preserved.');
