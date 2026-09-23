import { z } from 'zod';
import {
  CreateGenerationJobResponseSchema, GenerationJobListResponseSchema,
  GenerationJobResponseSchema, GenerationJobSchema, type CreateGenerationJob, type GenerationJob,
} from '@/lib/contracts/generation-jobs';

export class GenerationJobError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}
export const isActiveJob = (job: GenerationJob | null) => job?.status === 'queued' || job?.status === 'running';

export function generationJobsTransport(userId: string) {
  async function request<T extends { userId: string }>(path: string, schema: z.ZodType<T>, signal: AbortSignal, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api/generation-jobs${path}`, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(35_000)]),
        headers: { 'Content-Type': 'application/json', 'X-Lumina-Account': userId },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new GenerationJobError('NETWORK', 'Could not reach the task service. Your task may still be running. Check again to reconnect.');
    }
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new GenerationJobError('INVALID_RESPONSE', 'The task service returned an invalid response. Check again before submitting another task.', response.status); }
    if (!response.ok) {
      const issue = z.object({ code: z.string(), error: z.union([z.string(), z.object({ message: z.string() })]) }).safeParse(value);
      throw new GenerationJobError(issue.success ? issue.data.code : 'UNAVAILABLE', issue.success
        ? typeof issue.data.error === 'string' ? issue.data.error : issue.data.error.message
        : 'The task service is unavailable. Please try again.', response.status);
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new GenerationJobError('INVALID_RESPONSE', 'The task response is incomplete. Check again to reconnect.');
    if (parsed.data.userId !== userId) throw new GenerationJobError('ACCOUNT_CHANGED', 'Your account changed. Reopen your workspace.', 409);
    return parsed.data;
  }
  function owned(job: GenerationJob, id?: string, sessionId?: string) {
    if (job.userId !== userId) throw new GenerationJobError('ACCOUNT_CHANGED', 'Your account changed. Reopen your workspace.', 409);
    if (id && job.id !== id || sessionId && job.sessionId !== sessionId) throw new GenerationJobError('INVALID_RESPONSE', 'The task response belongs to a different lecture.');
  }
  return {
    async list(sessionId: string, signal: AbortSignal) {
      const response = await request(`?${new URLSearchParams({ sessionId, limit: '1' })}`, GenerationJobListResponseSchema, signal);
      response.jobs.forEach(job => owned(job, undefined, sessionId));
      return response;
    },
    async create(input: CreateGenerationJob, signal: AbortSignal) {
      const response = await request('', CreateGenerationJobResponseSchema, signal, input);
      owned(response.job, undefined, input.sessionId);
      return response;
    },
    async get(id: string, signal: AbortSignal) {
      const response = await request(`/${encodeURIComponent(id)}`, GenerationJobResponseSchema, signal);
      owned(response.job, id);
      if (response.job.status === 'succeeded' && !response.result) throw new GenerationJobError('INVALID_RESPONSE', 'The completed task result is not available yet. Check again.');
      return response;
    },
    async cancel(id: string, signal: AbortSignal) {
      const response = await request(`/${encodeURIComponent(id)}/cancel`, z.object({ userId: z.uuid(), job: GenerationJobSchema }), signal, {});
      owned(response.job, id);
      return response;
    },
    async retry(id: string, idempotencyKey: string, signal: AbortSignal) {
      const response = await request(`/${encodeURIComponent(id)}/retry`, CreateGenerationJobResponseSchema, signal, { idempotencyKey });
      owned(response.job);
      if (response.job.retryOf !== id) throw new GenerationJobError('INVALID_RESPONSE', 'The retry response belongs to a different task.');
      return response;
    },
  };
}
export type GenerationJobsTransport = ReturnType<typeof generationJobsTransport>;
