import { z } from 'zod';
import { revision, ServerStudySessionSchema, StudyRecordsResponseSchema, type StudyRecordsResponse } from '@/lib/contracts/study-records';
import type { StudySession } from './sessions';

export class StudyStorageError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}
export interface StudyTransport {
  list(signal: AbortSignal): Promise<StudyRecordsResponse>;
  save(session: StudySession, expectedRevision: number, signal: AbortSignal): Promise<{ session: StudySession; revision: number }>;
  remove(id: string, expectedRevision: number, signal: AbortSignal): Promise<{ deleted: true; revision: number }>;
}

export function studyTransport(userId: string): StudyTransport {
  async function request<T>(method: string, schema: z.ZodType<T>, signal: AbortSignal, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch('/api/study-sessions', { method, cache: 'no-store', credentials: 'same-origin',
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        headers: { 'Content-Type': 'application/json', 'X-Lumina-Account': userId },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new StudyStorageError('NETWORK', 'Could not reach cloud storage. Your changes are kept for retry.');
    }
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new StudyStorageError('INVALID_RESPONSE', 'Cloud storage returned an invalid response. Retry to check whether your changes were saved.', response.status); }
    if (!response.ok) {
      const issue = z.object({ code: z.string(), error: z.string() }).safeParse(value);
      throw new StudyStorageError(issue.success ? issue.data.code : 'UNAVAILABLE', issue.success ? issue.data.error : 'Cloud storage is unavailable. Please retry.', response.status);
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new StudyStorageError('INVALID_RESPONSE', 'Cloud storage returned incomplete records. Your changes have not been discarded.');
    return parsed.data;
  }
  return {
    async list(signal) {
      const value = await request('GET', StudyRecordsResponseSchema, signal);
      if (value.userId !== userId) throw new StudyStorageError('ACCOUNT_CHANGED', 'Your account changed. Reopen your workspace.', 409);
      return value;
    },
    async save(session, expectedRevision, signal) {
      const result = await request('PUT', z.object({ session: ServerStudySessionSchema, revision }), signal, { session, expectedRevision });
      if (result.session.id !== session.id || result.revision !== expectedRevision + 1) throw new StudyStorageError('INVALID_RESPONSE', 'The save could not be confirmed. Retry to check cloud storage.');
      return result;
    },
    async remove(id, expectedRevision, signal) {
      const result = await request('DELETE', z.object({ deleted: z.literal(true), revision }), signal, { id, expectedRevision });
      if (result.revision !== expectedRevision + 1) throw new StudyStorageError('INVALID_RESPONSE', 'The deletion could not be confirmed. Retry to check cloud storage.');
      return result;
    },
  };
}
