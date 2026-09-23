import { getGenerationJob } from '@/lib/server/generation-jobs';
import { authenticateJobRequest, jobFailure, jobId, jobJson } from '@/lib/server/generation-job-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateJobRequest(request);
    return jobJson(await getGenerationJob(user.id, jobId((await context.params).id)));
  } catch (error) { return jobFailure(error); }
}
