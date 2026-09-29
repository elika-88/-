import 'server-only';
import { withDatabase } from './database';
import { AccountError, initializeUserTables } from './user-auth';
import { PrepStateSchema, emptyPrepState, type PrepState } from '@/lib/prep/progress';
import type { Client } from '@libsql/client';
async function tables(db:Client) {
  await initializeUserTables(db);
  await db.batch([
    'CREATE TABLE IF NOT EXISTS prep_records (user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE, revision INTEGER NOT NULL, data TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS prep_request_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
  ],'write');
}
export async function loadPrep(userId:string) {
  return withDatabase(async db=>{await tables(db);const row=(await db.execute({sql:'SELECT revision,data FROM prep_records WHERE user_id=?',args:[userId]})).rows[0];
    return {revision:row?Number(row.revision):0,state:row?PrepStateSchema.parse(JSON.parse(String(row.data))):emptyPrepState()};});
}
export async function savePrep(userId:string,expectedRevision:number,state:PrepState) {
  const data=JSON.stringify(PrepStateSchema.parse(state));
  if(Buffer.byteLength(data)>512*1024) throw new AccountError('REQUEST_TOO_LARGE','Export or remove older practice before saving more.',413);
  return withDatabase(async db=>{await tables(db);const tx=await db.transaction('write');try{
    const row=(await tx.execute({sql:'SELECT revision FROM prep_records WHERE user_id=?',args:[userId]})).rows[0];
    if((row?Number(row.revision):0)!==expectedRevision) throw new AccountError('REVISION_CONFLICT','Cloud practice changed. Export this device first, then load the cloud copy.',409);
    const revision=expectedRevision+1;
    await tx.execute({sql:'INSERT INTO prep_records(user_id,revision,data) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,data=excluded.data',args:[userId,revision,data]});
    await tx.commit();return {revision};
  }finally{if(!tx.closed)await tx.rollback();tx.close();}});
}
function limit(name:string,fallback:number){const raw=process.env[name];if(raw===undefined||raw==='')return fallback;const n=Number(raw);if(!Number.isInteger(n)||n<1||n>10000)throw new Error('Invalid prep limit configuration.');return n;}
// Durable admission limits (including failed attempts), separate from paid credits.
export async function reservePrepRequest(userId:string,now=Date.now()) {
  if(process.env.LUMINA_GENERATION_PAUSED==='true')throw new AccountError('GENERATION_PAUSED','Generation is temporarily paused.',503);
  const day=Math.floor(now/86400000),burst=Math.floor(now/300000);
  const buckets=[{key:'user:'+userId+':'+day,max:limit('LUMINA_PREP_DAILY_ATTEMPTS',10),end:(day+1)*86400000},
    {key:'global:'+day,max:limit('LUMINA_PREP_GLOBAL_DAILY_ATTEMPTS',200),end:(day+1)*86400000},
    {key:'burst:'+userId+':'+burst,max:2,end:(burst+1)*300000}];
  await withDatabase(async db=>{await tables(db);const tx=await db.transaction('write');try{
    await tx.execute({sql:'DELETE FROM prep_request_limits WHERE expires_at<=?',args:[now]});
    for(const bucket of buckets){const row=(await tx.execute({sql:'SELECT count FROM prep_request_limits WHERE bucket=?',args:[bucket.key]})).rows[0];
      if(row&&Number(row.count)>=bucket.max)throw new AccountError('RATE_LIMITED','Practice generation attempt limit reached. Retry after '+new Date(bucket.end).toISOString()+'. Saved practice and review remain available.',429);
      await tx.execute({sql:'INSERT INTO prep_request_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1',args:[bucket.key,bucket.end]});
    }await tx.commit();
  }finally{if(!tx.closed)await tx.rollback();tx.close();}});
}
