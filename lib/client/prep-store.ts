"use client";
import { useSyncExternalStore } from 'react';
import type { ExamId } from '@/lib/prep/exams';
import { PrepStateSchema, emptyPrepState, reviewDue, type PrepState, type SavedSet, type ExamProfile, type PrepAttempt, type PrepSession, type PrepReview } from '@/lib/prep/progress';
export type {PrepState,SavedSet,ExamProfile,PrepAttempt} from '@/lib/prep/progress';
const EVENT='lumina:prep-changed';
const EMPTY=emptyPrepState();
const cache=new Map<string,{raw:string|null;state:PrepState}>();
export const prepKey=(owner:string)=>'lumina.prep.v2.'+owner;
export function readPrep(owner='guest'):PrepState {
  let raw:string|null=null;
  try{raw=window.localStorage.getItem(prepKey(owner));}catch{return cache.get(owner)?.state??EMPTY;}
  const old=cache.get(owner);if(old&&old.raw===raw)return old.state;
  let state=EMPTY;
  try {const parsed=PrepStateSchema.safeParse(raw?JSON.parse(raw):EMPTY);if(parsed.success)state=parsed.data;}catch{/* retain corrupt storage for export, never overwrite during reads */}
  cache.set(owner,{raw,state});return state;
}
export function replacePrep(owner:string,state:PrepState) {
  const parsed=PrepStateSchema.parse(state);const raw=JSON.stringify(parsed);
  // Fail visibly if full: do not pretend to save and then lose the update.
  window.localStorage.setItem(prepKey(owner),raw);
  cache.set(owner,{raw,state:parsed});window.dispatchEvent(new Event(EVENT));
}
function update(owner:string,fn:(s:PrepState)=>PrepState){replacePrep(owner,fn(readPrep(owner)));}
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener(EVENT,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(EVENT,callback);};}
export const usePrepState=(owner='guest')=>useSyncExternalStore(subscribe,()=>readPrep(owner),()=>EMPTY);
export function saveProfile(exam:ExamId,profile:ExamProfile,owner='guest'){update(owner,s=>({...s,profiles:{...s.profiles,[exam]:profile}}));}
export function saveSet(saved:SavedSet,owner='guest'){update(owner,s=>({...s,sets:{...s.sets,[saved.exam]:saved}}));}
export function saveDraft(exam:ExamId,text:string,owner='guest'){update(owner,s=>({...s,drafts:{...s.drafts,[exam]:text}}));}
export function clearSet(exam:ExamId,owner='guest'){update(owner,s=>{const sets={...s.sets};delete sets[exam];return {...s,sets};});}
export function updateSession(exam:ExamId,session:PrepSession,owner='guest'){update(owner,s=>{const saved=s.sets[exam];return saved?{...s,sets:{...s.sets,[exam]:{...saved,session}}}:s;});}
export function recordAttempt(attempt:Omit<PrepAttempt,'at'>,reviews:PrepReview[],owner='guest'){
  update(owner,s=>s.attempts.some(a=>a.id===attempt.id)?s:{...s,attempts:[{...attempt,at:Date.now()},...s.attempts].slice(0,100),
    reviews:[...reviews,...s.reviews.filter(r=>!reviews.some(n=>n.id===r.id))].slice(0,100)});
}
export function changeReview(id:string,patch:Partial<Pick<PrepReview,'note'|'reason'>>,owner='guest'){update(owner,s=>({...s,reviews:s.reviews.map(r=>r.id===id?{...r,...patch}:r)}));}
export function rateReview(id:string,remembered:boolean,owner='guest'){update(owner,s=>({...s,reviews:s.reviews.map(r=>r.id===id?{...r,...reviewDue(r.streak,remembered)}:r)}));}
export function removeReview(id:string,owner='guest'){update(owner,s=>({...s,reviews:s.reviews.filter(r=>r.id!==id)}));}
export function addVocabulary(value:Omit<PrepState['vocabulary'][number],'id'|'at'>,owner='guest'){
  update(owner,s=>({...s,vocabulary:[{...value,id:crypto.randomUUID(),at:Date.now()},...s.vocabulary.filter(v=>v.exam!==value.exam||v.term.toLowerCase()!==value.term.toLowerCase())].slice(0,100)}));
}
export function removeVocabulary(id:string,owner='guest'){update(owner,s=>({...s,vocabulary:s.vocabulary.filter(v=>v.id!==id)}));}
export function importLegacy(owner='guest'){
  const raw=window.localStorage.getItem('lumina.prep.v1');if(!raw)throw new Error('No legacy practice found.');
  const state=PrepStateSchema.parse(JSON.parse(raw));
  // Old SAT overall targets and TOEFL 0-120 targets are not section targets.
  delete state.profiles.sat;delete state.profiles.toefl;
  replacePrep(owner,state);
  window.dispatchEvent(new Event('lumina:prep-restored'));
}
export function daysUntil(date:string|null,now:number){if(!date)return null;const target=new Date(date+'T00:00:00').getTime();if(!Number.isFinite(target))return null;const today=new Date(now);today.setHours(0,0,0,0);return Math.round((target-today.getTime())/86400000);}
