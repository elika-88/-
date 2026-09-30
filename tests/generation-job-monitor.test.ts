import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationJobMonitor } from '@/lib/client/generation-job-monitor';
import { GenerationJobError, type GenerationJobsTransport } from '@/lib/client/generation-jobs';
import { generationJobFixture, jobUserId } from './fixtures/generationJob';
import { studyKitFixture } from './fixtures/studyKit';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
const disposals: (() => void)[] = [];
function fixture() {
  const job = generationJobFixture();
  const transport = {
    list: vi.fn<GenerationJobsTransport['list']>(async () => ({ userId: jobUserId, jobs: [], nextCursor: null })),
    create: vi.fn<GenerationJobsTransport['create']>(async () => ({ userId: jobUserId, job, reused: false })),
    get: vi.fn<GenerationJobsTransport['get']>(async () => ({ userId: jobUserId, job, result: null })),
    cancel: vi.fn<GenerationJobsTransport['cancel']>(async () => ({ userId: jobUserId, job: { ...job, status: 'cancelled' as const } })),
    retry: vi.fn<GenerationJobsTransport['retry']>(async () => ({ userId: jobUserId, job: { ...job, id: crypto.randomUUID(), retryOf: job.id }, reused: false })),
  };
  const ensureSaved = vi.fn(async () => 7); const refreshCloud = vi.fn(async () => {}); const onIdentityError = vi.fn(async () => {});
  const monitor = new GenerationJobMonitor({ sessionId: job.sessionId, transport, ensureSaved, refreshCloud, onIdentityError });
  disposals.push(monitor.dispose);
  return { monitor, job, transport, ensureSaved, refreshCloud, onIdentityError };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); });

describe('durable task observation', () => {
  it('locks synchronously and waits for the saved revision before creating exactly once', async () => {
    const f = fixture(); await f.monitor.restore(); const saved = deferred<number>(); f.ensureSaved.mockReturnValue(saved.promise);
    const first = f.monitor.create(); const second = f.monitor.create();
    expect(f.monitor.getSnapshot().action).toBe('saving'); expect(f.transport.create).not.toHaveBeenCalled();
    saved.resolve(12); await Promise.all([first, second]);
    expect(f.transport.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sessionId: f.job.sessionId, expectedRevision: 12 }), expect.any(AbortSignal));
    expect(f.monitor.getSnapshot().job?.status).toBe('queued');
  });
  it('blocks submission on failed cloud saves and conflicts', async () => {
    const f = fixture(); await f.monitor.restore(); f.ensureSaved.mockRejectedValue(new Error('Resolve sync conflict'));
    await f.monitor.create(); expect(f.transport.create).not.toHaveBeenCalled(); expect(f.monitor.getSnapshot().error).toBe('Resolve sync conflict');
  });
  it('polls from two seconds with backoff capped at four, and stops on completion', async () => {
    const f = fixture(); await f.monitor.restore(); await f.monitor.create();
    for (const delay of [2_000, 2_500, 3_000, 3_500, 4_000, 4_000]) {
      const before = f.transport.get.mock.calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1); expect(f.transport.get).toHaveBeenCalledTimes(before);
      await vi.advanceTimersByTimeAsync(1); expect(f.transport.get).toHaveBeenCalledTimes(before + 1);
    }
    const result = studyKitFixture(); f.transport.get.mockResolvedValue({ userId: jobUserId, job: { ...f.job, status: 'succeeded', savedSessionId: 'copy', stage: 'complete' }, result });
    await vi.advanceTimersByTimeAsync(4_000); expect(f.monitor.getSnapshot().result).toEqual(result); expect(f.refreshCloud).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000); expect(f.transport.get).toHaveBeenCalledTimes(7);
  });
  it('restores a completed task and a copy after reopening a lecture', async () => {
    const f = fixture(); const job = { ...f.job, status: 'succeeded' as const, savedSessionId: 'copy' }; const result = studyKitFixture();
    f.transport.list.mockResolvedValue({ userId: jobUserId, jobs: [job], nextCursor: null });
    f.transport.get.mockResolvedValue({ userId: jobUserId, job, result });
    await f.monitor.restore(); expect(f.monitor.getSnapshot().result).toEqual(result); expect(f.refreshCloud).toHaveBeenCalledTimes(1);
    expect(f.transport.create).not.toHaveBeenCalled();
  });
  it('keeps polling after a transient failure, without creating a second job', async () => {
    const f = fixture(); await f.monitor.restore(); await f.monitor.create();
    f.transport.get.mockRejectedValueOnce(new GenerationJobError('NETWORK', 'Offline'));
    await vi.advanceTimersByTimeAsync(2_000); expect(f.monitor.getSnapshot().error).toBe('Offline');
    await vi.advanceTimersByTimeAsync(2_500); expect(f.monitor.getSnapshot().error).toBeNull(); expect(f.transport.create).toHaveBeenCalledTimes(1);
  });
  it('reuses the exact create payload after a response is lost', async () => {
    const f = fixture(); await f.monitor.restore();
    f.transport.create.mockRejectedValueOnce(new GenerationJobError('NETWORK', 'Response lost'));
    await f.monitor.create(); expect(f.monitor.getSnapshot().uncertain).toBe(true);
    await f.monitor.reconnect(); expect(f.transport.create.mock.calls[1]).toEqual(f.transport.create.mock.calls[0]);
    expect(f.ensureSaved).toHaveBeenCalledTimes(1); expect(f.monitor.getSnapshot().uncertain).toBe(false);
  });
  it('keeps the request key when the server accepted a task but its response was malformed', async () => {
    const f = fixture(); await f.monitor.restore();
    f.transport.create.mockRejectedValueOnce(new GenerationJobError('INVALID_RESPONSE', 'Incomplete response', 202));
    await f.monitor.create(); expect(f.monitor.getSnapshot().uncertain).toBe(true);
    await f.monitor.reconnect(); expect(f.transport.create.mock.calls[1]).toEqual(f.transport.create.mock.calls[0]);
  });
  it('does not submit when the account is disposed while waiting for cloud saving', async () => {
    const f = fixture(); await f.monitor.restore(); const saved = deferred<number>(); f.ensureSaved.mockReturnValue(saved.promise);
    const creating = f.monitor.create(); f.monitor.dispose(); saved.resolve(5); await creating;
    expect(f.transport.create).not.toHaveBeenCalled();
  });
  it('cancels without allowing an older in-flight poll to restore running state, then retries once', async () => {
    const f = fixture(); await f.monitor.restore(); await f.monitor.create();
    const pending = deferred<Awaited<ReturnType<typeof f.transport.get>>>(); f.transport.get.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(2_000); const pollSignal = f.transport.get.mock.calls[0][1];
    await f.monitor.cancel(); expect(pollSignal.aborted).toBe(true);
    pending.resolve({ userId: jobUserId, job: { ...f.job, status: 'running' }, result: null }); await vi.advanceTimersByTimeAsync(20_000);
    expect(f.monitor.getSnapshot().job?.status).toBe('cancelled');
    const retry = f.monitor.retry(); await f.monitor.retry(); await retry;
    expect(f.transport.retry).toHaveBeenCalledTimes(1);
    expect(f.transport.retry.mock.calls[0][1]).not.toEqual(f.transport.create.mock.calls[0][0].idempotencyKey);
  });
  it('disposal aborts requests, ignores late results and prevents further polling', async () => {
    const f = fixture(); const pending = deferred<Awaited<ReturnType<typeof f.transport.create>>>(); f.transport.create.mockReturnValue(pending.promise);
    await f.monitor.restore(); const creating = f.monitor.create(); await Promise.resolve();
    const listener = vi.fn(); f.monitor.subscribe(listener); f.monitor.dispose();
    pending.resolve({ userId: jobUserId, job: f.job, reused: false }); await creating; await vi.advanceTimersByTimeAsync(30_000);
    expect(listener).not.toHaveBeenCalled(); expect(f.transport.get).not.toHaveBeenCalled();
    expect(f.transport.create.mock.calls[0][1].aborted).toBe(true);
  });
  it('account mismatch immediately stops polling and triggers identity revalidation', async () => {
    const f = fixture(); await f.monitor.restore(); await f.monitor.create();
    f.transport.get.mockRejectedValue(new GenerationJobError('ACCOUNT_CHANGED', 'Account changed', 409));
    await vi.advanceTimersByTimeAsync(2_000); await vi.advanceTimersByTimeAsync(30_000);
    expect(f.onIdentityError).toHaveBeenCalledTimes(1); expect(f.transport.get).toHaveBeenCalledTimes(1);
  });
});
