"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useSettings } from "@/lib/i18n/SettingsContext";
import type { GenerationStage } from "@/lib/contracts/generation";

const steps = ["validating", "analyzing", "generating", "verifying", "correcting", "complete"] as const;
type Step = (typeof steps)[number];
type StepState = "pending" | "active" | "done" | "error";

const labels: Record<"en" | "zh", Record<Step, string>> = {
  en: { validating: "Validate", analyzing: "Analyze", generating: "Generate", verifying: "Verify", correcting: "Correct", complete: "Finish" },
  zh: { validating: "校验", analyzing: "分析", generating: "生成", verifying: "核对", correcting: "修正", complete: "完成" },
};

function stepIndex(stage: GenerationStage | null) {
  if (!stage) return -1;
  return steps.indexOf(stage);
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

/**
 * Stage stepper shared by guest streaming and account background jobs.
 * Purely presentational: text never includes a percentage because stage
 * durations vary widely and a fake percentage would mislead.
 */
export function GenerationSteps({ stage, failed = false, startedAt = null, running = true }: {
  stage: GenerationStage | null;
  failed?: boolean;
  startedAt?: number | null;
  running?: boolean;
}) {
  const { language } = useSettings();
  const zh = language === "zh";
  const text = labels[zh ? "zh" : "en"];
  const current = stepIndex(stage);
  const done = stage === "complete" && !running;
  const elapsed = useElapsed(startedAt, running && !failed);

  return <div className="gen-steps-wrap">
    <ol className="gen-steps" aria-label={zh ? "生成阶段" : "Generation stages"}>
      {steps.map((step, index) => {
        // The API reports the current stage, not a history of completed stages.
        const state: StepState = index !== current ? "pending" : failed ? "error" : done ? "done" : "active";
        return <li key={step} className="gen-step" data-state={state} data-stage={step} aria-label={text[step]} aria-current={state === "active" ? "step" : undefined}>
          <span className="gen-step-bar" aria-hidden="true" />
          <span className="gen-step-label">
            <span className="gen-step-dot" aria-hidden="true">{state === "done" && <Check />}</span>
            <span>{text[step]}</span>
          </span>
        </li>;
      })}
    </ol>
    {elapsed !== null && running && !failed && <div className="gen-progress-meta" aria-hidden="true">
      <span>{zh ? `已用时 ${formatElapsed(elapsed)}` : `Elapsed ${formatElapsed(elapsed)}`}</span>
    </div>}
  </div>;
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
