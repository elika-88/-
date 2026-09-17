import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('initializes credentials once and preserves existing values on repeated setup', () => {
  const folder = mkdtempSync(join(tmpdir(), 'admin-setup-'));
  const script = resolve('scripts/admin-setup.mjs');
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development' };
  delete env.ADMIN_PASSWORD; delete env.ADMIN_ENCRYPTION_KEY;
  try {
    writeFileSync(join(folder, '.env.local'), 'ADMIN_PASSWORD=\nADMIN_ENCRYPTION_KEY=\n');
    execFileSync(process.execPath, [script], { cwd: folder, env });
    const first = readFileSync(join(folder, '.env.local'), 'utf8');
    expect(first.match(/^ADMIN_PASSWORD=/gm)).toHaveLength(1);
    expect(first.match(/^ADMIN_ENCRYPTION_KEY=/gm)).toHaveLength(1);
    execFileSync(process.execPath, [script], { cwd: folder, env });
    expect(readFileSync(join(folder, '.env.local'), 'utf8')).toBe(first);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
