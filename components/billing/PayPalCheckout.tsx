"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BillingInterval, PaidPlanId } from "@/lib/billing/plans";
import { LEGAL } from "@/lib/legal";
import { PayPalSubscribeButton } from "./PayPalSubscribeButton";
import styles from "./billing.module.css";

type Props = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  zh: boolean;
  planName: string;
  price: string;
  tier: PaidPlanId;
  interval: BillingInterval;
  paypal: { clientId: string; currency: string; planId: string };
  userId: string;
  onApproved: (subscriptionId: string) => Promise<void> | void;
  onError: (message: string) => void;
};

// PayPal's buttons are light, branded iframes that cannot follow the site theme. Instead of
// embedding them in every plan card, the card shows one of our own buttons and the PayPal
// buttons open in a light checkout sheet with the order summary, in both themes.
export function PayPalCheckout({ open, onOpen, onClose, zh, planName, price, tier, interval, paypal, userId, onApproved, onError }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const period = interval === "monthly" ? (zh ? "每月" : "per month") : (zh ? "每年" : "per year");
  return <>
    <Button type="button" className={styles.fullWidth} onClick={onOpen}>{zh ? `订阅${/^[A-Za-z]/.test(planName) ? " " : ""}${planName}` : `Subscribe to ${planName}`}</Button>
    <dialog ref={dialog} className={styles.checkout} aria-labelledby={`checkout-${tier}`} onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.checkoutBody}>
        <div className={styles.checkoutHead}>
          <div>
            <p className={styles.checkoutKicker}>{zh ? "确认订阅" : "Confirm subscription"}</p>
            <h2 id={`checkout-${tier}`}>{planName} · {interval === "monthly" ? (zh ? "月付" : "Monthly") : (zh ? "年付" : "Yearly")}</h2>
          </div>
          <button type="button" className={styles.checkoutClose} aria-label={zh ? "关闭" : "Close"} onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className={styles.checkoutSummary}>
          <span>{zh ? "应付" : "Total"}</span>
          <strong>{price}<small> {period}</small></strong>
        </div>
        <p className={styles.checkoutNote}>{zh
          ? `自动续费，可随时取消。每次付款后 ${LEGAL.refundDays} 天内可全额退款。`
          : `Renews automatically; cancel any time. Full refund within ${LEGAL.refundDays} days of any payment.`}</p>
        {open && <PayPalSubscribeButton key={paypal.planId} clientId={paypal.clientId} currency={paypal.currency} planId={paypal.planId} userId={userId} tier={tier} interval={interval}
          onApproved={async (id) => { onClose(); await onApproved(id); }} onError={onError} />}
        <p className={styles.checkoutLegal}>{zh ? "继续即表示同意" : "By continuing you agree to the"} <Link href="/terms">{zh ? "服务条款" : "Terms"}</Link>{zh ? "和" : " and "}<Link href="/refund">{zh ? "退款政策" : "Refund policy"}</Link>{zh ? "。" : "."}</p>
      </div>
    </dialog>
  </>;
}
