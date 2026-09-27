"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXAMS, PASSAGE_LIMITS, estimateIeltsBand, type ExamId } from "@/lib/prep/exams";
import type { ReadingQuestion } from "@/lib/prep/schema";
import { clearSet, recordAttempt, saveSet, usePrepState } from "@/lib/client/prep-store";
import { usePrepCopy } from "./copy";
import styles from "./prep.module.css";

type Answer = number | string;

function findQuote(passage: string, quote: string): [number, number] | null {
  const words = quote.trim().split(/\s+/).filter(Boolean).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return null;
  const match = new RegExp(words.join("\\s+"), "i").exec(passage);
  return match ? [match.index, match.index + match[0].length] : null;
}

const normalizeAnswer = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, " ").trim();

function isCorrect(question: ReadingQuestion, answer: Answer | undefined) {
  if (answer === undefined) return false;
  if (question.answerIndex >= 0) return answer === question.answerIndex;
  return typeof answer === "string" && normalizeAnswer(answer) === normalizeAnswer(question.answerText);
}

export function ReadingPractice({ exam: examId }: { exam: ExamId }) {
  const exam = EXAMS[examId];
  const { c, lang } = usePrepCopy();
  const saved = usePrepState().sets[examId];
  const [passage, setPassage] = useState(saved?.passage ?? "");
  const [types, setTypes] = useState<string[]>(saved?.types ?? exam.readingTypes.map((type) => type.id));
  const [zhExplanations, setZhExplanations] = useState(lang === "zh");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitted, setSubmitted] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [highlight]);

  async function generate() {
    const text = passage.trim();
    if (text.length < PASSAGE_LIMITS.minCharacters) { setError(c.tooShort(PASSAGE_LIMITS.minCharacters)); return; }
    if (!types.length) { setError(c.pickType); return; }
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/prep/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ exam: examId, passage: text, types, explanationLanguage: zhExplanations ? "zh" : "en" }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof body === "object" && body !== null && "error" in body && typeof (body as { error?: { message?: unknown } }).error?.message === "string" ? (body as { error: { message: string } }).error.message : c.networkError;
        throw new Error(message);
      }
      const set = (body as { set: Parameters<typeof saveSet>[0]["set"] }).set;
      saveSet({ exam: examId, passage: text, types, set, createdAt: Date.now() });
      setAnswers({}); setSubmitted(false); setHighlight(null);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : c.networkError);
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }

  function cancel() { request.current?.abort(); request.current = null; setLoading(false); }

  if (!saved) {
    const count = passage.length;
    return <section className={styles.card} aria-busy={loading}>
      <div className={styles.fieldHead}>
        <label htmlFor="prep-passage">{c.passage}</label>
        <span className={count > PASSAGE_LIMITS.maxCharacters ? styles.over : undefined}>{c.characters(count, PASSAGE_LIMITS.maxCharacters)}</span>
      </div>
      <p className={styles.hint}>{exam.passageHint[lang]}</p>
      <textarea id="prep-passage" className={styles.passageInput} value={passage} maxLength={PASSAGE_LIMITS.maxCharacters} disabled={loading}
        onChange={(event) => { setPassage(event.target.value); setError(null); }} placeholder={c.passagePlaceholder} />
      <fieldset className={styles.typeChips} disabled={loading}>
        <legend>{c.questionTypes}</legend>
        {exam.readingTypes.map((type) => {
          const on = types.includes(type.id);
          return <label key={type.id} className={`${styles.chip} ${on ? styles.chipOn : ""}`}>
            <input type="checkbox" checked={on} onChange={() => setTypes(on ? types.filter((id) => id !== type.id) : [...types, type.id])} />
            {type.name[lang]}
          </label>;
        })}
      </fieldset>
      <div className={styles.composeActions}>
        <label className={styles.toggle}><input type="checkbox" checked={zhExplanations} disabled={loading} onChange={(event) => setZhExplanations(event.target.checked)} />{c.explanationLanguage}</label>
        <div className={styles.actionGroup}>
          {loading && <Button type="button" variant="ghost" onClick={cancel}>{c.cancel}</Button>}
          <Button type="button" onClick={generate} disabled={loading}>
            {loading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {loading ? c.generating : c.generate}
          </Button>
        </div>
      </div>
      {loading && <p className={`${styles.hint} shimmer-text`} role="status">{c.generatingHint}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>;
  }

  const current = saved;
  const questions = current.set.questions;
  const answeredCount = questions.filter((question) => answers[question.id] !== undefined && answers[question.id] !== "").length;
  const correct = questions.filter((question) => isCorrect(question, answers[question.id])).length;
  const band = examId === "ielts" ? estimateIeltsBand(correct, questions.length) : null;
  const range = highlight ? findQuote(saved.passage, highlight) : null;
  const typeName = (id: string) => exam.readingTypes.find((type) => type.id === id)?.name[lang] ?? id;

  function submit() {
    setSubmitted(true);
    recordAttempt({ exam: examId, title: current.set.title, correct, total: questions.length });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function retry() { setAnswers({}); setSubmitted(false); setHighlight(null); }
  function newPassage() { clearSet(examId); setPassage(current.passage); retry(); }

  return <section className={styles.practice}>
    <article className={styles.passagePanel} aria-label={c.passage}>
      <header><p className={styles.kicker}>{c.passage}</p><h2>{saved.set.title}</h2></header>
      <div className={styles.passageText}>
        {range ? <>{saved.passage.slice(0, range[0])}<mark ref={markRef}>{saved.passage.slice(range[0], range[1])}</mark>{saved.passage.slice(range[1])}</> : saved.passage}
      </div>
    </article>

    <div className={styles.questions}>
      {submitted && <div className={styles.result} role="status">
        <div>
          <p className={styles.kicker}>{c.results}</p>
          <p className={styles.resultScore}>{correct}<span>/{questions.length}</span></p>
          <p className={styles.resultNote}>{band !== null ? c.band(band) : c.percent(Math.round((correct / questions.length) * 100))} — {c.estimateNote}</p>
        </div>
        <div className={styles.actionGroup}>
          <Button type="button" variant="outline" onClick={retry}>{c.retry}</Button>
          <Button type="button" onClick={newPassage}>{c.newSet}</Button>
        </div>
      </div>}

      <ol className={styles.questionList}>
        {questions.map((question, index) => {
          const answer = answers[question.id];
          const right = submitted && isCorrect(question, answer);
          const state = submitted ? (right ? styles.qRight : styles.qWrong) : "";
          return <li key={question.id} className={`${styles.question} ${state}`} style={{ animationDelay: `${Math.min(index, 8) * 40}ms` } as CSSProperties}>
            <div className={styles.qHead}>
              <span className={styles.qNumber}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.qType}>{typeName(question.type)}</span>
              {submitted && <span className={styles.qVerdict}>{right ? <><Check size={14} aria-hidden="true" />{c.correct}</> : <><X size={14} aria-hidden="true" />{c.incorrect}</>}</span>}
            </div>
            <p className={styles.qPrompt}>{question.prompt}</p>
            {question.answerIndex >= 0 ? <div className={styles.options} role="radiogroup" aria-label={c.questionOf(index + 1, questions.length)}>
              {question.options.map((option, optionIndex) => {
                const chosen = answer === optionIndex;
                const reveal = submitted && optionIndex === question.answerIndex;
                return <label key={optionIndex} className={`${styles.option} ${chosen ? styles.optionChosen : ""} ${reveal ? styles.optionAnswer : ""} ${submitted && chosen && !reveal ? styles.optionMissed : ""}`}>
                  <input type="radio" name={question.id} checked={chosen} disabled={submitted} onChange={() => setAnswers({ ...answers, [question.id]: optionIndex })} />
                  <span className={styles.optionLetter} aria-hidden="true">{question.options.length === 3 ? option.slice(0, 1) : String.fromCharCode(65 + optionIndex)}</span>
                  <span>{option}</span>
                </label>;
              })}
            </div> : <input className={styles.blankInput} value={typeof answer === "string" ? answer : ""} disabled={submitted} placeholder={c.answerPlaceholder} aria-label={c.questionOf(index + 1, questions.length)}
              onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })} />}
            {submitted && <div className={`${styles.explanation} explanation-enter`}>
              {!right && <p><strong>{c.correctAnswer}:</strong> {question.answerText}</p>}
              <p>{question.explanation}</p>
              {question.evidence[0] && <button type="button" className={styles.linkButton} onClick={() => setHighlight(question.evidence[0])}>{c.showInPassage}</button>}
            </div>}
          </li>;
        })}
      </ol>

      {!submitted && <div className={styles.submitBar}>
        <span>{c.answered(answeredCount, questions.length)}</span>
        <div className={styles.actionGroup}>
          <Button type="button" variant="ghost" onClick={newPassage}>{c.newSet}</Button>
          <Button type="button" onClick={submit} disabled={answeredCount === 0}>{c.submit}</Button>
        </div>
      </div>}
    </div>
  </section>;
}
