import { expect, test, type Page } from '@playwright/test';
import type { StudySession } from '../../lib/client/sessions';
import { generationJobFixture, jobUserId } from '../fixtures/generationJob';
import { studyKitFixture } from '../fixtures/studyKit';
import type { GenerationJob } from '../../lib/contracts/generation-jobs';

const user = { id: jobUserId, username: 'JobStudent', email: 'jobs@example.invalid', createdAt: '2026-09-23T00:00:00.000Z' };
const otherUser = { ...user, id: '1a6c8cc9-8707-43b0-9072-3708383773c4', username: 'OtherStudent' };

async function background(page: Page) {
  const kit = studyKitFixture(); kit.source.text += '\n' + 'Learning evidence helps students understand data structures. '.repeat(20);
  const lecture: StudySession = { id: 'course-a', title: 'Background course', customTitle: true, lecture: kit.source.text, outputLanguage: 'en', tab: 'summary', kit: null, updatedAt: 1 };
  const records = new Map([[lecture.id, lecture]]); const revisions: Record<string, number> = { [lecture.id]: 1 };
  let current = user; let job: GenerationJob | null = null; let posts = 0; let gets = 0; let retries = 0; let cancels = 0; let legacy = 0;
  let holdSave: Promise<void> | null = null; let offline = false; let loseCreate = false; let checksUnavailable = false; let releaseDetail: Promise<void> | null = null;
  const keys: string[] = []; const requestOwners: string[] = []; const events: string[] = [];
  await page.route('**/api/auth', route => route.fulfill({ json: { user: current } }));
  await page.route('**/api/generate', route => { legacy++; return route.fulfill({ status: 500 }); });
  await page.route('**/api/study-sessions', async route => {
    const req = route.request();
    if (req.headers()['x-lumina-account'] !== current.id) return route.fulfill({ status: 409, json: { code: 'ACCOUNT_CHANGED', error: 'Changed' } });
    if (req.method() === 'GET') return route.fulfill({ json: { userId: current.id, sessions: current.id === user.id ? [...records.values()] : [], revisions: current.id === user.id ? revisions : {}, storage: 'local' } });
    if (holdSave) await holdSave;
    if (offline) return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', error: 'Cloud save failed.' } });
    const body = req.postDataJSON(); const id = body.session.id;
    if ((revisions[id] ?? 0) !== body.expectedRevision) return route.fulfill({ status: 409, json: { code: 'CONFLICT', error: 'Changed elsewhere' } });
    records.set(id, body.session); revisions[id] = (revisions[id] ?? 0) + 1; events.push('saved');
    return route.fulfill({ json: { session: body.session, revision: revisions[id] } });
  });
  await page.route('**/api/generation-jobs**', async route => {
    const req = route.request(); const url = new URL(req.url()); const owner = req.headers()['x-lumina-account']; requestOwners.push(owner);
    if (owner !== current.id) return route.fulfill({ status: 409, json: { code: 'ACCOUNT_CHANGED', error: 'Changed' } });
    const tail = url.pathname.slice('/api/generation-jobs'.length);
    if (req.method() === 'GET' && !tail) {
      if (checksUnavailable) return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', error: 'Task lookup unavailable.' } });
      return route.fulfill({ json: { userId: owner, jobs: job && job.userId === owner && job.sessionId === url.searchParams.get('sessionId') ? [job] : [], nextCursor: null } });
    }
    if (req.method() === 'POST' && !tail) {
      posts++; events.push('created'); const body = req.postDataJSON();
      expect(body.expectedRevision).toBe(revisions[body.sessionId]); expect(records.has(body.sessionId)).toBe(true);
      const reused = keys.includes(body.idempotencyKey); keys.push(body.idempotencyKey);
      if (!reused) job = generationJobFixture({ id: crypto.randomUUID(), sessionId: body.sessionId, sourceRevision: body.expectedRevision, userId: owner });
      if (loseCreate) { loseCreate = false; return route.abort('failed'); }
      return route.fulfill({ status: reused ? 200 : 202, json: { userId: owner, job, reused } });
    }
    if (tail.endsWith('/cancel')) {
      cancels++; job = { ...job!, status: 'cancelled', stage: null };
      return route.fulfill({ json: { userId: owner, job } });
    }
    if (tail.endsWith('/retry')) {
      retries++; const body = req.postDataJSON(); expect(keys).not.toContain(body.idempotencyKey); keys.push(body.idempotencyKey);
      job = generationJobFixture({ id: crypto.randomUUID(), retryOf: job!.id, sessionId: job!.sessionId, sourceRevision: job!.sourceRevision });
      return route.fulfill({ status: 202, json: { userId: owner, job, reused: false } });
    }
    gets++;
    const response = { userId: owner, job, result: job?.status === 'succeeded' ? kit : null };
    if (releaseDetail) await releaseDetail;
    return route.fulfill({ json: response });
  });
  return { lecture, records, revisions, kit, events, keys, requestOwners,
    counts: () => ({ posts, gets, retries, cancels, legacy }),
    setJob: (patch: Partial<GenerationJob>) => { job = generationJobFixture({ ...job, ...patch }); },
    getJob: () => job,
    holdSave: (gate: Promise<void> | null) => { holdSave = gate; }, offline: (value: boolean) => { offline = value; },
    loseCreate: () => { loseCreate = true; }, checksUnavailable: (value: boolean) => { checksUnavailable = value; },
    holdDetail: (gate: Promise<void> | null) => { releaseDetail = gate; },
    switchUser: () => { current = otherUser; },
    complete: (copy = false) => {
      const savedSessionId = copy ? 'generated-copy' : lecture.id;
      const saved = { ...lecture, id: savedSessionId, title: copy ? 'Background course (generated copy)' : lecture.title, kit };
      records.set(savedSessionId, saved); revisions[savedSessionId] = (revisions[savedSessionId] ?? 0) + 1;
      job = { ...job!, status: 'succeeded', stage: 'complete', savedSessionId, savedRevision: revisions[savedSessionId], saveDisposition: copy ? 'copy' : 'updated' };
    },
  };
}
async function generate(page: Page) { await page.getByRole('button', { name: 'Generate materials', exact: true }).click(); }

test('saves the exact revision first, disables duplicate submits, restores and displays every real stage and result', async ({ page }) => {
  const state = await background(page); await page.goto('/');
  let release!: () => void; state.holdSave(new Promise<void>(resolve => { release = resolve; }));
  await page.getByLabel('Lecture text', { exact: true }).fill(state.kit.source.text + ' Latest edit.');
  await generate(page); await expect(page.getByRole('button', { name: 'Saving lecture', exact: true })).toBeDisabled();
  await page.locator('form[aria-busy]').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(state.counts().posts).toBe(0); release(); state.holdSave(null);
  await expect(page.getByTestId('generation-job')).toContainText('Queued'); expect(state.counts().posts).toBe(1);
  expect(state.events.indexOf('saved')).toBeLessThan(state.events.indexOf('created'));
  expect(state.getJob()?.sourceRevision).toBe(state.revisions[state.lecture.id]);
  await expect(page.getByRole('button', { name: 'Generating', exact: true })).toBeDisabled();
  await page.reload(); await expect(page.getByTestId('generation-job')).toContainText('Queued');
  await page.clock.install();
  for (const stage of ['validating', 'analyzing', 'generating', 'verifying', 'correcting'] as const) {
    state.setJob({ status: 'running', stage }); await page.clock.runFor(4_000);
    await expect(page.getByTestId('generation-stage')).toContainText(`(${stage})`);
  }
  await expect(page.getByTestId('generation-job')).not.toContainText('%');
  await page.getByTestId('generation-job').screenshot({ path: `test-results/background-running-${test.info().project.name}.png` });
  state.complete(); await page.clock.runFor(4_000);
  await expect(page.getByTestId('generation-stage')).toContainText('(complete)');
  await expect(page.getByRole('heading', { name: state.kit.lectureTitle })).toBeVisible();
  await page.getByRole('tab', { name: 'Quiz', exact: true }).click(); await expect(page.getByRole('radio', { name: 'A data structure', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Flashcards', exact: true }).click(); await expect(page.getByRole('button', { name: /Question: Schema/ })).toBeVisible();
  expect(state.counts().legacy).toBe(0); expect(state.counts().posts).toBe(1);
  expect(state.requestOwners.every(owner => owner === user.id)).toBe(true);
  const polls = state.counts().gets; await page.clock.runFor(12_000); expect(state.counts().gets).toBe(polls);
});

test('shows backend errors, retries with a new key and cancels durably across refresh', async ({ page }) => {
  const state = await background(page); await page.goto('/'); await generate(page);
  await expect(page.getByTestId('generation-job')).toContainText('Queued');
  await page.clock.install(); state.setJob({ status: 'failed', error: { code: 'UPSTREAM', message: 'The model could not verify this source.', retryable: true } });
  await page.clock.runFor(4_000); await expect(page.getByTestId('generation-job')).toContainText('The model could not verify this source.');
  await page.getByRole('button', { name: 'Retry task', exact: true }).click(); await expect(page.getByTestId('generation-job')).toContainText('Queued');
  expect(state.counts().retries).toBe(1); expect(new Set(state.keys).size).toBe(2);
  await page.getByRole('button', { name: 'Cancel task', exact: true }).click(); await expect(page.getByTestId('generation-job')).toContainText('Cancelled');
  const polls = state.counts().gets; await page.clock.runFor(12_000); expect(state.counts().gets).toBe(polls);
  await page.reload(); await expect(page.getByTestId('generation-job')).toContainText('Cancelled');
  expect(state.counts().cancels).toBe(1);
  await expect(page.getByRole('button', { name: 'Retry task', exact: true })).toBeVisible();
});

test('preserves edits and refreshes the cloud copy while displaying the returned result', async ({ page }) => {
  const state = await background(page); await page.goto('/'); await generate(page);
  await expect(page.getByTestId('generation-job')).toContainText('Queued');
  const edited = state.kit.source.text + ' Edited while generating.';
  await page.getByLabel('Lecture text', { exact: true }).fill(edited); await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
  state.complete(true); await page.clock.install(); await page.clock.runFor(4_000);
  await expect(page.getByTestId('generation-job')).toContainText('saved as a separate copy');
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue(edited);
  await expect(page.getByRole('heading', { name: state.kit.lectureTitle })).toBeVisible();
  expect(state.records.get(state.lecture.id)?.kit).toBeNull();
  await expect(page.getByText('Background course (generated copy)', { exact: true }).first()).toBeAttached();
  await expect(page.getByText(/These materials are from the previous version/)).toBeVisible();
});

test('cloud refresh replaces an older completed task result with another device’s newer result', async ({ page }) => {
  const state = await background(page);
  state.setJob({ id: state.kit.runId }); state.complete();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: state.kit.lectureTitle })).toBeVisible();
  state.kit.runId = 'c0913c04-e964-4aec-9104-a684fe6a6825';
  state.kit.lectureTitle = 'New result from another device';
  state.setJob({ id: state.kit.runId }); state.complete();
  const refreshed = page.waitForResponse(response => response.url().endsWith('/api/study-sessions') && response.request().method() === 'GET');
  await page.getByRole('button', { name: 'Refresh cloud', exact: true }).click();
  const payload = await (await refreshed).json();
  expect(payload.sessions[0].kit.lectureTitle).toBe('New result from another device');
  await expect(page.getByRole('heading', { name: 'New result from another device', exact: true })).toBeVisible();
});

test('account changes abort old polling and ignore a late successful result', async ({ page }) => {
  const state = await background(page); await page.goto('/'); await generate(page);
  await expect(page.getByTestId('generation-job')).toContainText('Queued');
  let release!: () => void; state.holdDetail(new Promise<void>(resolve => { release = resolve; })); state.complete();
  await page.clock.install(); await page.clock.runFor(4_000); await expect.poll(() => state.counts().gets).toBe(1);
  state.switchUser(); await page.evaluate(() => { const channel = new BroadcastChannel('lumina-auth'); channel.postMessage('changed'); channel.close(); });
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue('');
  release(); state.holdDetail(null); await page.clock.runFor(12_000);
  await expect(page.getByTestId('generation-job')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: state.kit.lectureTitle })).toHaveCount(0);
  expect(state.counts().gets).toBe(1);
});

test('does not create a task after a failed save, and reconnects an ambiguous create without duplication', async ({ page }) => {
  const state = await background(page); await page.goto('/');
  state.offline(true); await page.getByLabel('Lecture title', { exact: false }).first().fill('Unsaved title'); await generate(page);
  await expect(page.getByTestId('generation-job')).toContainText('Cloud save failed.'); expect(state.counts().posts).toBe(0);
  state.offline(false); await page.getByRole('button', { name: 'Retry sync', exact: true }).click(); await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud');
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  state.loseCreate(); await generate(page); await expect(page.getByRole('button', { name: 'Check again', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check again', exact: true }).click(); await expect(page.getByTestId('generation-job')).toContainText('Queued');
  expect(state.keys).toHaveLength(2); expect(new Set(state.keys).size).toBe(1);
});

test('restores a task on reopening a course, handles failed lookup and fits small screens', async ({ page }) => {
  const state = await background(page); state.setJob({ status: 'running', stage: 'verifying' }); state.checksUnavailable(true);
  await page.goto('/'); await expect(page.getByTestId('generation-job')).toContainText('Task lookup unavailable.');
  await expect(page.getByRole('button', { name: 'Generate materials', exact: true })).toBeDisabled();
  state.checksUnavailable(false); await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByTestId('generation-stage')).toContainText('(verifying)');
  const open = page.getByRole('button', { name: 'Open sidebar', exact: true }); if (await open.isVisible()) await open.click();
  await page.getByRole('button', { name: 'New lecture', exact: true }).filter({ visible: true }).click();
  await expect(page.getByTestId('generation-job')).toHaveCount(0);
  if (await open.isVisible()) await open.click();
  await page.locator('.gpt-chat-item:visible').filter({ hasText: 'Background course' }).getByRole('button').first().click();
  await expect(page.getByTestId('generation-stage')).toContainText('(verifying)');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const cancel = await page.getByRole('button', { name: 'Cancel task', exact: true }).boundingBox(); expect(cancel!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId('generation-job').screenshot({ path: `test-results/background-mobile-${test.info().project.name}.png` });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByTestId('generation-job').screenshot({ path: `test-results/background-dark-${test.info().project.name}.png` });
  await page.setViewportSize({ width: 812, height: 375 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
