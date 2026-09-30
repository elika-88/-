"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useBilling } from "@/lib/client/billing";
import { useBillingCopy } from "./copy";

/** Inline "n of 3 free generations left today · Upgrade" line for the composer footer. */
export function UsageHint() {
  const { user } = useAuth();
  const { summary } = useBilling(user?.id ?? null);
  const { c } = useBillingCopy();
  if (!summary) return null;
  if (summary.plan !== "free") return <span className="usage-hint"> · <span className="usage-pro">{c.planName[summary.plan]}</span></span>;
  const left = Math.max(0, summary.usage.lecture.limit - summary.usage.lecture.used);
  return <span className="usage-hint"> · {c.remaining(left, summary.usage.lecture.limit)} · <Link href="/pricing">{c.upgrade}</Link></span>;
}
