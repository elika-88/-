"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useSettings } from "@/lib/i18n/SettingsContext";
import type { GenerationStage } from "@/lib/contracts/generation";

const steps = ["validating", "analyzing", "generating", "verifying", "complete"] as const;
type Step = (typeof steps)[number];
type StepState = "pending" | "active" | "done" | "error";

const labels: Record<"en" | "zh", Record<Step, string>> = {
  en: { validating: "Check the lecture", analyzing: "Find the main topics", generating: "Write summary, key points, quiz and flashcards", verifying: "Check every item against the source", complete: "Done" },
  zh: { validating: "检查讲稿", analyzing: "分析主题", generating: "撰写摘要、要点、测验和闪卡", verifying: "逐条对照原文核对", complete: "完成" },
};
const correctingLabel = { en: "Fix items that did not pass the check", zh: "修正未通过核对的内容" };

/**
 * Stages run in this order, so every stage before the reported one has finished.
 * `correcting` re-runs writing after a failed check: it is shown on the writing
 * row (relabelled), and verification is pending again until it passes.
 */
function stepIndex(stage: GenerationStage | null) {
  if (!stage) return -1;
  return steps.indexOf(stage === "correcting" ? "generating" : stage);
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function useElapsed(startedAt: number | null, running: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!running || startedAt === null) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [running, startedAt]);
  return startedAt === null || now === null ? null : Math.max(0, now - startedAt);
}

export type ProgressStep = { id: string; label: string; stage?: string };

/**
 * Vertical checklist: finished steps get a check mark, the current one a spinner.
 * Purely presentational; never shows a percentage because step durations vary.
 */
export function ProgressSteps({ steps: items, current, status, startedAt = null, estimate, doneMessage, label }: {
  steps: ProgressStep[];
  current: number;
  status: "running" | "done" | "failed";
  startedAt?: number | null;
  estimate?: string;
  doneMessage?: string;
  label: string;
}) {
  const { language } = useSettings();
  const zh = language === "zh";
  const elapsed = useElapsed(startedAt, status === "running");
  return <div className="gen-checklist-wrap" data-status={status}>
    {status === "done" && doneMessage && <p className="gen-done" role="status"><span className="gen-check" data-state="done" aria-hidden="true"><Check /></span>{doneMessage}</p>}
    <ol className="gen-checklist" aria-label={label}>
      {items.map((step, index) => {
        const state: StepState = status === "done" || index < current ? "done" : index === current ? (status === "failed" ? "error" : "active") : "pending";
        return <li key={step.id} className="gen-check-row gen-step" data-state={state} data-stage={step.stage ?? step.id} aria-current={state === "active" ? "step" : undefined}>
          <span className="gen-check" data-state={state} aria-hidden="true">{state === "done" ? <Check /> : state === "error" ? <X /> : null}</span>
          <span className="gen-check-label">{step.label}</span>
          {state === "done" && <span className="sr-only">{zh ? "已完成" : "completed"}</span>}
        </li>;
      })}
    </ol>
    {elapsed !== null && status === "running" && <div className="gen-progress-meta" aria-hidden="true">
      <span>{zh ? `已用时 ${formatElapsed(elapsed)}` : `Elapsed ${formatElapsed(elapsed)}`}</span>
      {estimate && <span>{estimate}</span>}
    </div>}
  </div>;
}

/** Lecture generation stages (guest streaming and account background jobs). */
export function GenerationSteps({ stage, failed = false, startedAt = null, running = true }: {
  stage: GenerationStage | null;
  failed?: boolean;
  startedAt?: number | null;
  running?: boolean;
}) {
  const { language } = useSettings();
  const zh = language === "zh";
  const text = labels[zh ? "zh" : "en"];
  const correcting = stage === "correcting";
  const items = steps.map((step) => ({ id: step, stage: correcting && step === "generating" ? "correcting" : step, label: correcting && step === "generating" ? correctingLabel[zh ? "zh" : "en"] : text[step] }));
  const done = stage === "complete" && !running;
  return <ProgressSteps steps={items} current={stepIndex(stage)} status={failed ? "failed" : done ? "done" : "running"} startedAt={startedAt}
    label={zh ? "生成阶段" : "Generation stages"}
    doneMessage={zh ? "学习材料已生成，全部内容已对照原文核对" : "Study materials are ready and checked against the source"} />;
}

/** Placeholder shaped like the study dashboard while the first result is on its way. */
export function MaterialsSkeleton() {
  const { language } = useSettings();
  return <section className="materials-skeleton" aria-busy="true" aria-label={language === "zh" ? "正在生成学习材料" : "Study materials are being generated"}>
    <div className="skeleton skeleton-title" />
    <div className="skeleton skeleton-meta" />
    <div className="skeleton skeleton-tabs" />
    <div>
      <div className="skeleton skeleton-line" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line" />
      <div className="skeleton-gap" />
      <div className="skeleton skeleton-line" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line" />
    </div>
  </section>;
}
