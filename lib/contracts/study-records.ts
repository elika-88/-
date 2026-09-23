import { z } from 'zod';
import { INPUT_LIMITS, OutputLanguageSchema } from '@/lib/input';
import { StudyKitSchema } from '@/lib/schemas/studyMaterials';

export const recordId = z.string().min(1).max(100);
export const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
export const ServerStudySessionSchema = z.strictObject({
  id: recordId,
  title: z.string().max(INPUT_LIMITS.maxTitleCharacters),
  customTitle: z.boolean(),
  lecture: z.string().max(INPUT_LIMITS.maxCharacters),
  outputLanguage: OutputLanguageSchema,
  tab: z.enum(['summary', 'keypoints', 'quiz', 'flashcards']),
  kit: StudyKitSchema.nullable(),
  updatedAt: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export const SaveStudySessionSchema = z.strictObject({ session: ServerStudySessionSchema, expectedRevision: revision });
export const DeleteStudySessionSchema = z.strictObject({ id: recordId, expectedRevision: revision });
export const StudyRecordsResponseSchema = z.object({
  userId: z.string().uuid(),
  sessions: z.array(ServerStudySessionSchema),
  revisions: z.record(recordId, revision),
  storage: z.enum(['local', 'turso']),
}).refine(value => new Set(value.sessions.map(s => s.id)).size === value.sessions.length &&
  value.sessions.every(s => Object.hasOwn(value.revisions, s.id) && value.revisions[s.id] > 0), 'Invalid record revisions.');
export type StudyRecordsResponse = z.infer<typeof StudyRecordsResponseSchema>;
