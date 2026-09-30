"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { PLAN_LIMITS, type BillingInterval, type BillingSummary } from "@/lib/billing/plans";
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

export function PricingArea() {
  const { user } = useAuth();
  const { c, locale } = useBillingCopy();
  const { summary, error } = useBilling(user?.id ?? null);
  const [interval, setBillingInterval] = useState<BillingInterval>("yearly");
  const [status, setStatus] = useState<{ kind: "info" | "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const paypal = summary?.paypal ?? null;
  const plan = paypal?.plans[interval] ?? null;
  const saving = savingPercent(paypal?.plans.monthly?.price, paypal?.plans.yearly?.price);
  const isPro = summary?.plan === "pro";
  const sub = summary?.subscription ?? null;
  const date = (time: number | null) => time ? new Date(time).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }) : "";
  const free = PLAN_LIMITS.free, pro = PLAN_LIMITS.pro;

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

  const priceLabel = plan?.price && paypal ? new Intl.NumberFormat(locale, { style: "currency", currency: paypal.currency }).format(Number(plan.price)) : "—";
  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.kicker}>{c.kicker}</p>
      <h1 className={styles.display}>{c.title}</h1>
      <p className={styles.lead}>{c.lead}</p>
    </header>

    {!isPro && <div className={styles.toggle} role="radiogroup" aria-label={c.kicker}>
      {(["monthly", "yearly"] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={interval === value} className={interval === value ? styles.toggleOn : undefined} onClick={() => setBillingInterval(value)}>
        {value === "monthly" ? c.monthly : c.yearly}{value === "yearly" && saving ? <small>{c.save(saving)}</small> : null}
      </button>)}
    </div>}

    <div className={styles.plans}>
      <section className={styles.plan} aria-labelledby="plan-free">
        <h2 id="plan-free">{c.free}</h2>
        <p className={styles.planNote}>{c.freeNote}</p>
        <p className={styles.price}>{c.freePrice}</p>
        <ul className={styles.features}>
          <li><Check aria-hidden="true" />{c.features.lectures(free.lectureGenerationsPerDay)}</li>
          <li><Check aria-hidden="true" />{c.features.length(free.maxLectureCharacters)}</li>
          <li><Check aria-hidden="true" />{c.features.materials}</li>
          <li><Check aria-hidden="true" />{c.features.sources}</li>
          <li className={styles.off}><Minus aria-hidden="true" />{c.features.noPrep}</li>
        </ul>
        {summary && !isPro && <p className={styles.currentTag}>{c.current}</p>}
      </section>

      <section className={`${styles.plan} ${styles.planPro}`} aria-labelledby="plan-pro">
        <h2 id="plan-pro">{c.pro}</h2>
        <p className={styles.planNote}>{c.proNote}</p>
        {!isPro && <p className={styles.price}>{priceLabel}<span>{interval === "monthly" ? c.perMonth : c.perYear}</span></p>}
        <ul className={styles.features}>
          <li><Check aria-hidden="true" />{c.features.lectures(pro.lectureGenerationsPerDay)}</li>
          <li><Check aria-hidden="true" />{c.features.length(pro.maxLectureCharacters)}</li>
          <li><Check aria-hidden="true" />{c.features.materials}</li>
          <li><Check aria-hidden="true" />{c.features.prep}</li>
          <li><Check aria-hidden="true" />{c.features.prepSets(pro.prepSetsPerDay)}</li>
        </ul>

        <div className={styles.action}>
          {!summary && !error && <p className={styles.muted}>{c.loading}</p>}
          {error && <p className={styles.error}>{error}</p>}
          {summary && isPro && sub && <div className={styles.manage}>
            <p className={styles.currentTag}>{c.current}{sub.interval ? ` · ${c.interval[sub.interval]}` : ""}</p>
            <p className={styles.muted}>{sub.cancelled ? c.endsOn(date(sub.paidThrough)) : sub.nextBillingAt ? c.renews(date(sub.nextBillingAt)) : ""}</p>
            {!sub.cancelled && <Button type="button" variant="outline" disabled={busy} onClick={cancel}>{c.cancel}</Button>}
          </div>}
          {summary && !isPro && sub?.status === "SUSPENDED" && <p className={styles.error}>{c.suspended}</p>}
          {summary && !isPro && !paypal && <p className={styles.muted}>{c.notConfigured}</p>}
          {summary && !isPro && paypal && !user && <Button asChild className={styles.fullWidth}><Link href="/login">{c.signIn}</Link></Button>}
          {summary && !isPro && paypal && user && plan && <PayPalSubscribeButton key={plan.id} clientId={paypal.clientId} currency={paypal.currency} planId={plan.id} userId={user.id}
            onApproved={approved} onError={(message) => setStatus({ kind: "error", text: message === "paypal" ? c.paypalError : message })} />}
          {summary && !isPro && paypal && user && !plan && <p className={styles.muted}>{c.notConfigured}</p>}
        </div>
      </section>
    </div>

    {status && <p className={`${styles.status} ${styles[status.kind]}`} role={status.kind === "error" ? "alert" : "status"}>{status.text}</p>}

    {summary && <section className={styles.usage} aria-label={c.usageTitle}>
      <div><strong>{c.usageTitle}</strong><span>{c.usageLecture(summary.usage.lecture.used, summary.usage.lecture.limit)}</span></div>
      <div className={styles.meter} aria-hidden="true"><span style={{ transform: `scaleX(${Math.min(1, summary.usage.lecture.used / Math.max(1, summary.usage.lecture.limit))})` }} /></div>
      <small>{c.resets}</small>
    </section>}

    <p className={styles.fineprint}>{c.secure}</p>
  </div>;
}
