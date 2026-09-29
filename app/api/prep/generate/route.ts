import { createOpenAIClient } from '@/lib/openai';
import { publicError } from '@/lib/ai/pipeline';
import { ERROR_HTTP_STATUS } from '@/lib/contracts/errors';
import { PrepGenerateRequestSchema } from '@/lib/prep/schema';
import { generateReadingSet } from '@/lib/server/prep-generation';
import { AccountError, readAccountJson, requireSameOrigin } from '@/lib/server/user-auth';
import { authenticateJobRequest } from '@/lib/server/generation-job-http';
import { reservePrepRequest } from '@/lib/server/prep-storage';
export const runtime='nodejs';
export const maxDuration=240;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request) {
  let timer:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();
  const abort=()=>controller.abort();
  try {
    requireSameOrigin(request);
    const user=await authenticateJobRequest(request);
    const parsed=PrepGenerateRequestSchema.safeParse(await readAccountJson(request,64*1024));
    if(!parsed.success)return json({error:{code:'INVALID_REQUEST',message:'Check source length and choose one to three supported question types.',retryable:false}},400);
    request.signal.addEventListener('abort',abort,{once:true});
    if(request.signal.aborted)abort();
    controller.signal.throwIfAborted();
    const connection=await createOpenAIClient();
    await reservePrepRequest(user.id);
    timer=setTimeout(abort,210000);
    return json({set:await generateReadingSet(parsed.data,connection,controller.signal)});
  } catch(error) {
    if(error instanceof AccountError)return json({error:{code:error.code,message:error.message,retryable:error.status>=500||error.status===429}},error.status);
    if(controller.signal.aborted)return json({error:{code:'TIMEOUT',message:'Generation stopped or timed out. Your source remains available.',retryable:true}},504);
    const safe=publicError(error);return json({error:safe},ERROR_HTTP_STATUS[safe.code]);
  } finally { if(timer)clearTimeout(timer);request.signal.removeEventListener('abort',abort); }
}
