import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {validateReadingSet} from '@/lib/server/prep-generation';
import {validateTasks} from '@/lib/server/prep-task-validation';
import {EXAMS} from '@/lib/prep/exams';
import {SKILL_GROUPS} from '@/lib/prep/practice-guide';
import {PrepGenerateRequestSchema} from '@/lib/prep/schema';
import {scoreQuestion,isCorrect,hasAnswer,emptyPrepState,PrepStateSchema} from '@/lib/prep/progress';
import {withinWordLimit} from '@/lib/prep/tasks';
import {taskFixture,satFixture} from './fixtures/prep-tasks';

describe('complete IELTS task families',()=>{
  it.each(['heading','matching_info','matching_features','sentence_endings','summary','notes','table','flowchart','diagram'])('validates and restores shared %s options/limits',type=>{
    const {set,request}=taskFixture(type);const result=validateReadingSet(set,request);
    expect(result.questions).toHaveLength(4);
    expect(result.questions[0].options).toEqual(set.tasks![0].options);
    expect(result.questions[0].wordLimit).toBe(set.tasks![0].wordLimit);
  });
  it.each(['summary','notes','table','flowchart'])('supports %s word-bank variants',type=>{
    const {set,request}=taskFixture(type,true);
    expect(validateReadingSet(set,request).questions[0].answerText).toBe('funnel');
    expect(()=>validateReadingSet(set,{...request,completionMode:'source'})).toThrow(/requested/);
  });
  it.each(['heading','sentence_endings'])('rejects reused answers or missing extra options in %s',type=>{
    const {set,request}=taskFixture(type);set.questions[1].answerIndex=0;
    expect(()=>validateTasks(set,request)).toThrow(/reusing/);
    set.questions[1].answerIndex=1;set.tasks![0].options.pop();
    expect(()=>validateTasks(set,request)).toThrow(/extra options/);
  });
  it('permits repeated paragraph letters only when the rule and evidence match',()=>{
    const {set,request}=taskFixture('matching_info');
    set.questions[1].answerIndex=0;set.questions[1].context=set.questions[0].context;
    expect(validateTasks(set,request).questions[1].answerIndex).toBe(0);
    set.tasks![0].reuseOptions=false;
    expect(()=>validateTasks(set,request)).toThrow(/allows reuse/);
  });
  it.each(['summary','notes','table','flowchart','diagram'])('rejects duplicate or missing %s gaps',type=>{
    const {set,request}=taskFixture(type);const task=set.tasks![0];
    task.content=task.content.replace('{{q2}}','{{q1}}');
    task.rows=task.rows.map(r=>r.map(c=>c.replace('{{q2}}','{{q1}}')));
    task.nodes=task.nodes.map(n=>({...n,label:n.label.replace('{{q2}}','{{q1}}')}));
    expect(()=>validateTasks(set,request)).toThrow(/exactly one/);
  });
  it('rejects broken table rows, overlapping nodes and disconnected diagrams',()=>{
    const {set,request}=taskFixture('table');set.tasks![0].rows.push(['extra']);
    expect(()=>validateTasks(set,request)).toThrow(/rectangular/);
    const f=taskFixture('diagram');f.set.tasks![0].nodes[1].x=0;
    expect(()=>validateTasks(f.set,f.request)).toThrow(/nonoverlapping/);
    f.set.tasks![0].nodes[1].x=1;f.set.tasks![0].edges.splice(1,1);
    expect(()=>validateTasks(f.set,f.request)).toThrow(/connected layout/);
  });
  it('enforces source words, hyphenated words and number limits',()=>{
    expect(withinWordLimit('well-being',1)).toBe(true);
    expect(withinWordLimit('red roof 12',2,true)).toBe(true);
    expect(withinWordLimit('12 13',2,true)).toBe(false);
    expect(withinWordLimit('12',0,true)).toBe(true);
    expect(withinWordLimit('twelve litres',0,true)).toBe(false);
    const f=taskFixture('summary');f.set.questions[0].answerText='invented material';
    expect(()=>validateTasks(f.set,f.request)).toThrow(/come from source/);
  });
  it.each([2,3])('grades %i-answer tasks in any order with bounded partial credit',n=>{
    const q={...satFixture().set.questions[0],type:'multi',graphic:null,answerIndex:-1,options:Array.from({length:n===2?5:7},(_,i)=>'Option '+i),answerIndices:Array.from({length:n},(_,i)=>i),optionReasons:Array.from({length:n===2?5:7},()=> 'Reason')};
    expect(scoreQuestion(q,[...q.answerIndices].reverse())).toEqual({correct:n,total:n});
    expect(isCorrect(q,q.answerIndices)).toBe(true);
    expect(scoreQuestion(q,[0,n+1])).toEqual({correct:1,total:n});
    expect(isCorrect(q,[0,n+1])).toBe(false);
    expect(scoreQuestion(q,undefined).correct).toBe(0);
    expect(scoreQuestion(q,[0,0]).correct).toBe(0);
    expect(scoreQuestion(q,[0,1,2,3]).correct).toBe(0);
    expect(hasAnswer([])).toBe(false);expect(hasAnswer([0])).toBe(true);
    const f=satFixture();f.set.questions=f.set.questions.map((item,i)=>({...q,id:item.id,prompt:'Choose '+n+' '+i}));
    expect(validateReadingSet(f.set,{...f.request,exam:'ielts',types:['multi']}).questions[0].answerIndices).toEqual(q.answerIndices);
  });
});
describe('SAT contexts and source-grounded graphics',()=>{
  it.each(['table','bar','line'] as const)('supports a %s with a value for every series',kind=>{
    const {set,request}=satFixture();set.questions.forEach(q=>q.graphic!.kind=kind);
    expect(validateReadingSet(set,{...request,graphicKind:kind}).questions).toHaveLength(4);
    set.questions[0].graphic!.series.push('Another series');
    expect(()=>validateReadingSet(set,{...request,graphicKind:kind})).toThrow(/one value per series/);
  });
  it('rejects invented values, categories, missing graphics and unsupported chart kinds',()=>{
    const {set,request}=satFixture();set.questions[0].graphic!.rows[0].values=[999];
    expect(()=>validateReadingSet(set,request)).toThrow(/values must occur/);
    set.questions[0].graphic!.rows[0].values=[12];set.questions[0].graphic!.rows[0].label='Oak';
    expect(()=>validateReadingSet(set,request)).toThrow(/source evidence/);
    set.questions[0].graphic=null;
    expect(()=>validateReadingSet(set,request)).toThrow(/graphic kind/);
  });
  it.each(['words','transitions','boundaries','form'])('requires an actual gap for %s',type=>{
    const {set,request}=satFixture(type);
    expect(()=>validateReadingSet(set,request)).toThrow(/____/);
    set.questions.forEach(q=>q.context+=' ____');
    expect(validateReadingSet(set,request).questions).toHaveLength(4);
  });
  it('requires two labelled texts for cross-text questions',()=>{
    const {set,request}=satFixture('cross_text');
    expect(()=>validateReadingSet(set,request)).toThrow(/Text 1/);
    set.questions.forEach(q=>q.context='Text 1: '+q.context+'\nText 2: Longer trials would test reliability.');
    expect(validateReadingSet(set,request).questions).toHaveLength(4);
  });
});
describe('catalogue and persistence compatibility',()=>{
  it.each(['ielts','sat'] as const)('lists every %s skill once in the selector',exam=>{
    expect(SKILL_GROUPS[exam]!.flatMap(g=>g.ids).sort()).toEqual(EXAMS[exam].readingTypes.map(t=>t.id).sort());
  });
  it('rejects more shared tasks than fit the question count',()=>{
    const {request}=taskFixture('summary');
    expect(PrepGenerateRequestSchema.safeParse({...request,types:['summary','heading','diagram'],count:4}).success).toBe(false);
    expect(PrepGenerateRequestSchema.safeParse({...request,types:['summary','heading','diagram'],count:6}).success).toBe(true);
  });
  it('round-trips array answers and shared review material and accepts old records',()=>{
    const {set,request}=taskFixture('summary');const state=emptyPrepState();
    state.sets.ielts={exam:'ielts',passage:request.passage,types:['summary'],createdAt:1,set,session:{answers:{q1:[0,2]},flags:[],submitted:false,startedAt:1,deadline:null}};
    state.reviews=[{id:'r',exam:'ielts',question:set.questions[0],task:set.tasks![0],source:request.passage,reason:'evidence',note:'',dueAt:1,streak:0}];
    expect(PrepStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(PrepStateSchema.parse({profiles:{},attempts:[],sets:{}}).reviews).toEqual([]);
  });
});
