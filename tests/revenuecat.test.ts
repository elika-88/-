import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/user-auth', async original => ({ ...await original<typeof import('@/lib/server/user-auth')>(), getUserFromRequest: vi.fn(async () => ({ id: 'account-alice' })) }));
import { getUserFromRequest } from '@/lib/server/user-auth';
import { withDatabase } from '@/lib/server/database';
import { initializeBillingTables, billingSummary, syncSubscription } from '@/lib/server/billing';
import { loginAdmin } from '@/lib/server/admin-db';
import { readBillingChannels, setBillingChannel } from '@/lib/server/billing-channels';
import { revenueCatConfig, revenueCatSetupIssues, syncRevenueCat } from '@/lib/server/revenuecat';
import { paypalConfig } from '@/lib/server/paypal';
import { GET as adminGet, PATCH as adminPatch } from '@/app/api/admin/billing/route';
import { POST as webhook } from '@/app/api/billing/revenuecat/webhook/route';
import { POST as restore } from '@/app/api/billing/revenuecat/sync/route';
import { POST as checkout } from '@/app/api/billing/checkout/route';

const userId = 'account-alice';
const subject = { key: `user:${userId}`, userId, newAnonId: null };
const future = () => new Date(Date.now() + 30 * 86400000).toISOString();
let directory = '';
let now = 0;
function snapshot(tier: 'basic' | 'pro' | null = 'pro', overrides: Record<string, unknown> = {}) {
  const product = `${tier}_monthly`;
  return { request_date_ms: now, subscriber: {
    entitlements: tier ? { [tier]: { product_identifier: product, expires_date: future() } } : {},
    subscriptions: tier ? { [product]: { expires_date: future(), is_sandbox: false, unsubscribe_detected_at: null, ...overrides } } : {},
    management_url: 'https://billing.stripe.com/p/session',
  } };
}
function mockSnapshot(data = snapshot()) { const fetcher = vi.fn(async () => Response.json(data)); vi.stubGlobal('fetch', fetcher); return fetcher; }
function request(path: string, body: unknown = {}, headers: Record<string, string> = {}, method = 'POST') {
  return new NextRequest(`http://localhost${path}`, { method, headers: { Origin: 'http://localhost', 'Content-Type': 'application/json', ...headers }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
}
const event = (type = 'RENEWAL', extra: Record<string, unknown> = {}) => request('/api/billing/revenuecat/webhook', { event: { type, app_user_id: userId, environment: 'PRODUCTION', ...extra } }, { Authorization: `Bearer ${'w'.repeat(40)}` });

beforeEach(async () => {
  now = Date.now();
  directory = await mkdtemp(join(tmpdir(), 'lector-rc-'));
  const env = {
    ADMIN_DATABASE_PATH: join(directory, 'test.sqlite'), TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '', VERCEL: '',
    ADMIN_PASSWORD: 'test-admin-password', ADMIN_ENCRYPTION_KEY: 'ab'.repeat(32),
    PAYPAL_CLIENT_ID: 'client', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_WEBHOOK_ID: 'WH-TEST', PAYPAL_ENV: 'sandbox',
    PAYPAL_PLAN_BASIC_MONTHLY_ID: 'P-BASIC', PAYPAL_PLAN_PRO_MONTHLY_ID: 'P-PRO',
    REVENUECAT_ENV: 'production', REVENUECAT_PUBLIC_API_KEY: 'rcb_publicTest', REVENUECAT_SECRET_API_KEY: 'sk_serverTest',
    REVENUECAT_WEBHOOK_AUTH_TOKEN: 'w'.repeat(40), REVENUECAT_ENTITLEMENT_BASIC: 'basic', REVENUECAT_ENTITLEMENT_PRO: 'pro',
    REVENUECAT_PRODUCT_BASIC_MONTHLY: 'basic_monthly', REVENUECAT_PRODUCT_BASIC_YEARLY: 'basic_yearly',
    REVENUECAT_PRODUCT_PRO_MONTHLY: 'pro_monthly', REVENUECAT_PRODUCT_PRO_YEARLY: 'pro_yearly',
  };
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.mocked(getUserFromRequest).mockResolvedValue({ id: userId } as Awaited<ReturnType<typeof getUserFromRequest>>);
  await withDatabase(async db => {
    await initializeBillingTables(db);
    for (const id of [userId, 'account-bob']) await db.execute({ sql: 'INSERT INTO app_users (id, username, username_key, email, email_key, password_hash, created_at) VALUES (?,?,?,?,?,?,?)', args: [id, id, id, `${id}@example.invalid`, `${id}@example.invalid`, 'x', new Date().toISOString()] });
  });
});
afterEach(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true }).catch(() => undefined);
});

describe('channel controls', () => {
  it('defaults to PayPal on with RevenueCat off; persists revisions and rejects stale writes', async () => {
    expect(await readBillingChannels()).toEqual({ paypal: true, revenuecat: false, revision: 0 });
    await setBillingChannel('paypal', false, 0);
    await expect(setBillingChannel('revenuecat', true, 0)).rejects.toThrow('CONFLICT');
    expect(await readBillingChannels()).toEqual({ paypal: false, revenuecat: false, revision: 1 });
  });
  it('requires admin auth and same-origin; never returns secret credentials', async () => {
    expect((await adminGet(request('/api/admin/billing', {}, {}, 'GET'))).status).toBe(401);
    expect((await adminPatch(request('/api/admin/billing', {}, { Origin: 'https://evil.invalid' }, 'PATCH'))).status).toBe(403);
    const session = await loginAdmin('test-admin-password');
    if (!('token' in session)) throw new Error('login failed');
    const response = await adminGet(request('/api/admin/billing', {}, { Cookie: `lumina_admin=${session.token}` }, 'GET'));
    const raw = await response.text(); expect(response.status).toBe(200); expect(raw).not.toContain('sk_serverTest'); expect(raw).not.toContain('w'.repeat(40));
    const changed = await adminPatch(request('/api/admin/billing', { channel: 'revenuecat', enabled: true, revision: 0 }, { Cookie: `lumina_admin=${session.token}` }, 'PATCH'));
    expect(changed.status).toBe(200); expect((await changed.json()).channels.revenuecat).toBe(true);
    expect((await adminPatch(request('/api/admin/billing', { channel: 'paypal', enabled: false, revision: 0 }, { Cookie: `lumina_admin=${session.token}` }, 'PATCH'))).status).toBe(409);
  });
  it('blocks enabling an unconfigured provider but always allows disabling it', async () => {
    const session = await loginAdmin('test-admin-password'); if (!('token' in session)) throw new Error('login');
    vi.stubEnv('REVENUECAT_SECRET_API_KEY', '');
    const headers = { Cookie: `lumina_admin=${session.token}` };
    expect((await adminPatch(request('/api/admin/billing', { channel: 'revenuecat', enabled: true, revision: 0 }, headers, 'PATCH'))).status).toBe(400);
    expect((await adminPatch(request('/api/admin/billing', { channel: 'revenuecat', enabled: false, revision: 0 }, headers, 'PATCH'))).status).toBe(200);
  });
  it('rejects secret SDK keys, environment mismatch and duplicate plan mappings', () => {
    const config = revenueCatConfig(); expect(revenueCatSetupIssues(config)).toEqual([]);
    expect(revenueCatSetupIssues({ ...config, publicApiKey: 'sk_secret' }).length).toBeGreaterThan(0);
    expect(revenueCatSetupIssues({ ...config, publicApiKey: 'rcb_sb_test' }).length).toBeGreaterThan(0);
    config.products.pro.monthly = config.products.basic.monthly;
    expect(revenueCatSetupIssues(config)).toContain('RevenueCat product identifiers must be unique');
  });
});

describe('RevenueCat authoritative membership', () => {
  it.each([
    ['basic', 'monthly'], ['basic', 'yearly'], ['pro', 'monthly'], ['pro', 'yearly'],
  ] as const)('maps a shared entitlement to %s %s by verified product ID', async (tier, interval) => {
    vi.stubEnv('REVENUECAT_ENTITLEMENT_BASIC', 'lector_access');
    vi.stubEnv('REVENUECAT_ENTITLEMENT_PRO', 'lector_access');
    expect(revenueCatSetupIssues()).toEqual([]);
    const product = `${tier}_${interval}`;
    const data = snapshot(tier);
    data.subscriber.entitlements = { lector_access: { product_identifier: product, expires_date: future() } };
    data.subscriber.subscriptions = { [product]: { expires_date: future(), is_sandbox: false, unsubscribe_detected_at: null } };
    mockSnapshot(data);
    await syncRevenueCat(userId);
    expect(await billingSummary(subject)).toMatchObject({ plan: tier, subscription: { tier, interval } });
  });
  it('does not grant a shared entitlement for an unmapped product', async () => {
    vi.stubEnv('REVENUECAT_ENTITLEMENT_BASIC', 'lector_access');
    vi.stubEnv('REVENUECAT_ENTITLEMENT_PRO', 'lector_access');
    const data = snapshot();
    data.subscriber.entitlements = { lector_access: { product_identifier: 'foreign', expires_date: future() } };
    data.subscriber.subscriptions = { foreign: { expires_date: future(), is_sandbox: false, unsubscribe_detected_at: null } };
    mockSnapshot(data); await syncRevenueCat(userId);
    expect((await billingSummary(subject)).plan).toBe('free');
  });
  it('grants the server-verified tier and expires it without a webhook', async () => {
    mockSnapshot(); await syncRevenueCat(userId);
    expect((await billingSummary(subject)).plan).toBe('pro');
    expect((await billingSummary(subject, Date.now() + 31 * 86400000)).plan).toBe('free');
  });
  it('keeps provider management links for RevenueCat Web Billing backed by Paddle', async () => {
    const data = snapshot();
    data.subscriber.management_url = 'https://customer-portal.paddle.com/session/test';
    mockSnapshot(data); await syncRevenueCat(userId);
    expect((await billingSummary(subject)).subscription?.managementUrl).toBe(data.subscriber.management_url);
    const unsafe = snapshot();
    unsafe.request_date_ms = now + 1;
    unsafe.subscriber.management_url = 'https://evil.invalid/session';
    mockSnapshot(unsafe); await syncRevenueCat(userId);
    expect((await billingSummary(subject)).subscription?.managementUrl).toBeNull();
  });
  it('keeps cancellation access only until the paid period ends', async () => {
    mockSnapshot(snapshot('basic', { unsubscribe_detected_at: new Date(now).toISOString() })); await syncRevenueCat(userId);
    const summary = await billingSummary(subject); expect(summary.plan).toBe('basic'); expect(summary.subscription?.cancelled).toBe(true);
  });
  it.each([{ is_sandbox: true }, { refunded_at: new Date(1).toISOString() }, { expires_date: new Date(1).toISOString() }])('does not grant access for an ineligible subscription %o', async patch => {
    mockSnapshot(snapshot('pro', patch)); await syncRevenueCat(userId); expect((await billingSummary(subject)).plan).toBe('free');
  });
  it('rejects unknown products and entitlements', async () => {
    const data = snapshot(); data.subscriber.entitlements.pro.product_identifier = 'foreign_product';
    mockSnapshot(data); await syncRevenueCat(userId); expect((await billingSummary(subject)).plan).toBe('free');
  });
  it('keeps a paid membership when verification fails; malformed snapshots never revoke it', async () => {
    mockSnapshot(); await syncRevenueCat(userId);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 401 })));
    await expect(syncRevenueCat(userId)).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ subscriber: {} })));
    await expect(syncRevenueCat(userId)).rejects.toThrow(); expect((await billingSummary(subject)).plan).toBe('pro');
  });
  it('revokes refunded or expired access, but does not overwrite newer snapshots', async () => {
    mockSnapshot(); await syncRevenueCat(userId);
    const expired = snapshot(null); expired.request_date_ms = now - 1000;
    mockSnapshot(expired); await syncRevenueCat(userId); expect((await billingSummary(subject)).plan).toBe('pro');
    expired.request_date_ms = now + 1; mockSnapshot(expired); await syncRevenueCat(userId); expect((await billingSummary(subject)).plan).toBe('free');
  });
  it('does not create phantom users or query RevenueCat for strangers', async () => {
    const fetcher = mockSnapshot(); expect(await syncRevenueCat('unknown')).toEqual({ applied: false }); expect(fetcher).not.toHaveBeenCalled();
  });

  it('accepts a Paddle-backed RevenueCat Web Billing public key', () => {
    vi.stubEnv('REVENUECAT_PUBLIC_API_KEY', 'pdl_live_web_key');
    expect(revenueCatSetupIssues()).not.toContain('REVENUECAT_PUBLIC_API_KEY (RevenueCat Web Billing public SDK key)');
  });
  it('retains PayPal separately and chooses the highest paid tier even when channels close', async () => {
    await syncSubscription(paypalConfig()!, { id: 'I-PAYPAL01', status: 'ACTIVE', plan_id: 'P-BASIC', custom_id: userId, billing_info: { next_billing_time: future() } });
    mockSnapshot(); await syncRevenueCat(userId); await setBillingChannel('paypal', false, 0);
    const summary = await billingSummary(subject); expect(summary.plan).toBe('pro'); expect(summary.paypal).toBeNull(); expect(summary.revenuecat).toBeNull(); expect(summary.subscriptions).toHaveLength(2);
    mockSnapshot(snapshot(null)); await syncRevenueCat(userId); expect((await billingSummary(subject)).plan).toBe('basic');
  });
  it('ignores sandbox cached access after switching to production', async () => {
    vi.stubEnv('REVENUECAT_ENV', 'sandbox'); mockSnapshot(snapshot('pro', { is_sandbox: true })); await syncRevenueCat(userId);
    expect((await billingSummary(subject)).plan).toBe('pro'); vi.stubEnv('REVENUECAT_ENV', 'production'); expect((await billingSummary(subject)).plan).toBe('free');
  });
});

describe('webhooks and restore', () => {
  it('rejects unauthorized delivery before network or database changes', async () => {
    const fetcher = mockSnapshot(); expect((await webhook(request('/api/billing/revenuecat/webhook', { event: {} }))).status).toBe(401); expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts authenticated test deliveries without granting access', async () => {
    const fetcher = mockSnapshot(); expect((await webhook(event('TEST'))).status).toBe(200); expect(fetcher).not.toHaveBeenCalled();
  });
  it('handles duplicates and ignores sandbox deliveries in production', async () => {
    const fetcher = mockSnapshot(); expect((await webhook(event('RENEWAL', { environment: 'SANDBOX' }))).status).toBe(200); expect(fetcher).not.toHaveBeenCalled();
    expect((await webhook(event())).status).toBe(200); expect((await webhook(event())).status).toBe(200); expect((await billingSummary(subject)).plan).toBe('pro');
  });
  it('returns retryable failure on upstream errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect((await webhook(event())).status).toBe(503);
  });
  it('updates both known customers on a transfer', async () => {
    const fetcher = vi.fn(async (url: string) => Response.json(url.endsWith(userId) ? snapshot(null) : snapshot())); vi.stubGlobal('fetch', fetcher);
    expect((await webhook(event('TRANSFER', { transferred_from: [userId], transferred_to: ['account-bob'] }))).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await billingSummary(subject)).plan).toBe('free'); expect((await billingSummary({ ...subject, userId: 'account-bob', key: 'user:account-bob' })).plan).toBe('pro');
  });
  it('restores while disabled, ignores forged body user ids, and requires login', async () => {
    const fetcher = mockSnapshot(); const result = await restore(request('/api/billing/revenuecat/sync', { userId: 'account-bob', tier: 'pro' }));
    expect(result.status).toBe(200); expect((fetcher.mock.calls as unknown[][])[0]?.[0]).toBe(`https://api.revenuecat.com/v1/subscribers/${userId}`);
    vi.mocked(getUserFromRequest).mockResolvedValue(null); expect((await restore(request('/api/billing/revenuecat/sync'))).status).toBe(401);
  });
});

describe('server checkout authorization', () => {
  it('rejects stale-page checkouts after either channel closes without contacting a provider', async () => {
    const fetcher = mockSnapshot(snapshot(null)); await setBillingChannel('paypal', false, 0);
    for (const provider of ['paypal', 'revenuecat']) expect((await checkout(request('/api/billing/checkout', { provider, tier: 'pro', interval: 'monthly' }))).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('authorizes SDK checkout for the session account and only exposes public configuration', async () => {
    mockSnapshot(snapshot(null)); await setBillingChannel('revenuecat', true, 0);
    const response = await checkout(request('/api/billing/checkout', { provider: 'revenuecat', tier: 'pro', interval: 'monthly' }));
    expect(response.status).toBe(200); const data = await response.json(); expect(data.appUserId).toBe(userId); expect(JSON.stringify(data)).not.toContain('sk_serverTest');
  });
  it('prevents duplicate and cross-provider purchases', async () => {
    mockSnapshot(); await setBillingChannel('revenuecat', true, 0);
    for (const provider of ['paypal', 'revenuecat']) expect((await checkout(request('/api/billing/checkout', { provider, tier: 'pro', interval: 'monthly' }))).status).toBe(409);
  });
  it('creates PayPal subscriptions with server-owned identity and plan', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('revenuecat.com')) return Response.json(snapshot(null));
      if (url.includes('/oauth2/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
      expect(JSON.parse(String(init?.body))).toMatchObject({ custom_id: userId, plan_id: 'P-PRO' });
      return Response.json({ id: 'I-NEW00001' });
    }));
    const result = await checkout(request('/api/billing/checkout', { provider: 'paypal', tier: 'pro', interval: 'monthly' }));
    expect(result.status).toBe(200); expect(await result.json()).toEqual({ subscriptionId: 'I-NEW00001' });
  });
});
