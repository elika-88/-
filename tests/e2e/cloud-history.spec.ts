import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import type { StudySession } from '../../lib/client/sessions';
import { studyKitFixture } from '../fixtures/studyKit';
import { generationJobFixture } from '../fixtures/generationJob';
import type { GenerationJob } from '../../lib/contracts/generation-jobs';
import { readFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const user = { id: 'a20e5041-118e-4de0-b7b6-6ecf279c5b23', username: 'CloudStudent', email: 'cloud@example.invalid', createdAt: '2026-09-23T00:00:00.000Z' };
const otherUser = { ...user, id: '1a6c8cc9-8707-43b0-9072-3708383773c4', username: 'OtherStudent', email: 'other@example.invalid' };
const blank = (id: string, title: string): StudySession => ({ id, title, customTitle: true, lecture: 'Private course text', outputLanguage: 'en', tab: 'summary', kit: null, updatedAt: 1 });
async function verifiedFixtureAccount(name: string, email: string, contexts: BrowserContext[], baseURL: string) {
  // Initialize the isolated E2E database through the real auth route, then seed
  // sessions directly. This test exercises study sync without sending email.
  const bootstrap = await contexts[0].request.post('/api/auth', {
    headers: { Origin: baseURL }, data: { action: 'login', identifier: `setup-${randomUUID()}`, password: 'invalid' },
  });
  expect(bootstrap.status()).toBe(401);
  const path = process.env.LUMINA_E2E_DATABASE_PATH;
  if (!path) throw new Error('E2E database path is missing.');
  const db = createClient({ url: pathToFileURL(resolve(path)).href });
  const id = randomUUID();
  const now = Date.now();
  try {
    await db.execute('PRAGMA busy_timeout = 5000');
    await db.execute({
      sql: 'INSERT INTO app_users (id, username, username_key, email, email_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, name, name.toLowerCase(), email, email.toLowerCase(), 'disabled-e2e-password', new Date(now).toISOString()],
    });
    for (const context of contexts) {
      const token = randomBytes(32).toString('hex');
      await db.execute({
        sql: 'INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
        args: [createHash('sha256').update(token).digest('hex'), id, now + 7 * 24 * 60 * 60 * 1000, now],
      });
      await context.addCookies([{ name: 'lumina_user', value: token, url: baseURL, httpOnly: true, sameSite: 'Lax' }]);
    }
  } finally { db.close(); }
  return id;
}
async function sidebar(page: Page) {
  const open = page.getByRole('button', { name: 'Open sidebar', exact: true });
  if (await open.isVisible()) await open.click();
}
async function cloud(page: Page, records = new Map<string, StudySession>()) {
  let current: typeof user | null = user;
  let offline = false;
  const revisions: Record<string, number> = Object.fromEntries([...records.keys()].map(id => [id, 1]));
  await page.route('**/api/auth', route => {
    if (route.request().method() === 'POST') current = null;
    return route.fulfill({ json: { user: current } });
  });
  await page.route('**/api/generation-jobs?*', route => route.fulfill({ json: { userId: current!.id, jobs: [], nextCursor: null } }));
  await page.route('**/api/study-sessions', async route => {
    if (offline) return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', error: 'Cloud temporarily unavailable. Your edits are retained.' } });
    const req = route.request();
    if (req.headers()['x-lumina-account'] !== current?.id) return route.fulfill({ status: 409, json: { code: 'ACCOUNT_CHANGED', error: 'Account changed' } });
    if (req.method() === 'GET') return route.fulfill({ json: { userId: current.id, sessions: current.id === user.id ? [...records.values()] : [], revisions: current.id === user.id ? revisions : {}, storage: 'local' } });
    const body = req.postDataJSON(); const id = body.session?.id ?? body.id;
    if ((revisions[id] ?? 0) !== body.expectedRevision || revisions[id] && !records.has(id)) return route.fulfill({ status: 409, json: { code: 'CONFLICT', error: 'Changed elsewhere' } });
    revisions[id] = (revisions[id] ?? 0) + 1;
    if (req.method() === 'PUT') { records.set(id, body.session); return route.fulfill({ json: { session: body.session, revision: revisions[id] } }); }
    records.delete(id); return route.fulfill({ json: { deleted: true, revision: revisions[id] } });
  });
  return { records, revisions, offline: (value: boolean) => { offline = value; }, switchUser: (value: typeof user | null) => { current = value; } };
}

test('imports guest history only after consent, keeps originals, and isolates sign-out', async ({ page }) => {
  const guest = blank('guest-lecture', 'Guest notes');
  await page.addInitScript(item => { if (!localStorage.getItem('lumina.sessions.v1')) localStorage.setItem('lumina.sessions.v1', JSON.stringify({ version: 1, activeId: item.id, sessions: [item] })); }, guest);
  const state = await cloud(page);
  await page.goto('/');
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue('');
  expect(state.records.size).toBe(0);
  await page.getByRole('button', { name: 'Import guest lectures', exact: true }).click();
  await expect(page.getByText('1 of 1 lectures imported.', { exact: false })).toBeVisible();
  expect(state.records.size).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('lumina.sessions.v1'))).toContain('Guest notes');
  await page.reload(); await expect(page.getByRole('button', { name: 'Import guest lectures' })).toHaveCount(0);
  await expect(page.getByLabel('Lecture title', { exact: false }).first()).toHaveValue('Guest notes');
  await page.getByLabel('Lecture title', { exact: false }).first().fill('Account-only title');
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
  await sidebar(page); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Lecture title', { exact: false }).first()).toHaveValue('Guest notes');
  await expect(page.getByText('Account-only title', { exact: true })).toHaveCount(0);
});

test('preserves failed edits through reload and saves them on retry', async ({ page }) => {
  const item = blank('course-a', 'Cloud course'); const state = await cloud(page, new Map([[item.id, item]]));
  await page.goto('/'); await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
  state.offline(true);
  await page.getByLabel('Lecture text', { exact: true }).fill('Unsaved text that must survive reload');
  await expect(page.getByRole('button', { name: 'Retry sync', exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/cloud-save-error-${test.info().project.name}.png`, fullPage: true });
  state.offline(false); page.on('dialog', dialog => dialog.accept()); await page.reload();
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue('Unsaved text that must survive reload');
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
  expect(state.records.get(item.id)?.lecture).toBe('Unsaved text that must survive reload');
});

test('shows revision conflicts, saves a local copy, and preserves a remote deletion', async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 780 });
  const item = blank('conflict-a', 'Conflict lesson'); const state = await cloud(page, new Map([[item.id, item]]));
  await page.goto('/'); await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
  state.records.set(item.id, { ...item, lecture: 'Newer version from another device' }); state.revisions[item.id] = 2;
  await page.getByLabel('Lecture text', { exact: true }).fill('My own changes');
  await expect(page.getByText('Sync conflict:', { exact: false })).toBeVisible();
  await page.screenshot({ path: `test-results/cloud-conflict-${test.info().project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Keep local copy', exact: true }).click();
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
  expect(state.records.get(item.id)?.lecture).toBe('Newer version from another device');
  const copy = [...state.records.values()].find(s => s.id !== item.id)!;
  expect(copy.lecture).toBe('My own changes');
  state.records.delete(copy.id); state.revisions[copy.id]++;
  await page.getByLabel('Lecture text', { exact: true }).fill('Deleted remotely but still editing');
  await expect(page.getByText('This lecture was deleted in the cloud.', { exact: false })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Use cloud version', exact: true }).click();
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
  expect(state.records.has(copy.id)).toBe(false);
});

test('switching account hides old data and ignores an old task submission response', async ({ page }) => {
  const kit = studyKitFixture(); const item = { ...blank('gen-a', 'Private A'), lecture: kit.source.text + '\n' + 'Learning evidence is a useful way to study. '.repeat(20) }; kit.source.text = item.lecture;
  const state = await cloud(page, new Map([[item.id, item]]));
  await page.addInitScript(result => {
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      if (args[0] === '/api/generation-jobs' && args[1]?.method === 'POST') {
        document.documentElement.dataset.generationHeld = 'true';
        return new Promise<Response>(resolve => window.addEventListener('release-generation', () => resolve(Response.json(result)), { once: true }));
      }
      return original(...args);
    };
  }, { userId: user.id, job: generationJobFixture({ sessionId: item.id }), reused: false });
  await page.goto('/'); await page.getByRole('button', { name: 'Generate materials', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-generation-held', 'true');
  state.switchUser(otherUser);
  await page.evaluate(() => { const channel = new BroadcastChannel('lumina-auth'); channel.postMessage('changed'); channel.close(); });
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
  await page.evaluate(async () => { window.dispatchEvent(new Event('release-generation')); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
  await expect(page.getByRole('heading', { name: kit.lectureTitle })).toHaveCount(0);
  expect(state.records.get(item.id)?.kit).toBeNull();
});

test('real accounts sync create, generated materials, rename and delete across independent devices', async ({ page, browser, baseURL }) => {
  const suffix = `${Date.now()}_${test.info().project.name === 'mobile' ? 'm' : 'd'}`;
  const username = `cloud_${suffix}`;
  const second = await browser.newContext({ baseURL }); const third = await browser.newContext({ baseURL });
  try {
    const accountId = await verifiedFixtureAccount(username, `${username}@example.invalid`, [page.context(), second], baseURL!);
    await verifiedFixtureAccount(`b_${suffix}`, `b_${suffix}@example.invalid`, [third], baseURL!);
    const kit = studyKitFixture(); kit.source.text += '\n' + 'This lecture explains reliable learning and evidence. '.repeat(15);
    let job: GenerationJob | null = null;
    await page.route('**/api/generation-jobs**', async route => {
      const req = route.request(); const url = new URL(req.url());
      if (req.method() === 'POST') {
        const input = req.postDataJSON();
        const cloud = await page.request.get('/api/study-sessions', { headers: { 'X-Lumina-Account': accountId } });
        const records = await cloud.json();
        expect(input.expectedRevision).toBe(records.revisions[input.sessionId]);
        const saved = await page.request.put('/api/study-sessions', { headers: { Origin: baseURL!, 'X-Lumina-Account': accountId },
          data: { session: { ...records.sessions.find((session: StudySession) => session.id === input.sessionId), kit }, expectedRevision: input.expectedRevision } });
        expect(saved.ok()).toBe(true);
        job = generationJobFixture({ userId: accountId, sessionId: input.sessionId, sourceRevision: input.expectedRevision,
          status: 'succeeded', stage: 'complete', savedSessionId: input.sessionId, savedRevision: input.expectedRevision + 1, saveDisposition: 'updated' });
        return route.fulfill({ status: 202, json: { userId: accountId, job: { ...job, status: 'queued', stage: null }, reused: false } });
      }
      if (url.pathname === '/api/generation-jobs') return route.fulfill({ json: { userId: accountId, jobs: job ? [job] : [], nextCursor: null } });
      return route.fulfill({ json: { userId: accountId, job, result: kit } });
    });
    await page.goto('/');
    await page.getByLabel('Lecture title', { exact: false }).first().fill('Multi-device lecture');
    await page.getByLabel('Lecture text', { exact: true }).fill(kit.source.text);
    await page.getByRole('button', { name: 'Generate materials', exact: true }).click();
    await expect(page.getByRole('heading', { name: kit.lectureTitle })).toBeVisible();
    await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
    const device = await second.newPage(); await device.goto('/');
    await expect(device.getByLabel('Lecture text', { exact: true })).toHaveValue(kit.source.text);
    await expect(device.getByRole('heading', { name: kit.lectureTitle })).toBeVisible();
    const stranger = await third.newPage(); await stranger.goto('/');
    await expect(stranger.getByLabel('Lecture text', { exact: true })).toHaveValue('');
    await device.getByLabel('Lecture title', { exact: false }).first().fill('Renamed on device two');
    await expect(device.getByTestId('sync-status')).toHaveText('Saved to cloud');
    await page.getByRole('button', { name: 'Refresh cloud', exact: true }).click();
    await expect(page.getByLabel('Lecture title', { exact: false }).first()).toHaveValue('Renamed on device two');
    await sidebar(page);
    await page.locator('.gpt-chat-item:visible').filter({ hasText: 'Renamed on device two' }).getByRole('button', { name: 'Options', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete lecture?' }).getByRole('button', { name: 'Delete', exact: true }).click();
    if (await page.getByRole('dialog', { name: 'Lecture history' }).isVisible()) await page.keyboard.press('Escape');
    await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
    await device.getByRole('button', { name: 'Refresh cloud', exact: true }).click();
    await expect(device.getByLabel('Lecture text', { exact: true })).toHaveValue('');
  } finally { await second.close(); await third.close(); }
});

test('exports the current account instead of private guest history', async ({ page }) => {
  const guest = blank('guest-export', 'Guest-only material'); const account = blank('account-export', 'Account-only material');
  await page.addInitScript(item => localStorage.setItem('lumina.sessions.v1', JSON.stringify({ version: 1, activeId: item.id, sessions: [item] })), guest);
  await cloud(page, new Map([[account.id, account]])); await page.goto('/');
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
  await sidebar(page); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.locator('.gpt-settings-dialog:visible');
  await settings.getByRole('button', { name: 'Learning & Data', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const downloaded = await downloading; const result = JSON.parse(await readFile((await downloaded.path())!, 'utf8'));
  expect(result.sessions.map((s: StudySession) => s.title)).toEqual(['Account-only material']);
});

test('storage-event identity changes hide old lectures without BroadcastChannel', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'BroadcastChannel', { value: undefined }); });
  const item = blank('fallback-identity', 'First account private'); const state = await cloud(page, new Map([[item.id, item]]));
  await page.goto('/'); await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue(item.lecture);
  state.switchUser(otherUser);
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'lumina.auth.changed', newValue: 'changed' })));
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue('');
  await expect(page.getByText('First account private', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
});
