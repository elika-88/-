import { expect, test, type Page } from '@playwright/test';

async function openSidebar(page: Page) {
  const open = page.getByRole('button', { name: 'Open sidebar', exact: true });
  if (await open.isVisible()) await open.click();
}

test('registers, restores the account, logs out and signs in by email without BroadcastChannel', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'BroadcastChannel', { value: undefined }); });
  const username = `portal_${Date.now()}_${test.info().project.name}`;
  const email = `${username}@example.invalid`;
  const password = 'Portal-test-only-482!';
  await page.goto('/');
  await openSidebar(page);
  await page.getByRole('link', { name: 'Sign in or register' }).click();
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL('/');
  await openSidebar(page);
  await expect(page.locator('.gpt-expanded-content[aria-hidden="false"] .account-identity:visible')).toContainText(username);
  const cookie = (await page.context().cookies()).find(item => item.name === 'lumina_user');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect((await page.request.get('/api/admin')).status()).toBe(401);

  await page.reload();
  await openSidebar(page);
  await expect(page.locator('.gpt-expanded-content[aria-hidden="false"] .account-identity:visible')).toContainText(username);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Sign in or register' })).toBeVisible();
  expect(await (await page.request.get('/api/auth')).json()).toEqual({ user: null });

  await page.getByRole('link', { name: 'Sign in or register' }).click();
  await page.getByLabel('Username or email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.gpt-auth-error')).toContainText('Incorrect username, email, or password');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');
  await openSidebar(page);
  await expect(page.locator('.gpt-expanded-content[aria-hidden="false"] .account-identity:visible')).toContainText(username);
  await page.screenshot({ path: `test-results/account-${test.info().project.name}.png`, fullPage: true });
});

test('shows account service failure and allows retry without pretending the user is logged out', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/auth', route => route.fulfill({
    status: unavailable ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify(unavailable ? { error: 'Unavailable' } : { user: null }),
  }));
  await page.goto('/');
  await openSidebar(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Could not check your account' })).toContainText('Could not check your account');
  unavailable = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not check your account' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in or register' })).toBeVisible();
});
