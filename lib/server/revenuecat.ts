import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BillingInterval, PaidPlanId } from '@/lib/billing/plans';
import { withDatabase } from './database';
import { initializeUserTables } from './user-auth';

export class RevenueCatError extends Error {
  constructor(message: string, public readonly status = 503) { super(message); }
}

export function revenueCatConfig() {
  const value = (name: string) => process.env[name]?.trim() ?? '';
  const products = {
    basic: { monthly: value('REVENUECAT_PRODUCT_BASIC_MONTHLY'), yearly: value('REVENUECAT_PRODUCT_BASIC_YEARLY') },
    pro: { monthly: value('REVENUECAT_PRODUCT_PRO_MONTHLY'), yearly: value('REVENUECAT_PRODUCT_PRO_YEARLY') },
  };
  return {
    publicApiKey: value('REVENUECAT_PUBLIC_API_KEY'),
    secretApiKey: value('REVENUECAT_SECRET_API_KEY'),
    webhookToken: value('REVENUECAT_WEBHOOK_AUTH_TOKEN'),
    sandbox: value('REVENUECAT_ENV') === 'sandbox',
    offeringId: value('REVENUECAT_OFFERING_ID') || 'default',
    entitlements: { basic: value('REVENUECAT_ENTITLEMENT_BASIC') || 'basic', pro: value('REVENUECAT_ENTITLEMENT_PRO') || 'pro' },
    products,
  };
}
export type RevenueCatConfig = ReturnType<typeof revenueCatConfig>;

export function revenueCatSetupIssues(config = revenueCatConfig()) {
  const issues: string[] = [];
  // Web Billing (Stripe) keys start with rcb_; a Paddle web config issues its own public key.
  // Either works with purchases-js, but a secret key must never reach the browser.
  if (!/^[A-Za-z0-9]+_[A-Za-z0-9_]{8,}$/.test(config.publicApiKey) || config.publicApiKey.startsWith('sk_')) issues.push('REVENUECAT_PUBLIC_API_KEY (public Web SDK key of the Web Billing or Paddle config)');
  if (config.publicApiKey.startsWith('rcb_') && config.publicApiKey.startsWith('rcb_sb_') !== config.sandbox) issues.push('REVENUECAT_ENV must match the public key environment');
  if (!config.secretApiKey.startsWith('sk_')) issues.push('REVENUECAT_SECRET_API_KEY (secret API v1 key)');
  if (config.webhookToken.length < 32) issues.push('REVENUECAT_WEBHOOK_AUTH_TOKEN (at least 32 characters)');
  for (const tier of ['basic', 'pro'] as const) for (const interval of ['monthly', 'yearly'] as const) {
    if (!config.products[tier][interval]) issues.push(`REVENUECAT_PRODUCT_${tier.toUpperCase()}_${interval.toUpperCase()}`);
  }
  const ids = Object.values(config.products).flatMap(v => Object.values(v)).filter(Boolean);
  if (new Set(ids).size !== ids.length) issues.push('RevenueCat product identifiers must be unique');
  if (config.entitlements.basic === config.entitlements.pro) issues.push('RevenueCat entitlement identifiers must be different');
  return issues;
}

export function publicRevenueCatConfig(config = revenueCatConfig()) {
  if (revenueCatSetupIssues(config).length) return null;
  return { publicApiKey: config.publicApiKey, offeringId: config.offeringId, products: config.products, sandbox: config.sandbox };
}

export async function initializeRevenueCatTables(db: import('@libsql/client').Client) {
  await initializeUserTables(db);
  await db.execute(`CREATE TABLE IF NOT EXISTS revenuecat_memberships (
    user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL, status TEXT NOT NULL, billing_interval TEXT,
    paid_through INTEGER, next_billing_at INTEGER, management_url TEXT,
    environment TEXT NOT NULL, checked_at INTEGER NOT NULL
  )`);
}

const dateString = z.string().refine(v => Number.isFinite(Date.parse(v)));
const Entitlement = z.object({ product_identifier: z.string(), expires_date: dateString.nullable(), grace_period_expires_date: dateString.nullable().optional() });
const Subscription = z.object({
  is_sandbox: z.boolean(), expires_date: dateString.nullable(),
  grace_period_expires_date: dateString.nullable().optional(),
  unsubscribe_detected_at: dateString.nullable().optional(),
  refunded_at: dateString.nullable().optional(),
});
const SubscriberResponse = z.object({
  request_date_ms: z.number().int().positive(),
  subscriber: z.object({
    entitlements: z.record(z.string(), Entitlement),
    subscriptions: z.record(z.string(), Subscription),
    management_url: z.string().nullable().optional(),
  }),
});

function managementURL(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    // RevenueCat/Stripe Web Billing portals, and Paddle's customer portal (customer-portal.paddle.com).
    const allowed = ['revenuecat.com', 'stripe.com', 'paddle.com'];
    return url.protocol === 'https:' && !url.username && !url.password && allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;
  } catch { return null; }
}

export async function syncRevenueCat(userId: string, config = revenueCatConfig()) {
  if (!config.secretApiKey) throw new RevenueCatError('RevenueCat verification is not configured.');
  const known = await withDatabase(async db => {
    await initializeUserTables(db);
    return Boolean((await db.execute({ sql: 'SELECT id FROM app_users WHERE id=?', args: [userId] })).rows[0]);
  });
  if (!known) return { applied: false };
  // The identity always comes from our session or an authenticated webhook, never a checkout body.
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${config.secretApiKey}`, Accept: 'application/json' },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
  });
  // A customer who has never purchased can legitimately be absent from the
  // subscriber endpoint. Treat that as an empty account so first checkout can
  // proceed; all other upstream failures remain fail-closed.
  if (response.status === 404) return { applied: true, active: false };
  if (!response.ok) throw new RevenueCatError('RevenueCat could not verify this subscription. Do not pay again; retry syncing later.');
  const parsed = SubscriberResponse.safeParse(await response.json());
  if (!parsed.success) throw new RevenueCatError('RevenueCat returned an invalid subscription response. Retry syncing later.');
  const { subscriber, request_date_ms: checkedAt } = parsed.data;
  let membership: { tier: PaidPlanId; interval: BillingInterval; expires: number; cancelled: boolean } | null = null;
  for (const tier of ['pro', 'basic'] as const) {
    const entitlement = subscriber.entitlements[config.entitlements[tier]];
    if (!entitlement) continue;
    const productId = entitlement.product_identifier;
    const interval = (['monthly', 'yearly'] as const).find(period => config.products[tier][period] === productId);
    const subscription = subscriber.subscriptions[productId];
    if (!interval || !subscription || subscription.is_sandbox !== config.sandbox || subscription.refunded_at) continue;
    const expiry = Math.max(Date.parse(entitlement.expires_date ?? '') || 0, Date.parse(entitlement.grace_period_expires_date ?? '') || 0);
    const subscriptionExpiry = Math.max(Date.parse(subscription.expires_date ?? '') || 0, Date.parse(subscription.grace_period_expires_date ?? '') || 0);
    const expires = Math.min(expiry, subscriptionExpiry);
    if (expires <= Math.max(Date.now(), checkedAt)) continue;
    membership = { tier, interval, expires, cancelled: Boolean(subscription.unsubscribe_detected_at) };
    break;
  }
  await withDatabase(async db => {
    await initializeRevenueCatTables(db);
    await db.execute({
      sql: `INSERT INTO revenuecat_memberships VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET tier=excluded.tier, status=excluded.status,
          billing_interval=excluded.billing_interval, paid_through=excluded.paid_through,
          next_billing_at=excluded.next_billing_at, management_url=excluded.management_url,
          environment=excluded.environment, checked_at=excluded.checked_at
        WHERE excluded.checked_at >= revenuecat_memberships.checked_at`,
      args: [userId, membership?.tier ?? 'free', membership ? membership.cancelled ? 'CANCELLED' : 'ACTIVE' : 'EXPIRED',
        membership?.interval ?? null, membership?.expires ?? null, membership && !membership.cancelled ? membership.expires : null,
        managementURL(subscriber.management_url), config.sandbox ? 'sandbox' : 'production', checkedAt],
    });
  });
  return { applied: true, active: Boolean(membership) };
}

export function validRevenueCatWebhook(authorization: string | null, config = revenueCatConfig()) {
  if (config.webhookToken.length < 32 || !authorization) return false;
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(authorization), hash(`Bearer ${config.webhookToken}`));
}
