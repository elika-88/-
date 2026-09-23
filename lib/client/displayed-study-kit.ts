import type { StudySession } from './sessions';
import type { GenerationJob } from '@/lib/contracts/generation-jobs';
import type { StudyKit } from '@/lib/schemas/studyMaterials';

export function displayedStudyKit(session: StudySession, cloudRevision: number, job: GenerationJob | null, result: StudyKit | null) {
  if (!result || !job || job.sessionId !== session.id) return session.kit;
  if (!session.kit) return result;
  // Once the worker's save (or a later save) is in the cloud snapshot, use that
  // record. A finished monitor stops polling and must not shadow later devices.
  if (job.savedSessionId === session.id && job.savedRevision !== null && cloudRevision >= job.savedRevision) return session.kit;
  // Copy/result-only tasks have no saved revision for this course. Preserve
  // their new result over the previous kit, until a newer kit reaches the cloud.
  return Date.parse(session.kit.verification.reviewedAt) > Date.parse(result.verification.reviewedAt) ? session.kit : result;
}
