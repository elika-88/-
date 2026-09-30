"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { PLAN_LIMITS, PLAN_RANK, type BillingInterval, type BillingSummary, type PaidPlanId } from "@/lib/billing/plans";
import { refreshBilling, setBillingSummary, useBilling } from "@/lib/client/billing";
import { PayPalSubscribeButton } from "./PayPalSubscribeButton";
import { useBillingCopy } from "./copy";
import styles from "./billing.module.css";

function savingPercent(monthly?: string, yearly?: string) {
  const m = Number(monthly), y = Number(yearly);
  if (!m || !y || y >= m * 12) return null;
  return Math.round((1 - y / (m * 12)) * 100);
}

async function postJson(url: string, body?: unknown): Promise<BillingSummary> {
  const response = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await response.json().catch(() => null) as (BillingSummary & { error?: string }) | null;
  if (!response.ok || !data || data.error) throw new Error(data?.error || "Request failed.");
  return data;
}

type Copy = ReturnType<typeof useBillingCopy>["c"];

function Feature({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <li className={on ? undefined : styles.off}>{on ? <Check aria-hidden="true" /> : <Minus aria-hidden="true" />}{children}</li>;
}

function features(c: Copy, tier: "free" | PaidPlanId) {
  const limits = PLAN_LIMITS[tier];
  return <ul className={styles.features}>
    <Feature on>{c.features.lectures(limits.lectureGenerationsPerDay)}</Feature>
    <Feature on>{c.features.length(limits.maxLectureCharacters)}</Feature>
    <Feature on>{c.features.materials}</Feature>
    <Feature on>{c.features.sources}</Feature>
    {tier === "pro" ? <>
      <Feature on>{c.features.prep}</Feature>
      <Feature on>{c.features.prepSets(limits.prepSetsPerDay)}</Feature>
    </> : <Feature on={false}>{c.features.noPrep}</Feature>}
  </ul>;
}

export function PricingArea() {
  const { user } = useAuth();
  const { c, locale } = useBillingCopy();
  const { summary, error } = useBilling(user?.id ?? null);
  const [interval, setBillingInterval] = useState<BillingInterval>("yearly");
  const [status, setStatus] = useState<{ kind: "info" | "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const paypal = summary?.paypal ?? null;
  const current = summary?.plan ?? "free";
  const sub = summary?.subscription ?? null;
  const saving = savingPercent(paypal?.plans.pro.monthly?.price, paypal?.plans.pro.yearly?.price);
  const date = (time: number | null) => time ? new Date(time).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }) : "";
  const money = (value?: string) => value && paypal ? new Intl.NumberFormat(locale, { style: "currency", currency: paypal.currency }).format(Number(value)) : "—";

  async function approved(subscriptionId: string) {
    setStatus({ kind: "info", text: c.activating });
    try { setBillingSummary(await postJson("/api/billing/paypal/confirm", { subscriptionId })); setStatus({ kind: "success", text: c.welcome }); }
    catch (caught) { setStatus({ kind: "error", text: caught instanceof Error ? caught.message : c.paypalError }); void refreshBilling(); }
  }
  async function cancel() {
    if (!window.confirm(c.cancelConfirm)) return;
    setBusy(true); setStatus({ kind: "info", text: c.cancelling });
    try { setBillingSummary(await postJson("/api/billing/paypal/cancel")); setStatus({ kind: "success", text: c.cancelled }); }
    catch (caught) { setStatus({ kind: "error", text: caught instanceof Error ? caught.message : c.paypalError }); }
    finally { setBusy(false); }
  }

  function action(tier: PaidPlanId) {
    if (!summary) return error ? <p className={styles.error}>{error}</p> : <p className={styles.muted}>{c.loading}</p>;
    const plan = paypal?.plans[tier][interval] ?? null;
    if (current === tier && sub) return <div className={styles.manage}>
      <p className={styles.currentTag}>{c.current}{sub.interval ? ` · ${c.interval[sub.interval]}` : ""}</p>
      <p className={styles.muted}>{sub.cancelled ? c.endsOn(date(sub.paidThrough)) : sub.nextBillingAt ? c.renews(date(sub.nextBillingAt)) : ""}</p>
      {!sub.cancelled && <Button type="button" variant="outline" disabled={busy} onClick={cancel}>{c.cancel}</Button>}
    </div>;
    if (PLAN_RANK[current] > PLAN_RANK[tier]) return <p className={styles.muted}>{c.switchLater}</p>;
    if (!paypal || !plan) return <p className={styles.muted}>{c.notConfigured}</p>;
    if (!user) return <Button asChild className={styles.fullWidth}><Link href="/login">{c.signIn}</Link></Button>;
    return <>
      {current === "basic" && tier === "pro" && <p className={styles.muted}>{c.upgradeNote}</p>}
      <PayPalSubscribeButton key={plan.id} clientId={paypal.clientId} currency={paypal.currency} planId={plan.id} userId={user.id}
        onApproved={approved} onError={(message) => setStatus({ kind: "error", text: message === "paypal" ? c.paypalError : message })} />
    </>;
  }

  function paidCard(tier: PaidPlanId) {
    const plan = paypal?.plans[tier][interval];
    const showPrice = !(current === tier && sub);
    return <section className={`${styles.plan} ${tier === "pro" ? styles.planPro : ""}`} aria-labelledby={`plan-${tier}`}>
      <h2 id={`plan-${tier}`}>{tier === "pro" ? c.pro : c.basic}</h2>
      <p className={styles.planNote}>{tier === "pro" ? c.proNote : c.basicNote}</p>
      {showPrice && <p className={styles.price}>{money(plan?.price)}<span>{interval === "monthly" ? c.perMonth : c.perYear}</span></p>}
      {features(c, tier)}
      <div className={styles.action}>{action(tier)}</div>
    </section>;
  }

  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.kicker}>{c.kicker}</p>
      <h1 className={styles.display}>{c.title}</h1>
      <p className={styles.lead}>{c.lead}</p>
    </header>

    <div className={styles.toggle} role="radiogroup" aria-label={c.kicker}>
      {(["monthly", "yearly"] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={interval === value} className={interval === value ? styles.toggleOn : undefined} onClick={() => setBillingInterval(value)}>
        {value === "monthly" ? c.monthly : c.yearly}{value === "yearly" && saving ? <small>{c.save(saving)}</small> : null}
      </button>)}
    </div>

    <div className={styles.plans}>
      <section className={styles.plan} aria-labelledby="plan-free">
        <h2 id="plan-free">{c.free}</h2>
        <p className={styles.planNote}>{c.freeNote}</p>
        <p className={styles.price}>{c.freePrice}</p>
        {features(c, "free")}
        {summary && current === "free" && <p className={styles.currentTag}>{c.current}</p>}
      </section>
      {paidCard("basic")}
      {paidCard("pro")}
    </div>

    {status && <p className={`${styles.status} ${styles[status.kind]}`} role={status.kind === "error" ? "alert" : "status"}>{status.text}</p>}
    {summary && current === "free" && sub?.status === "SUSPENDED" && <p className={`${styles.status} ${styles.error}`}>{c.suspended}</p>}

    {summary && <section className={styles.usage} aria-label={c.usageTitle}>
      <div><strong>{c.usageTitle} · {c.planName[current]}</strong><span>{c.usageLecture(summary.usage.lecture.used, summary.usage.lecture.limit)}</span></div>
      <div className={styles.meter} aria-hidden="true"><span style={{ transform: `scaleX(${Math.min(1, summary.usage.lecture.used / Math.max(1, summary.usage.lecture.limit))})` }} /></div>
      <small>{c.resets}</small>
    </section>}

    <p className={styles.fineprint}>{c.secure}</p>
  </div>;
}
