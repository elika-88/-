"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useBilling } from "@/lib/client/billing";
import { useBillingCopy } from "./copy";

/** Plan entry in the sidebar: an upgrade prompt on Free, a quiet badge on Pro. */
export function SidebarPlan({ compact = false, active = false }: { compact?: boolean; active?: boolean }) {
  const { user } = useAuth();
  const { summary } = useBilling(user?.id ?? null);
  const { c } = useBillingCopy();
  const plan = summary?.plan ?? "free";
  const pro = plan === "pro";
  const label = pro ? c.manage : plan === "basic" ? c.upgradeToPro : c.upgradePlan;
  if (compact) return <Link href="/pricing" className={`gpt-rail-btn ${active ? "is-active" : ""}`} title={label} aria-label={label} aria-current={active ? "page" : undefined}><Sparkles size={18} /></Link>;
  const left = summary ? Math.max(0, summary.usage.lecture.limit - summary.usage.lecture.used) : null;
  return <Link href="/pricing" className={`sb-plan ${plan !== "free" ? "is-pro" : ""} ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
    <Sparkles size={16} aria-hidden="true" />
    <span className="sb-plan-text">
      <strong>{plan === "free" ? c.upgradePlan : `Lumina ${c.planName[plan]}`}</strong>
      {summary && plan === "free" && left !== null && <small>{c.remaining(left, summary.usage.lecture.limit)}</small>}
      {plan === "basic" && <small>{c.upgradeToPro}</small>}
      {pro && <small>{c.manage}</small>}
    </span>
  </Link>;
}
