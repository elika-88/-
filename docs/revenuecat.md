# RevenueCat Web Billing

LectorAI supports two subscription channels: the existing PayPal integration and RevenueCat Web Billing. They are separate providers. The admin page at `/admin` has independent switches under **订阅渠道 / Subscriptions**.

Turning a switch off is a reversible operational control. It blocks new checkouts at the server, even for an already-open pricing page. It does not remove existing access, erase subscription records, or stop provider webhooks. This prevents an outage or maintenance switch from revoking a paid subscription.

## RevenueCat dashboard setup

1. Create a RevenueCat project and a Web Billing configuration. RevenueCat Web Billing requires a connected Stripe, Paddle, or RevenueCat Billing payment setup; a PayPal Client ID cannot be pasted into RevenueCat.
2. Create four products with stable identifiers matching the Vercel variables below: Basic monthly/yearly and Pro monthly/yearly.
3. Use separate entitlements (`basic` and `pro`), or keep the single entitlement created by onboarding and attach all four products to it. For a shared entitlement, set both `REVENUECAT_ENTITLEMENT_BASIC` and `REVENUECAT_ENTITLEMENT_PRO` to its exact **Identifier**, not its display name. The server still verifies the product identifier to distinguish Basic from Pro; a Basic purchase never grants Pro just because the entitlement is called “LectorAI Pro”. Put all four products in the configured offering, or change `REVENUECAT_OFFERING_ID` to match. The shared mode supports one current subscription per account; use separate entitlements if you need independent overlapping tiers.
4. Copy the Web Billing public SDK key to `REVENUECAT_PUBLIC_API_KEY`. Copy a RevenueCat secret API v1 key to `REVENUECAT_SECRET_API_KEY`. The secret is server-only.
5. In RevenueCat Integrations → Webhooks, add:

   `https://lectorai.tech/api/billing/revenuecat/webhook`

   Set the Authorization header to `Bearer <a random token>`, then put only the random token (without `Bearer `) into `REVENUECAT_WEBHOOK_AUTH_TOKEN`. Keep the token at least 32 characters. Enable HMAC signing if your plan supports it; the current endpoint uses the authorization header and can be extended to HMAC without changing the public checkout flow.

6. Add all variables from `.env.example` to Vercel Production, redeploy, and open `/admin` → **订阅渠道**. The RevenueCat row must show no missing variables before it can be enabled.

## Checkout and verification

The browser uses only the public SDK key and the signed-in account ID. Before opening checkout, the server verifies the channel, account, plan, and duplicate-subscription state. After purchase, the server calls RevenueCat's subscriber API using the secret key. Browser state or a webhook body cannot grant membership.

RevenueCat webhooks are authenticated, environment-filtered, and processed by re-reading the subscriber record. Repeated and out-of-order events are safe because the latest checked snapshot wins. A failed verification returns a retryable error and does not revoke the last verified membership.

Use **同步 RevenueCat 订阅（不重复付款）** on the pricing page to restore an existing purchase. Never pay a second time because a webhook or verification request is delayed.

## Admin switch behavior

The switch is stored in the persistent database with a revision number. Stale admin tabs receive a conflict and must reload. Enabling a provider is allowed only when its server variables pass validation. Disabling is always allowed so an administrator can stop new payments during an incident.
