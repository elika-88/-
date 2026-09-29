"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EXAMS, PASSAGE_LIMITS, minimumCharacters, type ExamId } from '@/lib/prep/exams';
import { PrepGenerateResponseSchema } from '@/lib/prep/schema';
import { isCorrect, scoreQuestion, hasAnswer, type PrepSession, type SavedSet, type PrepReview } from '@/lib/prep/progress';
import { TASK_TYPES, labelPassage, passageParagraphs } from '@/lib/prep/tasks';
import { TaskMaterial, DataGraphic } from './TaskMaterial';
import { QuestionInput } from './QuestionInput';
import { SkillPicker } from './SkillPicker';
import { SAMPLE_PASSAGE } from '@/lib/prep/practice-guide';
import { clearSet, recordAttempt, saveDraft, saveSet, updateSession, usePrepState } from '@/lib/client/prep-store';
import { usePrepOwner } from './PrepContext';
import { usePrepCopy } from './copy';
import styles from './prep.module.css';

export function ReadingPractice({exam:examId}:{exam:ExamId}) {
  const owner=usePrepOwner();
  const prepState=usePrepState(owner);
  const saved=prepState.sets[examId];
  const {c,lang}=usePrepCopy(); const zh=lang==='zh';
  const exam=EXAMS[examId];
  const [passage,setPassageValue]=useState(saved?.passage??prepState.drafts[examId]??'');
  const [types,setTypes]=useState<string[]>(saved?.types.slice(0,3)??exam.readingTypes.slice(0,3).map(t=>t.id));
  const [track,setTrack]=useState<'academic'|'general'>('academic');
  const [difficulty,setDifficulty]=useState('standard');
  const [count,setCount]=useState(6);
  const [completionMode,setCompletionMode]=useState('source');
  const [graphicKind,setGraphicKind]=useState('table');
  const [minutes,setMinutes]=useState(0);
  const [extra,setExtra]=useState(1);
  const [zhExplanations,setZhExplanations]=useState(zh);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  function setPassage(text:string){setPassageValue(text);try{saveDraft(examId,text,owner);}catch{setError(zh?'草稿无法保存到浏览器，请先复制备份。':'Could not save the draft locally. Copy a backup before leaving.');}}
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  async function generate() {
    const text=passage.trim();
    if(owner==='guest'){setError(zh?'请先登录，已有练习和复习仍可离线使用。':'Sign in to generate. Saved practice and review remain available.');return;}
    if(text.length<minimumCharacters(examId)){setError(c.tooShort(minimumCharacters(examId)));return;}
    if(!types.length){setError(c.pickType);return;}
    if(types.reduce((n,id)=>n+(TASK_TYPES[id]?2:1),0)>count){setError(zh?'共用题组至少需要 2 道题，请增加题数。':'Shared tasks need at least two items each. Increase the question count.');return;}
    if(examId==='ielts'&&types.some(id=>['heading','matching_info'].includes(id))&&passageParagraphs(text).length<2){setError(zh?'段落匹配需要至少两段素材，请用空行分段或使用示例素材。':'Paragraph matching needs at least two paragraphs. Separate them with blank lines or use the sample.');return;}
    const controller=new AbortController();request.current?.abort();request.current=controller;setLoading(true);setError(null);
    try {
      const response=await fetch('/api/prep/generate',{method:'POST',headers:{'Content-Type':'application/json','X-Lumina-Account':owner},
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(225000)]),
        body:JSON.stringify({exam:examId,passage:text,types,track,difficulty,count,completionMode,graphicKind,explanationLanguage:zhExplanations?'zh':'en'})});
      const body=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(body?.error?.message??c.networkError);
      const result=PrepGenerateResponseSchema.parse(body);
      if(controller.signal.aborted)return;
      const now=Date.now();
      saveSet({exam:examId,passage:text,types,set:result.set,createdAt:now,session:{answers:{},flags:[],submitted:false,startedAt:now,deadline:minutes?now+minutes*extra*60000:null}},owner);
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:c.networkError);}
    finally{if(request.current===controller){request.current=null;setLoading(false);}}
  }
  function newPassage(){if(saved)setPassage(saved.passage);try{clearSet(examId,owner);}catch{setError(zh?'本地保存失败，请先导出记录。':'Local storage failed. Export your records first.');}}
  if(saved)return <PracticeSession key={saved.createdAt} saved={saved} onNew={newPassage}/>;
  return <section className={styles.card} aria-busy={loading}>
    <div className={styles.fieldHead}><label htmlFor="prep-passage">{c.passage}</label><span>{c.characters(passage.length,PASSAGE_LIMITS.maxCharacters)}</span></div>
    <p className={styles.hint}>{track==='general'&&examId==='ielts'?(zh?'粘贴通知、工作说明或通识文章。':'Paste everyday notices, workplace information or general-interest reading.'):exam.passageHint[lang]}</p>
    <textarea id="prep-passage" className={styles.passageInput} value={passage} maxLength={PASSAGE_LIMITS.maxCharacters} disabled={loading} onChange={e=>setPassage(e.target.value)} placeholder={c.passagePlaceholder}/>
    <button className={styles.linkButton} disabled={loading} onClick={()=>{if(!passage.trim()||window.confirm(zh?'用原创示例替换当前输入？':'Replace the current source with an original sample?'))setPassage(SAMPLE_PASSAGE);}}>{zh?'使用原创示例素材（含段落、数据和装置）':'Use original sample (paragraphs, data and equipment)'}</button>
    <p className={styles.hint}>{zh?'匹配题请用空行分段；图表题需数字数据；流程图／示意图需过程或部件描述。素材不适合时不会编造事实。':'Separate paragraphs with blank lines for matching. Graphics require numeric data; diagrams need process or part descriptions. Unsupported facts must not be invented.'}</p>
    <div className={styles.controlsGrid}>
      {examId==='ielts'&&<label className={styles.field}>{zh?'雅思类别':'IELTS track'}<select value={track} onChange={e=>setTrack(e.target.value as typeof track)}><option value="academic">Academic / 学术类</option><option value="general">General Training / 培训类</option></select></label>}
      <label className={styles.field}>{zh?'练习难度（非标定）':'Practice difficulty (uncalibrated)'}<select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="foundation">{zh?'基础':'Foundation'}</option><option value="standard">{zh?'标准':'Standard'}</option><option value="stretch">{zh?'挑战':'Stretch'}</option></select></label>
      <label className={styles.field}>{zh?'题数':'Questions'}<select value={count} onChange={e=>setCount(Number(e.target.value))}>{[4,6,8].map(n=><option key={n} disabled={n<types.reduce((sum,id)=>sum+(TASK_TYPES[id]?2:1),0)}>{n}</option>)}</select></label>
      <label className={styles.field}>{zh?'练习计时':'Practice timer'}<select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={0}>{zh?'不限时':'Untimed'}</option>{[5,10,15,20,32,60].map(n=><option key={n} value={n}>{n} min</option>)}</select></label>
      {!!minutes&&<label className={styles.field}>{zh?'练习延时':'Practice time adjustment'}<select value={extra} onChange={e=>setExtra(Number(e.target.value))}>{[1,1.25,1.5,2].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>}
      {examId==='ielts'&&types.some(t=>['summary','notes','table','flowchart'].includes(t))&&<label className={styles.field}>{zh?'填空方式':'Completion format'}<select value={completionMode} onChange={e=>setCompletionMode(e.target.value)}><option value="source">{zh?'从原文取词／数字':'Words / numbers from source'}</option><option value="bank">{zh?'从共用词库选择':'Choose from a word bank'}</option></select></label>}
      {examId==='sat'&&types.includes('quantitative')&&<label className={styles.field}>{zh?'数据图形式':'Graphic format'}<select value={graphicKind} onChange={e=>setGraphicKind(e.target.value)}><option value="table">{zh?'表格':'Table'}</option><option value="bar">{zh?'柱状图':'Bar graph'}</option><option value="line">{zh?'折线图':'Line graph'}</option></select></label>}
    </div>
    <p className={styles.hint}>{zh?'自由设置的专项计时，不是完整模考。正式考试延时须向考试机构申请。':'A custom drill timer, not a full mock exam. Official accommodations require approval from the test provider.'}</p>
    <SkillPicker exam={examId} types={types} setTypes={setTypes} count={count} disabled={loading}/>
    <div className={styles.composeActions}><label className={styles.toggle}><input type="checkbox" checked={zhExplanations} onChange={e=>setZhExplanations(e.target.checked)}/>{c.explanationLanguage}</label>
      <div className={styles.actionGroup}>{loading&&<Button variant="ghost" onClick={()=>{request.current?.abort();request.current=null;setLoading(false);}}>{c.cancel}</Button>}
      <Button onClick={generate} disabled={loading}>{loading&&<LoaderCircle className="animate-spin" aria-hidden="true"/>}{loading?c.generating:c.generate}</Button></div>
    </div>
    {owner==='guest'&&<p className={styles.hint}><Link href="/login">{zh?'登录后生成练习':'Sign in to generate practice'}</Link></p>}
    <p className={styles.hint}>{zh?'生成请求受每日与短时限额保护，失败或取消也计为一次请求；不扣付费订阅点数。只上传你有权使用的素材。':'Generation attempts have daily and short-term limits, including failed or cancelled attempts; they are not paid subscription credits. Use material you have permission to submit.'}</p>
    {loading&&<p role="status">{c.generatingHint}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  </section>;
}

function quoteRange(source:string,quote:string) {
  const words=quote.trim().split(/\s+/).filter(Boolean).map(w=>w.replace(/[.*+?^{}$()|[\]\\]/g,'\\$&'));
  if(!words.length)return null;
  const match=new RegExp(words.join('\\s+'),'i').exec(source);
  return match?[match.index,match.index+match[0].length]:null;
}
function PracticeSession({saved,onNew}:{saved:SavedSet;onNew:()=>void}) {
  const owner=usePrepOwner();const {c,lang}=usePrepCopy();const zh=lang==='zh';
  const [session,setSession]=useState<PrepSession>(()=>saved.session??{answers:{},flags:[],submitted:false,startedAt:Date.now(),deadline:null});
  const [now,setNow]=useState(()=>Date.now());
  const [error,setError]=useState<string|null>(null);
  const [highlight,setHighlight]=useState<string|null>(null);
  const [filter,setFilter]=useState(false);
  const [hiddenClock,setHiddenClock]=useState(false);
  const [round,setRound]=useState(0);
  const mark=useRef<HTMLElement>(null);
  useEffect(()=>{if(session.submitted)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[session.submitted]);
  useEffect(()=>{mark.current?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});},[highlight]);
  const expired=session.deadline!==null&&now>=session.deadline&&!session.submitted;
  const locked=session.submitted||expired;
  const questions=saved.set.questions;
  const answered=questions.filter(q=>hasAnswer(session.answers[q.id])).length;
  const scores=questions.map(q=>scoreQuestion(q,session.answers[q.id]));
  const correct=scores.reduce((n,s)=>n+s.correct,0),total=scores.reduce((n,s)=>n+s.total,0);
  function persist(next:PrepSession){setSession(next);try{updateSession(saved.exam,next,owner);}catch{setError(zh?'本地保存失败，先导出备份再离开。':'Local save failed. Export a backup before leaving.');}}
  function submit(submittedAt:number){
    if(session.submitted)return;
    const next={...session,submitted:true,submittedAt};
    const skills:Record<string,{correct:number;total:number}>={};
    for(const q of questions){const old=skills[q.type]??{correct:0,total:0},score=scoreQuestion(q,session.answers[q.id]);skills[q.type]={correct:old.correct+score.correct,total:old.total+score.total};}
    const reviews:PrepReview[]=questions.filter(q=>!isCorrect(q,session.answers[q.id])||session.flags.includes(q.id)).map(q=>({
      id:saved.exam+'-'+saved.createdAt+'-'+q.id,exam:saved.exam,question:{...q,context:q.context||(q.evidence.join('\n')||saved.passage.slice(0,5000))},source:saved.exam==='ielts'?displayPassage:undefined,task:saved.set.tasks?.find(t=>t.id===q.taskId),reason:session.flags.includes(q.id)?'uncertain':'evidence',note:'',dueAt:submittedAt+86400000,streak:0,
    }));
    try{recordAttempt({id:saved.exam+'-'+saved.createdAt,exam:saved.exam,title:saved.set.title,correct,total,seconds:Math.max(0,Math.round(((session.deadline?Math.min(next.submittedAt,session.deadline):next.submittedAt)-session.startedAt)/1000)),skills},reviews,owner);persist(next);}
    catch{setError(zh?'保存成绩失败，请导出备份后重试。':'Could not save results. Export a backup and retry.');}
  }
  const displayPassage=saved.exam==='ielts'&&saved.set.tasks?.length?labelPassage(saved.passage):saved.passage;
  const range=highlight?quoteRange(displayPassage,highlight):null;
  const visibleQuestions=questions.filter(q=>!filter||!isCorrect(q,session.answers[q.id]));
  const fullSource=saved.exam==='ielts'||questions.every(q=>!q.context);
  const clock=Math.max(0,Math.floor(((session.deadline??now)- (session.deadline?now:session.startedAt))/1000));
  const typeName=(id:string)=>EXAMS[saved.exam].readingTypes.find(t=>t.id===id)?.name[lang]??id;
  return <section className={styles.practiceBlock}>
    <div className={styles.practiceToolbar}>
      <h2>{saved.set.title}</h2>
      {!session.submitted&&<div className={styles.actionGroup}>
        <span aria-label={zh?'练习计时':'Practice time'}>{hiddenClock?'—':Math.floor(clock/60)+':'+String(clock%60).padStart(2,'0')}</span>
        <button className={styles.linkButton} onClick={()=>setHiddenClock(!hiddenClock)}>{hiddenClock?(zh?'显示时间':'Show timer'):(zh?'隐藏时间':'Hide timer')}</button>
      </div>}
      <nav className={styles.questionNav} aria-label={zh?'题目导航':'Question navigation'}>{questions.map((q,i)=><a key={q.id} href={'#prep-'+q.id} aria-label={(zh?'第 ':'Question ')+(i+1)+(session.flags.includes(q.id)?' ★':'')}>{i+1}{session.flags.includes(q.id)?' ★':hasAnswer(session.answers[q.id])?' ✓':''}</a>)}</nav>
    </div>
    {expired&&<p role="status" className={styles.error}>{zh?'练习时间到。答案已锁定，请提交查看解析。':'Time reached. Answers are locked; check your results.'}</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {session.submitted&&<div className={styles.result} role="status">
      <div><p className={styles.kicker}>{c.results}</p><p className={styles.resultScore}>{total===questions.length?c.score(correct,total):`${correct} / ${total} ${zh?'得分':'points'}`}</p><p className={styles.resultNote}>{c.percent(Math.round(correct/total*100))} · {c.estimateNote}</p>
      <p className={styles.hint}>{zh?'错题和标记题已加入复习队列。重做同一套不重复计入统计。':'Missed and flagged questions entered your review queue. Repeating this set does not inflate your statistics.'}</p></div>
      <div className={styles.actionGroup}><Button variant="outline" onClick={()=>setFilter(!filter)}>{filter?(zh?'查看全部':'Show all'):(zh?'只看错题':'Missed only')}</Button>
      <Button variant="outline" onClick={()=>{persist({answers:{},flags:[],submitted:false,startedAt:Date.now(),deadline:null});setHighlight(null);setFilter(false);setRound(n=>n+1);}}>{c.retry}</Button><Button onClick={onNew}>{c.newSet}</Button></div>
    </div>}
    <div className={fullSource?styles.practice:styles.singlePractice}>
      {(fullSource||session.submitted)&&<details className={styles.passagePanel} open={fullSource||!!highlight}><summary>{c.passage} · {zh?'原始素材':'Original source'}</summary>
        <div className={styles.passageText}>{range?<>{displayPassage.slice(0,range[0])}<mark ref={mark}>{displayPassage.slice(range[0],range[1])}</mark>{displayPassage.slice(range[1])}</>:displayPassage}</div>
      </details>}
      <div className={styles.questions}><ol className={styles.questionList}>
      {visibleQuestions.map(q=>{
        const index=questions.indexOf(q),right=isCorrect(q,session.answers[q.id]);
        const task=saved.set.tasks?.find(t=>t.id===q.taskId);
        const first=task&&visibleQuestions.find(x=>x.taskId===q.taskId)?.id===q.id;
        const used=task&&!task.reuseOptions?questions.filter(x=>x.taskId===q.taskId&&x.id!==q.id).flatMap(x=>typeof session.answers[x.id]==='number'?[session.answers[x.id] as number]:[]):[];
        return <li id={'prep-'+q.id} key={q.id} className={styles.question+' '+(session.submitted?(right?styles.qRight:styles.qWrong):'')}>
          {first&&<TaskMaterial task={task} headings={q.type==='heading'} zh={zh}/>}
          <div className={styles.qHead}><span>{index+1}</span><span className={styles.qType}>{typeName(q.type)}</span>
          {session.submitted?<span className={styles.qVerdict}>{right?c.correct:c.incorrect}</span>:<button className={styles.linkButton} aria-pressed={session.flags.includes(q.id)} disabled={expired} onClick={()=>persist({...session,flags:session.flags.includes(q.id)?session.flags.filter(id=>id!==q.id):[...session.flags,q.id]})}>{session.flags.includes(q.id)?'★ ':'☆ '}{zh?'标记回看':'Mark for review'}</button>}</div>
          {!fullSource&&q.context&&<div className={styles.itemContext}>{q.context}</div>}
          {q.graphic&&<DataGraphic graphic={q.graphic} zh={zh}/>}
          <p className={styles.qPrompt}>{q.prompt}</p>
          <QuestionInput key={`${q.id}-${round}`} question={q} task={task} answer={session.answers[q.id]} onChange={answer=>persist({...session,answers:{...session.answers,[q.id]:answer}})} locked={locked} submitted={session.submitted} label={c.questionOf(index+1,questions.length)} zh={zh} used={used}/>
          {session.submitted&&<div className={styles.explanation}>
            <p><strong>{c.correctAnswer}:</strong> {q.answerText}</p>{!!q.answerIndices?.length&&<p>{scoreQuestion(q,session.answers[q.id]).correct} / {q.answerIndices.length} {zh?'得分':'points'}</p>}<p>{q.explanation}</p>
            {q.optionReasons?.length? <details><summary>{zh?'逐项排除理由':'Why each option works or fails'}</summary><ol>{q.optionReasons.map((reason,i)=><li key={i}><strong>{String.fromCharCode(65+i)}.</strong> {reason}</li>)}</ol></details>:null}
            {q.strategy&&<p><strong>{zh?'下次如何做':'Strategy for next time'}:</strong> {q.strategy}</p>}
            {q.evidence[0]&&<button className={styles.linkButton} onClick={()=>setHighlight(q.evidence[0])}>{c.showInPassage}</button>}
          </div>}
        </li>;
      })}</ol>
      {!session.submitted&&<div className={styles.submitBar}><span>{c.answered(answered,questions.length)} · {zh?'未答按错题计':'unanswered count as missed'}</span><div className={styles.actionGroup}><Button variant="ghost" onClick={onNew}>{c.newSet}</Button><Button onClick={()=>submit(Date.now())} disabled={answered===0&&!expired}>{c.submit}</Button></div></div>}
      </div>
    </div>
  </section>;
}
