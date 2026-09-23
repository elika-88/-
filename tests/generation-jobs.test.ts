import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { initializeUserTables } from '@/lib/server/user-auth';
import { withDatabase } from '@/lib/server/database';
import { saveStudySession } from '@/lib/server/study-records';
import { claimGenerationJob, completeGenerationJob, createGenerationJob, getGenerationJob, listGenerationJobs } from '@/lib/server/generation-jobs';
import { studyKitFixture } from './fixtures/studyKit';

let directory: string;
const lecture = ('A schema defines a data structure. This paragraph provides enough source material for a durable generation task. ').repeat(12);
async function register() {
  const id = randomUUID();
  await withDatabase(async db => {
    await initializeUserTables(db);
    await db.execute({
      sql: 'INSERT INTO app_users (id, username, username_key, email, email_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, 'JobUser', 'jobuser', 'jobs@example.invalid', 'jobs@example.invalid', 'disabled-test-password', new Date().toISOString()],
    });
  });
  return { id };
}
function resultFor(jobId: string) {
  const result = structuredClone(studyKitFixture());
  result.runId = jobId;
  result.source = { text: lecture, segments: [{ id: 's1', text: lecture, start: 0, end: lecture.length }], wordCount: lecture.split(/\s+/).length };
  return result;
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'lumina-generation-jobs-'));
  vi.stubEnv('ADMIN_DATABASE_PATH', join(directory, 'test.sqlite'));
  vi.stubEnv('TURSO_DATABASE_URL', ''); vi.stubEnv('TURSO_AUTH_TOKEN', ''); vi.stubEnv('VERCEL', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  try { rmSync(directory, { recursive: true, force: true }); } catch { /* Windows may hold SQLite briefly. */ }
});

describe('durable generation jobs', () => {
  it('creates idempotently, claims, completes and stores the generated course', async () => {
    const user = await register();
    const session = { id: randomUUID(), title: 'Schemas', customTitle: true, lecture, outputLanguage: 'en' as const, tab: 'summary' as const, kit: null, updatedAt: Date.now() };
    await saveStudySession(user.id, session, 0);
    const input = { sessionId: session.id, expectedRevision: 1, idempotencyKey: randomUUID() };
    const first = await createGenerationJob(user.id, input);
    expect(first.reused).toBe(false);
    expect((await createGenerationJob(user.id, input)).reused).toBe(true);
    const claim = await claimGenerationJob(first.job.id);
    expect(claim?.input.lecture).toBe(lecture);
    expect(await completeGenerationJob(first.job.id, claim!.token, resultFor(first.job.id))).toBe(true);
    const finished = await getGenerationJob(user.id, first.job.id);
    expect(finished.job.status).toBe('succeeded');
    expect(finished.job.saveDisposition).toBe('updated');
    expect(finished.result?.runId).toBe(first.job.id);
    expect((await listGenerationJobs(user.id)).jobs).toHaveLength(1);
  });

  it('saves a separate course when the source revision changed while running', async () => {
    const user = await register();
    const session = { id: randomUUID(), title: 'Original', customTitle: true, lecture, outputLanguage: 'en' as const, tab: 'summary' as const, kit: null, updatedAt: Date.now() };
    await saveStudySession(user.id, session, 0);
    const created = await createGenerationJob(user.id, { sessionId: session.id, expectedRevision: 1, idempotencyKey: randomUUID() });
    const claim = await claimGenerationJob(created.job.id);
    await saveStudySession(user.id, { ...session, lecture: `${lecture} New edit.` }, 1);
    expect(await completeGenerationJob(created.job.id, claim!.token, resultFor(created.job.id))).toBe(true);
    const finished = await getGenerationJob(user.id, created.job.id);
    expect(finished.job.saveDisposition).toBe('copy');
    expect(finished.job.savedSessionId).not.toBe(session.id);
  });
});
