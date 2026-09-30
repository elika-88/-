import { expect, test, type Page } from '@playwright/test';
import type { ReadingSet } from '../../lib/prep/schema';

const passage = 'Honeybees communicate the location of food through a waggle dance. Longer waggle runs signal greater distances. Researchers decoded this behaviour through careful observation. '.repeat(5);
const set: ReadingSet = {
  title: 'Bee communication',
  questions: Array.from({ length: 4 }, (_, index) => ({
    id: `q${index + 1}`, type: 'mcq', prompt: `What do longer waggle runs signal? (${index + 1})`,
    options: ['Greater distances', 'More food', 'Danger', 'Rain'], answerIndex: 0, answerText: 'Greater distances',
    explanation: 'Longer waggle runs signal greater distances.', evidence: ['Longer waggle runs signal greater distances.'],
  })),
};

async function guest(page: Page) {
  await page.route('**/api/auth', route => route.fulfill({ json: { user: null } }));
}

test('exam prep creates, grades and restores reading practice and the saved plan', async ({ page }) => {
  await guest(page);
  let requests = 0;
  await page.route('**/api/prep/generate', async route => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ exam: 'ielts', passage: passage.trim() });
    await route.fulfill({ json: { set } });
  });
  await page.goto('/prep');
  await page.getByRole('link', { name: /IELTS/ }).click();
  await page.getByRole('combobox', { name: 'Target band', exact: true }).selectOption('7');
  await page.getByLabel('Exam date', { exact: true }).fill('2027-06-01');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByLabel('Passage', { exact: true }).fill(passage);
  await page.getByRole('button', { name: 'Create questions', exact: true }).click();
  await expect(page.getByRole('heading', { name: set.title, exact: true })).toBeVisible();
  for (const option of await page.getByRole('radio', { name: 'Greater distances', exact: true }).all()) await option.click();
  await page.getByRole('button', { name: 'Check answers', exact: true }).click();
  await expect(page.getByText('4 / 4 correct', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Show in passage', exact: true }).first().click();
  await expect(page.locator('mark')).toHaveText('Longer waggle runs signal greater distances.');
  await page.reload();
  await expect(page.getByRole('heading', { name: set.title, exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Target band', exact: true })).toHaveValue('7');
  await expect(page.getByLabel('Exam date', { exact: true })).toHaveValue('2027-06-01');
  await page.getByRole('button', { name: 'New passage', exact: true }).click();
  await expect(page.getByLabel('Passage', { exact: true })).toHaveValue(passage.trim());
  expect(requests).toBe(1);
});

test('prep keeps text after a failed request and fits light and dark phone layouts', async ({ page }) => {
  await guest(page);
  await page.route('**/api/prep/generate', route => route.fulfill({ status: 503, json: { error: { message: 'Please try again later.' } } }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/prep/ielts');
  await page.getByLabel('Passage', { exact: true }).fill(passage);
  await page.getByRole('button', { name: 'Create questions', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Please try again later.' })).toBeVisible();
  await expect(page.getByLabel('Passage', { exact: true })).toHaveValue(passage);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/prep-${theme}-${test.info().project.name}.png`, fullPage: true });
  }
});

test('sidebar pins lectures and opens exam prep on desktop and mobile', async ({ page }) => {
  await guest(page);
  await page.goto('/');
  await page.getByLabel('Lecture text', { exact: true }).fill('Notes to pin');
  const open = page.getByRole('button', { name: 'Open sidebar', exact: true });
  if (await open.isVisible()) await open.click();
  const item = page.locator('.gpt-chat-item:visible').filter({ hasText: 'Notes to pin' });
  await item.getByRole('button', { name: 'Options', exact: true }).click();
  await item.getByRole('button', { name: 'Pin', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pinned', exact: true })).toContainText('Notes to pin');
  await page.getByRole('link', { name: 'Exam prep', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Reading practice for SAT, IELTS and TOEFL', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Lecture history', exact: true })).not.toBeVisible();
});
