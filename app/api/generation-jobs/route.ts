import { z } from 'zod';
import { CreateGenerationJobSchema } from '@/lib/contracts/generation-jobs';
import { recordId } from '@/lib/contracts/study-records';
import { createGenerationJob, listGenerationJobs } from '@/lib/server/generation-jobs';
import { authenticateJobRequest, jobFailure, jobJson } from '@/lib/server/generation-job-http';
import { requireBackgroundGeneration } from '@/lib/server/generation-job-config';
import { dispatchGenerationJobs } from '@/lib/server/generation-dispatch';
import { readAccountJson, requireSameOrigin } from '@/lib/server/user-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const QuerySchema = z.strictObject({ sessionId: recordId.optional(), active: z.enum(['true','false']).optional(), cursor: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(50).optional() });
export async function GET(request: Request) {
  try {
    const user = await authenticateJobRequest(request);
    const query = QuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return jobJson(await listGenerationJobs(user.id, { ...query, active: query.active === 'true' }));
  } catch (error) { return jobFailure(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await authenticateJobRequest(request);
    requireBackgroundGeneration();
    const input = CreateGenerationJobSchema.parse(await readAccountJson(request, 8192));
    const result = await createGenerationJob(user.id, input);
    await dispatchGenerationJobs(result.job.id);
    return jobJson({ userId: user.id, ...result }, result.reused ? 200 : 202);
  } catch (error) { return jobFailure(error); }
}
