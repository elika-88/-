import type { ReadingSet, PrepGenerateRequest } from '../../lib/prep/schema';
import { TASK_TYPES, passageParagraphs, type ReadingTask } from '../../lib/prep/tasks';
import { SAMPLE_PASSAGE } from '../../lib/prep/practice-guide';

export function taskFixture(type:string,bank=false):{set:ReadingSet;request:PrepGenerateRequest} {
  const paragraphs=passageParagraphs(SAMPLE_PASSAGE);
  const kind=TASK_TYPES[type];
  const answers=['funnel','mesh filter','pipe','lid'];
  const matching=kind==='matching';
  const options=matching?(type==='matching_info'?['A','B','C','D']:['Purpose and contrasting views','Components and measurement','Results and their limits','Recommendations for improvement','A history of gardens']):bank?[...answers,'leaves']:[];
  const task:ReadingTask={id:'t1',kind,title:'Collector task',content:'',options,reuseOptions:type==='matching_info'||type==='matching_features',wordLimit:matching||bank?0:2,allowNumber:false,headers:[],rows:[],nodes:[],edges:[]};
  if(kind==='summary'||kind==='notes')task.content='The {{q1}} contains a {{q2}}. A {{q3}} joins the tank to the cylinder. A {{q4}} reduces evaporation.';
  if(kind==='table'){task.headers=['Part','Description'];task.rows=[['{{q1}}','Contains {{q2}}'],['{{q3}}','A {{q4}} reduces evaporation']];}
  if(kind==='diagram'||kind==='flowchart'){
    task.nodes=[{id:'a',label:'{{q1}}',x:0,y:0},{id:'b',label:'{{q2}}',x:1,y:0},{id:'c',label:'{{q3}}',x:1,y:1},{id:'d',label:'{{q4}}',x:0,y:1}];
    task.edges=[{from:'a',to:'b',label:''},{from:'b',to:'c',label:''},{from:'c',to:'d',label:''}];
  }
  const questions=answers.map((answer,i)=>({id:'q'+(i+1),type,taskId:'t1',prompt:matching?'Match paragraph '+paragraphs[i].label:'Complete gap '+(i+1),options:[],answerIndex:options.length?i:-1,answerText:options.length?options[i]:answer,explanation:'Check the stated relation.',evidence:['A lid covered the tank between measurements to reduce evaporation.'],context:paragraphs[i].text,wordLimit:task.wordLimit,allowNumber:false,optionReasons:options.map(()=> 'Compare with the source.'),strategy:'Check the evidence.'}));
  return {set:{title:'Shared '+type+' practice',tasks:[task],questions},request:{exam:'ielts',passage:SAMPLE_PASSAGE,types:[type],count:4,completionMode:bank?'bank':'source',explanationLanguage:'en'}};
}
export function satFixture(type='quantitative'): {set:ReadingSet;request:PrepGenerateRequest} {
  const evidence='In the first trial, the Cedar collector gathered 12 litres, the Maple collector gathered 18 litres, and the Birch collector gathered 24 litres.';
  return {request:{exam:'sat',passage:SAMPLE_PASSAGE,types:[type],count:4,explanationLanguage:'en',graphicKind:'bar'},set:{title:'SAT data practice',questions:Array.from({length:4},(_,i)=>({id:'q'+(i+1),type,prompt:'Which finding supports the claim? '+i,context:'Students compared three collectors in a garden experiment. They placed each device beside the others to compare its water collection. The recorded results of the first trial are displayed in the graph.',options:['Birch gathered more than Cedar.','Cedar gathered the most.','Maple gathered the least.','The trial established long-term reliability.'],answerIndex:0,answerText:'Birch gathered more than Cedar.',explanation:'Compare the first trial values.',evidence:[evidence],graphic:type==='quantitative'?{kind:'bar',title:'First trial',unit:'litres',series:['Collected water'],rows:[{label:'Cedar',values:[12],evidence},{label:'Maple',values:[18],evidence},{label:'Birch',values:[24],evidence}]}:undefined}))}};
}
