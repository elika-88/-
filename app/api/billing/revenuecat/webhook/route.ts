import { z } from 'zod';
import { revenueCatConfig, syncRevenueCat, validRevenueCatWebhook } from '@/lib/server/revenuecat';
import { AccountError, readAccountJson } from '@/lib/server/user-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const Event = z.object({ event: z.object({
  type: z.string(), app_user_id: z.string().max(200).optional(),
  environment: z.enum(['SANDBOX', 'PRODUCTION']).optional(),
  transferred_from: z.array(z.string().max(200)).max(10).optional(),
  transferred_to: z.array(z.string().max(200)).max(10).optional(),
}) });

export async function POST(request: Request) {
  const config = revenueCatConfig();
  if (config.webhookToken.length < 32) return Response.json({ error: 'Webhook not configured.' }, { status: 503 });
  if (!validRevenueCatWebhook(request.headers.get('authorization'), config)) return Response.json({ error: 'Invalid authorization.' }, { status: 401 });
  try {
    const parsed = Event.safeParse(await readAccountJson(request, 64 * 1024));
    if (!parsed.success) return Response.json({ error: 'Invalid event.' }, { status: 400 });
    const event = parsed.data.event;
    if (event.type === 'TEST') return Response.json({ received: true });
    if (event.environment && (event.environment === 'SANDBOX') !== config.sandbox) return Response.json({ received: true, ignored: 'environment' });
    const ids = event.type === 'TRANSFER' ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])] : [event.app_user_id];
    const users = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!users.length) return Response.json({ error: 'Missing customer.' }, { status: 400 });
    // Re-read authoritative state instead of trusting the event's entitlement or expiry.
    // Repeated and out-of-order events are safe: the newest API snapshot wins in SQL.
    const results = await Promise.allSettled(users.map(id => syncRevenueCat(id, config)));
    if (results.some(result => result.status === 'rejected')) return Response.json({ error: 'Retry delivery later.' }, { status: 503 });
    return Response.json({ received: true });
  } catch (error) {
    return Response.json({ error: error instanceof AccountError ? error.message : 'Retry delivery later.' }, { status: error instanceof AccountError ? error.status : 503 });
  }
}
