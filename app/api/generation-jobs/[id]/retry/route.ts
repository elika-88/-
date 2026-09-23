import { RetryGenerationJobSchema } from '@/lib/contracts/generation-jobs';
import { retryGenerationJob } from '@/lib/server/generation-jobs';
import { authenticateJobRequest, jobFailure, jobId, jobJson } from '@/lib/server/generation-job-http';
import { requireBackgroundGeneration } from '@/lib/server/generation-job-config';
import { dispatchGenerationJobs } from '@/lib/server/generation-dispatch';
import { readAccountJson, requireSameOrigin } from '@/lib/server/user-auth';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await authenticateJobRequest(request);
    requireBackgroundGeneration();
    const input = RetryGenerationJobSchema.parse(await readAccountJson(request, 8192));
    const result = await retryGenerationJob(user.id, jobId((await context.params).id), input.idempotencyKey);
    await dispatchGenerationJobs(result.job.id);
    return jobJson({ userId: user.id, ...result }, result.reused ? 200 : 202);
  } catch (error) { return jobFailure(error); }
}
