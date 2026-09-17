import { expect, test } from '@playwright/test';

test('restores real preferences without showing demo account or disconnected settings', async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on('pageerror', (error) => hydrationErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration|did not match/i.test(message.text())) hydrationErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('lumina.settings.lang', 'zh');
    localStorage.setItem('lumina.settings.theme', 'dark');
    localStorage.setItem('lumina.auth.user', JSON.stringify({ id: 'old-demo-profile', name: 'Old Demo User', email: 'fixture@example.invalid' }));
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByText('Old Demo User', { exact: true })).toHaveCount(0);
  const open = page.getByRole('button', { name: 'Open sidebar', exact: true });
  if (await open.isVisible()) await open.click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.locator('.gpt-settings-dialog').filter({ visible: true });
  await expect(settings.getByRole('heading', { name: '设置' })).toBeVisible();
  await expect(settings.getByText('自动保存草稿', { exact: true })).toHaveCount(0);
  await expect(settings.getByText('操作音效反馈', { exact: true })).toHaveCount(0);
  await expect(settings.getByRole('button', { name: '关于', exact: true })).toHaveCount(0);
  await settings.getByRole('button', { name: '外观', exact: true }).click();
  await expect(settings.getByText('正文字体大小', { exact: true })).toHaveCount(0);
  await settings.getByRole('button', { name: '浅色明亮', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('lumina.settings.theme'))).toBe('light');
  await settings.getByRole('button', { name: '学习与数据', exact: true }).click();
  const download = page.waitForEvent('download');
  await settings.getByRole('button', { name: '导出备份', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^lumina-study-backup-/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(hydrationErrors).toEqual([]);
});

test('admin renders recorded audit values without invented users, status or origin', async ({ page }) => {
  await page.route('**/api/admin', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authenticated: true, settings: { baseURL: 'https://relay.example/v1', model: 'test-model', apiFormat: 'responses', revision: 0, hasApiKey: false, source: 'environment', updatedAt: null }, audit: [{ event: 'recorded-event', created_at: 1_700_000_000_000 }] }),
  }));
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'AI Relay & Model', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'User Directory', exact: true })).toHaveCount(0);
  await expect(page.getByText('SQLite / Turso Ready', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Audit Logs', exact: true }).click();
  await expect(page.getByText('recorded-event', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Origin', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Status', exact: true })).toHaveCount(0);
});
