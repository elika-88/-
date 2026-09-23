import 'server-only';
import { generateStudyKit, publicError } from '@/lib/ai/pipeline';
import { createOpenAIClient } from '@/lib/openai';
import type { GenerationEvent } from '@/lib/contracts/generation';
import type { JobError } from '@/lib/contracts/generation-jobs';
import { AccountError } from './user-auth';
import { acknowledgeCancellation, claimGenerationJob, completeGenerationJob, failGenerationAttempt, updateJobStage } from './generation-jobs';
import { JOB_LIMITS } from './generation-job-config';

export async function runGenerationJob(id: string) {
  const claim = await claimGenerationJob(id);
  if (!claim) return { claimed: false };
  const controller = new AbortController();
  let timedOut = false;
  let storageFailed = false;
  let progress = Promise.resolve();
  const persist = (event?: GenerationEvent) => {
    progress = progress.then(async () => {
      if (controller.signal.aborted) return;
      const stage = event && (event.type === 'stage' || event.type === 'retry') ? event.stage : undefined;
      if (!await updateJobStage(id, claim.token, stage)) controller.abort();
    }).catch(() => { storageFailed = true; controller.abort(); });
  };
  // This signal is independent of the submitting browser and Inngest request.
  // Cancellation and fencing are checked during provider calls and before save.
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, JOB_LIMITS.timeoutMs);
  const heartbeat = setInterval(() => persist(), 2000);
  try {
    let connection: Awaited<ReturnType<typeof createOpenAIClient>>;
    try { connection = await createOpenAIClient(); }
    catch { throw new AccountError('SERVER_CONFIG', 'Configure the server AI key, base URL and model before generating.', 503); }
    const output = await generateStudyKit(claim.input, connection, id, controller.signal, persist);
    await progress;
    controller.signal.throwIfAborted();
    await completeGenerationJob(id, claim.token, output);
  } catch (error) {
    const failure: JobError = storageFailed
      ? { code: 'STORAGE_UNAVAILABLE', message: 'Task storage is temporarily unavailable.', retryable: true }
      : timedOut ? { code: 'TIMEOUT', message: 'This generation attempt exceeded its time limit.', retryable: true }
      : error instanceof AccountError ? { code: error.code, message: error.message, retryable: false }
      : publicError(error);
    // Cancellation/fencing makes this a no-op; stale workers cannot alter a task.
    await failGenerationAttempt(id, claim.token, failure);
  } finally {
    clearTimeout(timeout); clearInterval(heartbeat);
    await progress;
    await acknowledgeCancellation(id, claim.token);
  }
  return { claimed: true };
}
