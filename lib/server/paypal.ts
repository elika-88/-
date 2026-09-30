import "server-only";
import { createHash } from "node:crypto";
import type { BillingInterval, PaidPlanId, PlanPrice } from "@/lib/billing/plans";

// Minimal PayPal REST client for Subscriptions. Secrets stay on the server.
export type PayPalConfig = {
  env: "live" | "sandbox";
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookId: string | null;
  currency: string;
  plans: Record<PaidPlanId, Record<BillingInterval, PlanPrice>>;
};

export class PayPalError extends Error {
  constructor(message: string, public readonly status = 502, public readonly code = "PAYPAL_UPSTREAM_ERROR") { super(message); }
}

export function paypalConfig(): PayPalConfig | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const env = process.env.PAYPAL_ENV?.trim() === "sandbox" ? "sandbox" : "live";
  const plan = (id?: string, price?: string) => id?.trim() ? { id: id.trim(), price: price?.trim() || "" } : null;
  return {
    env,
    baseUrl: env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
    clientId,
    clientSecret,
    webhookId: process.env.PAYPAL_WEBHOOK_ID?.trim() || null,
    currency: process.env.PAYPAL_CURRENCY?.trim() || "USD",
    plans: {
      basic: {
        monthly: plan(process.env.PAYPAL_PLAN_BASIC_MONTHLY_ID, process.env.PAYPAL_PRICE_BASIC_MONTHLY),
        yearly: plan(process.env.PAYPAL_PLAN_BASIC_YEARLY_ID, process.env.PAYPAL_PRICE_BASIC_YEARLY),
      },
      pro: {
        monthly: plan(process.env.PAYPAL_PLAN_PRO_MONTHLY_ID, process.env.PAYPAL_PRICE_PRO_MONTHLY),
        yearly: plan(process.env.PAYPAL_PLAN_PRO_YEARLY_ID, process.env.PAYPAL_PRICE_PRO_YEARLY),
      },
    },
  };
}

/** Maps a PayPal plan id back to our tier and interval; unknown plans grant nothing. */
export function planForPayPalId(config: PayPalConfig, planId: string): { tier: PaidPlanId; interval: BillingInterval } | null {
  for (const tier of ["basic", "pro"] as const) {
    for (const interval of ["monthly", "yearly"] as const) {
      if (config.plans[tier][interval]?.id === planId) return { tier, interval };
    }
  }
  return null;
}

let cachedToken: { key: string; value: string; expiresAt: number } | null = null;

async function accessToken(config: PayPalConfig, fetcher: typeof fetch) {
  const key = createHash("sha256").update(`${config.baseUrl}|${config.clientId}|${config.clientSecret}`).digest("hex");
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await fetcher(`${config.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; error?: string; debug_id?: string } | null;
  if (!response.ok || !body?.access_token) {
    const safe = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : undefined;
    // Do not log credentials, Authorization headers, response bodies or tokens.
    console.error("PayPal token request failed", { status: response.status, environment: config.env, error: safe(body?.error), debugId: safe(body?.debug_id ?? response.headers.get("paypal-debug-id")) });
    if (response.status === 401 || body?.error === "invalid_client") {
      throw new PayPalError("PayPal API authentication failed. The site administrator must check the matching Client ID, Secret and environment. This does not mean the payment failed; do not pay again.", 503, "PAYPAL_AUTH_FAILED");
    }
    throw new PayPalError("PayPal is temporarily unavailable for subscription verification. Payment status is unknown; do not pay again.", 503, "PAYPAL_VERIFICATION_UNAVAILABLE");
  }
  cachedToken = { key, value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
  return cachedToken.value;
}

export async function paypalRequest<T>(config: PayPalConfig, path: string, init: { method?: string; body?: unknown; requestId?: string } = {}, fetcher: typeof fetch = fetch): Promise<T | null> {
  const token = await accessToken(config, fetcher);
  const response = await fetcher(`${config.baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (response.status === 404) throw new PayPalError("PayPal could not find this subscription.", 404);
  if (!response.ok) throw new PayPalError(`PayPal request failed (${response.status}).`, 502);
  return body as T;
}

export type PayPalSubscription = {
  id: string;
  status: "APPROVAL_PENDING" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED" | string;
  plan_id: string;
  custom_id?: string;
  billing_info?: { next_billing_time?: string; last_payment?: { time?: string } };
};

export const getSubscription = (config: PayPalConfig, id: string, fetcher?: typeof fetch) =>
  paypalRequest<PayPalSubscription>(config, `/v1/billing/subscriptions/${encodeURIComponent(id)}`, {}, fetcher);

export const cancelSubscription = (config: PayPalConfig, id: string, reason: string, fetcher?: typeof fetch) =>
  paypalRequest<null>(config, `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { reason: reason.slice(0, 127) } }, fetcher);

/** Asks PayPal to verify a webhook delivery. Requires PAYPAL_WEBHOOK_ID. */
export async function verifyWebhook(config: PayPalConfig, headers: Headers, event: unknown, fetcher?: typeof fetch) {
  if (!config.webhookId) throw new PayPalError("PAYPAL_WEBHOOK_ID is not configured.", 503);
  const header = (name: string) => headers.get(name) ?? "";
  const result = await paypalRequest<{ verification_status?: string }>(config, "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: header("paypal-auth-algo"),
      cert_url: header("paypal-cert-url"),
      transmission_id: header("paypal-transmission-id"),
      transmission_sig: header("paypal-transmission-sig"),
      transmission_time: header("paypal-transmission-time"),
      webhook_id: config.webhookId,
      webhook_event: event,
    },
  }, fetcher);
  return result?.verification_status === "SUCCESS";
}
