#!/usr/bin/env node
// Creates the Lumina product, monthly and yearly plans for Basic and Pro, and optionally the
// webhook in your PayPal account, then prints the lines to add to .env.local.
//
//   npm run paypal:setup
//   npm run paypal:setup -- --basic-monthly 9.90 --basic-yearly 95.00 --pro-monthly 12.90 --pro-yearly 124.00
//   npm run paypal:setup -- --webhook-only --webhook-url https://your.site/api/billing/paypal/webhook
//
// Needs PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV (live | sandbox) in .env.local.
// Running it twice creates new plans; keep the ids from the first run.

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]?.startsWith("--") ? "true" : all[index + 1]]);
  return pairs;
}, []));

const fail = (message) => { console.error(`\n✖ ${message}\n`); process.exit(1); };
// Defaults: Basic $9.90/month, Pro $12.90/month, yearly = 12 months at 20% off (rounded).
const DEFAULTS = { "basic-monthly": "9.90", "basic-yearly": "95.00", "pro-monthly": "12.90", "pro-yearly": "124.00" };
const price = (name) => {
  const value = args[name] ?? DEFAULTS[name];
  if (!/^\d+(\.\d{1,2})?$/.test(value ?? "")) fail(`--${name} must be a price such as ${DEFAULTS[name]}`);
  return Number(value).toFixed(2);
};

const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
if (!clientId || !secret) fail("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local first.");
const env = process.env.PAYPAL_ENV?.trim() === "sandbox" ? "sandbox" : "live";
const base = env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const currency = (args.currency ?? process.env.PAYPAL_CURRENCY ?? "USD").toUpperCase();
const prices = Object.fromEntries(Object.keys(DEFAULTS).map((name) => [name, price(name)]));
const webhookUrl = args["webhook-url"];
const webhookOnly = args["webhook-only"] === "true";
if (webhookOnly && !webhookUrl) fail("--webhook-only needs --webhook-url.");
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
const created = {};
if (!webhookOnly) {
const product = await call("/v1/catalogs/products", json({ name: "Lumina membership", description: "Lumina Basic and Pro plans", type: "SERVICE", category: "SOFTWARE" }));
console.log(`✓ Product ${product.id}`);

const plan = (name, unit, value) => call("/v1/billing/plans", json({
  product_id: product.id,
  name,
  status: "ACTIVE",
  billing_cycles: [{ frequency: { interval_unit: unit, interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value, currency_code: currency } } }],
  payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: "CONTINUE", payment_failure_threshold: 2 },
}));
for (const [tier, label] of [["basic", "Basic"], ["pro", "Pro"]]) {
  for (const [interval, unit, name] of [["monthly", "MONTH", "Monthly"], ["yearly", "YEAR", "Yearly"]]) {
    const value = prices[`${tier}-${interval}`];
    const result = await plan(`Lumina ${label} — ${name}`, unit, value);
    created[`${tier}-${interval}`] = { id: result.id, value };
    console.log(`✓ ${label} ${name.toLowerCase()} ${result.id} (${value} ${currency})`);
  }
}
}

let webhookId = "";
if (webhookUrl) {
  const events = ["BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.UPDATED", "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.EXPIRED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "PAYMENT.SALE.COMPLETED"];
  const webhook = await call("/v1/notifications/webhooks", json({ url: webhookUrl, event_types: events.map((name) => ({ name })) }));
  webhookId = webhook.id;
  console.log(`✓ Webhook ${webhookId} → ${webhookUrl}`);
}

if (webhookOnly) { console.log(`\nAdd this line to .env.local, then restart the server:\n\nPAYPAL_WEBHOOK_ID=${webhookId}\n`); process.exit(0); }
const line = (tier, interval) => `PAYPAL_PLAN_${tier.toUpperCase()}_${interval.toUpperCase()}_ID=${created[`${tier}-${interval}`].id}\nPAYPAL_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}=${created[`${tier}-${interval}`].value}`;
console.log(`\nAdd these lines to .env.local, then restart the server:\n
PAYPAL_CURRENCY=${currency}
${line("basic", "monthly")}
${line("basic", "yearly")}
${line("pro", "monthly")}
${line("pro", "yearly")}${webhookId ? `\nPAYPAL_WEBHOOK_ID=${webhookId}` : "\n# PAYPAL_WEBHOOK_ID=  (later: npm run paypal:setup -- --webhook-only --webhook-url https://your.site/api/billing/paypal/webhook)"}
`);
