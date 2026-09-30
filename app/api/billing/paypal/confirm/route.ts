import { NextResponse } from "next/server";
import { z } from "zod";
import { activeSubscriptionId, billingSummary, syncSubscription } from "@/lib/server/billing";
import { cancelSubscription, getSubscription, paypalConfig, PayPalError, planForPayPalId } from "@/lib/server/paypal";
import { AccountError, getUserFromRequest, readAccountJson, requireSameOrigin } from "@/lib/server/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BodySchema = z.strictObject({ subscriptionId: z.string().regex(/^I-[A-Z0-9]{6,40}$/) });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Called after the PayPal button approves a subscription. The server re-reads the
// subscription from PayPal, so the browser cannot claim a plan it did not buy.
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: "Sign in to subscribe." }, 401);
    const config = paypalConfig();
    if (!config) return json({ error: "PayPal is not configured on this server." }, 503);
    const parsed = BodySchema.safeParse(await readAccountJson(request, 2048));
    if (!parsed.success) return json({ error: "Invalid subscription id." }, 400);
    // PayPal activates approved subscriptions within seconds; wait briefly instead of granting early.
    let subscription = await getSubscription(config, parsed.data.subscriptionId);
    for (let attempt = 0; subscription?.status === "APPROVED" && attempt < 4; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      subscription = await getSubscription(config, parsed.data.subscriptionId);
    }
    if (!subscription) return json({ error: "PayPal returned no subscription." }, 502);
    if (subscription.status !== "ACTIVE") return json({ error: `PayPal reports the subscription as ${subscription.status.toLowerCase()}. It will update here automatically once PayPal activates it.` }, 409);
    if (subscription.custom_id !== user.id || !planForPayPalId(config, subscription.plan_id)) return json({ error: "This subscription does not belong to your account or plan." }, 403);
    // Switching tier (e.g. Basic -> Pro): stop the previous subscription so the user is not billed twice.
    const previous = await activeSubscriptionId(user.id);
    if (previous && previous !== subscription.id) await cancelSubscription(config, previous, "Replaced by a new Lumina plan").catch(() => undefined);
    const result = await syncSubscription(config, subscription, user.id, { replace: true });
    if (!result.applied) return json({ error: "This subscription does not belong to your account or plan." }, 403);
    return json(await billingSummary({ key: `user:${user.id}`, userId: user.id, newAnonId: null }));
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    if (error instanceof PayPalError) return json({ error: error.message }, error.status);
    return json({ error: "Could not confirm the subscription. It may still activate shortly; refresh this page." }, 503);
  }
}
