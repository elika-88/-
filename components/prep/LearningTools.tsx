"use client";
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { EXAMS, type ExamId } from '@/lib/prep/exams';
import { PrepStateSchema, REASONS, skillSummary } from '@/lib/prep/progress';
import { addVocabulary, changeReview, importLegacy, prepKey, rateReview, readPrep, removeReview, removeVocabulary, replacePrep, usePrepState } from '@/lib/client/prep-store';
import { usePrepOwner } from './PrepContext';
import { usePrepCopy } from './copy';
import styles from './prep.module.css';

const cloudSchema=z.object({revision:z.number().int().nonnegative(),state:PrepStateSchema});
const reasonLabels:Record<typeof REASONS[number],[string,string]>={vocabulary:['Vocabulary','词汇'],evidence:['Finding evidence','定位证据'],inference:['Inference','推断'],grammar:['Grammar','语法'],timing:['Time pressure','时间不足'],careless:['Misread / spelling','误读／拼写'],uncertain:['Unsure / disputed','不确定／有争议']};
export function LearningTools({exam}:{exam:ExamId}) {
  const owner=usePrepOwner();const state=usePrepState(owner);const {lang}=usePrepCopy();const zh=lang==='zh';
  const [error,setError]=useState('');const [term,setTerm]=useState('');const [meaning,setMeaning]=useState('');const [context,setContext]=useState('');
  const [revealed,setRevealed]=useState<string[]>([]);const [now]=useState(()=>Date.now());
  const reviews=state.reviews.filter(r=>r.exam===exam).sort((a,b)=>a.dueAt-b.dueAt);
  const stats=skillSummary(state,exam);
  function safe(action:()=>void){try{action();setError('');}catch{setError(zh?'保存失败，请导出备份并检查浏览器存储空间。':'Save failed. Export a backup and check browser storage.');}}
  return <section className={styles.toolkit}>
    <h2>{zh?'复盘与复习':'Review and retention'}</h2>
    <p className={styles.hint}>{zh?'建议：先回忆，再看解析，记录错因。按 1／3／7／14／30／60 天回顾；这是可重复的练习计划，不是提分保证。':'Recall first, then inspect the explanation and record why you missed it. Review on a 1/3/7/14/30/60-day schedule; this is a study routine, not a score guarantee.'}</p>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <details className={styles.toolSection} open><summary>{zh?'错题与标记题':'Missed and flagged questions'} · {reviews.filter(r=>r.dueAt<=now).length} {zh?'到期':'due'} / {reviews.length}</summary>
      {!reviews.length&&<p>{zh?'完成练习后，错题和标记题会出现在这里。':'Missed and flagged questions appear here after you submit a practice set.'}</p>}
      {reviews.slice(0,10).map(r=><article key={r.id} className={styles.reviewItem}>
        <p className={styles.hint}>{EXAMS[exam].readingTypes.find(t=>t.id===r.question.type)?.name[lang]} · {zh?'复习日期':'Due'} {new Date(r.dueAt).toLocaleDateString()}</p>
        {r.question.context&&<div className={styles.itemContext}>{r.question.context}</div>}
        <p><strong>{r.question.prompt}</strong></p>
        {r.question.options.length>0&&<ol type="A">{r.question.options.map((v,i)=><li key={i}>{v}</li>)}</ol>}
        <label className={styles.field}>{zh?'先回忆你的答案（不计分）':'Recall your answer first (unscored)'}<input autoComplete="off" /></label>
        <Button variant="outline" onClick={()=>setRevealed(revealed.includes(r.id)?revealed.filter(id=>id!==r.id):[...revealed,r.id])}>{revealed.includes(r.id)?(zh?'隐藏解析':'Hide explanation'):(zh?'展开答案与解析':'Reveal answer and explanation')}</Button>
        {revealed.includes(r.id)&&<div className={styles.explanation}><p><strong>{r.question.answerText}</strong></p><p>{r.question.explanation}</p><p>{r.question.strategy}</p>
          <div className={styles.actionGroup}><Button variant="outline" onClick={()=>{safe(()=>rateReview(r.id,false,owner));setRevealed(revealed.filter(id=>id!==r.id));}}>{zh?'还没掌握·明天再看':'Not yet · tomorrow'}</Button><Button onClick={()=>{safe(()=>rateReview(r.id,true,owner));setRevealed(revealed.filter(id=>id!==r.id));}}>{zh?'已回忆出·延后复习':'Recalled · schedule next'}</Button></div></div>}
        <label className={styles.field}>{zh?'错因 / 争议':'Reason / uncertainty'}<select value={r.reason} onChange={e=>safe(()=>changeReview(r.id,{reason:e.target.value as typeof r.reason},owner))}>{REASONS.map(reason=><option key={reason} value={reason}>{reasonLabels[reason][zh?1:0]}</option>)}</select></label>
        <div className={styles.field}><label htmlFor={'review-note-'+r.id}>{zh?'我的纠错笔记':'My correction note'}</label><textarea id={'review-note-'+r.id} maxLength={1200} value={r.note} onChange={e=>safe(()=>changeReview(r.id,{note:e.target.value},owner))}/></div>
        <button className={styles.linkButton} onClick={()=>safe(()=>removeReview(r.id,owner))}>{zh?'移出复习队列':'Remove from review'}</button>
      </article>)}
      {reviews.length>10&&<p>{zh?'先处理最早的 10 道，后续会自动前移。':'The earliest 10 are shown; later items move up as you review.'}</p>}
    </details>
    <details className={styles.toolSection}><summary>{zh?'技能表现与下一步':'Skill performance and next step'}</summary>
      <p>{zh?'仅统计每套练习首次提交，重做不重复计分；不同题组难度未标定。':'First submission per set only. Retries do not inflate the statistics; sets are not calibrated for equal difficulty.'}</p>
      {!stats.length?<p>{zh?'先完成一次练习建立起点。':'Complete one set to establish a starting point.'}</p>:<ul>{stats.map(([id,s])=><li key={id}>{EXAMS[exam].readingTypes.find(t=>t.id===id)?.name[lang]??id}: {s.correct}/{s.total} · {Math.round(s.correct/s.total*100)}% {s.total<4?(zh?'（样本不足）':'(small sample)'):''}</li>)}</ul>}
      {stats.find(([,s])=>s.total>=4)&&<p>{zh?'下次优先练习：':'Suggested next focus: '}{EXAMS[exam].readingTypes.find(t=>t.id===stats.find(([,s])=>s.total>=4)?.[0])?.name[lang]}</p>}
    </details>
    <details className={styles.toolSection}><summary>{zh?'语境词汇本':'Vocabulary in context'} · {state.vocabulary.filter(v=>v.exam===exam).length}</summary>
      <p className={styles.hint}>{zh?'记录词组、原句和自己的解释。不要脱离语境只背中文释义。':'Save a phrase, its sentence and your own explanation. Keep meaning tied to context.'}</p>
      <label className={styles.field}>{zh?'词或词组':'Word or phrase'}<input maxLength={120} value={term} onChange={e=>setTerm(e.target.value)}/></label>
      <label className={styles.field}>{zh?'语境中的意思':'Meaning in context'}<input maxLength={500} value={meaning} onChange={e=>setMeaning(e.target.value)}/></label>
      <label className={styles.field}>{zh?'原句 / 例句':'Source sentence / example'}<textarea maxLength={1200} value={context} onChange={e=>setContext(e.target.value)}/></label>
      <Button disabled={!term.trim()||!meaning.trim()} onClick={()=>safe(()=>{addVocabulary({exam,term:term.trim(),meaning:meaning.trim(),context},owner);setTerm('');setMeaning('');setContext('');})}>{zh?'保存词汇':'Save vocabulary'}</Button>
      <ul>{state.vocabulary.filter(v=>v.exam===exam).map(v=><li key={v.id}><strong>{v.term}</strong> — {v.meaning}<p>{v.context}</p><button className={styles.linkButton} onClick={()=>safe(()=>removeVocabulary(v.id,owner))}>{zh?'删除':'Delete'}</button></li>)}</ul>
    </details>
    <PrepBackup />
  </section>;
}

export function PrepBackup() {
  const owner=usePrepOwner();const {lang}=usePrepCopy();const zh=lang==='zh';
  const [revision,setRevision]=useState(()=>{try{const n=Number(window.localStorage.getItem(prepKey(owner)+'.revision'));return Number.isSafeInteger(n)&&n>=0?n:0;}catch{return 0;}});const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  function exportData(){try{const blob=new Blob([JSON.stringify({version:2,state:readPrep(owner)},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='lumina-prep-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setMessage(zh?'导出失败':'Export failed');}}
  async function cloud(load:boolean){
    if(load&&!window.confirm(zh?'云端记录会替换本机备考记录。请先导出本机备份。继续？':'Cloud records will replace this device’s prep records. Export a local backup first. Continue?'))return;
    setBusy(true);setMessage('');
    try{const response=await fetch('/api/prep/progress',{method:load?'GET':'PUT',cache:'no-store',headers:{'Content-Type':'application/json','X-Lumina-Account':owner},signal:AbortSignal.timeout(15000),...(!load?{body:JSON.stringify({expectedRevision:revision,state:readPrep(owner)})}:{})});
      const body=await response.json();if(!response.ok)throw new Error(typeof body.error==='string'?body.error:'Cloud save failed.');
      if(!alive.current)return;
      if(load){const data=cloudSchema.parse(body);window.localStorage.setItem(prepKey(owner)+'.backup',JSON.stringify(readPrep(owner)));replacePrep(owner,data.state);window.localStorage.setItem(prepKey(owner)+'.revision',String(data.revision));window.dispatchEvent(new Event('lumina:prep-restored'));setRevision(data.revision);}
      else {const next=z.number().int().parse(body.revision);window.localStorage.setItem(prepKey(owner)+'.revision',String(next));setRevision(next);}
      setMessage(zh?'已完成。修改后请再次点击保存到云端。':'Done. Save to cloud again after making changes.');
    }catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'Cloud unavailable.');}finally{if(alive.current)setBusy(false);}
  }
  return <details className={styles.toolSection}><summary>{zh?'保存、隐私与备份':'Storage, privacy and backups'}</summary>
    <p>{zh?'本机自动保存，按账号隔离。云端需手动保存／读取；不会自动覆盖其他设备。共用电脑请退出账号，访客记录仍在该浏览器。':'Automatically saved on this device, separately per account. Cloud save/load is manual and detects conflicting revisions. Sign out on shared computers; guest records remain in that browser.'}</p>
    <div className={styles.actionGroup}><Button variant="outline" onClick={exportData}>{zh?'导出 JSON 备份':'Export JSON backup'}</Button>
      {owner!=='guest'&&<><Button disabled={busy} onClick={()=>void cloud(false)}>{zh?'保存到云端':'Save to cloud'}</Button><Button disabled={busy} variant="outline" onClick={()=>void cloud(true)}>{zh?'读取云端':'Load cloud copy'}</Button></>}
    </div>
    <label className={styles.field}>{zh?'从备份恢复（替换本机）':'Restore a backup (replaces local records)'}<input type="file" accept="application/json,.json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{
      if(file.size>520*1024)throw new Error('Backup exceeds 520 KiB.');
      const parsed=z.object({version:z.literal(2),state:PrepStateSchema}).parse(JSON.parse(await file.text()));
      if(!alive.current||!window.confirm(zh?'替换本机备考记录？':'Replace this device’s prep records?'))return;
      window.localStorage.setItem(prepKey(owner)+'.backup',JSON.stringify(readPrep(owner)));replacePrep(owner,parsed.state);window.dispatchEvent(new Event('lumina:prep-restored'));setMessage(zh?'已恢复到本机。':'Restored locally.');
    }catch{if(alive.current)setMessage(zh?'备份无效或无法保存。':'Invalid backup or storage unavailable.');}}}/></label>
    <button className={styles.linkButton} onClick={()=>{if(!window.confirm(zh?'导入这台电脑的旧版记录并替换当前本机记录？':'Import this browser’s legacy records and replace current local records?'))return;try{importLegacy(owner);setMessage(zh?'旧记录已导入；SAT／TOEFL 目标分需重新设定。':'Imported. Re-enter SAT/TOEFL section targets.');}catch{setMessage(zh?'未找到可用旧记录。':'No valid legacy records found.');}}}>{zh?'导入旧版备考记录':'Import legacy practice'}</button>
    {message&&<p role="status">{message}</p>}
  </details>;
}
