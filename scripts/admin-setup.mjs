import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const file = '.env.local';
let text = existsSync(file) ? readFileSync(file, 'utf8') : '';
for (const [name, value] of Object.entries({ ADMIN_PASSWORD: randomBytes(24).toString('base64url'), ADMIN_ENCRYPTION_KEY: randomBytes(32).toString('hex') })) {
  if (!new RegExp(`^${name}=.+$`, 'm').test(text)) {
    text += String.fromCharCode(10) + name + '=' + value + String.fromCharCode(10);
    text += `\n${name}=${value}\n`;
  }
}
writeFileSync(file, text, { mode: 0o600 });
console.log('Admin credentials are configured in .env.local. Read ADMIN_PASSWORD locally, then restart the application. Existing credentials were preserved.');
