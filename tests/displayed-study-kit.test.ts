import { describe, expect, it } from 'vitest';
import { displayedStudyKit } from '@/lib/client/displayed-study-kit';
import { createSession } from '@/lib/client/sessions';
import { studyKitFixture } from './fixtures/studyKit';
import { generationJobFixture } from './fixtures/generationJob';

describe('selecting task results after cloud refresh', () => {
  const original = studyKitFixture();
  const result = { ...original, runId: 'c0913c04-e964-4aec-9104-a684fe6a6825',
    verification: { ...original.verification, reviewedAt: '2026-09-24T00:00:00Z' } };
  const session = { ...createSession(), id: 'course-a', kit: original };
  const job = generationJobFixture({ id: result.runId, status: 'succeeded', savedSessionId: session.id, savedRevision: 3, saveDisposition: 'updated' });
  it('keeps the new task result while its course save is still being fetched', () => {
    expect(displayedStudyKit(session, 2, job, result)).toBe(result);
  });
  it('uses a newer cloud revision even when the previous completed task is still cached', () => {
    const newer = { ...result, runId: crypto.randomUUID() };
    expect(displayedStudyKit({ ...session, kit: newer }, 4, job, result)).toBe(newer);
  });
  it.each(['copy', 'result_only'] as const)('preserves %s results over the original course kit and local edits', disposition => {
    const copyJob = { ...job, saveDisposition: disposition, savedSessionId: disposition === 'copy' ? 'copy' : null, savedRevision: disposition === 'copy' ? 1 : null };
    expect(displayedStudyKit(session, 5, copyJob, result)).toBe(result);
    const newer = { ...original, verification: { ...original.verification, reviewedAt: '2026-09-24T01:00:00Z' } };
    expect(displayedStudyKit({ ...session, kit: newer }, 6, copyJob, result)).toBe(newer);
  });
  it('does not display a task from a different course', () => {
    expect(displayedStudyKit(session, 1, { ...job, sessionId: 'different-course' }, result)).toBe(original);
  });
});
