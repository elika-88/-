import { z } from 'zod';
import { EXAM_IDS, type ExamId } from './exams';
import { ReadingQuestionSchema, ReadingSetSchema, type ReadingQuestion } from './schema';
const AnswerSchema=z.union([z.number().int().min(0).max(3),z.string().max(200)]);
export const REASONS=['vocabulary','evidence','inference','grammar','timing','careless','uncertain'] as const;
const Profile=z.object({target:z.number().nullable(),date:z.string().nullable(),minutes:z.number().min(5).max(120).optional()});
const Session=z.object({answers:z.record(z.string(),AnswerSchema),flags:z.array(z.string()),submitted:z.boolean(),startedAt:z.number(),deadline:z.number().nullable(),submittedAt:z.number().optional()});
const SavedSet=z.object({exam:z.enum(EXAM_IDS),passage:z.string().max(12000),types:z.array(z.string()),set:ReadingSetSchema,createdAt:z.number(),session:Session.optional()});
const Attempt=z.object({id:z.string(),exam:z.enum(EXAM_IDS),title:z.string(),correct:z.number().min(0),total:z.number().min(1),at:z.number(),seconds:z.number().nonnegative().optional(),skills:z.record(z.string(),z.object({correct:z.number(),total:z.number()})).optional()});
const Review=z.object({id:z.string(),exam:z.enum(EXAM_IDS),question:ReadingQuestionSchema,reason:z.enum(REASONS),note:z.string().max(1200),dueAt:z.number(),streak:z.number().int().min(0).max(6)});
const Vocabulary=z.object({id:z.string(),exam:z.enum(EXAM_IDS),term:z.string().min(1).max(120),meaning:z.string().max(500),context:z.string().max(1200),at:z.number()});
export const PrepStateSchema=z.object({
  profiles:z.partialRecord(z.enum(EXAM_IDS),Profile),attempts:z.array(Attempt).max(100),sets:z.partialRecord(z.enum(EXAM_IDS),SavedSet),
  drafts:z.partialRecord(z.enum(EXAM_IDS),z.string().max(12000)).default({}),
  reviews:z.array(Review).max(100).default([]),vocabulary:z.array(Vocabulary).max(100).default([]),
});
export type PrepState=z.infer<typeof PrepStateSchema>;
export type PrepSession=z.infer<typeof Session>;
export type PrepAttempt=z.infer<typeof Attempt>;
export type PrepReview=z.infer<typeof Review>;
export type SavedSet=z.infer<typeof SavedSet>;
export type ExamProfile=z.infer<typeof Profile>;
export const emptyPrepState=():PrepState=>({profiles:{},attempts:[],sets:{},reviews:[],vocabulary:[],drafts:{}});
export function isCorrect(question:ReadingQuestion,answer:unknown) {
  if(question.answerIndex>=0) return answer===question.answerIndex;
  if(typeof answer!=='string') return false;
  // Preserve punctuation and hyphens: IELTS spelling must not be silently repaired.
  const clean=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  return clean(answer)===clean(question.answerText) && answer.trim().split(/\s+/).length<=(question.wordLimit??2);
}
export function reviewDue(streak:number,remembered:boolean,now=Date.now()) {
  const next=remembered?Math.min(streak+1,5):0;
  const days=[1,3,7,14,30,60][next];
  return {streak:next,dueAt:now+days*86400000};
}
export function skillSummary(state:PrepState,exam:ExamId) {
  const result:Record<string,{correct:number;total:number}>={};
  for(const attempt of state.attempts.filter(a=>a.exam===exam).slice(0,20)) for(const [id,value] of Object.entries(attempt.skills??{})) {
    const old=result[id]??{correct:0,total:0};result[id]={correct:old.correct+value.correct,total:old.total+value.total};
  }
  return Object.entries(result).sort((a,b)=>(a[1].correct/a[1].total)-(b[1].correct/b[1].total));
}
