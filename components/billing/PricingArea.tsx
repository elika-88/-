"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, type Account } from "@/components/auth/AuthProvider";
import { PLAN_LIMITS, PLAN_PRICES, PLAN_RANK, type BillingInterval, type BillingSummary, type PaidPlanId } from "@/lib/billing/plans";
import { refreshBilling, setBillingSummary, useBilling } from "@/lib/client/billing";
import { clearPendingPayPal, isPayPalSubscriptionId, savePendingPayPal, usePendingPayPal } from "@/lib/client/pending-paypal";
import { PayPalSubscribeButton } from "./PayPalSubscribeButton";
import { useBillingCopy } from "./copy";
import styles from "./billing.module.css";

function savingPercent(monthly?: string, yearly?: string) {
  const m = Number(monthly), y = Number(yearly);
  if (!m || !y || y >= m * 12) return null;
  return Math.round((1 - y / (m * 12)) * 100);
}

async function postJson(url: string, body?: unknown): Promise<BillingSummary> {
  const response = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(45_000) });
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
  return <PricingContent key={user?.id ?? "guest"} user={user} />;
}

function PricingContent({ user }: { user: Account | null }) {
  const { c, locale } = useBillingCopy();
  const { summary, error } = useBilling(user?.id ?? null);
  const [interval, setBillingInterval] = useState<BillingInterval>("yearly");
  const [status, setStatus] = useState<{ kind: "info" | "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreId, setRestoreId] = useState("");
  const pendingId = usePendingPayPal(user?.id ?? null);
  const confirming = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const paypal = summary?.paypal ?? null;
  const current = summary?.plan ?? "free";
  const sub = summary?.subscription ?? null;
  const date = (time: number | null) => time ? new Date(time).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }) : "";
  const money = (value: string | undefined, currency: string) => value ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value)) : "—";
  // Until checkout is configured, show the advertised USD catalogue. Once a
  // plan exists, use its configured price/currency rather than masking it.
  const priceFor = (tier: PaidPlanId, period: BillingInterval) => {
    const plan = paypal?.plans[tier][period];
    return plan && paypal
      ? { value: plan.price, currency: paypal.currency }
      : { value: PLAN_PRICES[tier][period], currency: PLAN_PRICES.currency };
  };

  async function approved(subscriptionId: string) {
    if (!user || confirming.current) return;
    if (!isPayPalSubscriptionId(subscriptionId)) { setStatus({ kind: "error", text: c.invalidSubscriptionId }); return; }
    const userId = user.id;
    savePendingPayPal(userId, subscriptionId);
    confirming.current = true;
    setBusy(true);
    setStatus({ kind: "info", text: c.activating });
    try {
      const result = await postJson("/api/billing/paypal/confirm", { subscriptionId });
      clearPendingPayPal(userId, subscriptionId);
      if (!mounted.current) return;
      setBillingSummary(result); setRestoreId(""); setStatus({ kind: "success", text: c.welcome });
    } catch (caught) {
      if (!mounted.current) return;
      setStatus({ kind: "error", text: `${c.pendingConfirmation} ${caught instanceof Error ? caught.message : ""}` });
      void refreshBilling();
    } finally { confirming.current = false; if (mounted.current) setBusy(false); }
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
    if (pendingId || busy) return <p className={styles.muted}>{busy ? c.activating : c.pendingConfirmation}</p>;
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
    const price = priceFor(tier, interval);
    const monthly = priceFor(tier, "monthly");
    const yearly = priceFor(tier, "yearly");
    const saving = monthly.currency === yearly.currency ? savingPercent(monthly.value, yearly.value) : null;
    const showPrice = !(current === tier && sub);
    return <section className={`${styles.plan} ${tier === "pro" ? styles.planPro : ""}`} aria-labelledby={`plan-${tier}`}>
      <h2 id={`plan-${tier}`}>{tier === "pro" ? c.pro : c.basic}</h2>
      <p className={styles.planNote}>{tier === "pro" ? c.proNote : c.basicNote}</p>
      {showPrice && <p className={styles.price}>{money(price.value, price.currency)}<span>{interval === "monthly" ? c.perMonth : c.perYear}</span></p>}
      {showPrice && interval === "yearly" && saving && <p className={styles.planNote}>{c.save(saving)}</p>}
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
        {value === "monthly" ? c.monthly : c.yearly}
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
    {user && <section className={styles.recovery} aria-label={c.restoreTitle}>
      {pendingId && <div role="status">
        <p>{c.pendingConfirmation}</p>
        <p>{c.subscriptionId}: <code>{pendingId}</code></p>
        <Button type="button" disabled={busy} onClick={() => void approved(pendingId)}>{busy ? c.activating : c.retryConfirmation}</Button>
      </div>}
      <details>
        <summary>{c.restoreTitle}</summary>
        <p id="restore-help">{c.restoreHelp}</p>
        <form onSubmit={event => { event.preventDefault(); void approved(restoreId.trim().toUpperCase()); }}>
          <label htmlFor="restore-subscription">{c.subscriptionId}</label>
          <input id="restore-subscription" aria-describedby="restore-help" value={restoreId} onChange={event => setRestoreId(event.target.value)} placeholder="I-…" maxLength={42} autoComplete="off" spellCheck={false} required disabled={busy} />
          <Button type="submit" disabled={busy}>{busy ? c.activating : c.retryConfirmation}</Button>
        </form>
      </details>
    </section>}
    {summary && current === "free" && sub?.status === "SUSPENDED" && <p className={`${styles.status} ${styles.error}`}>{c.suspended}</p>}

    {summary && <section className={styles.usage} aria-label={c.usageTitle}>
      <div><strong>{c.usageTitle} · {c.planName[current]}</strong><span>{c.usageLecture(summary.usage.lecture.used, summary.usage.lecture.limit)}</span></div>
      <div className={styles.meter} aria-hidden="true"><span style={{ transform: `scaleX(${Math.min(1, summary.usage.lecture.used / Math.max(1, summary.usage.lecture.limit))})` }} /></div>
      <small>{c.resets}</small>
    </section>}

    <p className={styles.fineprint}>{c.secure}</p>
  </div>;
}
