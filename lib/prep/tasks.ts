import { z } from 'zod';
import type { ExamId } from './exams';

// Shared stimuli are stored once per set. Gaps refer to question IDs, e.g. {{q2}}.
export const ReadingTaskSchema = z.strictObject({
  id: z.string().regex(/^t[1-8]$/),
  kind: z.enum(['matching', 'summary', 'notes', 'table', 'flowchart', 'diagram']),
  title: z.string().min(1).max(180),
  content: z.string().max(2500),
  options: z.array(z.string().min(1).max(250)).max(12),
  reuseOptions: z.boolean(),
  wordLimit: z.number().int().min(0).max(3),
  allowNumber: z.boolean(),
  headers: z.array(z.string().max(100)).max(5),
  rows: z.array(z.array(z.string().max(300)).max(5)).max(12),
  nodes: z.array(z.strictObject({id:z.string().max(24),label:z.string().max(100),x:z.number().min(0).max(3),y:z.number().min(0).max(5)})).max(12),
  edges: z.array(z.strictObject({from:z.string().max(24),to:z.string().max(24),label:z.string().max(40)})).max(16),
});
export type ReadingTask = z.infer<typeof ReadingTaskSchema>;
export const ReadingGraphicSchema = z.strictObject({
  kind:z.enum(['table','bar','line']), title:z.string().min(1).max(160),
  unit:z.string().min(1).max(60), series:z.array(z.string().min(1).max(60)).min(1).max(3),
  rows:z.array(z.strictObject({label:z.string().min(1).max(60),values:z.array(z.number().min(-1e9).max(1e9)).min(1).max(3),evidence:z.string().min(1).max(650)})).min(2).max(6),
});
export type ReadingGraphic = z.infer<typeof ReadingGraphicSchema>;

export const TASK_TYPES:Record<string,ReadingTask['kind']>={heading:'matching',matching_info:'matching',matching_features:'matching',sentence_endings:'matching',summary:'summary',summary_bank:'summary',notes:'notes',table:'table',flowchart:'flowchart',diagram:'diagram'};
export const SOURCE_COMPLETION_TYPES=['completion','short','summary','notes','table','flowchart','diagram'];
export function passageParagraphs(passage:string) {
  return passage.trim().split(/\r?\n\s*\r?\n/).filter(p=>p.trim()).map((text,i)=>({label:String.fromCharCode(65+i),text:text.trim()}));
}
export function sourceSupportIssue(exam:ExamId,passage:string,types:string[],count:number) {
  if(exam==='ielts'){
    const paragraphs=passageParagraphs(passage).length;
    if(types.includes('matching_info')&&paragraphs>12)return 'too_many_paragraphs';
    if(types.some(type=>type==='heading'||type==='matching_info')&&paragraphs<2)return 'needs_paragraphs';
    if(types.length===1&&types[0]==='heading'&&paragraphs<count)return 'needs_heading_paragraphs';
  }
  if(exam==='sat'&&types.includes('quantitative')&&(passage.match(/(?:^|[^\p{L}\p{N}])[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/gu)??[]).length<2)return 'needs_numeric_data';
  return null;
}
export function labelPassage(passage:string){return passageParagraphs(passage).map(p=>p.label+'\n'+p.text).join('\n\n');}
export function optionLabel(index:number,headings=false){return headings?['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii'][index]??String(index+1):String.fromCharCode(65+index);}
export function completionInstruction(wordLimit:number,allowNumber=false){
  const words=['ZERO','ONE','TWO','THREE'][wordLimit]??String(wordLimit);
  if(wordLimit===0)return 'ONE NUMBER ONLY';
  return 'NO MORE THAN '+words+' WORD'+(wordLimit===1?'':'S')+(allowNumber?' AND/OR A NUMBER':'')+' FROM THE PASSAGE';
}
export function withinWordLimit(answer:string,limit:number,allowNumber=false) {
  const tokens=answer.trim().split(/\s+/).filter(Boolean);
  const numeric=(s:string)=>/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/.test(s);
  const numbers=tokens.filter(numeric).length;
  return tokens.length>0 && (allowNumber?numbers<=1 && tokens.length-numbers<=limit:tokens.length<=limit);
}
