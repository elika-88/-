import type { GenerationJob } from '../../lib/contracts/generation-jobs';

export const jobUserId = 'a20e5041-118e-4de0-b7b6-6ecf279c5b23';
export function generationJobFixture(patch: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: 'ed931cd1-c8b7-4d6d-8953-945a2d3b9358', userId: jobUserId, sessionId: 'course-a', sourceRevision: 1,
    status: 'queued', stage: null, attempt: 0, maxAttempts: 2, createdAt: 1, updatedAt: 1,
    startedAt: null, finishedAt: null, nextAttemptAt: 1, error: null,
    savedSessionId: null, savedRevision: null, saveDisposition: null, retryOf: null, ...patch,
  };
}
