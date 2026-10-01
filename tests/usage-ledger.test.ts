import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/generation-dispatch', () => ({ dispatchGenerationJobs: vi.fn() }));
import { withDatabase } from '@/lib/server/database';
import { initializeUserTables } from '@/lib/server/user-auth';
import { saveStudySession, deleteStudySession } from '@/lib/server/study-records';
import { acknowledgeCancellation, cancelGenerationJob, claimGenerationJob, completeGenerationJob, createGenerationJob,
  failGenerationAttempt, getGenerationJob, recoverGenerationJobs, retryGenerationJob } from '@/lib/server/generation-jobs';
import { getUsageSummary, initializeUsageTables, reserveGenerationCredit, usagePolicy } from '@/lib/server/usage-ledger';
import { GET as usageGET } from '@/app/api/usage/route';
import { POST as createPOST } from '@/app/api/generation-jobs/route';
import { dispatchGenerationJobs } from '@/lib/server/generation-dispatch';
import { POST as legacyPOST } from '@/app/api/generate/route';
import { UsageSummarySchema } from '@/lib/contracts/usage';
import { studyKitFixture } from './fixtures/studyKit';

let directory: string;
let now: number;
const lecture = 'A schema defines a data structure. A schema controls the allowed fields and their types. '.repeat(12);
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'lumina-usage-'));
  vi.stubEnv('ADMIN_DATABASE_PATH', join(directory, 'test.sqlite'));
  for (const name of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'VERCEL', 'LUMINA_MONTHLY_GENERATION_LIMIT', 'LUMINA_GLOBAL_DAILY_GENERATION_LIMIT', 'LUMINA_GENERATION_PAUSED']) vi.stubEnv(name, '');
  now = Date.UTC(2026, 8, 15, 12);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  try { rmSync(directory, { recursive: true, force: true }); }
  catch (error) { if (!['EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
});
async function account() {
  const userId = randomUUID(), token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  await withDatabase(async db => {
    await initializeUserTables(db);
    await db.execute({ sql: 'INSERT INTO app_users VALUES (?,?,?,?,?,?,?)', args: [userId, userId, userId, `${userId}@example.invalid`, `${userId}@example.invalid`, 'disabled-test-password', new Date(now).toISOString()] });
    await db.execute({ sql: 'INSERT INTO user_sessions VALUES (?,?,?,?)', args: [createHash('sha256').update(token).digest('hex'), userId, now + 86400_000, now] });
  });
  const session = { id: randomUUID(), title: 'Schemas', customTitle: true, lecture, outputLanguage: 'en' as const, tab: 'summary' as const, kit: null, updatedAt: now };
  await saveStudySession(userId, session, 0);
  return { userId, token, session, input: { sessionId: session.id, expectedRevision: 1, idempotencyKey: randomUUID() } };
}
function output(id: string) {
  return { ...studyKitFixture(), runId: id, source: { text: lecture, segments: [{ id: 's1', text: lecture, start: 0, end: lecture.length }], wordCount: lecture.split(/\s+/).length } };
}
const events = (id: string) => withDatabase(async db => (await db.execute({ sql: 'SELECT event FROM usage_ledger WHERE job_id=? ORDER BY event', args: [id] })).rows.map(row => row.event));
async function finish(id: string) {
  const claim = await claimGenerationJob(id);
  expect(claim).not.toBeNull();
  expect(await completeGenerationJob(id, claim!.token, output(id))).toBe(true);
  return claim!;
}

describe('transactional generation allowance', () => {
  it('reserves once under duplicate submissions, charges once, and rejects the next task at the limit', async () => {
    vi.stubEnv('LUMINA_MONTHLY_GENERATION_LIMIT', '1');
    const a = await account();
    const submissions = await Promise.all(Array.from({ length: 5 }, () => createGenerationJob(a.userId, a.input)));
    expect(new Set(submissions.map(s => s.job.id)).size).toBe(1);
    const id = submissions[0].job.id;
    expect(await getUsageSummary(a.userId)).toMatchObject({ used: 0, reserved: 1, remaining: 0 });
    const claim = await finish(id);
    expect(await completeGenerationJob(id, claim.token, output(id))).toBe(false);
    expect(await getUsageSummary(a.userId)).toMatchObject({ used: 1, reserved: 0, remaining: 0 });
    expect(await events(id)).toEqual(['charge', 'reserve']);
    await expect(createGenerationJob(a.userId, { ...a.input, expectedRevision: 2, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });

  it('rolls back quota if job insertion fails and rolls back completion if charging fails', async () => {
    const a = await account();
    const warmup = await createGenerationJob(a.userId, a.input); await cancelGenerationJob(a.userId, warmup.job.id);
    await withDatabase(db => db.execute("CREATE TRIGGER reject_job BEFORE INSERT ON generation_jobs BEGIN SELECT RAISE(ABORT, 'test'); END"));
    await expect(createGenerationJob(a.userId, { ...a.input, idempotencyKey: randomUUID() })).rejects.toThrow();
    expect(await getUsageSummary(a.userId)).toMatchObject({ reserved: 0, used: 0 });
    await withDatabase(db => db.execute('DROP TRIGGER reject_job'));
    const job = await createGenerationJob(a.userId, { ...a.input, idempotencyKey: randomUUID() });
    const claim = await claimGenerationJob(job.job.id);
    await withDatabase(db => db.execute("CREATE TRIGGER reject_charge BEFORE INSERT ON usage_ledger WHEN NEW.event='charge' BEGIN SELECT RAISE(ABORT, 'test'); END"));
    await expect(completeGenerationJob(job.job.id, claim!.token, output(job.job.id))).rejects.toThrow();
    expect((await getGenerationJob(a.userId, job.job.id)).job.status).toBe('running');
    expect(await getUsageSummary(a.userId)).toMatchObject({ reserved: 1, used: 0 });
    const row = await withDatabase(async db => (await db.execute({ sql: 'SELECT revision FROM study_records WHERE id=?', args: [a.session.id] })).rows[0]);
    expect(Number(row.revision)).toBe(1);
  });

  it('refunds cancellation exactly once and fences a late worker result', async () => {
    const a = await account(), created = await createGenerationJob(a.userId, a.input);
    const claim = await claimGenerationJob(created.job.id);
    await Promise.all([cancelGenerationJob(a.userId, created.job.id), cancelGenerationJob(a.userId, created.job.id)]);
    expect(await completeGenerationJob(created.job.id, claim!.token, output(created.job.id))).toBe(false);
    expect(await events(created.job.id)).toEqual(['release', 'reserve']);
    expect(await getUsageSummary(a.userId)).toMatchObject({ reserved: 0, used: 0, remaining: 60 });
    await expect(retryGenerationJob(a.userId, created.job.id, randomUUID())).rejects.toMatchObject({ code: 'CONCURRENCY_LIMIT' });
    await acknowledgeCancellation(created.job.id, claim!.token);
    const retried = await retryGenerationJob(a.userId, created.job.id, randomUUID());
    await finish(retried.job.id);
    expect(await getUsageSummary(a.userId)).toMatchObject({ reserved: 0, used: 1 });
  });

  it('keeps one reservation across automatic retry and releases final failure', async () => {
    const a = await account(), created = await createGenerationJob(a.userId, a.input);
    let claim = await claimGenerationJob(created.job.id);
    const error = { code: 'UPSTREAM_FAILURE', message: 'Unavailable', retryable: true };
    await failGenerationAttempt(created.job.id, claim!.token, error);
    expect(await events(created.job.id)).toEqual(['reserve']);
    now += 16_000; claim = await claimGenerationJob(created.job.id);
    await failGenerationAttempt(created.job.id, claim!.token, error);
    await failGenerationAttempt(created.job.id, claim!.token, error);
    expect(await events(created.job.id)).toEqual(['release', 'reserve']);
    expect(await getUsageSummary(a.userId)).toMatchObject({ reserved: 0, used: 0 });
  });

  it('recovers expired leases, rejects stale workers and releases exhausted attempts', async () => {
    const a = await account(), created = await createGenerationJob(a.userId, a.input);
    const first = await claimGenerationJob(created.job.id);
    now += 301_000; await recoverGenerationJobs();
    expect(await events(created.job.id)).toEqual(['reserve']);
    const second = await claimGenerationJob(created.job.id);
    expect(await completeGenerationJob(created.job.id, first!.token, output(created.job.id))).toBe(false);
    now += 301_000; await recoverGenerationJobs(); await recoverGenerationJobs();
    expect(await completeGenerationJob(created.job.id, second!.token, output(created.job.id))).toBe(false);
    expect(await events(created.job.id)).toEqual(['release', 'reserve']);
  });

  it('releases queue timeouts while paused and allows existing records to be read', async () => {
    const a = await account(), created = await createGenerationJob(a.userId, a.input);
    vi.stubEnv('LUMINA_GENERATION_PAUSED', 'true');
    expect(await claimGenerationJob(created.job.id)).toBeNull();
    expect((await getUsageSummary(a.userId)).generationPaused).toBe(true);
    now += 31 * 60_000; await recoverGenerationJobs();
    expect(await events(created.job.id)).toEqual(['release', 'reserve']);
    expect((await getGenerationJob(a.userId, created.job.id)).job.error?.code).toBe('QUEUE_TIMEOUT');
    await expect(createGenerationJob(a.userId, { ...a.input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'GENERATION_PAUSED' });
  });

  it('settles a job spanning UTC month boundaries in its original allowance period', async () => {
    now = Date.UTC(2026, 8, 30, 23, 59);
    const a = await account(), created = await createGenerationJob(a.userId, a.input);
    const claim = await claimGenerationJob(created.job.id);
    now += 61_000;
    await completeGenerationJob(created.job.id, claim!.token, output(created.job.id));
    expect(await getUsageSummary(a.userId)).toMatchObject({ used: 0, reserved: 0, remaining: 60, period: { start: Date.UTC(2026, 9, 1) } });
    now = Date.UTC(2026, 8, 30, 23, 59);
    expect(await getUsageSummary(a.userId)).toMatchObject({ used: 1, reserved: 0 });
  });

  it('retains charges and request aliases after result cleanup without charging a replay', async () => {
    now = Date.UTC(2026, 7, 1);
    const a = await account(), created = await createGenerationJob(a.userId, a.input);
    const alias = { ...a.input, idempotencyKey: randomUUID() };
    expect((await createGenerationJob(a.userId, alias)).job.id).toBe(created.job.id);
    await finish(created.job.id);
    expect((await createGenerationJob(a.userId, alias)).job.id).toBe(created.job.id);
    now += 30 * 86400_000 + 1; await recoverGenerationJobs();
    await expect(getGenerationJob(a.userId, created.job.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await getUsageSummary(a.userId)).toMatchObject({ used: 1 });
    for (const input of [a.input, alias]) await expect(createGenerationJob(a.userId, input)).rejects.toMatchObject({ code: 'REQUEST_EXPIRED' });
    expect(await events(created.job.id)).toEqual(['charge', 'reserve']);
  });

  it('bounds duplicate request aliases and rejects changing the meaning of a request key', async () => {
    const a = await account(), created = await createGenerationJob(a.userId, a.input);
    await expect(createGenerationJob(a.userId, { ...a.input, expectedRevision: 2 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    for (let i = 1; i < 32; i++) await createGenerationJob(a.userId, { ...a.input, idempotencyKey: randomUUID() });
    await expect(createGenerationJob(a.userId, { ...a.input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect((await createGenerationJob(a.userId, a.input)).job.id).toBe(created.job.id);
    expect(await getUsageSummary(a.userId)).toMatchObject({ reserved: 1 });
  });

  it('charges results saved as copies or retained only in the task', async () => {
    for (const disposition of ['copy', 'result_only']) {
      const a = await account(), created = await createGenerationJob(a.userId, a.input);
      if (disposition === 'copy') await saveStudySession(a.userId, { ...a.session, lecture: lecture + ' edited' }, 1);
      else await deleteStudySession(a.userId, a.session.id, 1);
      await finish(created.job.id);
      expect((await getGenerationJob(a.userId, created.job.id)).job.saveDisposition).toBe(disposition);
      expect(await getUsageSummary(a.userId)).toMatchObject({ used: 1 });
    }
  });

  it('keeps pre-release tasks available without retroactive charging', async () => {
    const a = await account(), created = await createGenerationJob(a.userId, a.input);
    await withDatabase(db => db.execute({ sql: 'DELETE FROM usage_reservations WHERE job_id=?', args: [created.job.id] }));
    await finish(created.job.id);
    expect(await getUsageSummary(a.userId)).toMatchObject({ used: 0 });
  });

  it('enforces a global admission limit across users even after refunds, then resets at UTC midnight', async () => {
    vi.stubEnv('LUMINA_GLOBAL_DAILY_GENERATION_LIMIT', '1');
    const a = await account(), b = await account();
    const results = await Promise.allSettled([createGenerationJob(a.userId, a.input), createGenerationJob(b.userId, b.input)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected').map(r => r.reason.code)).toEqual(['DAILY_CAPACITY']);
    const index = results.findIndex(r => r.status === 'fulfilled');
    const winner = results[index] as PromiseFulfilledResult<Awaited<ReturnType<typeof createGenerationJob>>>;
    await cancelGenerationJob([a, b][index].userId, winner.value.job.id);
    await expect(createGenerationJob(a.userId, { ...a.input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'DAILY_CAPACITY' });
    now += 86400_000;
    await expect(createGenerationJob(a.userId, { ...a.input, idempotencyKey: randomUUID() })).resolves.toMatchObject({ reused: false });
  });

  it('serializes the last monthly credit across competing transactions', async () => {
    vi.stubEnv('LUMINA_MONTHLY_GENERATION_LIMIT', '1');
    const a = await account();
    await withDatabase(initializeUsageTables);
    const reserve = () => withDatabase(async db => {
      const tx = await db.transaction('write');
      try { await reserveGenerationCredit(tx, a.userId, randomUUID(), now); await tx.commit(); }
      finally { if (!tx.closed) await tx.rollback(); tx.close(); }
    });
    const results = await Promise.allSettled([reserve(), reserve(), reserve()]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected').map(r => r.reason.code)).toEqual(['QUOTA_EXCEEDED', 'QUOTA_EXCEEDED']);
  });

  it.each(['-1', 'oops', '1.5', '9007199254740992'])('fails closed with invalid quota configuration %s', async value => {
    vi.stubEnv('LUMINA_MONTHLY_GENERATION_LIMIT', value);
    expect(() => usagePolicy()).toThrowError('Generation limits are unavailable');
    const a = await account();
    await expect(createGenerationJob(a.userId, a.input)).rejects.toMatchObject({ code: 'USAGE_CONFIG' });
  });
});

describe('usage HTTP boundaries', () => {
  it('rejects exhausted quota before dispatching work and accepts a retry once capacity is available', async () => {
    const a = await account();
    vi.stubEnv('LUMINA_BACKGROUND_GENERATION', 'true'); vi.stubEnv('INNGEST_DEV', '1');
    vi.stubEnv('LUMINA_MONTHLY_GENERATION_LIMIT', '0');
    const request = () => new Request('https://lumina.test/api/generation-jobs', { method: 'POST', headers: {
      origin: 'https://lumina.test', cookie: `lumina_user=${a.token}`, 'x-lumina-account': a.userId, 'content-type': 'application/json',
    }, body: JSON.stringify(a.input) });
    const denied = await createPOST(request());
    expect(denied.status).toBe(429);
    expect(await denied.json()).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(dispatchGenerationJobs).not.toHaveBeenCalled();
    vi.stubEnv('LUMINA_MONTHLY_GENERATION_LIMIT', '60');
    expect((await createPOST(request())).status).toBe(202);
    expect(dispatchGenerationJobs).toHaveBeenCalledTimes(1);
    expect(await getUsageSummary(a.userId)).toMatchObject({ reserved: 1, remaining: 59 });
  });

  it('returns only the authenticated account balance and rejects switched or anonymous identities', async () => {
    const a = await account(), b = await account();
    await createGenerationJob(a.userId, a.input);
    const request = (cookie: string, expected: string) => new Request('https://lumina.test/api/usage', { headers: { cookie: `lumina_user=${cookie}`, 'x-lumina-account': expected } });
    expect((await usageGET(request('', a.userId))).status).toBe(401);
    expect((await usageGET(request(b.token, a.userId))).status).toBe(409);
    const response = await usageGET(request(a.token, a.userId));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(UsageSummarySchema.parse(await response.json())).toMatchObject({ userId: a.userId, reserved: 1, remaining: 59 });
    expect(await (await usageGET(request(b.token, b.userId))).json()).toMatchObject({ userId: b.userId, reserved: 0, remaining: 60 });
  });

  it('rejects the old production generation path for an authenticated user too', async () => {
    const a = await account(); vi.stubEnv('NODE_ENV', 'production');
    const response = await legacyPOST(new Request('https://lumina.test/api/generate', { method: 'POST', headers: { origin: 'https://lumina.test', cookie: `lumina_user=${a.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ lecture }) }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('BACKGROUND_REQUIRED');
    expect(await getUsageSummary(a.userId)).toMatchObject({ used: 0, reserved: 0 });
  });

  it('returns service unavailable when the database cannot be configured, without exposing secrets', async () => {
    vi.stubEnv('TURSO_DATABASE_URL', 'libsql://unconfigured.example');
    const response = await usageGET(new Request('https://lumina.test/api/usage', { headers: { cookie: `lumina_user=${'a'.repeat(64)}`, 'x-lumina-account': randomUUID() } }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('unconfigured.example');
  });
});
