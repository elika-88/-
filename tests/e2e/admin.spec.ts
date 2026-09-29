import { expect, test } from '@playwright/test';

test('real administrator session restores after reload, saves settings and revokes logout', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await page.getByLabel('Administrator Password', { exact: true }).fill('e2e-only-admin-password');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI Relay & Model', exact: true })).toBeVisible();
  await page.locator('#admin-url').fill('https://provider.example.invalid/v1');
  await page.locator('#admin-key').fill('e2e-only-api-key');
  const model = 'e2e-' + test.info().project.name;
  await page.locator('#admin-model').fill(model);
  const saved = page.waitForResponse(response => response.url().endsWith('/api/admin') && response.request().postDataJSON()?.action === 'save');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.locator('.gpt-admin-toast.success')).toBeVisible();
  await expect(page.locator('#admin-key')).toHaveValue('');
  await page.getByRole('button', { name: 'Audit Logs', exact: true }).click();
  await expect(page.getByText('AI Relay Configuration Updated', { exact: true }).first()).toBeVisible();
  const body = await (await page.request.get('/api/admin')).text();
  expect(body).not.toContain('e2e-only-api-key');
  const cookie = (await page.context().cookies()).find(item => item.name === 'lumina_admin');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.path).toBe('/api/admin');
  expect(cookie?.sameSite).toBe('Strict');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'AI Relay & Model', exact: true })).toBeVisible();
  await expect(page.locator('#admin-model')).toHaveValue(model);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  expect((await page.request.get('/api/admin')).status()).toBe(401);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  expect((await (await page.request.get('/api/admin/status')).json()).authenticated).toBe(false);
});

test('successful settings save does not depend on a second request', async ({ page }) => {
  const settings = { baseURL: 'https://provider.example.invalid/v1', model: 'old-model', apiFormat: 'responses', revision: 2, hasApiKey: true, source: 'database', updatedAt: 1 };
  await page.route('**/api/admin/status', route => route.fulfill({ json: { authenticated: true, configured: true } }));
  let reads = 0;
  await page.route('**/api/admin', route => {
    if (route.request().method() === 'GET') {
      reads++;
      return reads === 1
        ? route.fulfill({ json: { authenticated: true, settings, audit: [] } })
        : route.fulfill({ status: 503, json: { error: 'Database temporarily unavailable.' } });
    }
    return route.fulfill({ json: { settings: { ...settings, model: 'new-model', revision: 3 } } });
  });
  await page.goto('/admin');
  await page.locator('#admin-model').fill('new-model');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.locator('.gpt-admin-toast.success')).toBeVisible();
  await expect(page.locator('#admin-model')).toHaveValue('new-model');
  await expect(page.locator('.gpt-admin-status-bar')).toContainText('#3');
  expect(reads).toBe(1);
});
