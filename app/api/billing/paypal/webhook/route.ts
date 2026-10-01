import { NextResponse } from "next/server";
import { syncSubscription } from "@/lib/server/billing";
import { getSubscription, paypalConfig, verifyWebhook } from "@/lib/server/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookEvent = { id?: string; event_type?: string; resource?: { id?: string; billing_agreement_id?: string } };

// PayPal calls this for renewals, cancellations and payment failures. The event is
// verified with PayPal, then the subscription is re-read so state comes from PayPal only.
export async function POST(request: Request) {
  const config = paypalConfig();
  if (!config?.webhookId) return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: "Too large." }, { status: 413 });
  let event: WebhookEvent;
  try { event = JSON.parse(raw) as WebhookEvent; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  try {
    if (!await verifyWebhook(config, request.headers, event)) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    const type = event.event_type ?? "";
    const subscriptionId = type.startsWith("BILLING.SUBSCRIPTION.") ? event.resource?.id
      : type.startsWith("PAYMENT.SALE.") ? event.resource?.billing_agreement_id : undefined;
    if (subscriptionId) {
      const subscription = await getSubscription(config, subscriptionId);
      if (subscription) await syncSubscription(config, subscription);
    }
    return NextResponse.json({ received: true });
  } catch {
    // A non-2xx response makes PayPal retry the delivery later.
    return NextResponse.json({ error: "Temporarily unavailable." }, { status: 503 });
  }
}
