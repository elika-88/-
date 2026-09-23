import { expect, test, type Page } from '@playwright/test';

test('a delayed account check cannot undo a newer login', async ({ page }) => {
  const user = { id: 'a20e5041-118e-4de0-b7b6-6ecf279c5b23', username: 'LatestAccount', email: 'latest@example.invalid', createdAt: '2026-09-23T00:00:00.000Z' };
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BroadcastChannel', { value: undefined });
    const original = window.fetch.bind(window);
    let signingIn = false;
    window.fetch = async (...args) => {
      if (args[0] === '/api/auth' && args[1]?.method === 'POST') signingIn = true;
      if (args[0] === '/api/auth' && !args[1]?.method && !signingIn) {
        return new Promise<Response>(resolve => {
          window.addEventListener('release-old-auth', () => resolve(new Response('{"user":null}', { headers: { 'Content-Type': 'application/json' } })), { once: true });
        });
      }
      return original(...args);
    };
  });
  await page.route('**/api/auth', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) }));
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(user.username);
  await page.getByLabel('Password', { exact: true }).fill('Test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');
  await openSidebar(page);
  await expect(page.locator('.gpt-expanded-content[aria-hidden="false"] .account-identity:visible')).toContainText(user.username);
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('release-old-auth'));
    // Let the released fetch, JSON parsing and React commit settle before asserting.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.locator('.gpt-expanded-content[aria-hidden="false"] .account-identity:visible')).toContainText(user.username);
});

async function openSidebar(page: Page) {
  const open = page.getByRole('button', { name: 'Open sidebar', exact: true });
  if (await open.isVisible()) await open.click();
}

test('a delayed account refresh cannot restore a signed-out account', async ({ page }) => {
  const user = { id: 'a20e5041-118e-4de0-b7b6-6ecf279c5b23', username: 'SignedOutAccount', email: 'out@example.invalid', createdAt: '2026-09-23T00:00:00.000Z' };
  await page.addInitScript(account => {
    const original = window.fetch.bind(window);
    let hold = false;
    window.addEventListener('hold-auth', () => { hold = true; });
    window.fetch = async (...args) => {
      if (args[0] === '/api/auth' && !args[1]?.method && hold) {
        hold = false;
        document.documentElement.dataset.authDelayed = 'true';
        return new Promise<Response>(resolve => window.addEventListener('release-auth', () => resolve(new Response(JSON.stringify({ user: account }), { headers: { 'Content-Type': 'application/json' } })), { once: true }));
      }
      return original(...args);
    };
  }, user);
  let signedOut = false;
  await page.route('**/api/auth', route => {
    if (route.request().method() === 'POST') signedOut = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: signedOut ? null : user }) });
  });
  await page.goto('/');
  await openSidebar(page);
  await expect(page.locator('.gpt-expanded-content[aria-hidden="false"] .account-identity:visible')).toContainText(user.username);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('hold-auth'));
    const channel = new BroadcastChannel('lumina-auth'); channel.postMessage('changed'); channel.close();
  });
  await expect(page.locator('html')).toHaveAttribute('data-auth-delayed', 'true');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Sign in or register' })).toBeVisible();
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('release-auth'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.getByRole('link', { name: 'Sign in or register' })).toBeVisible();
});

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
