"use client";

import { useRef, useState } from "react";
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

  if (!question) return <p className={styles.emptyState}>No quiz questions in these materials.</p>;

  if (finished) return (
    <div className={styles.quizResult} aria-live="polite">
      <CircleCheck size={32} strokeWidth={1.5} aria-hidden="true" />
      <h3>Quiz complete</h3>
      <p className={styles.score}>{score}<span> / {questions.length}</span></p>
      <p className={styles.muted}>{score} correct, {questions.length - score} incorrect</p>
      {wrongTopics.length > 0 && <p className={styles.reviewTopics}>Topics to revisit: {wrongTopics.map((topic) => topic.title).join(", ")}</p>}
      <div className={styles.actionRow}>
        <Button type="button" variant="outline" onClick={retry}><RotateCcw aria-hidden="true" />Try again</Button>
        {wrongTopics.length > 0 && <Button type="button" onClick={onReviewMistakes}>Review missed topics<ArrowRight aria-hidden="true" /></Button>}
      </div>
    </div>
  );

  return (
    <div className={styles.quiz}>
      <div className={styles.studyToolbar}>
        <p className={styles.muted}>Question {current + 1} of {questions.length}</p>
        <span className={styles.questionKind}>{questionKinds[question.kind]}</span>
      </div>
      <progress className={styles.progress} value={Object.keys(answers).length} max={questions.length} aria-label="Quiz progress" />
      <fieldset className={styles.question} disabled={Boolean(answered)}>
        <legend ref={questionRef} tabIndex={-1}>{question.question}</legend>
        <div className={styles.options}>
          {question.options.map((option, index) => {
            const isSelected = answered ? checkedAnswer === index : selection === index;
            const isCorrect = answered && question.correctAnswer === index;
            const isWrong = answered && isSelected && !isCorrect;
            return (
              <label key={index} className={`${styles.option} ${isSelected ? styles.optionSelected : ""} ${isCorrect ? styles.optionCorrect : ""} ${isWrong ? styles.optionWrong : ""}`}>
                <input type="radio" name={`quiz-${question.id}`} value={index} checked={isSelected} onChange={() => setSelection(index)} />
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
        <div className={styles.explanation} role="status">
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
    </div>
  );
}
