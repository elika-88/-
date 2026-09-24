import { expect, test, type Page } from '@playwright/test';
import { studyKitFixture } from '../fixtures/studyKit';

test.use({ reducedMotion: 'reduce' });

async function checkContrast(page: Page, selector: string) {
  const failures = () => page.locator(selector).evaluateAll(elements => {
    const parse = (color: string) => {
      const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
      return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
    };
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
    return elements.flatMap(element => {
      if (!(element instanceof HTMLElement) || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || element.closest('[hidden], [aria-hidden="true"], [inert]') || element.matches(':disabled')) return [];
      const style = getComputedStyle(element);
      const colors: number[][] = [];
      for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) colors.unshift(parse(getComputedStyle(ancestor).backgroundColor));
      const background = colors.reduce((base, color) => color.slice(0, 3).map((c, i) => c * color[3] + base[i] * (1 - color[3])), [255, 255, 255]);
      const foreground = parse(style.color).slice(0, 3);
      const a = luminance(background), b = luminance(foreground);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return ratio < 4.5 ? [{ text: element.textContent?.trim().slice(0, 60) || element.getAttribute('aria-label') || element.tagName, color: style.color, background, ratio: Number(ratio.toFixed(2)) }] : [];
    });
  });
  await expect.poll(failures, { message: `Low-contrast text in ${selector}` }).toEqual([]);
}

for (const theme of ['light', 'dark']) {
  test(`${theme} theme keeps workspace, study results and dialogs readable`, async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize({ width: 360, height: 780 });
    const kit = studyKitFixture();
    await page.addInitScript(({ theme, kit }) => {
      localStorage.setItem('lumina.settings.theme', theme);
      localStorage.setItem('lumina.sessions.v1', JSON.stringify({ version: 1, activeId: 'theme-lesson', sessions: [{ id: 'theme-lesson', title: 'Learning with Lumina', customTitle: true, lecture: kit.source.text, outputLanguage: 'auto', tab: 'summary', kit, updatedAt: Date.now() }] }));
    }, { theme, kit });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: kit.lectureTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Regenerate materials', exact: true })).toBeEnabled();
    await checkContrast(page, '.workspace-title, .course-import-note, .course-import-heading span, .field-heading span, .form-footer > span, .gpt-custom-select-label, .gpt-empty-hint, .gpt-section-label, .account-menu small, [role="tabpanel"] p, [role="tab"], [class*="verification"], [class*="eyebrow"], [class*="sectionNumber"], [class*="evidenceButton"]');
    await page.screenshot({ path: `test-results/ui-${theme}-${test.info().project.name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Match lecture', exact: true }).click();
    await checkContrast(page, '[role="option"]');
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'View source', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'Lecture source' })).toBeVisible();
    await checkContrast(page, 'dialog h2, dialog mark, [class*="sourceText"]');
    await page.getByRole('button', { name: 'Close source' }).click();
    await page.getByRole('tab', { name: 'Quiz', exact: true }).click();
    await checkContrast(page, '[class*="optionText"], [class*="optionLetter"], [class*="questionKind"]');
    await page.getByRole('radio', { name: 'A color', exact: true }).check();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await checkContrast(page, '[class*="optionText"], [class*="optionLetter"], [class*="explanation"] p');
    await page.screenshot({ path: `test-results/quiz-${theme}-${test.info().project.name}.png`, fullPage: true });
    await page.getByRole('tab', { name: 'Flashcards', exact: true }).click();
    await checkContrast(page, '[class*="cardFront"] [class*="cardContent"], [class*="cardTopic"]');
    await page.getByRole('button', { name: /^Question:/ }).click();
    await checkContrast(page, '[class*="cardBack"] [class*="cardContent"]');
    const open = page.getByRole('button', { name: 'Open sidebar', exact: true });
    if (await open.isVisible()) await open.click();
    await checkContrast(page, '.gpt-nav-item, .account-identity, .gpt-chat-btn, .account-menu small');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const dialog = page.locator('.gpt-settings-dialog').filter({ visible: true });
    await dialog.getByRole('button', { name: 'Appearance', exact: true }).click();
    await checkContrast(page, '.gpt-setting-info p, .gpt-settings-tab-btn, .gpt-theme-card, .gpt-settings-done-btn');
    await page.screenshot({ path: `test-results/settings-${theme}-${test.info().project.name}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`${theme} theme keeps account and admin forms readable`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('lumina.settings.theme', theme), theme);
    for (const path of ['/login', '/signup', '/admin']) {
      await page.goto(path);
      await expect(page.locator('.gpt-auth-title')).toBeVisible();
      await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
      await checkContrast(page, '.gpt-auth-title, .gpt-auth-subtitle, .gpt-auth-field label, .gpt-auth-field small, .gpt-auth-field input, .gpt-auth-submit, .account-switch, .account-back');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.screenshot({ path: `test-results/login-${theme}-${test.info().project.name}.png`, fullPage: true });
  });

  test(`${theme} theme keeps admin settings readable at narrow widths`, async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize({ width: 360, height: 780 });
    await page.addInitScript(theme => localStorage.setItem('lumina.settings.theme', theme), theme);
    const payload = { authenticated: true, configured: true, settings: { baseURL: 'https://relay.example/v1', model: 'study-model', apiFormat: 'responses', revision: 0, hasApiKey: false, source: 'environment', updatedAt: null }, audit: [{ event: 'settings_updated', created_at: 1_700_000_000_000 }] };
    await page.route('**/api/admin/status', route => route.fulfill({ json: payload }));
    await page.route('**/api/admin', route => route.fulfill({ json: payload }));
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'AI Relay & Model', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
    await checkContrast(page, '.gpt-admin-panel-header p, .gpt-admin-nav-item, .gpt-admin-help-text, .gpt-admin-form-label span, .gpt-admin-sidebar-title, .gpt-fetch-models-btn, .gpt-pill-btn, .gpt-admin-status-bar, .text-warning, .text-success');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/admin-${theme}-${test.info().project.name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Audit Logs', exact: true }).click();
    await checkContrast(page, '.gpt-admin-table th, .gpt-admin-table td, .gpt-table-code');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
