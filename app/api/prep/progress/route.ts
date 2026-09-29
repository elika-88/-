import { z } from 'zod';
import { authenticateJobRequest, jobFailure, jobJson } from '@/lib/server/generation-job-http';
import { readAccountJson, requireSameOrigin } from '@/lib/server/user-auth';
import { loadPrep, savePrep } from '@/lib/server/prep-storage';
import { PrepStateSchema } from '@/lib/prep/progress';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return jobJson(await loadPrep((await authenticateJobRequest(request)).id));}catch(e){return jobFailure(e);}}
export async function PUT(request:Request){try{
  requireSameOrigin(request);const user=await authenticateJobRequest(request);
  const body=z.strictObject({expectedRevision:z.number().int().nonnegative(),state:PrepStateSchema}).parse(await readAccountJson(request,520*1024));
  return jobJson(await savePrep(user.id,body.expectedRevision,body.state));
}catch(e){return jobFailure(e);}}
