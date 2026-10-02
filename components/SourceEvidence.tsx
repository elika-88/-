"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Evidence, StudyKit } from "@/lib/schemas/studyMaterials";
import { useWorkspaceCopy } from "@/lib/i18n/workspace";
import styles from "./study.module.css";

export type EvidenceHandler = (evidence: Evidence[]) => void;

export function EvidenceButton({ evidence, onEvidence }: {
  evidence: Evidence[];
  onEvidence: EvidenceHandler;
}) {
  const s = useWorkspaceCopy().source;
  return (
    <Button type="button" variant="ghost" className={styles.evidenceButton} onClick={() => onEvidence(evidence)}>
      <BookOpen aria-hidden="true" />{s.view(evidence.length)}
    </Button>
  );
}

export function SourceEvidence({ source, evidence, onClose }: {
  source: StudyKit["source"];
  evidence: Evidence[];
  onClose: () => void;
}) {
  const s = useWorkspaceCopy().source;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const quoteRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(0);
  const titleId = useId();
  const citation = evidence[selected];
  const segment = source.segments.find((item) => item.id === citation?.segmentId);
  const validSegment = segment && segment.start >= 0 && segment.end > segment.start
    && segment.end <= source.text.length && source.text.slice(segment.start, segment.end) === segment.text;
  const quoteOffset = validSegment && citation ? segment.text.indexOf(citation.quote) : -1;
  const quoteStart = validSegment && quoteOffset >= 0 ? segment.start + quoteOffset : -1;
  const quoteEnd = citation && quoteStart >= 0 ? quoteStart + citation.quote.length : -1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    quoteRef.current?.scrollIntoView({ block: "center", behavior: selected === 0 || reducedMotion ? "instant" : "smooth" });
  }, [selected]);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.sourceDialog} lumina-dialog`}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <header className={styles.dialogHeader}>
        <div>
          <p className={styles.eyebrow}>{s.eyebrow}</p>
          <h2 id={titleId}>{s.title}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={s.close} title={s.close} onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </header>
      {evidence.length > 1 && (
        <div className={styles.citationList} aria-label={s.citations}>
          {evidence.map((item, index) => (
            <Button type="button" key={`${item.segmentId}-${index}`} variant={index === selected ? "default" : "outline"} aria-pressed={index === selected} onClick={() => setSelected(index)}>
              {s.item(index + 1)}
            </Button>
          ))}
        </div>
      )}
      {quoteStart < 0 && (
        <div className={styles.sourceWarning} role="status">
          <p>{s.notLocated}</p>
          {citation && <blockquote>{citation.quote}</blockquote>}
        </div>
      )}
      <div className={styles.sourceText}>
        {quoteStart >= 0 ? <>
          {source.text.slice(0, quoteStart)}
          <mark ref={quoteRef}>{source.text.slice(quoteStart, quoteEnd)}</mark>
          {source.text.slice(quoteEnd)}
        </> : source.text}
      </div>
    </dialog>
  );
}
