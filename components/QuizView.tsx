"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CircleCheck, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuizQuestion, Topic } from "@/lib/schemas/studyMaterials";
import { EvidenceButton, type EvidenceHandler } from "./SourceEvidence";
import styles from "./study.module.css";

const questionKinds: Record<QuizQuestion["kind"], string> = {
  recall: "Recall", understanding: "Understanding", comparison: "Comparison", reasoning: "Reasoning",
};

export function QuizView({ questions, topics, onEvidence, onWrongTopicsChange, onReviewMistakes }: {
  questions: QuizQuestion[];
  topics: Topic[];
  onEvidence: EvidenceHandler;
  onWrongTopicsChange: (topicIds: string[]) => void;
  onReviewMistakes: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [selection, setSelection] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  const questionRef = useRef<HTMLLegendElement>(null);
  const question = questions[current];
  const answered = question && Object.hasOwn(answers, question.id);
  const checkedAnswer = question ? answers[question.id] : undefined;
  const score = questions.filter((item) => answers[item.id] === item.correctAnswer).length;
  const wrongTopics = topics.filter((topic) => questions.some((item) => item.topicId === topic.id && Object.hasOwn(answers, item.id) && answers[item.id] !== item.correctAnswer));

  function submit() {
    if (!question || selection === null || answered) return;
    const nextAnswers = { ...answers, [question.id]: selection };
    setAnswers(nextAnswers);
    onWrongTopicsChange([...new Set(questions.filter((item) => Object.hasOwn(nextAnswers, item.id) && nextAnswers[item.id] !== item.correctAnswer).map((item) => item.topicId))]);
  }

  function goTo(index: number) {
    setCurrent(index);
    setSelection(null);
    requestAnimationFrame(() => questionRef.current?.focus());
  }

  function retry() {
    setCurrent(0);
    setSelection(null);
    setAnswers({});
    setFinished(false);
    onWrongTopicsChange([]);
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!question || answered || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof HTMLElement && event.target.closest("input:not([type=radio]), textarea, select")) return;
    const key = event.key.toUpperCase();
    const index = /^[1-9]$/.test(key) ? Number(key) - 1 : /^[A-I]$/.test(key) ? key.charCodeAt(0) - 65 : -1;
    if (index >= 0 && index < question.options.length) { event.preventDefault(); setSelection(index); }
  }

  if (!question) return <p className={styles.emptyState}>No quiz questions in these materials.</p>;

  if (finished) return (
    <div className={styles.quizResult} aria-live="polite">
      <CircleCheck size={32} strokeWidth={1.5} aria-hidden="true" />
      <h3>Quiz complete</h3>
      <ScoreRing score={score} total={questions.length} />
      <p className={styles.muted}>{score} correct, {questions.length - score} incorrect</p>
      {wrongTopics.length > 0 && <p className={styles.reviewTopics}>Topics to revisit: {wrongTopics.map((topic) => topic.title).join(", ")}</p>}
      <div className={styles.actionRow}>
        <Button type="button" variant="outline" onClick={retry}><RotateCcw aria-hidden="true" />Try again</Button>
        {wrongTopics.length > 0 && <Button type="button" onClick={onReviewMistakes}>Review missed topics<ArrowRight aria-hidden="true" /></Button>}
      </div>
    </div>
  );

  return (
    <div className={styles.quiz} onKeyDown={handleKeys}>
      <div className={styles.studyToolbar}>
        <p className={styles.muted}>Question {current + 1} of {questions.length}</p>
        <span className={styles.questionKind}>{questionKinds[question.kind]}</span>
      </div>
      <div className={styles.progress} role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={Object.keys(answers).length}>
        <span style={{ transform: `scaleX(${questions.length ? Object.keys(answers).length / questions.length : 0})` }} />
      </div>
      <fieldset key={question.id} className={styles.question} disabled={Boolean(answered)}>
        <legend ref={questionRef} tabIndex={-1}>{question.question}</legend>
        <div className={styles.options}>
          {question.options.map((option, index) => {
            const isSelected = answered ? checkedAnswer === index : selection === index;
            const isCorrect = answered && question.correctAnswer === index;
            const isWrong = answered && isSelected && !isCorrect;
            return (
              <label key={index} style={{ animationDelay: `${60 + index * 40}ms` }} className={`${styles.option} ${isSelected ? styles.optionSelected : ""} ${isCorrect ? styles.optionCorrect : ""} ${isWrong ? styles.optionWrong : ""}`}>
                <input type="radio" aria-label={option} name={`quiz-${question.id}`} value={index} checked={isSelected} onChange={() => setSelection(index)} />
                <span className={styles.optionLetter} aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                <span className={styles.optionText}>{option}</span>
                {isCorrect && <Check aria-label="Correct answer" size={18} />}
                {isWrong && <X aria-label="Incorrect answer" size={18} />}
              </label>
            );
          })}
        </div>
      </fieldset>
      {answered && (
        <div className={`${styles.explanation} explanation-enter`} role="status">
          <p className={styles.answerStatus}>{checkedAnswer === question.correctAnswer ? "Correct answer" : `Correct answer: ${String.fromCharCode(65 + question.correctAnswer)}`}</p>
          <p>{question.explanation}</p>
          <EvidenceButton evidence={question.evidence} onEvidence={onEvidence} />
        </div>
      )}
      <div className={styles.quizActions}>
        <Button type="button" variant="ghost" disabled={current === 0} onClick={() => goTo(current - 1)}><ArrowLeft aria-hidden="true" />Previous</Button>
        {answered ? <Button type="button" onClick={() => current === questions.length - 1 ? setFinished(true) : goTo(current + 1)}>
          {current === questions.length - 1 ? "See results" : "Next question"}<ArrowRight aria-hidden="true" />
        </Button> : <Button type="button" disabled={selection === null} onClick={submit}><Check aria-hidden="true" />Check answer</Button>}
      </div>
      {!answered && <p className={styles.keyHint} aria-hidden="true">Tip: press 1–{Math.min(question.options.length, 9)} to choose, then Check answer</p>}
    </div>
  );
}

function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || target === 0) {
      const frame = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frame);
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

function ScoreRing({ score, total }: { score: number; total: number }) {
  const shown = useCountUp(score);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const ratio = total ? score / total : 0;
  return (
    <div className={styles.scoreRing}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className={styles.scoreTrack} cx="60" cy="60" r={radius} />
        <circle className={styles.scoreValue} cx="60" cy="60" r={radius} strokeDasharray={circumference} style={{ strokeDashoffset: circumference * (1 - ratio), "--ring-length": circumference } as CSSProperties} />
      </svg>
      <p className={styles.score}><span className="sr-only">{score} / {total}</span><span aria-hidden="true">{shown}<span> / {total}</span></span></p>
    </div>
  );
}
