"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXAMS, EXAM_IDS, type ExamId } from "@/lib/prep/exams";
import { daysUntil, saveProfile, usePrepState } from "@/lib/client/prep-store";
import { usePrepCopy } from "./copy";
import { ReadingPractice } from "./ReadingPractice";
import styles from "./prep.module.css";
import { useAuth } from '@/components/auth/AuthProvider';
import { PrepOwnerContext, usePrepOwner } from './PrepContext';
import { LearningTools } from './LearningTools';
import { CHECKED_ON, GUIDES } from '@/lib/prep/guides';

export function PrepArea({ exam }: { exam: ExamId | null }) {
  const {user,ready,verified,error,recheckIdentity}=useAuth();
  const {lang}=usePrepCopy();
  const [restored,setRestored]=useState(0);
  useEffect(()=>{const changed=()=>setRestored(n=>n+1);window.addEventListener('lumina:prep-restored',changed);return()=>window.removeEventListener('lumina:prep-restored',changed);},[]);
  if(!ready||!verified)return <p role="status">{lang==='zh'?'正在确认账号…':'Checking account…'}</p>;
  if(error)return <p role="alert">{error} <Button onClick={()=>void recheckIdentity()}>{lang==='zh'?'重试':'Retry'}</Button></p>;
  const owner=user?.id??'guest';
  return <PrepOwnerContext.Provider value={owner} key={owner+'-'+restored}>{exam ? <ExamView key={exam} exam={exam} /> : <PrepHome />}</PrepOwnerContext.Provider>;
}

type Copy = ReturnType<typeof usePrepCopy>["c"];

function formatScore(exam: ExamId, correct: number, total: number, c: Copy) {
  void exam;
  return `${c.score(correct, total)} · ${c.percent(Math.round((correct / Math.max(total, 1)) * 100))}`;
}

function PrepHome() {
  const { c, lang } = usePrepCopy();
  const state = usePrepState(usePrepOwner());
  const [now] = useState(() => Date.now());
  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.kicker}>{c.eyebrow}</p>
      <h1 className={styles.display}>{c.homeTitle}</h1>
      <p className={styles.lead}>{c.homeLead}</p>
    </header>

    <ul className={styles.examList}>
      {EXAM_IDS.map((id) => {
        const exam = EXAMS[id];
        const profile = state.profiles[id];
        const days = daysUntil(profile?.date ?? null, now);
        const last = state.attempts.find((attempt) => attempt.exam === id);
        const meta = [
          profile?.target ? `${c.target} ${profile.target}` : null,
          days !== null ? c.daysLeft(days) : null,
          last ? `${c.lastScore} ${formatScore(id, last.correct, last.total, c)}` : null,
        ].filter(Boolean);
        return <li key={id}>
          <Link href={`/prep/${id}`} className={styles.examRow}>
            <span className={styles.examText}>
              <span className={styles.examName}>{exam.name}</span>
              <span className={styles.examTagline}>{exam.tagline[lang]}</span>
            </span>
            <span className={styles.examMeta}>{meta.length ? meta.join(" · ") : c.noPractice}</span>
            <ArrowUpRight className={styles.examArrow} size={18} aria-hidden="true" />
          </Link>
        </li>;
      })}
    </ul>
    <p className={styles.disclaimer}>{c.disclaimer}</p>
  </div>;
}

function ExamView({ exam: examId }: { exam: ExamId }) {
  const exam = EXAMS[examId];
  const { c, lang } = usePrepCopy();
  const owner=usePrepOwner();
  const state = usePrepState(owner);
  const profile = state.profiles[examId];
  const [draft,setDraft]=useState<{target?:string;date?:string;minutes?:number}>({});
  const target=draft.target??(profile?.target?String(profile.target):'');
  const date=draft.date??profile?.date??'';
  const setTarget=(value:string)=>setDraft(d=>({...d,target:value}));
  const setDate=(value:string)=>setDraft(d=>({...d,date:value}));
  const [savedFlash, setSavedFlash] = useState(false);
  const [profileError,setProfileError]=useState('');
  const minutes=draft.minutes??profile?.minutes??20;
  const setMinutes=(value:number)=>setDraft(d=>({...d,minutes:value}));
  const [now] = useState(() => Date.now());
  const days = daysUntil(profile?.date ?? null, now);
  const attempts = state.attempts.filter((attempt) => attempt.exam === examId).slice(0, 5);
  const { min, max, step } = exam.scoreRange;
  const scoreOptions: number[] = [];
  for (let value = max; value >= min - 1e-9; value -= step) scoreOptions.push(Math.round(value * 10) / 10);

  function submitProfile() {
    try {saveProfile(examId, { target: target ? Number(target) : null, date: date || null,minutes },owner);setProfileError('');}
    catch {setProfileError(lang==='zh'?'保存失败，请先导出备份。':'Save failed. Export a backup first.');return;}
    setSavedFlash(true);
    setDraft({});
    window.setTimeout(() => setSavedFlash(false), 1600);
  }

  return <div className={styles.page}>
    <Link href="/prep" className={styles.backLink}><ArrowLeft size={14} aria-hidden="true" />{c.back}</Link>
    <header className={styles.examHeader}>
      <h1 className={styles.display}>{exam.name}</h1>
      <p className={styles.lead}>{exam.tagline[lang]}{days !== null && <> · {c.daysLeft(days)}</>}</p>
    </header>

    <details className={styles.examGuide}>
      <summary>{lang==='zh'?'考试要求、解题策略与官方资源':'Exam requirements, strategies and official resources'} · {CHECKED_ON}</summary>
      <p>{GUIDES[examId].format[lang]}</p><p>{GUIDES[examId].scoring[lang]}</p>
      <ol>{GUIDES[examId].strategy.map((tip,i)=><li key={i}>{tip[lang]}</li>)}</ol>
      <ul>{GUIDES[examId].resources.map(resource=><li key={resource.url}><a href={resource.url} target="_blank" rel="noreferrer">{resource.label} ↗</a></li>)}</ul>
    </details>

    <div className={styles.examLayout}>
      <div className={styles.examMain}>
        <nav className={styles.sectionTabs} aria-label={c.sections}>
          {exam.sections.map((section) => {
            const current = section.id === exam.readingSection;
            return <span key={section.id} className={`${styles.sectionTab} ${current ? styles.sectionCurrent : ""}`} aria-current={current ? "page" : undefined} aria-disabled={!section.available || undefined} title={section.available ? undefined : c.soon}>
              {section.name[lang]}
            </span>;
          })}
        </nav>
        {exam.sections.some((section) => !section.available) && <p className={styles.tabNote}>{c.moreSoon}</p>}
        <ReadingPractice exam={examId} />
        <LearningTools exam={examId}/>
      </div>

      <aside className={styles.examAside}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{c.profile}</h2>
          <label className={styles.field}><span>{exam.scoreLabel[lang]}</span>
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">—</option>
              {scoreOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={styles.field}><span>{c.examDate}</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className={styles.field}><span>{lang==='zh'?'每天可用分钟':'Daily study minutes'}</span><select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[10,20,30,45,60].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <Button type="button" variant="outline" className={styles.fullWidth} onClick={submitProfile}>{savedFlash ? c.saved : c.save}</Button>
          {profileError&&<p role="alert">{profileError}</p>}
          <p className={styles.hint}>{lang==='zh'?'今日安排：':'Today: '}{Math.round((profile?.minutes??20)*.2)} {lang==='zh'?'分钟回忆 / ':'min recall / '}{Math.round((profile?.minutes??20)*.5)} {lang==='zh'?'分钟练习 / ':'min drill / '}{Math.round((profile?.minutes??20)*.3)} {lang==='zh'?'分钟复盘':'min review'}</p>
          {days!==null&&days<=7&&days>=0&&<p className={styles.hint}>{lang==='zh'?'考前一周：用官方材料校准节奏，优先复盘反复出错的技能，保持正常作息。':'Final week: check pacing with official materials, revisit recurring mistakes and keep a regular sleep routine.'}</p>}
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{c.history}</h2>
          {attempts.length ? <ul className={styles.attempts}>
            {attempts.map((attempt) => <li key={attempt.id}>
              <span>{attempt.title}</span>
              <small>{formatScore(examId, attempt.correct, attempt.total, c)} · {new Date(attempt.at).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })}</small>
            </li>)}
          </ul> : <p className={styles.muted}>{c.noPractice}</p>}
        </section>
      </aside>
    </div>
    <p className={styles.disclaimer}>{c.disclaimer}</p>
  </div>;
}
