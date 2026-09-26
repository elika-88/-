"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Target } from "lucide-react";
import { EXAMS, EXAM_IDS, estimateIeltsBand, type ExamId } from "@/lib/prep/exams";
import { daysUntil, saveProfile, usePrepState } from "@/lib/client/prep-store";
import { usePrepCopy } from "./copy";
import { ReadingPractice } from "./ReadingPractice";
import styles from "./prep.module.css";

export function PrepArea({ exam }: { exam: ExamId | null }) {
  return exam ? <ExamView key={exam} exam={exam} /> : <PrepHome />;
}

function formatScore(exam: ExamId, correct: number, total: number, c: ReturnType<typeof usePrepCopy>["c"]) {
  if (exam === "ielts") { const band = estimateIeltsBand(correct, total); return band === null ? c.score(correct, total) : `${c.score(correct, total)} · ${c.band(band)}`; }
  return `${c.score(correct, total)} · ${c.percent(Math.round((correct / Math.max(total, 1)) * 100))}`;
}

function PrepHome() {
  const { c, lang } = usePrepCopy();
  const state = usePrepState();
  const [now] = useState(() => Date.now());
  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>{c.eyebrow}</p>
      <h1>{c.homeTitle}</h1>
      <p className={styles.lead}>{c.homeLead}</p>
    </header>
    <div className={styles.examGrid}>
      {EXAM_IDS.map((id, index) => {
        const exam = EXAMS[id];
        const profile = state.profiles[id];
        const days = daysUntil(profile?.date ?? null, now);
        const last = state.attempts.find((attempt) => attempt.exam === id);
        return <Link key={id} href={`/prep/${id}`} className={styles.examCard} style={{ "--exam": exam.accent, animationDelay: `${index * 60}ms` } as CSSProperties}>
          <span className={styles.examMark} aria-hidden="true">{exam.name.slice(0, 1)}</span>
          <span className={styles.examName}>{exam.name}</span>
          <span className={styles.examTagline}>{exam.tagline[lang]}</span>
          <span className={styles.examMeta}>
            <span><Target size={14} aria-hidden="true" />{profile?.target ? `${c.target} ${profile.target}` : c.noTarget}</span>
            <span><CalendarDays size={14} aria-hidden="true" />{days === null ? c.noDate : c.daysLeft(days)}</span>
          </span>
          <span className={styles.examLast}>{last ? `${c.lastScore}: ${formatScore(id, last.correct, last.total, c)}` : c.noPractice}</span>
          <span className={styles.examCta}>{c.start}<ArrowRight size={16} aria-hidden="true" /></span>
        </Link>;
      })}
    </div>
    <p className={styles.disclaimer}>{c.disclaimer}</p>
  </div>;
}

function ExamView({ exam: examId }: { exam: ExamId }) {
  const exam = EXAMS[examId];
  const { c, lang } = usePrepCopy();
  const state = usePrepState();
  const profile = state.profiles[examId];
  const [target, setTarget] = useState<string>(profile?.target ? String(profile.target) : "");
  const [date, setDate] = useState(profile?.date ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  const [now] = useState(() => Date.now());
  const days = daysUntil(profile?.date ?? null, now);
  const attempts = state.attempts.filter((attempt) => attempt.exam === examId).slice(0, 5);
  const { min, max, step } = exam.scoreRange;
  const scoreOptions: number[] = [];
  for (let value = max; value >= min - 1e-9; value -= step) scoreOptions.push(Math.round(value * 10) / 10);

  function submitProfile() {
    saveProfile(examId, { target: target ? Number(target) : null, date: date || null });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  }

  return <div className={styles.page} style={{ "--exam": exam.accent } as CSSProperties}>
    <Link href="/prep" className={styles.backLink}><ArrowLeft size={15} aria-hidden="true" />{c.back}</Link>
    <header className={styles.examHeader}>
      <span className={styles.examMark} aria-hidden="true">{exam.name.slice(0, 1)}</span>
      <div>
        <h1>{exam.name}</h1>
        <p className={styles.lead}>{exam.tagline[lang]}{days !== null && <> · <strong>{c.daysLeft(days)}</strong></>}</p>
      </div>
    </header>

    <div className={styles.examLayout}>
      <div className={styles.examMain}>
        <nav className={styles.sectionTabs} aria-label={c.sections}>
          {exam.sections.map((section) => <span key={section.id} className={section.id === exam.readingSection ? styles.sectionActive : styles.sectionSoon} aria-current={section.id === exam.readingSection ? "page" : undefined}>
            {section.name[lang]}{!section.available && <small>{c.soon}</small>}
          </span>)}
        </nav>
        <ReadingPractice exam={examId} />
      </div>

      <aside className={styles.examAside}>
        <section className={styles.panel}>
          <h2>{c.profile}</h2>
          <label className={styles.field}><span>{exam.scoreLabel[lang]}</span>
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">—</option>
              {scoreOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={styles.field}><span>{c.examDate}</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <button type="button" className={styles.secondaryButton} onClick={submitProfile}>{savedFlash ? c.saved : c.save}</button>
        </section>
        <section className={styles.panel}>
          <h2>{c.history}</h2>
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
