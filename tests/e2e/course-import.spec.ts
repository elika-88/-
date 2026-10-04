import { expect, test } from '@playwright/test';
import { studyKitFixture } from '../fixtures/studyKit';
import { docxCourse, pdfCourse, pptxCourse } from '../fixtures/courseFiles';
import { COURSE_FILE_LIMITS } from '../../lib/course-files';

for (const source of ['file', 'PDF', 'PPTX', 'DOCX', 'YouTube']) {
  test(`generates directly after ${source} import without copying or editing the text`, async ({ page }) => {
    const kit = studyKitFixture();
    const lecture = (kit.source.text + '\n' + 'Retrieval practice and specific feedback support learning. '.repeat(20)).trim();
    kit.source.text = lecture;
    let submitted: unknown;
    await page.route('**/api/generate', route => {
      submitted = route.request().postDataJSON();
      kit.source.text = (submitted as { lecture: string }).lecture;
      const segment = kit.source.segments[0];
      segment.start = kit.source.text.indexOf(segment.text);
      segment.end = segment.start + segment.text.length;
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', runId: kit.runId, data: kit }) + '\n' });
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Generate materials', exact: true })).toBeEnabled();
    if (source === 'file') {
      await page.locator('#course-file').setInputFiles({ name: 'course.txt', mimeType: 'text/plain', buffer: Buffer.from(lecture) });
    } else if (source === 'PDF' || source === 'PPTX' || source === 'DOCX') {
      await page.locator('#course-file').setInputFiles({
        name: `course.${source.toLowerCase()}`,
        mimeType: source === 'PDF' ? 'application/pdf' : source === 'PPTX' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: source === 'PDF' ? pdfCourse(lecture.replace(/\n/g, ' ')) : source === 'PPTX' ? await pptxCourse(lecture) : await docxCourse(lecture),
      });
    } else {
      await page.route('**/api/extract-course', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'YouTube lesson', text: lecture, sourceLabel: 'YouTube' }) }));
      await page.locator('#youtube-url').fill('https://www.youtube.com/watch?v=i30jVPqQeOM');
      await page.getByRole('button', { name: 'Import captions', exact: true }).click();
    }
    await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue(/Retrieval practice/, { timeout: 30_000 });
    const imported = await page.getByLabel('Lecture text', { exact: true }).inputValue();
    await page.getByRole('button', { name: 'Generate materials', exact: true }).click();
    await expect(page.getByRole('heading', { name: kit.lectureTitle })).toBeVisible();
    expect(submitted).toMatchObject({ lecture: imported });
    await expect(page.locator('#form-error')).toHaveCount(0);
  });
}

test('oversized uploads are rejected before sending and preserve the current lecture', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/extract-course', route => { requests++; return route.abort(); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Generate materials', exact: true })).toBeEnabled();
  await page.getByLabel('Lecture text', { exact: true }).fill('Keep this lecture.');
  await page.locator('#course-file').setInputFiles({ name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(COURSE_FILE_LIMITS.maxBytes + 1) });
  await expect(page.getByRole('alert').filter({ hasText: '4 MB or smaller' })).toBeVisible();
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue('Keep this lecture.');
  expect(requests).toBe(0);
});

test('platform HTML errors produce an actionable message and allow another upload', async ({ page }) => {
  await page.route('**/api/extract-course', route => route.fulfill({ status: 413, contentType: 'text/html', body: '<h1>FUNCTION_PAYLOAD_TOO_LARGE</h1>' }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Generate materials', exact: true })).toBeEnabled();
  await page.locator('#course-file').setInputFiles({ name: 'course.txt', mimeType: 'text/plain', buffer: Buffer.from('Course content.') });
  await expect(page.getByRole('alert').filter({ hasText: '4 MB or smaller' })).toBeVisible();
  await page.unroute('**/api/extract-course');
  await page.locator('#course-file').setInputFiles({ name: 'course.txt', mimeType: 'text/plain', buffer: Buffer.from('Course content.') });
  await expect(page.getByLabel('Lecture text', { exact: true })).toHaveValue('Course content.');
  await expect(page.getByRole('alert').filter({ hasText: '4 MB or smaller' })).toHaveCount(0);
});
