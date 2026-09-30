"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Layers, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Flashcard, Topic } from "@/lib/schemas/studyMaterials";
import { EvidenceButton, type EvidenceHandler } from "./SourceEvidence";
import styles from "./study.module.css";

export function FlashcardsView({ cards, topics, wrongTopicIds, onlyWrong, onFilterChange, onEvidence }: {
  cards: Flashcard[];
  topics: Topic[];
  wrongTopicIds: string[];
  onlyWrong: boolean;
  onFilterChange: (onlyWrong: boolean) => void;
  onEvidence: EvidenceHandler;
}) {
  const [current, setCurrent] = useState(0);
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const filtered = onlyWrong ? cards.filter((card) => wrongTopicIds.includes(card.topicId)) : cards;
  const currentIndex = Math.min(current, Math.max(0, filtered.length - 1));
  const card = filtered[currentIndex];
  const flipped = Boolean(card && flippedId === card.id);

  function move(index: number, refocus = false) {
    setDirection(index > currentIndex ? "next" : index < currentIndex ? "prev" : null);
    setCurrent(index);
    setFlippedId(null);
    if (refocus) requestAnimationFrame(() => cardRef.current?.focus());
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!card || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) return;
    if (event.key === "ArrowRight" && currentIndex < filtered.length - 1) { event.preventDefault(); move(currentIndex + 1, true); }
    else if (event.key === "ArrowLeft" && currentIndex > 0) { event.preventDefault(); move(currentIndex - 1, true); }
  }

  function changeFilter(value: boolean) {
    onFilterChange(value);
    move(0);
  }

  return (
    <div className={styles.flashcards} onKeyDown={handleKeys}>
      <div className={styles.studyToolbar}>
        <label className={styles.filterControl}>
          <input type="checkbox" checked={onlyWrong} onChange={(event) => changeFilter(event.target.checked)} />
          Missed topics only
          <span className={styles.muted}>({wrongTopicIds.length})</span>
        </label>
        <span className={styles.muted}>{filtered.length} cards</span>
      </div>
      {card ? <>
        <div className={styles.cardTopic}>{topics.find((topic) => topic.id === card.topicId)?.title ?? "Review card"}</div>
        <button
          type="button"
          key={card.id}
          ref={cardRef}
          className={`${styles.flashcard} ${direction === "next" ? styles.enterNext : direction === "prev" ? styles.enterPrev : ""}`}
          aria-label={flipped ? `Answer: ${card.back}. Show question` : `Question: ${card.front}. Show answer`}
          aria-pressed={flipped}
          onClick={() => setFlippedId(flipped ? null : card.id)}
        >
          <span className={`${styles.flashcardInner} ${flipped ? styles.flipped : ""}`}>
            <span className={`${styles.cardFace} ${styles.cardFront}`} aria-hidden={flipped}>
              <span className={styles.cardSide}>QUESTION</span>
              <span className={styles.cardContent}>{card.front}</span>
              <span className={styles.cardFlipIcon}><RotateCw aria-hidden="true" size={19} /></span>
            </span>
            <span className={`${styles.cardFace} ${styles.cardBack}`} aria-hidden={!flipped}>
              <span className={styles.cardSide}>ANSWER</span>
              <span className={styles.cardContent}>{card.back}</span>
              <span className={styles.cardFlipIcon}><RotateCw aria-hidden="true" size={19} /></span>
            </span>
          </span>
        </button>
        <div className={styles.cardNavigation}>
          <Button type="button" variant="outline" size="icon" aria-label="Previous card" title="Previous card" disabled={currentIndex === 0} onClick={() => move(currentIndex - 1)}><ArrowLeft aria-hidden="true" /></Button>
          <span aria-live="polite">{currentIndex + 1} / {filtered.length}</span>
          <Button type="button" variant="outline" size="icon" aria-label="Next card" title="Next card" disabled={currentIndex === filtered.length - 1} onClick={() => move(currentIndex + 1)}><ArrowRight aria-hidden="true" /></Button>
        </div>
        <div className={styles.cardProgress} aria-hidden="true"><span style={{ transform: `scaleX(${(currentIndex + 1) / filtered.length})` }} /></div>
        <p className={styles.keyHint} aria-hidden="true">Space to flip · ← → to move between cards</p>
        <div className={styles.cardEvidence}><EvidenceButton evidence={card.evidence} onEvidence={onEvidence} /></div>
      </> : <div className={styles.emptyState}>
        <Layers size={28} strokeWidth={1.5} aria-hidden="true" />
        <p>{onlyWrong ? "No flashcards match your missed topics yet." : "No flashcards in these materials."}</p>
        {onlyWrong && <Button type="button" variant="outline" onClick={() => changeFilter(false)}>Show all cards</Button>}
      </div>}
    </div>
  );
}
