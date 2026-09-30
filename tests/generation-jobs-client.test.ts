import { afterEach, describe, expect, it, vi } from 'vitest';
import { generationJobsTransport } from '@/lib/client/generation-jobs';
import { generationJobFixture, jobUserId } from './fixtures/generationJob';
import { studyKitFixture } from './fixtures/studyKit';

afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
describe('background job transport', () => {
  it('uses authenticated, uncached requests with the expected revision and idempotency key', async () => {
    const job = generationJobFixture();
    const input = { sessionId: job.sessionId, expectedRevision: 9, idempotencyKey: crypto.randomUUID() };
    const fetch = vi.fn(async () => Response.json({ userId: jobUserId, job, reused: false }, { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    await generationJobsTransport(jobUserId).create(input, signal());
    expect(fetch).toHaveBeenCalledWith('/api/generation-jobs', expect.objectContaining({ method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Lumina-Account': jobUserId }, body: JSON.stringify(input) }));
  });
  it('queries the latest course task, including terminal tasks completed while the page was closed', async () => {
    const job = generationJobFixture();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ userId: jobUserId, jobs: [job], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    expect((await generationJobsTransport(jobUserId).list(job.sessionId, signal())).jobs).toEqual([job]);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/generation-jobs?sessionId=course-a&limit=1');
  });
  it('rejects wrong owners, wrong task IDs and missing successful results', async () => {
    const job = generationJobFixture(); const api = generationJobsTransport(jobUserId);
    for (const [body, code] of [
      [{ userId: crypto.randomUUID(), job, result: null }, 'ACCOUNT_CHANGED'],
      [{ userId: jobUserId, job: { ...job, userId: crypto.randomUUID() }, result: null }, 'ACCOUNT_CHANGED'],
      [{ userId: jobUserId, job: { ...job, id: crypto.randomUUID() }, result: null }, 'INVALID_RESPONSE'],
      [{ userId: jobUserId, job: { ...job, status: 'succeeded' }, result: null }, 'INVALID_RESPONSE'],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)));
      await expect(api.get(job.id, signal())).rejects.toMatchObject({ code });
    }
  });
  it('reads response.result and supports cancel and retry response shapes', async () => {
    const job = generationJobFixture(); const api = generationJobsTransport(jobUserId); const result = studyKitFixture();
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ userId: jobUserId, job: { ...job, status: 'succeeded' }, result }))
      .mockResolvedValueOnce(Response.json({ userId: jobUserId, job: { ...job, status: 'cancelled' } }))
      .mockResolvedValueOnce(Response.json({ userId: jobUserId, job: { ...job, id: crypto.randomUUID(), retryOf: job.id }, reused: false }, { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    expect((await api.get(job.id, signal())).result).toEqual(result);
    expect((await api.cancel(job.id, signal())).job.status).toBe('cancelled');
    const key = crypto.randomUUID(); await api.retry(job.id, key, signal());
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ idempotencyKey: key });
    expect(fetch.mock.calls.every(([, init]) => init.headers['X-Lumina-Account'] === jobUserId)).toBe(true);
  });
  it('preserves backend errors and distinguishes aborted requests from network failures', async () => {
    const api = generationJobsTransport(jobUserId); const job = generationJobFixture();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'CONFLICT', error: 'Save or reload this lecture before generating.' }, { status: 409 })));
    await expect(api.get(job.id, signal())).rejects.toMatchObject({ code: 'CONFLICT', message: 'Save or reload this lecture before generating.', status: 409 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(api.get(job.id, signal())).rejects.toMatchObject({ code: 'NETWORK' });
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal('fetch', vi.fn(async () => { controller.signal.throwIfAborted(); }));
    await expect(api.get(job.id, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
