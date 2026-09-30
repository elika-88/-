import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { billingSummary } from '@/lib/server/billing';
import { readBillingChannels } from '@/lib/server/billing-channels';
import { paypalConfig, paypalRequest } from '@/lib/server/paypal';
import { publicRevenueCatConfig, syncRevenueCat } from '@/lib/server/revenuecat';
import { AccountError, getUserFromRequest, readAccountJson, requireSameOrigin } from '@/lib/server/user-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const Body = z.strictObject({ provider: z.enum(['paypal', 'revenuecat']), tier: z.enum(['basic', 'pro']), interval: z.enum(['monthly', 'yearly']) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Sign in to subscribe.' }, 401);
    const body = Body.safeParse(await readAccountJson(request, 2048));
    if (!body.success) return json({ error: 'Invalid checkout request.' }, 400);
    const { provider, tier, interval } = body.data;
    if (!(await readBillingChannels())[provider]) return json({ error: 'This payment channel is currently closed. Refresh the plans page.', code: 'CHANNEL_DISABLED' }, 403);
    const rc = publicRevenueCatConfig();
    if (provider === 'revenuecat' && !rc) return json({ error: 'RevenueCat is not configured.' }, 503);
    // Also discover paid memberships that have not reached us through a webhook yet.
    if (rc) await syncRevenueCat(user.id);
    const summary = await billingSummary({ key: `user:${user.id}`, userId: user.id, newAnonId: null });
    const active = summary.subscriptions?.filter(sub => sub.status === 'ACTIVE' || (sub.cancelled && (sub.paidThrough ?? 0) > Date.now())) ?? [];
    const upgrade = provider === 'paypal' && tier === 'pro' && active.length === 1 && active[0].provider === 'paypal' && active[0].tier === 'basic' && !active[0].cancelled;
    if (active.length && !upgrade) return json({ error: 'You already have a subscription. Manage it before starting another to avoid duplicate charges.', code: 'ALREADY_SUBSCRIBED' }, 409);
    // Recheck the durable switch immediately before issuing a new checkout.
    if (!(await readBillingChannels())[provider]) return json({ error: 'This payment channel is currently closed.', code: 'CHANNEL_DISABLED' }, 403);
    if (provider === 'revenuecat') return json({ ...rc, appUserId: user.id });
    const config = paypalConfig();
    const plan = config?.plans[tier][interval];
    if (!config || !plan) return json({ error: 'This PayPal plan is not configured.' }, 503);
    const subscription = await paypalRequest<{ id: string }>(config, '/v1/billing/subscriptions', {
      method: 'POST', body: { plan_id: plan.id, custom_id: user.id, application_context: { user_action: 'SUBSCRIBE_NOW' } }, requestId: randomUUID(),
    });
    if (!subscription?.id) return json({ error: 'Could not start checkout. No subscription was confirmed.' }, 503);
    return json({ subscriptionId: subscription.id });
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    return json({ error: 'Could not start checkout. Check your existing subscription before retrying.' }, 503);
  }
}
