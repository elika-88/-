"use client";
import { EXAMS, type ExamId } from '@/lib/prep/exams';
import { TASK_TYPES } from '@/lib/prep/tasks';
import { SKILL_GROUPS, SKILL_TIPS } from '@/lib/prep/practice-guide';
import { usePrepCopy } from './copy';
import styles from './prep.module.css';

export function SkillPicker({exam,types,setTypes,count,disabled}:{exam:ExamId;types:string[];setTypes:(types:string[])=>void;count:number;disabled:boolean}) {
  const {lang}=usePrepCopy();const zh=lang==='zh';
  const groups=SKILL_GROUPS[exam]??[{name:{en:'Reading skills',zh:'阅读技能'},ids:EXAMS[exam].readingTypes.map(t=>t.id)}];
  const needed=types.reduce((n,id)=>n+(TASK_TYPES[id]?2:1),0);
  return <div className={styles.skillPicker}>
    <p>{zh?'题型专项':'Question types'} · {types.length}/3</p>
    {groups.map(group=><fieldset key={group.name.en} className={styles.skillGroup} disabled={disabled}>
      <legend>{group.name[lang]}</legend>
      {group.ids.map(id=>{const type=EXAMS[exam].readingTypes.find(t=>t.id===id)!;const selected=types.includes(id);return <label key={id} className={styles.skillOption}>
        <input type="checkbox" checked={selected} disabled={!selected&&(types.length>=3||needed+(TASK_TYPES[id]?2:1)>count)} onChange={()=>setTypes(selected?types.filter(t=>t!==id):[...types,id])}/>
        <span>{type.name[lang]}</span>
      </label>;})}
    </fieldset>)}
    <p className={styles.hint}>{zh?`共用题组每组至少 2 题；当前最少 ${needed} 题。`:`Shared tasks need at least 2 items each; current minimum: ${needed}.`}</p>
    {types.some(id=>SKILL_TIPS[exam]?.[id])&&<details className={styles.skillTips}><summary>{zh?'所选题型的解题要点':'Strategies for selected skills'}</summary><ul>{types.map(id=>SKILL_TIPS[exam]?.[id]&&<li key={id}><strong>{EXAMS[exam].readingTypes.find(t=>t.id===id)?.name[lang]}: </strong>{SKILL_TIPS[exam]![id][lang]}</li>)}</ul></details>}
  </div>;
}
