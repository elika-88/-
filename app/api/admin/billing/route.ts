import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validAdminSession } from '@/lib/server/admin-db';
import { readBillingChannels, setBillingChannel } from '@/lib/server/billing-channels';
import { paypalConfig } from '@/lib/server/paypal';
import { revenueCatConfig, revenueCatSetupIssues } from '@/lib/server/revenuecat';
import { AccountError, readAccountJson } from '@/lib/server/user-auth';
import { requireAdminOrigin } from '@/lib/server/admin-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const authorized = (request: NextRequest) => validAdminSession(request.cookies.get('lumina_admin')?.value ?? '');
function readiness() {
  const paypal = paypalConfig();
  const paypalIssues = !paypal ? ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'] : [
    ...(!paypal.webhookId ? ['PAYPAL_WEBHOOK_ID'] : []),
    ...(!Object.values(paypal.plans).some(periods => Object.values(periods).some(Boolean)) ? ['PAYPAL_PLAN_*_ID'] : []),
  ];
  return { paypal: { issues: paypalIssues, environment: paypal?.env ?? 'live' }, revenuecat: { issues: revenueCatSetupIssues(), environment: revenueCatConfig().sandbox ? 'sandbox' : 'production' } };
}
async function view() { return { channels: await readBillingChannels(), readiness: readiness() }; }

export async function GET(request: NextRequest) {
  try {
    if (!await authorized(request)) return json({ error: 'Please log in as administrator.' }, 401);
    return json(await view());
  } catch { return json({ error: 'Could not read subscription settings.' }, 503); }
}

export async function PATCH(request: NextRequest) {
  try {
    requireAdminOrigin(request);
    if (!await authorized(request)) return json({ error: 'Please log in as administrator.' }, 401);
    const body = z.strictObject({ channel: z.enum(['paypal', 'revenuecat']), enabled: z.boolean(), revision: z.number().int().min(0) }).safeParse(await readAccountJson(request, 2048));
    if (!body.success) return json({ error: 'Invalid subscription settings.' }, 400);
    const { channel, enabled, revision } = body.data;
    const issues = readiness()[channel].issues;
    if (enabled && issues.length) return json({ error: `Configure first: ${issues.join(', ')}` }, 400);
    await setBillingChannel(channel, enabled, revision);
    return json(await view());
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'CONFLICT') return json({ error: 'Another administrator changed these settings. Reload and try again.' }, 409);
    return json({ error: 'Could not update subscription settings.' }, 503);
  }
}
