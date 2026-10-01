"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import styles from "./billing.module.css";
import type { BillingInterval, PaidPlanId } from '@/lib/billing/plans';

type PayPalButtons = { render: (element: HTMLElement) => Promise<void>; close?: () => Promise<void> };
type PayPalNamespace = {
  Buttons: (options: {
    style?: Record<string, unknown>;
    createSubscription: (data: unknown, actions: { subscription: { create: (input: { plan_id: string; custom_id: string }) => Promise<string> } }) => Promise<string>;
    onApprove: (data: { subscriptionID?: string | null }) => Promise<void> | void;
    onError?: (error: unknown) => void;
    onCancel?: () => void;
  }) => PayPalButtons;
};
declare global { interface Window { paypal?: PayPalNamespace } }

let sdk: { key: string; promise: Promise<PayPalNamespace> } | null = null;

// Loads PayPal's JS SDK once per client id/currency.
function loadPayPal(clientId: string, currency: string) {
  const key = `${clientId}|${currency}`;
  if (sdk?.key === key) return sdk.promise;
  const promise = new Promise<PayPalNamespace>((resolve, reject) => {
    document.querySelectorAll("script[data-lumina-paypal]").forEach((node) => node.remove());
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?${new URLSearchParams({ "client-id": clientId, vault: "true", intent: "subscription", currency, components: "buttons" })}`;
    script.async = true;
    script.dataset.luminaPaypal = "true";
    script.onload = () => window.paypal ? resolve(window.paypal) : reject(new Error("PayPal did not load."));
    script.onerror = () => { sdk = null; reject(new Error("PayPal could not be loaded. Check your connection or ad blocker.")); };
    document.head.appendChild(script);
  });
  sdk = { key, promise };
  return promise;
}

export function PayPalSubscribeButton({ clientId, currency, planId, userId, tier, interval, onApproved, onError }: {
  clientId: string;
  currency: string;
  planId: string;
  userId: string;
  tier: PaidPlanId;
  interval: BillingInterval;
  onApproved: (subscriptionId: string) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onApproved, onError });
  useEffect(() => { callbacks.current = { onApproved, onError }; });

  useEffect(() => {
    let cancelled = false;
    let buttons: PayPalButtons | null = null;
    const element = container.current;
    loadPayPal(clientId, currency).then(async (paypal) => {
      if (cancelled || !element) return;
      element.replaceChildren();
      buttons = paypal.Buttons({
        style: { layout: "vertical", color: "black", shape: "rect", label: "subscribe", height: 44, tagline: false },
        // The server owns the channel switch, plan mapping and account identity.
        createSubscription: async () => {
          const response = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'paypal', tier, interval }), signal: AbortSignal.timeout(45_000) });
          const data = await response.json();
          if (!response.ok || !data.subscriptionId) { callbacks.current.onError(data.error ?? 'Checkout unavailable.'); throw new Error('Checkout unavailable.'); }
          return data.subscriptionId;
        },
        onApprove: async (data) => { if (data.subscriptionID) await callbacks.current.onApproved(data.subscriptionID); },
        onError: () => callbacks.current.onError("paypal"),
      });
      await buttons.render(element);
      if (!cancelled) setReady(true);
    }).catch((error: unknown) => { if (!cancelled) callbacks.current.onError(error instanceof Error ? error.message : "paypal"); });
    return () => { cancelled = true; void buttons?.close?.().catch(() => undefined); };
  }, [clientId, currency, planId, userId, tier, interval]);

  return <div className={styles.paypalSlot} aria-busy={!ready}>
    {!ready && <div className={styles.paypalLoading}><LoaderCircle className="animate-spin" size={16} aria-hidden="true" /></div>}
    <div ref={container} />
  </div>;
}
