import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { assertAllowance, billingSummary, BillingError, initializeBillingTables, recordUsage, syncSubscription, type Subject } from '@/lib/server/billing';
import { paypalConfig } from '@/lib/server/paypal';
import { withDatabase } from '@/lib/server/database';
import { POST as webhook } from '@/app/api/billing/paypal/webhook/route';

let directory = '';
const userId = '11111111-1111-4111-8111-111111111111';
const user: Subject = { key: `user:${userId}`, userId, newAnonId: null };
const anon: Subject = { key: 'anon:0123456789abcdef0123456789abcdef', userId: null, newAnonId: null };
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lumina-billing-'));
  vi.stubEnv('ADMIN_DATABASE_PATH', join(directory, 'test.sqlite'));
  vi.stubEnv('TURSO_DATABASE_URL', ''); vi.stubEnv('TURSO_AUTH_TOKEN', ''); vi.stubEnv('VERCEL', '');
  vi.stubEnv('PAYPAL_ENV', 'sandbox');
  vi.stubEnv('PAYPAL_CLIENT_ID', 'client-id');
  vi.stubEnv('PAYPAL_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('PAYPAL_WEBHOOK_ID', 'WH-TEST');
  vi.stubEnv('PAYPAL_PLAN_MONTHLY_ID', 'P-MONTHLY');
  vi.stubEnv('PAYPAL_PLAN_YEARLY_ID', 'P-YEARLY');
  await withDatabase(async (db) => {
    await initializeBillingTables(db);
    await db.execute({ sql: 'INSERT INTO app_users (id, username, username_key, email, email_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [userId, 'mao', 'mao', 'mao@example.com', 'mao@example.com', 'x', new Date().toISOString()] });
  });
});
afterEach(async () => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  try { await rm(directory, { recursive: true, force: true }); } catch { /* Windows may hold SQLite briefly. */ }
});

const subscription = (patch: Record<string, unknown> = {}) => ({ id: 'I-ABCDEFGH', status: 'ACTIVE', plan_id: 'P-MONTHLY', custom_id: userId, billing_info: { next_billing_time: new Date(Date.now() + 30 * DAY).toISOString() }, ...patch });

describe('plan limits', () => {
  it('limits free use per day and keeps exam prep and long lectures for Pro', async () => {
    for (let i = 0; i < 3; i++) { await assertAllowance(anon, 'lecture'); await recordUsage(anon, 'lecture'); }
    await expect(assertAllowance(anon, 'lecture')).rejects.toMatchObject({ code: 'PLAN_LIMIT', status: 429 });
    await expect(assertAllowance(user, 'prep')).rejects.toMatchObject({ code: 'PRO_REQUIRED' });
    await expect(assertAllowance(user, 'lecture', { characters: 25_000 })).rejects.toBeInstanceOf(BillingError);
    const summary = await billingSummary(anon);
    expect(summary).toMatchObject({ plan: 'free', usage: { lecture: { used: 3, limit: 3 } } });
    expect(summary.paypal?.plans.monthly?.id).toBe('P-MONTHLY');
  });

  it('grants Pro for an active subscription owned by the user and a configured plan', async () => {
    const config = paypalConfig()!;
    expect(await syncSubscription(config, subscription({ custom_id: 'someone-else' }))).toMatchObject({ applied: false });
    expect(await syncSubscription(config, subscription({ plan_id: 'P-UNKNOWN' }))).toMatchObject({ applied: false });
    expect(await syncSubscription(config, subscription())).toMatchObject({ applied: true });
    await expect(assertAllowance(user, 'prep', { questions: 15 })).resolves.toBe('pro');
    await expect(assertAllowance(user, 'lecture', { characters: 50_000 })).resolves.toBe('pro');
    expect((await billingSummary(user)).subscription).toMatchObject({ status: 'ACTIVE', interval: 'monthly', cancelled: false });
  });

  it('keeps Pro after cancelling until the paid period ends', async () => {
    const config = paypalConfig()!;
    await syncSubscription(config, subscription());
    await syncSubscription(config, subscription({ status: 'CANCELLED', billing_info: {} }));
    expect((await billingSummary(user)).plan).toBe('pro');
    expect((await billingSummary(user, Date.now() + 31 * DAY)).plan).toBe('free');
  });
});

describe('PayPal webhook', () => {
  function paypalFetch(verification: string) {
    return vi.fn(async (url: string) => {
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
      if (url.endsWith('/verify-webhook-signature')) return Response.json({ verification_status: verification });
      if (url.includes('/v1/billing/subscriptions/I-ABCDEFGH')) return Response.json(subscription());
      return new Response('not found', { status: 404 });
    });
  }
  const delivery = () => new Request('http://localhost/api/billing/paypal/webhook', { method: 'POST', body: JSON.stringify({ id: 'WH-1', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-ABCDEFGH' } }) });

  it('rejects deliveries PayPal does not verify', async () => {
    vi.stubGlobal('fetch', paypalFetch('FAILURE'));
    expect((await webhook(delivery())).status).toBe(400);
    expect((await billingSummary(user)).plan).toBe('free');
  });

  it('syncs the subscription from PayPal after a verified event', async () => {
    vi.stubGlobal('fetch', paypalFetch('SUCCESS'));
    expect((await webhook(delivery())).status).toBe(200);
    expect((await billingSummary(user)).plan).toBe('pro');
  });
});
