import { expect, test, type Page } from '@playwright/test';
import { studyKitFixture } from '../fixtures/studyKit';

async function study(page: Page, theme = 'light') {
  const kit = studyKitFixture();
  kit.quiz.push({ ...kit.quiz[0], id: 'q2', question: 'Choose the correct definition again.' });
  kit.flashcards.push({ ...kit.flashcards[0], id: 'f2', front: 'Second card', back: 'Second answer' });
  await page.route('**/api/auth', route => route.fulfill({ json: { user: null } }));
  await page.addInitScript(({ kit, theme }) => {
    localStorage.setItem('lumina.settings.theme', theme);
    localStorage.setItem('lumina.sessions.v1', JSON.stringify({ version: 1, activeId: 'motion-course', sessions: [{ id: 'motion-course', title: 'Motion course', lecture: kit.source.text, customTitle: true, outputLanguage: 'en', tab: 'summary', kit, updatedAt: 1 }] }));
  }, { kit, theme });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: kit.lectureTitle })).toBeVisible();
  return kit;
}

test('quiz shortcuts preserve answer locking, progress and the final score', async ({ page }) => {
  await study(page); await page.getByRole('tab', { name: 'Quiz', exact: true }).click();
  const radio = page.getByRole('radio', { name: 'A data structure', exact: true });
  await radio.focus(); await page.keyboard.press('1'); await expect(radio).toBeChecked();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Quiz progress' })).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: 'Next question', exact: true }).press('2');
  await expect(radio).toBeChecked(); await expect(radio).toBeDisabled();
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  await expect(page.getByText('Choose the correct definition again.', { exact: true })).toBeFocused();
  await page.keyboard.press('b'); await expect(page.getByRole('radio', { name: 'A color', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Quiz progress' })).toHaveAttribute('aria-valuenow', '2');
  await page.getByRole('button', { name: 'See results', exact: true }).click();
  await expect(page.getByText('1 correct, 1 incorrect', { exact: true })).toBeVisible();
  await expect(page.locator('[class*="scoreRing"] [aria-hidden="true"]').filter({ hasText: '1 / 2' })).toBeVisible();
  await page.locator('[class*="quizResult"]').screenshot({ path: `test-results/motion-quiz-${test.info().project.name}.png` });
});

test('flashcard arrow navigation keeps focus and resets flipped state', async ({ page }) => {
  await study(page); await page.getByRole('tab', { name: 'Flashcards', exact: true }).click();
  const first = page.getByRole('button', { name: 'Question: Schema. Show answer', exact: true });
  await first.focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Answer: Defines/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Question: Second card. Show answer', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Next card', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowLeft'); await expect(first).toBeFocused(); await expect(first).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Previous card', exact: true })).toBeDisabled();
});

for (const theme of ['light', 'dark']) {
  test(`${theme} motion styles respect reduced motion and fit a small phone`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 375, height: 812 });
    await study(page, theme); await page.getByRole('tab', { name: 'Flashcards', exact: true }).click();
    const indicator = page.locator('[class*="tabIndicator"]');
    expect(await indicator.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.00001);
    const card = page.getByRole('button', { name: 'Question: Schema. Show answer', exact: true }); await card.click();
    expect(await page.locator('[class*="flashcardInner"]').evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.00001);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('region', { name: 'Study materials', exact: true }).screenshot({ path: `test-results/motion-${theme}-${test.info().project.name}.png` });
  });
}
