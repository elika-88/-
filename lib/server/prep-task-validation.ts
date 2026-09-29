import 'server-only';
import type { PrepGenerateRequest, ReadingSet } from '@/lib/prep/schema';
import { TASK_TYPES, passageParagraphs, withinWordLimit } from '@/lib/prep/tasks';

const normalize=(s:string)=>s.replace(/\s+/g,' ').trim().toLowerCase();
export function sourceContains(source:string,answer:string) {
  const escaped=answer.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return !!answer.trim() && new RegExp('(^|[^\\p{L}\\p{N}])'+escaped.replace(/\s+/g,'\\s+')+'(?=$|[^\\p{L}\\p{N}])','iu').test(source);
}
export function validateTasks(set:ReadingSet,request:PrepGenerateRequest):ReadingSet {
  const tasks=set.tasks??[];
  const ids=new Set(tasks.map(t=>t.id));
  if(ids.size!==tasks.length)throw new Error('Task IDs must be distinct.');
  const paragraphs=passageParagraphs(request.passage);
  for(const q of set.questions){
    if(q.taskId&&!ids.has(q.taskId))throw new Error('Unknown taskId.');
    if(TASK_TYPES[q.type]&&!q.taskId)throw new Error('Shared task required for '+q.type+'.');
    if(q.taskId&&!TASK_TYPES[q.type])throw new Error('This question type does not use a shared task.');
    if(q.type!=='multi'&&q.answerIndices?.length)throw new Error('Only multiple-answer tasks may have answerIndices.');
    if(q.type!=='quantitative'&&q.graphic)throw new Error('Graphics are reserved for quantitative evidence.');
    if(q.taskId&&q.id!=='q'+(set.questions.indexOf(q)+1))throw new Error('Shared tasks must use sequential q1,q2 IDs.');
  }
  for(const task of tasks){
    const members=set.questions.filter(q=>q.taskId===task.id);
    const type=members[0]?.type;
    if(request.exam!=='ielts'||members.length<2||members.some(q=>q.type!==type)||task.kind!==TASK_TYPES[type])throw new Error('Every IELTS shared task needs at least two questions of the same type and matching layout.');
    const positions=members.map(q=>set.questions.indexOf(q));
    if(positions.some((p,i)=>i>0&&p!==positions[i-1]+1))throw new Error('Keep shared task questions consecutive.');
    const bank=task.options.length>0;
    if(bank&&(new Set(task.options.map(normalize)).size!==task.options.length||task.options.some(s=>!s.trim())))throw new Error('Shared options must be distinct and nonempty.');
    if(task.kind==='matching'){
      if(task.options.length<2)throw new Error('Matching tasks require a shared option pool.');
      if(['heading','sentence_endings'].includes(type)&&(task.reuseOptions||task.options.length<=members.length))throw new Error('Headings and endings need extra options and no reuse.');
      if(['heading','matching_info'].includes(type)){
        if(paragraphs.length<2)throw new Error('Paragraph matching needs at least two paragraphs separated by blank lines.');
        for(const q of members){
          const paragraph=paragraphs.find(p=>normalize(p.text)===normalize(q.context??''));
          if(!paragraph)throw new Error('Matching context must be one exact labelled source paragraph.');
          if(type==='heading'&&!new RegExp('\\b'+paragraph.label+'\\b').test(q.prompt))throw new Error('Heading prompt must identify its target paragraph letter.');
          if(type==='matching_info'&&task.options[q.answerIndex]!==paragraph.label)throw new Error('Information answer letter must point to its evidence paragraph.');
        }
        if(type==='heading'&&new Set(members.map(q=>normalize(q.context??''))).size!==members.length)throw new Error('Use different paragraphs for heading questions.');
        if(type==='matching_info'&&(JSON.stringify(task.options)!==JSON.stringify(paragraphs.map(p=>p.label))||!task.reuseOptions))throw new Error('Information matching uses all source paragraph letters and allows reuse.');
      }
      if(task.content||task.rows.length||task.nodes.length||task.edges.length||task.headers.length)throw new Error('Matching tasks use only title and options.');
    }else{
      if(type==='diagram'&&bank)throw new Error('Diagram labels must be copied from the source, not a word bank.');
      if(['summary','notes','table','flowchart'].includes(type)&&bank!==((request.completionMode??'source')==='bank'))throw new Error('Use the requested source-word or shared word-bank mode.');
      if(bank&&(task.reuseOptions||task.options.length<=members.length))throw new Error('Completion banks need extra options and no reuse.');
      const fields=task.kind==='table'?task.rows.flat():['diagram','flowchart'].includes(task.kind)?task.nodes.map(n=>n.label):[task.content];
      const gaps=fields.join('\n').match(/\{\{[^{}]+\}\}/g)??[];
      if(gaps.length!==members.length||members.some(q=>gaps.filter(g=>'{{'+q.id+'}}'===g).length!==1))throw new Error('Every group question needs exactly one {{qN}} gap, with no unknown gaps.');
      if(task.kind==='table'&&(task.headers.length<2||task.rows.length<2||task.rows.some(r=>r.length!==task.headers.length)))throw new Error('A table must have headers and rectangular data rows.');
      if(task.kind==='table'&&(task.content||task.nodes.length||task.edges.length)||['summary','notes'].includes(task.kind)&&(task.headers.length||task.rows.length||task.nodes.length||task.edges.length)||['diagram','flowchart'].includes(task.kind)&&(task.content||task.headers.length||task.rows.length))throw new Error('Only populate fields for the selected task layout.');
      if(['diagram','flowchart'].includes(task.kind)){
        const nodes=new Set(task.nodes.map(n=>n.id));
        if(nodes.size!==task.nodes.length||task.nodes.length<3||task.edges.length<2||new Set(task.nodes.map(n=>n.x+','+n.y)).size!==nodes.size)throw new Error('Diagram needs distinct nonoverlapping nodes and connections.');
        if(task.nodes.some(n=>!Number.isInteger(n.x)||!Number.isInteger(n.y))||task.edges.some(e=>!nodes.has(e.from)||!nodes.has(e.to)||e.from===e.to))throw new Error('Invalid diagram grid or connection.');
        if(task.nodes.some(n=>!task.edges.some(e=>e.from===n.id||e.to===n.id)))throw new Error('Every diagram node must connect to another.');
        const reached=new Set([task.nodes[0].id]);
        for(let i=0;i<task.nodes.length;i++)for(const edge of task.edges){if(reached.has(edge.from))reached.add(edge.to);if(reached.has(edge.to))reached.add(edge.from);}
        if(reached.size!==nodes.size)throw new Error('Diagram connections must form one connected layout.');
      }
      if(!bank)for(const q of members){
        if(!withinWordLimit(q.answerText,task.wordLimit,task.allowNumber)||!sourceContains(request.passage,q.answerText))throw new Error('Every gap answer must satisfy the shared word/number limit and come from source.');
      }
    }
    if(bank&&!task.reuseOptions&&new Set(members.map(q=>q.answerIndex)).size!==members.length)throw new Error('This task prohibits reusing an answer option.');
  }
  const questions=set.questions.map(q=>{
    const task=tasks.find(t=>t.id===q.taskId);
    if(!task)return q;
    return {...q,options:task.options,wordLimit:task.wordLimit,allowNumber:task.allowNumber};
  });
  return {...set,questions};
}
export function validateGraphic(q:ReadingSet['questions'][number],source:string,requestedKind?:string){
  const g=q.graphic;
  if(!g||(requestedKind&&g.kind!==requestedKind))throw new Error('Quantitative evidence requires the selected graphic kind.');
  if(new Set(g.rows.map(r=>normalize(r.label))).size!==g.rows.length||new Set(g.series.map(normalize)).size!==g.series.length)throw new Error('Graphic labels and series must be distinct.');
  for(const row of g.rows){
    if(row.values.length!==g.series.length||!normalize(source).includes(normalize(row.evidence))||!sourceContains(row.evidence,row.label))throw new Error('Every graphic row needs source evidence, category label and one value per series.');
    const numbers=(row.evidence.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g)??[]).map(x=>Number(x.replace(/,/g,'')));
    if(row.values.some(v=>!numbers.includes(v)))throw new Error('Graphic values must occur in the cited source evidence.');
  }
}
