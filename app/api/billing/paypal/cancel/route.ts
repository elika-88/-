import { NextResponse } from "next/server";
import { activeSubscriptionId, billingSummary, syncSubscription } from "@/lib/server/billing";
import { cancelSubscription, getSubscription, paypalConfig, PayPalError } from "@/lib/server/paypal";
import { AccountError, getUserFromRequest, requireSameOrigin } from "@/lib/server/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Stops renewal. Pro stays available until the end of the period already paid for.
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: "Sign in first." }, 401);
    const config = paypalConfig();
    if (!config) return json({ error: "PayPal is not configured on this server." }, 503);
    const id = await activeSubscriptionId(user.id);
    if (!id) return json({ error: "No active subscription to cancel." }, 404);
    const before = await getSubscription(config, id);
    await cancelSubscription(config, id, "Cancelled by the subscriber in Lumina");
    const after = await getSubscription(config, id);
    const latest = after ?? before;
    if (latest) await syncSubscription(config, { ...latest, billing_info: { ...latest.billing_info, next_billing_time: before?.billing_info?.next_billing_time ?? latest.billing_info?.next_billing_time } }, user.id);
    return json(await billingSummary({ key: `user:${user.id}`, userId: user.id, newAnonId: null }));
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    if (error instanceof PayPalError) return json({ error: error.message }, error.status);
    return json({ error: "Could not cancel right now. Try again, or cancel from your PayPal account." }, 503);
  }
}
