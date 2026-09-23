import { z } from 'zod';
import { StageSchema } from './generation';
import { recordId, revision } from './study-records';
import { StudyKitSchema } from '@/lib/schemas/studyMaterials';

// Submit an already-saved course version. Credentials and raw input are never
// accepted here: the worker reads the immutable snapshot and server settings.
export const CreateGenerationJobSchema = z.strictObject({
  sessionId: recordId,
  expectedRevision: revision.refine(value => value > 0),
  idempotencyKey: z.uuid(),
});
export type CreateGenerationJob = z.infer<typeof CreateGenerationJobSchema>;
export const RetryGenerationJobSchema = z.strictObject({ idempotencyKey: z.uuid() });
export const GenerationJobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export const JobErrorSchema = z.strictObject({ code: z.string(), message: z.string(), retryable: z.boolean() });
export type JobError = z.infer<typeof JobErrorSchema>;
const timestamp = z.number().int().nonnegative();
export const GenerationJobSchema = z.strictObject({
  id: z.uuid(), userId: z.uuid(), sessionId: recordId, sourceRevision: revision,
  status: GenerationJobStatusSchema, stage: StageSchema.nullable(),
  attempt: z.number().int().min(0).max(2), maxAttempts: z.literal(2),
  createdAt: timestamp, updatedAt: timestamp, startedAt: timestamp.nullable(),
  finishedAt: timestamp.nullable(), nextAttemptAt: timestamp,
  error: JobErrorSchema.nullable(),
  savedSessionId: recordId.nullable(), savedRevision: revision.nullable(),
  saveDisposition: z.enum(['updated', 'copy', 'result_only']).nullable(),
  retryOf: z.uuid().nullable(),
});
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
export const GenerationJobResponseSchema = z.strictObject({
  userId: z.uuid(), job: GenerationJobSchema, result: StudyKitSchema.nullable(),
});
export const CreateGenerationJobResponseSchema = z.strictObject({
  userId: z.uuid(), job: GenerationJobSchema, reused: z.boolean(),
});
export const GenerationJobListResponseSchema = z.strictObject({
  userId: z.uuid(), jobs: z.array(GenerationJobSchema), nextCursor: z.uuid().nullable(),
});
