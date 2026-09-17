import { expect, test } from '@playwright/test';
import { studyKitFixture } from '../fixtures/studyKit';

test('studies a generated kit, reviews mistakes and preserves it after failed regeneration', async ({ page }) => {
  const kit = studyKitFixture();
  const lecture = kit.source.text + '\n' + 'Evidence explains the structure of learning materials. '.repeat(15);
  kit.source.text = lecture;
  let requests = 0;
  await page.route('**/api/generate', (route) => {
    requests++;
    return route.fulfill(requests === 1 ? { status: 200, contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', runId: kit.runId, data: kit }) + '\n' } : { status: 502, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UPSTREAM_FAILURE', message: 'Test failure', retryable: true } }) });
  });
  await page.goto('/');
  await page.getByLabel('Lecture text', { exact: true }).fill(lecture);
  await page.getByRole('button', { name: 'Generate materials', exact: true }).click();
  await expect(page.getByRole('heading', { name: kit.lectureTitle })).toBeVisible();
  await page.getByRole('tabpanel').filter({ visible: true }).getByRole('button', { name: 'View source', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Lecture source' })).toBeVisible();
  await expect(page.locator('dialog mark')).toHaveText(kit.overview.evidence[0].quote);
  await page.getByRole('button', { name: 'Close source' }).click();
  await page.getByRole('tab', { name: 'Key Points', exact: true }).click();
  await expect(page.getByText(kit.keyPoints[0].text, { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Quiz', exact: true }).click();
  await page.getByRole('radio', { name: 'A color', exact: true }).check();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByRole('radio', { name: 'A color', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.getByText('0 correct, 1 incorrect')).toBeVisible();
  await page.getByRole('button', { name: 'Review missed topics' }).click();
  await expect(page.getByLabel('Missed topics only')).toBeChecked();
  await page.getByRole('button', { name: /Question: Schema/ }).click();
  await expect(page.getByRole('button', { name: /^Answer:/ })).toBeVisible();
  await page.screenshot({ path: `test-results/study-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Regenerate materials', exact: true }).click();
  await expect(page.locator('#form-error')).toBeVisible();
  await expect(page.getByRole('heading', { name: kit.lectureTitle })).toBeVisible();
  await page.getByLabel('Lecture text', { exact: true }).fill(lecture + ' Modified source.');
  await expect(page.getByText(/These materials are from the previous version/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: kit.lectureTitle })).toBeVisible();
  expect(requests).toBe(2);
});

test('starts empty without demo controls or simulated account creation', async ({ page }) => {
  let generated = false;
  page.on('request', (request) => { if (request.url().endsWith('/api/generate')) generated = true; });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Load demo lecture' })).toHaveCount(0);
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue('');
  await expect(page.locator('a[href="/login"], a[href="/signup"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No study materials yet' })).toBeVisible();
  for (const path of ['/login', '/signup', '/demo/research-methods.txt']) {
    expect((await page.request.get(path)).status()).toBe(404);
  }
  expect((await page.request.post('/api/auth', { data: { email: 'fixture@example.invalid' } })).status()).toBe(404);
  expect(generated).toBe(false);
});
