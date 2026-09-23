import { cancelGenerationJob } from '@/lib/server/generation-jobs';
import { authenticateJobRequest, jobFailure, jobId, jobJson } from '@/lib/server/generation-job-http';
import { requireSameOrigin } from '@/lib/server/user-auth';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await authenticateJobRequest(request);
    return jobJson({ userId: user.id, job: await cancelGenerationJob(user.id, jobId((await context.params).id)) });
  } catch (error) { return jobFailure(error); }
}
