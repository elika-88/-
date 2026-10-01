import { expect, test } from '@playwright/test';

test('a production login requirement preserves the guest lecture and offers sign-in', async ({ page }) => {
  await page.route('**/api/generate', route => route.fulfill({ status: 401, json: { error: {
    code: 'LOGIN_REQUIRED', message: 'Sign in to generate study materials.', retryable: false,
  } } }));
  const lecture = 'A schema defines the fields and data types in a database. '.repeat(15);
  await page.goto('/');
  await page.getByLabel('Lecture text', { exact: true }).fill(lecture);
  await page.getByRole('button', { name: 'Generate materials', exact: true }).click();
  await expect(page.locator('#form-error')).toContainText('Sign in to generate study materials');
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue(lecture);
  await page.getByRole('link', { name: 'Sign in or create an account', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page.getByRole('link', { name: 'Back to study', exact: true }).click();
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue(lecture);
});
