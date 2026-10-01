"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXAMS, EXAM_IDS, estimateIeltsBand, type ExamId } from "@/lib/prep/exams";
import { daysUntil, saveProfile, usePrepState } from "@/lib/client/prep-store";
import { usePrepCopy } from "./copy";
import { ReadingPractice } from "./ReadingPractice";
import { useAuth } from "@/components/auth/AuthProvider";
import { useBilling } from "@/lib/client/billing";
import { useBillingCopy } from "@/components/billing/copy";
import billingStyles from "@/components/billing/billing.module.css";
import styles from "./prep.module.css";

export function PrepArea({ exam }: { exam: ExamId | null }) {
  return exam ? <ExamView key={exam} exam={exam} /> : <PrepHome />;
}

type Copy = ReturnType<typeof usePrepCopy>["c"];

function formatScore(exam: ExamId, correct: number, total: number, c: Copy) {
  const band = exam === "ielts" ? estimateIeltsBand(correct, total) : null;
  return band !== null ? `${c.score(correct, total)} · ${c.band(band)}` : `${c.score(correct, total)} · ${c.percent(Math.round((correct / Math.max(total, 1)) * 100))}`;
}

function PrepHome() {
  const { c, lang } = usePrepCopy();
  const state = usePrepState();
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

  return <div className={styles.page}>
    <Link href="/prep" className={styles.backLink}><ArrowLeft size={14} aria-hidden="true" />{c.back}</Link>
    <header className={styles.examHeader}>
      <h1 className={styles.display}>{exam.name}</h1>
      <p className={styles.lead}>{exam.tagline[lang]}{days !== null && <> · {c.daysLeft(days)}</>}</p>
    </header>

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
        <PrepGate><ReadingPractice exam={examId} /></PrepGate>
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
          <Button type="button" variant="outline" className={styles.fullWidth} onClick={submitProfile}>{savedFlash ? c.saved : c.save}</Button>
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

/** Exam prep is a Pro feature; Free users see what it does and a path to upgrade. */
function PrepGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { summary } = useBilling(user?.id ?? null);
  const { c } = useBillingCopy();
  if (!summary || summary.limits.prepSetsPerDay > 0) return <>{children}</>;
  return <section className={billingStyles.locked}>
    <h2>{c.lockedTitle}</h2>
    <p>{c.lockedLead}</p>
    <Button asChild><Link href="/pricing">{c.seePlans}</Link></Button>
  </section>;
}
