import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/openai',()=>({createOpenAIClient:vi.fn(async()=>({}))}));
vi.mock('@/lib/server/prep-generation',()=>({generateReadingSet:vi.fn(async()=>({title:'Test',questions:[]}))}));
import {withDatabase} from '@/lib/server/database';
import {initializeUserTables} from '@/lib/server/user-auth';
import {loadPrep,savePrep,reservePrepRequest} from '@/lib/server/prep-storage';
import {emptyPrepState} from '@/lib/prep/progress';
import {POST} from '@/app/api/prep/generate/route';
import {GET,PUT} from '@/app/api/prep/progress/route';
import {createOpenAIClient} from '@/lib/openai';
let directory:string;
const user='prep-test-user';const token='a'.repeat(64);
beforeEach(async()=>{
  directory=mkdtempSync(join(tmpdir(),'lumina-prep-'));
  vi.stubEnv('ADMIN_DATABASE_PATH',join(directory,'db.sqlite'));vi.stubEnv('TURSO_DATABASE_URL','');vi.stubEnv('TURSO_AUTH_TOKEN','');vi.stubEnv('VERCEL','');
  vi.stubEnv('LUMINA_PREP_DAILY_ATTEMPTS','3');vi.stubEnv('LUMINA_PREP_GLOBAL_DAILY_ATTEMPTS','10');vi.stubEnv('LUMINA_GENERATION_PAUSED','false');
  await withDatabase(async db=>{await initializeUserTables(db);await db.batch([
    {sql:'INSERT INTO app_users VALUES(?,?,?,?,?,?,?)',args:[user,'Prep','prep','prep@example.invalid','prep@example.invalid','unused-hash',new Date().toISOString()]},
    {sql:'INSERT INTO user_sessions VALUES(?,?,?,?)',args:[createHash('sha256').update(token).digest('hex'),user,Date.now()+3600000,Date.now()]},
  ],'write');});vi.clearAllMocks();
});
afterEach(()=>{vi.unstubAllEnvs();try{rmSync(directory,{recursive:true,force:true});}catch(e){if(process.platform!=='win32'||!['EPERM','EBUSY'].includes((e as NodeJS.ErrnoException).code??''))throw e;}});
function request(body?:unknown,path='/api/prep/generate',method='POST',cookie=true,account=user){return new Request('https://lumina.test'+path,{method,headers:{Origin:'https://lumina.test','Content-Type':'application/json','X-Lumina-Account':account,...(cookie?{Cookie:'lumina_user='+token}:{})},...(body?{body:JSON.stringify(body)}:{})});}
const input={exam:'ielts',passage:'Honeybees communicate through dance. '.repeat(30),types:['mcq'],count:4,explanationLanguage:'en'};
describe('prep storage, account and budget boundaries',()=>{
  it('rejects anonymous and stale-account generation before using the provider',async()=>{
    expect((await POST(request(input,undefined,undefined,false))).status).toBe(401);
    expect((await POST(request(input,undefined,undefined,true,'other-user'))).status).toBe(409);
    expect(createOpenAIClient).not.toHaveBeenCalled();
  });
  it('rejects cross-origin writes and oversized bodies',async()=>{
    const cross=request(input);cross.headers.set('origin','https://other.test');expect((await POST(cross)).status).toBe(403);
    expect((await POST(request({...input,passage:'x'.repeat(70000)}))).status).toBe(413);
    expect(createOpenAIClient).not.toHaveBeenCalled();
  });
  it('atomically admits only two concurrent requests per short window and resets UTC limits',async()=>{
    const now=Date.UTC(2026,8,29,12);
    const results=await Promise.allSettled(Array.from({length:6},()=>reservePrepRequest(user,now)));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
    await reservePrepRequest(user,now+300001);
    await expect(reservePrepRequest(user,now+600001)).rejects.toMatchObject({status:429});
    await expect(reservePrepRequest(user,now+86400000)).resolves.toBeUndefined();
  });
  it('preserves cloud data when two devices save the same revision',async()=>{
    const a={...emptyPrepState(),profiles:{ielts:{target:7,date:null}}};
    const b={...emptyPrepState(),profiles:{ielts:{target:8,date:null}}};
    const results=await Promise.allSettled([savePrep(user,0,a),savePrep(user,0,b)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await loadPrep(user)).revision).toBe(1);
    expect((await loadPrep('another-user')).state).toEqual(emptyPrepState());
  });
  it('requires the matching account header to read or write progress',async()=>{
    expect((await GET(request(undefined,'/api/prep/progress','GET',false))).status).toBe(401);
    expect((await PUT(request({expectedRevision:0,state:emptyPrepState()},'/api/prep/progress','PUT',true,'other'))).status).toBe(409);
    const save=await PUT(request({expectedRevision:0,state:emptyPrepState()},'/api/prep/progress','PUT'));expect(save.status).toBe(200);
    expect((await GET(request(undefined,'/api/prep/progress','GET'))).headers.get('Cache-Control')).toBe('no-store');
  });
});
