"use client";
import {useState} from 'react';
import type {ReadingQuestion} from '@/lib/prep/schema';
import type {ReadingTask} from '@/lib/prep/tasks';
import {completionInstruction,optionLabel} from '@/lib/prep/tasks';
import type {PrepAnswer} from '@/lib/prep/progress';
import styles from './prep.module.css';

export function QuestionInput({question:q,task,answer,onChange,locked,submitted,label,zh,used=[]}:{question:ReadingQuestion;task?:ReadingTask;answer?:PrepAnswer;onChange:(value:PrepAnswer)=>void;locked:boolean;submitted:boolean;label:string;zh:boolean;used?:number[]}){
  const [eliminated,setEliminated]=useState<number[]>([]);
  const multi=q.answerIndices?.length??0;
  if(task?.options.length)return <label className={styles.field}>{label}<select aria-label={label} disabled={locked} value={typeof answer==='number'?answer:''} onChange={e=>onChange(e.target.value===''?'':Number(e.target.value))}><option value="">{zh?'请选择':'Choose…'}</option>{q.options.map((option,i)=><option key={i} value={i} disabled={!task.reuseOptions&&used.includes(i)&&answer!==i}>{optionLabel(i,q.type==='heading')}. {option}{!task.reuseOptions&&used.includes(i)&&answer!==i?(zh?'（已使用）':' (used)'):''}</option>)}</select></label>;
  if(q.answerIndex>=0||multi){
    const selected=Array.isArray(answer)?answer:[];
    return <>
      {!!multi&&<p className={styles.taskInstruction}>{zh?`选择 ${multi} 项，每选对一项得 1 分；顺序不限。`:`Choose ${multi}. One point per correct choice; any order.`} ({selected.length}/{multi})</p>}
      <div className={styles.options} role={multi?'group':'radiogroup'} aria-label={label}>
        {q.options.map((option,i)=>{const chosen=multi?selected.includes(i):answer===i;const correct=multi?q.answerIndices!.includes(i):q.answerIndex===i;return <div className={styles.choiceRow} key={i}>
          <label className={styles.option+' '+(chosen?styles.optionChosen:'')+' '+(submitted&&correct?styles.optionAnswer:'')+' '+(eliminated.includes(i)&&!submitted?styles.eliminated:'')}>
            <input type={multi?'checkbox':'radio'} name={q.id} checked={chosen} disabled={locked||!!multi&&!chosen&&selected.length>=multi} onChange={()=>onChange(multi?chosen?selected.filter(v=>v!==i):[...selected,i]:i)}/>
            <span className={styles.optionLetter} aria-hidden="true">{optionLabel(i)}</span><span>{option}</span>
          </label>{!locked&&<button className={styles.eliminate} aria-label={(zh?'排除选项 ':'Eliminate option ')+optionLabel(i)} aria-pressed={eliminated.includes(i)} onClick={()=>setEliminated(eliminated.includes(i)?eliminated.filter(v=>v!==i):[...eliminated,i])}>×</button>}
        </div>;})}
      </div>
    </>;
  }
  return <><p className={styles.hint}>{q.type==='complete_words'?(zh?'输入完整单词，不是只填缺失字母。':'Enter the FULL word, not only missing letters.'):completionInstruction(q.wordLimit??2,q.allowNumber)}</p><input className={styles.blankInput} maxLength={200} autoComplete="off" spellCheck={false} value={typeof answer==='string'?answer:''} disabled={locked} placeholder={zh?'输入答案':'Your answer'} aria-label={label} onChange={e=>onChange(e.target.value)}/></>;
}
