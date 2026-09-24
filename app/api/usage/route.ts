import { authenticateJobRequest, jobFailure, jobJson } from '@/lib/server/generation-job-http';
import { getUsageSummary } from '@/lib/server/usage-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await authenticateJobRequest(request);
    return jobJson(await getUsageSummary(user.id));
  } catch (error) { return jobFailure(error); }
}
