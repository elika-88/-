# RevenueCat Web Billing

LectorAI supports two subscription channels: the existing PayPal integration and RevenueCat Web Billing. They are separate providers. The admin page at `/admin` has independent switches under **订阅渠道 / Subscriptions**.

Turning a switch off is a reversible operational control. It blocks new checkouts at the server, even for an already-open pricing page. It does not remove existing access, erase subscription records, or stop provider webhooks. This prevents an outage or maintenance switch from revoking a paid subscription.

## RevenueCat dashboard setup (Paddle, for a Kazakhstan seller)

RevenueCat's own Web Billing checkout needs a Stripe account, and Stripe does not onboard businesses registered in Kazakhstan. Lumina's seller is an individual entrepreneur in Kazakhstan, so card payments go through **Paddle**: Paddle is the Merchant of Record (it charges the customer, handles sales tax/VAT, receipts and refunds) and pays out to us. The same purchases-js checkout code opens Paddle's checkout.

1. **Paddle account.** Sign up at paddle.com as an individual seller. Before checkout works, Paddle runs a *domain review* of https://lectorai.tech. The site must show:
   - a product description, the Plans page with prices, and the features of each plan;
   - Terms of Service with the seller's legal name, a Refund Policy and a Privacy Policy, reachable from navigation. They are at `/terms`, `/refund` and `/privacy` (linked in the sidebar, the Plans page and sign-up). **Fill in `lib/legal.ts` first**: name, IIN, address and support email.
   Paddle sandbox (sandbox-vendors.paddle.com) is a separate account; repeat the setup there for testing.
2. **Paddle catalogue.** In Paddle create a product "Lumina Basic" with two prices (monthly 9.90, yearly 95.00 USD) and "Lumina Pro" with two prices (12.90, 124.00). Each Paddle *price* becomes one RevenueCat product.
3. **Paddle API key.** In Paddle → Developer tools → Authentication create an API key with the permissions listed in RevenueCat's Paddle guide, including *Customer portal sessions (write)* so customers get a working "Manage subscription" link.
4. **RevenueCat web config.** In RevenueCat → your project → Web, create a web config for **Paddle** and paste the Paddle API key with *Set secret*. Import the products.
5. **Entitlements and offering.** Create entitlements `basic` and `pro`, attach the matching products, and put all four in the current offering (or set `REVENUECAT_OFFERING_ID`). Copy each product identifier into `REVENUECAT_PRODUCT_*`.
6. **Keys.** Copy the Paddle web config's **public** API key to `REVENUECAT_PUBLIC_API_KEY` and a RevenueCat secret API v1 key (`sk_…`) to `REVENUECAT_SECRET_API_KEY`. The secret is server-only.
7. **Webhook.** In RevenueCat Integrations → Webhooks, add

   `https://lectorai.tech/api/billing/revenuecat/webhook`

   Set the Authorization header to `Bearer <a random token>`, then put only the random token (without `Bearer `) into `REVENUECAT_WEBHOOK_AUTH_TOKEN`. Keep the token at least 32 characters.
8. Add all variables from `.env.example` to Vercel Production, redeploy, and open `/admin` → **订阅渠道**. The RevenueCat row must show no missing variables before it can be enabled. Customers see this channel as **Card**.

Set up payouts in Paddle (Business account → Payouts) and confirm which payout methods Paddle offers for Kazakhstan before going live.

## Checkout and verification

The browser uses only the public SDK key and the signed-in account ID. Before opening checkout, the server verifies the channel, account, plan, and duplicate-subscription state. After purchase, the server calls RevenueCat's subscriber API using the secret key. Browser state or a webhook body cannot grant membership.

RevenueCat webhooks are authenticated, environment-filtered, and processed by re-reading the subscriber record. Repeated and out-of-order events are safe because the latest checked snapshot wins. A failed verification returns a retryable error and does not revoke the last verified membership.

Use **同步 RevenueCat 订阅（不重复付款）** on the pricing page to restore an existing purchase. Never pay a second time because a webhook or verification request is delayed.

## Admin switch behavior

The switch is stored in the persistent database with a revision number. Stale admin tabs receive a conflict and must reload. Enabling a provider is allowed only when its server variables pass validation. Disabling is always allowed so an administrator can stop new payments during an incident.
