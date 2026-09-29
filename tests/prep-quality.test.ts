import { describe,it,expect,vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { z } from 'zod';
import OpenAI, { APIConnectionTimeoutError } from 'openai';
import { prepModel } from '@/lib/server/prep-model';
import { generateReadingSet,validateReadingSet,maskCompletionContext } from '@/lib/server/prep-generation';
import { EXAMS,minimumCharacters } from '@/lib/prep/exams';
import { PrepGenerateRequestSchema, type ReadingSet } from '@/lib/prep/schema';
import { isCorrect,PrepStateSchema,emptyPrepState,reviewDue } from '@/lib/prep/progress';
import { citationCatalog } from '@/lib/ai/citation-catalog';
import { segmentLecture } from '@/lib/source';
const passage='Honeybees communicate the location of food through a waggle dance. Longer waggle runs signal greater distances. '.repeat(6);
const request={exam:'ielts' as const,passage,types:['mcq'],explanationLanguage:'en' as const};
const valid:ReadingSet={title:'Bees',questions:Array.from({length:4},(_,i)=>({id:'q'+i,type:'mcq',prompt:'What do longer waggle runs signal? '+i,options:['Greater distances','Rain','Danger','Sleep'],answerIndex:0,answerText:'Greater distances',explanation:'The text states this.',evidence:['Longer waggle runs signal greater distances.']}))};
describe('prep quality boundaries',()=>{
  it('masks exactly the second half on the server and rejects leaked repeated answers',()=>{
    expect(maskCompletionContext('Students attend the library.','Students')).toBe('Stud____ attend the library.');
    expect(maskCompletionContext('They dance in circles.','dance')).toBe('They da___ in circles.');
    expect(()=>maskCompletionContext('Dance after another dance.','dance')).toThrow(/exactly once/);
  });
  it('rejects empty evidence, duplicate questions and invalid requested types',()=>{
    expect(()=>validateReadingSet({...valid,questions:valid.questions.map(q=>({...q,evidence:['']}))},request)).toThrow(/nonempty/);
    expect(()=>validateReadingSet({...valid,questions:valid.questions.map(q=>({...q,prompt:'same'}))},request)).toThrow(/Duplicate/);
    expect(PrepGenerateRequestSchema.safeParse({...request,types:['fake']}).success).toBe(false);
    expect(PrepGenerateRequestSchema.safeParse({...request,types:['mcq','mcq']}).success).toBe(false);
    expect(minimumCharacters('sat')).toBeLessThan(minimumCharacters('ielts'));
  });
  it('validates SAT short contexts rather than accepting a long shared passage',()=>{
    expect(()=>validateReadingSet({...valid,questions:valid.questions.map(q=>({...q,type:'central'}))},{...request,exam:'sat',types:['central']})).toThrow(/25-150/);
    expect(()=>validateReadingSet({...valid,questions:valid.questions.map(q=>({...q,type:'central',context:'Too short.'}))},{...request,exam:'sat',types:['central']})).toThrow(/25-150/);
    expect(EXAMS.toefl.scoreRange.max).toBe(6);expect(EXAMS.sat.scoreRange.max).toBe(800);
    expect(EXAMS.toefl.readingTypes.map(t=>t.id)).toContain('complete_words');
  });
  it('does not silently repair misspelled or wrongly hyphenated short answers',()=>{
    const q={...valid.questions[0],answerIndex:-1,answerText:'well-being',wordLimit:2};
    expect(isCorrect(q,'well being')).toBe(false);expect(isCorrect(q,' WELL-BEING ')).toBe(true);
    expect(isCorrect({...q,answerText:'red sun',wordLimit:1},'red sun')).toBe(false);
  });
  it('allows repeated SAT task stems for distinct texts but rejects duplicated items',()=>{
    const questions=valid.questions.map((q,i)=>({...q,type:'central',prompt:'What is the main idea of the text?',context:passage+' Example '+i}));
    const satRequest={...request,exam:'sat' as const,types:['central']};
    expect(validateReadingSet({...valid,questions},satRequest).questions).toHaveLength(4);
    expect(()=>validateReadingSet({...valid,questions:questions.map(q=>({...q,context:passage}))},satRequest)).toThrow(/Duplicate/);
  });
  it('bounds review scheduling and validates restored records',()=>{
    expect(reviewDue(0,false,0)).toEqual({streak:0,dueAt:86400000});
    expect(reviewDue(0,true,0)).toEqual({streak:1,dueAt:3*86400000});
    expect(PrepStateSchema.safeParse({...emptyPrepState(),sets:{ielts:{garbage:true}}}).success).toBe(false);
  });
  it.each(['responses','chat_completions'] as const)('accepts a single fenced JSON object using the real %s SDK',async apiFormat=>{
    const content='```json\n{"result":"ok","metadata":"ignored"}\n```';
    const body=apiFormat==='responses'?{id:'r',object:'response',status:'completed',output:[{type:'message',id:'m',role:'assistant',content:[{type:'output_text',text:content,annotations:[]}]}]}:{id:'c',object:'chat.completion',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content}}]};
    const client=new OpenAI({apiKey:'local-test-placeholder',maxRetries:0,fetch:async()=>Response.json(body)});
    expect(await prepModel(z.strictObject({result:z.string()}),'check','Check',{}, {client,model:'test-model',apiFormat},new AbortController().signal)).toEqual({result:'ok'});
  });
  it('fails closed after invalid generation instead of returning unreviewed material',async()=>{
    const create=vi.fn().mockResolvedValue({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}]});
    await expect(generateReadingSet(request,{client:{responses:{create}},model:'test-model',apiFormat:'responses'} as never,new AbortController().signal)).rejects.toMatchObject({code:'VERIFICATION_FAILED'});
    expect(create).toHaveBeenCalledTimes(2);
  });
  it('reviews the masked TOEFL context and returns only audited questions',async()=>{
    const evidenceId=citationCatalog(segmentLecture(passage))[0].sourceId;
    const questions=valid.questions.map((q,i)=>({...q,id:'q'+(i+1),type:'complete_words',options:[],answerIndex:-1,answerText:'Honeybees',context:'Honeybees communicate through a dance to signal where food is located.',evidence:[evidenceId],optionReasons:[],strategy:'Check the context.',wordLimit:1,allowNumber:false,answerIndices:[],taskId:null,graphic:null}));
    const output=(value:unknown)=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
    const create=vi.fn().mockResolvedValueOnce(output({title:'Bees',questions,tasks:[]})).mockResolvedValueOnce(output({items:questions.map(q=>({id:q.id,valid:true,reason:''}))}));
    const result=await generateReadingSet({...request,exam:'toefl',types:['complete_words'],count:4},{client:{responses:{create}},model:'test-model',apiFormat:'responses'} as never,new AbortController().signal);
    const reviewed=JSON.parse(create.mock.calls[1][0].input[1].content).set;
    expect(reviewed.questions[0].context).toContain('Hone_____');
    expect(reviewed.questions[0].context).not.toContain('Honeybees');
    expect(result.questions[0].answerText).toBe('Honeybees');
    expect(result.questions[0].evidence[0]).toBe(citationCatalog(segmentLecture(passage))[0].text);
  });
  it('reports provider timeout without spending another generation attempt',async()=>{
    const create=vi.fn().mockRejectedValue(new APIConnectionTimeoutError());
    await expect(generateReadingSet(request,{client:{responses:{create}},model:'test-model',apiFormat:'responses'} as never,new AbortController().signal)).rejects.toMatchObject({code:'TIMEOUT',retryable:true});
    expect(create).toHaveBeenCalledTimes(1);
  });
});
