#!/usr/bin/env node
// Creates the Lumina Pro product, a monthly and a yearly plan, and optionally the
// webhook in your PayPal account, then prints the lines to add to .env.local.
//
//   npm run paypal:setup -- --monthly 4.99 --yearly 39.99
//   npm run paypal:setup -- --monthly 4.99 --yearly 39.99 --currency USD --webhook-url https://your.site/api/billing/paypal/webhook
//
// Needs PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV (live | sandbox) in .env.local.
// Running it twice creates new plans; keep the ids from the first run.

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]?.startsWith("--") ? "true" : all[index + 1]]);
  return pairs;
}, []));

const fail = (message) => { console.error(`\n✖ ${message}\n`); process.exit(1); };
const price = (value, name) => {
  if (!/^\d+(\.\d{1,2})?$/.test(value ?? "")) fail(`Pass --${name} <price>, for example --${name} 4.99`);
  return Number(value).toFixed(2);
};

const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
if (!clientId || !secret) fail("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local first.");
const env = process.env.PAYPAL_ENV?.trim() === "sandbox" ? "sandbox" : "live";
const base = env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const currency = (args.currency ?? process.env.PAYPAL_CURRENCY ?? "USD").toUpperCase();
const monthly = price(args.monthly, "monthly");
const yearly = price(args.yearly, "yearly");
const webhookUrl = args["webhook-url"];
if (webhookUrl && !/^https:\/\//.test(webhookUrl)) fail("--webhook-url must be a public https URL ending in /api/billing/paypal/webhook.");

async function call(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(`PayPal ${init.method ?? "GET"} ${path} failed (${response.status}): ${body.message ?? body.error_description ?? JSON.stringify(body).slice(0, 300)}`);
  return body;
}

const token = (await call("/v1/oauth2/token", {
  method: "POST",
  headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
})).access_token;
const json = (body) => ({ method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) });

console.log(`\nPayPal ${env} · ${currency}\n`);
const product = await call("/v1/catalogs/products", json({ name: "Lumina Pro", description: "Lumina Pro membership", type: "SERVICE", category: "SOFTWARE" }));
console.log(`✓ Product ${product.id}`);

const plan = (name, unit, value) => call("/v1/billing/plans", json({
  product_id: product.id,
  name,
  status: "ACTIVE",
  billing_cycles: [{ frequency: { interval_unit: unit, interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value, currency_code: currency } } }],
  payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: "CONTINUE", payment_failure_threshold: 2 },
}));
const monthlyPlan = await plan("Lumina Pro — Monthly", "MONTH", monthly);
console.log(`✓ Monthly plan ${monthlyPlan.id} (${monthly} ${currency})`);
const yearlyPlan = await plan("Lumina Pro — Yearly", "YEAR", yearly);
console.log(`✓ Yearly plan ${yearlyPlan.id} (${yearly} ${currency})`);

let webhookId = "";
if (webhookUrl) {
  const events = ["BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.UPDATED", "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.EXPIRED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "PAYMENT.SALE.COMPLETED"];
  const webhook = await call("/v1/notifications/webhooks", json({ url: webhookUrl, event_types: events.map((name) => ({ name })) }));
  webhookId = webhook.id;
  console.log(`✓ Webhook ${webhookId} → ${webhookUrl}`);
}

console.log(`\nAdd these lines to .env.local, then restart the server:\n
PAYPAL_CURRENCY=${currency}
PAYPAL_PLAN_MONTHLY_ID=${monthlyPlan.id}
PAYPAL_PRICE_MONTHLY=${monthly}
PAYPAL_PLAN_YEARLY_ID=${yearlyPlan.id}
PAYPAL_PRICE_YEARLY=${yearly}${webhookId ? `\nPAYPAL_WEBHOOK_ID=${webhookId}` : "\n# PAYPAL_WEBHOOK_ID=  (run again with --webhook-url once the site is public, or create it in the PayPal dashboard)"}
`);
