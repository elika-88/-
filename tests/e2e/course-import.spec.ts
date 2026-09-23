import { expect, test } from '@playwright/test';
import { studyKitFixture } from '../fixtures/studyKit';

for (const source of ['file', 'YouTube']) {
  test(`generates directly after ${source} import without copying or editing the text`, async ({ page }) => {
    const kit = studyKitFixture();
    const lecture = (kit.source.text + '\n' + 'Retrieval practice and specific feedback support learning. '.repeat(20)).trim();
    kit.source.text = lecture;
    let submitted: unknown;
    await page.route('**/api/generate', route => {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', runId: kit.runId, data: kit }) + '\n' });
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Generate materials', exact: true })).toBeEnabled();
    if (source === 'file') {
      await page.locator('#course-file').setInputFiles({ name: 'course.txt', mimeType: 'text/plain', buffer: Buffer.from(lecture) });
    } else {
      await page.route('**/api/extract-course', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'YouTube lesson', text: lecture, sourceLabel: 'YouTube' }) }));
      await page.locator('#youtube-url').fill('https://www.youtube.com/watch?v=i30jVPqQeOM');
      await page.getByRole('button', { name: 'Import captions', exact: true }).click();
    }
    await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue(lecture);
    await page.getByRole('button', { name: 'Generate materials', exact: true }).click();
    await expect(page.getByRole('heading', { name: kit.lectureTitle })).toBeVisible();
    expect(submitted).toMatchObject({ lecture });
    await expect(page.locator('#form-error')).toHaveCount(0);
  });
}
