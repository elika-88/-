import { expect, test, type Page } from '@playwright/test';
import type { BillingSummary } from '../../lib/billing/plans';

const user = { id: 'a20e5041-118e-4de0-b7b6-6ecf279c5b23', username: 'PaidAccount', email: 'paid@example.invalid', createdAt: '2026-09-23T00:00:00.000Z' };
const pendingKey = `lumina:pending-paypal:${user.id}`;
function summary(paid = false): BillingSummary {
  return {
    plan: paid ? 'basic' : 'free', signedIn: true, limits: { lectureGenerationsPerDay: paid ? 40 : 3, maxLectureCharacters: paid ? 60000 : 20000, prepSetsPerDay: 0, maxPrepQuestions: 10 },
    usage: { lecture: { used: 0, limit: paid ? 40 : 3 }, prep: { used: 0, limit: 0 } }, resetsAt: Date.now() + 86400000,
    subscription: paid ? { tier: 'basic', status: 'ACTIVE', interval: 'yearly', nextBillingAt: Date.now() + 86400000, paidThrough: Date.now() + 86400000, cancelled: false } : null,
    paypal: { clientId: 'test-client', currency: 'USD', plans: { basic: { monthly: { id: 'P-BASIC-M', price: '9.90' }, yearly: { id: 'P-BASIC-Y', price: '95.00' } }, pro: { monthly: { id: 'P-PRO-M', price: '12.90' }, yearly: { id: 'P-PRO-Y', price: '124.00' } } } },
  };
}
const sdk = `window.paypal = { Buttons(options) {
  let host;
  return { render: async function(element) {
    host = element;
    const button = document.createElement('button');
    button.textContent = 'Mock PayPal subscribe';
    button.onclick = async () => {
      const id = await options.createSubscription({}, { subscription: { create: async () => 'I-APPROVED1' } });
      localStorage.setItem('mock-paypal-creates', String(Number(localStorage.getItem('mock-paypal-creates') || 0) + 1));
      await options.onApprove({ subscriptionID: id });
    };
    element.appendChild(button);
  }, close: async () => { host?.replaceChildren(); } };
} };`;

async function mockBilling(page: Page) {
  const state = { rejectConfirmation: true, confirmed: false, confirmations: 0 };
  await page.route('**/api/auth', route => route.fulfill({ json: { user } }));
  await page.route('**/api/study-sessions', route => route.fulfill({ json: { userId: user.id, sessions: [], revisions: {}, storage: 'local' } }));
  await page.route('**/api/billing', route => route.fulfill({ json: summary(state.confirmed) }));
  await page.route('**/api/billing/checkout', async route => {
    expect(route.request().postDataJSON()).toEqual({ provider: 'paypal', tier: 'basic', interval: 'yearly' });
    await route.fulfill({ json: { subscriptionId: 'I-APPROVED1' } });
  });
  await page.route(url => url.hostname === 'www.paypal.com' && url.pathname === '/sdk/js', route => route.fulfill({ contentType: 'application/javascript', body: sdk }));
  await page.route('**/api/billing/paypal/confirm', async route => {
    expect(route.request().postDataJSON()).toEqual({ subscriptionId: 'I-APPROVED1' });
    state.confirmations++;
    if (state.rejectConfirmation) return route.fulfill({ status: 503, json: { code: 'PAYPAL_AUTH_FAILED', error: 'API authentication failed. Do not pay again.' } });
    state.confirmed = true;
    return route.fulfill({ json: summary(true) });
  });
  return state;
}

test('an approved subscription survives failure and reload, then syncs without another checkout', async ({ page }) => {
  const state = await mockBilling(page);
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'Mock PayPal subscribe' }).first().click();
  await expect(page.getByRole('button', { name: 'Sync existing subscription (no new payment)', exact: true }).first()).toBeEnabled();
  await expect(page.getByRole('alert').filter({ hasText: 'PayPal approval was received' })).toContainText('Do not pay again');
  await expect(page.getByRole('button', { name: 'Mock PayPal subscribe' })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), pendingKey)).toBe('I-APPROVED1');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sync existing subscription (no new payment)', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mock PayPal subscribe' })).toHaveCount(0);
  expect(state.confirmations).toBe(1);
  state.rejectConfirmation = false;
  await page.getByRole('button', { name: 'Sync existing subscription (no new payment)', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Your subscription is confirmed' })).toBeVisible();
  expect(state.confirmations).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem('mock-paypal-creates'))).toBe('1');
  expect(await page.evaluate(key => localStorage.getItem(key), pendingKey)).toBeNull();
});

test('a payment made before this fix can be restored using its existing subscription ID', async ({ page }) => {
  const state = await mockBilling(page);
  state.rejectConfirmation = false;
  await page.goto('/pricing');
  await page.locator('summary').filter({ hasText: 'Already paid? Restore your subscription' }).click();
  await page.getByLabel('PayPal subscription ID', { exact: true }).fill('i-approved1');
  await page.getByRole('button', { name: 'Sync existing subscription (no new payment)', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your subscription is confirmed' })).toBeVisible();
  expect(state.confirmations).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('mock-paypal-creates'))).toBeNull();
});

test('does not show another account’s pending subscription or allow a plan ID as recovery input', async ({ page }) => {
  const state = await mockBilling(page);
  await page.addInitScript(() => localStorage.setItem('lumina:pending-paypal:another-account', 'I-PRIVATE123'));
  await page.goto('/pricing');
  await expect(page.getByRole('button', { name: 'Mock PayPal subscribe' }).first()).toBeVisible();
  await expect(page.getByText('I-PRIVATE123', { exact: false })).toHaveCount(0);
  await page.locator('summary').filter({ hasText: 'Already paid? Restore your subscription' }).click();
  await page.getByLabel('PayPal subscription ID', { exact: true }).fill('P-NOTASUBSCRIPTION');
  await page.getByRole('button', { name: 'Sync existing subscription (no new payment)', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a subscription ID' })).toContainText('not a transaction ID or plan ID');
  expect(state.confirmations).toBe(0);
});
