"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, BookOpen, CircleHelp, Layers, ListChecks, ShieldCheck } from "lucide-react";
import type { Evidence, StudyKit } from "@/lib/schemas/studyMaterials";
import { FlashcardsView } from "./FlashcardsView";
import { QuizView } from "./QuizView";
import { EvidenceButton, SourceEvidence } from "./SourceEvidence";
import styles from "./study.module.css";

export type StudyTab = "summary" | "keypoints" | "quiz" | "flashcards";

const tabs = [
  { id: "summary", label: "Summary", icon: BookOpen },
  { id: "keypoints", label: "Key Points", icon: ListChecks },
  { id: "quiz", label: "Quiz", icon: CircleHelp },
  { id: "flashcards", label: "Flashcards", icon: Layers },
] as const;

type DashboardProps = { kit: StudyKit; tab: StudyTab; onTabChange: (tab: StudyTab) => void };

export function StudyDashboard(props: DashboardProps) {
  return <StudyDashboardContent key={props.kit.runId} {...props} />;
}

function StudyDashboardContent({ kit, tab, onTabChange }: DashboardProps) {
  const [activeEvidence, setActiveEvidence] = useState<Evidence[] | null>(null);
  const [wrongTopicIds, setWrongTopicIds] = useState<string[]>([]);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const verification = kit.verification;
  const reviewConcerns = verification.items.filter((item) => item.status !== "supported");

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (current + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onTabChange(tabs[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className={styles.dashboard} aria-label="Study materials">
      <header className={styles.dashboardHeader}>
        <p className={styles.eyebrow}>YOUR STUDY MATERIALS</p>
        <h2>{kit.lectureTitle}</h2>
        <div className={styles.verification}>
          <ShieldCheck size={15} aria-hidden="true" />
          <span>{verification.supportedItems} / {verification.totalItems} items supported</span>
          <span>{verification.representedTopics} / {verification.totalTopics} topics covered</span>
        </div>
        <p className={styles.verificationNote}>AI review results. Confirm important details against the lecture source.</p>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Study material type">
        {tabs.map((item, index) => {
          const Icon = item.icon;
          return <button
            type="button"
            key={item.id}
            ref={(element) => { tabRefs.current[index] = element; }}
            role="tab"
            id={`${id}-tab-${item.id}`}
            aria-controls={`${id}-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTabChange(item.id)}
            onKeyDown={(event) => navigateTabs(event, index)}
            className={styles.tab}
          ><Icon aria-hidden="true" size={16} /><span>{item.label}</span></button>;
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel-summary`} aria-labelledby={`${id}-tab-summary`} hidden={tab !== "summary"} tabIndex={0} className={styles.panel}>
        <div className={styles.overview}>
          <h3>Overview</h3>
          <p>{kit.overview.text}</p>
          <EvidenceButton evidence={kit.overview.evidence} onEvidence={setActiveEvidence} />
        </div>
        {kit.summary.map((section, index) => <article className={styles.summarySection} key={section.id}>
          <span className={styles.sectionNumber}>{String(index + 1).padStart(2, "0")}</span>
          <div><h3>{section.title}</h3><p>{section.text}</p><EvidenceButton evidence={section.evidence} onEvidence={setActiveEvidence} /></div>
        </article>)}
      </div>
      <div role="tabpanel" id={`${id}-panel-keypoints`} aria-labelledby={`${id}-tab-keypoints`} hidden={tab !== "keypoints"} tabIndex={0} className={styles.panel}>
        <div className={styles.panelHeading}><h3>Key takeaways</h3><span className={styles.muted}>{kit.keyPoints.length} points</span></div>
        <ul className={styles.keyPoints}>{kit.keyPoints.map((point) => <li key={point.id}>
          <ArrowUpRight size={20} aria-hidden="true" />
          <div><div className={styles.pointMeta}><span>{kit.topics.find((topic) => topic.id === point.topicId)?.title}</span>{point.importance === "high" && <span className={styles.importance}>Essential</span>}</div><p>{point.text}</p><EvidenceButton evidence={point.evidence} onEvidence={setActiveEvidence} /></div>
        </li>)}</ul>
      </div>
      <div role="tabpanel" id={`${id}-panel-quiz`} aria-labelledby={`${id}-tab-quiz`} hidden={tab !== "quiz"} tabIndex={0} className={styles.panel}>
        <QuizView questions={kit.quiz} topics={kit.topics} onEvidence={setActiveEvidence} onWrongTopicsChange={setWrongTopicIds} onReviewMistakes={() => { setOnlyWrong(true); onTabChange("flashcards"); tabRefs.current[3]?.focus(); }} />
      </div>
      <div role="tabpanel" id={`${id}-panel-flashcards`} aria-labelledby={`${id}-tab-flashcards`} hidden={tab !== "flashcards"} tabIndex={0} className={styles.panel}>
        <FlashcardsView key={String(onlyWrong)} cards={kit.flashcards} topics={kit.topics} wrongTopicIds={wrongTopicIds} onlyWrong={onlyWrong} onFilterChange={setOnlyWrong} onEvidence={setActiveEvidence} />
      </div>
      {(kit.limitations.length > 0 || reviewConcerns.length > 0) && <details className={styles.limitations}>
        <summary>Limitations and review notes ({kit.limitations.length + reviewConcerns.length})</summary>
        <ul>{kit.limitations.map((text, index) => <li key={`limitation-${index}`}>{text}</li>)}{reviewConcerns.map((item, index) => <li key={`${item.itemId}-${index}`}><p>{item.reason}</p>{item.evidence.length > 0 && <EvidenceButton evidence={item.evidence} onEvidence={setActiveEvidence} />}</li>)}</ul>
      </details>}
      {activeEvidence && <SourceEvidence source={kit.source} evidence={activeEvidence} onClose={() => setActiveEvidence(null)} />}
    </section>
  );
}
