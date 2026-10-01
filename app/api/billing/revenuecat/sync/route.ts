import { NextResponse } from 'next/server';
import { billingSummary } from '@/lib/server/billing';
import { syncRevenueCat } from '@/lib/server/revenuecat';
import { AccountError, getUserFromRequest, requireSameOrigin } from '@/lib/server/user-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Restoration remains available even when new RevenueCat purchases are disabled.
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Sign in to restore your subscription.' }, 401);
    await syncRevenueCat(user.id);
    return json(await billingSummary({ key: `user:${user.id}`, userId: user.id, newAnonId: null }));
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    return json({ error: 'Subscription verification is unavailable. If you have paid, do not pay again. Retry syncing later.' }, 503);
  }
}
