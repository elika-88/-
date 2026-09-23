import type { CreateGenerationJob, GenerationJob } from '@/lib/contracts/generation-jobs';
import type { StudyKit } from '@/lib/schemas/studyMaterials';
import { GenerationJobError, isActiveJob, type GenerationJobsTransport } from './generation-jobs';

export type JobSnapshot = {
  job: GenerationJob | null; result: StudyKit | null; error: string | null;
  restoring: boolean; action: 'saving' | 'submitting' | 'cancelling' | 'retrying' | null;
  uncertain: boolean;
};
export const emptyJobSnapshot: JobSnapshot = { job: null, result: null, error: null, restoring: false, action: null, uncertain: false };
type Options = {
  sessionId: string; transport: GenerationJobsTransport;
  ensureSaved: (id: string, signal: AbortSignal) => Promise<number>;
  refreshCloud: (signal: AbortSignal) => Promise<void>;
  onIdentityError: () => Promise<void>;
};

/** A course-scoped observer. Disposing it never cancels the durable server task. */
export class GenerationJobMonitor {
  private snapshot: JobSnapshot = { ...emptyJobSnapshot, restoring: true };
  private listeners = new Set<() => void>();
  private lifetime = new AbortController();
  private polling: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private delay = 2_000;
  private locked = false;
  private intent: { create: CreateGenerationJob } | { retryId: string; key: string } | null = null;
  constructor(private options: Options) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<JobSnapshot>) {
    if (this.lifetime.signal.aborted) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private fail(error: unknown) {
    if (this.lifetime.signal.aborted) return;
    this.emit({ error: error instanceof Error ? error.message : 'Could not check your task. Please try again.' });
    if (error instanceof GenerationJobError && (error.code === 'ACCOUNT_CHANGED' || error.code === 'UNAUTHENTICATED')) {
      this.stopPolling();
      void this.options.onIdentityError();
      this.dispose();
    }
  }
  private stopPolling() { clearTimeout(this.timer); this.polling?.abort(); this.polling = null; }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.lifetime.signal.aborted && isActiveJob(this.snapshot.job)) {
      this.timer = setTimeout(() => { void this.poll(); }, this.delay);
      this.delay = Math.min(4_000, this.delay + 500);
    }
  }
  private async accept(job: GenerationJob, result: StudyKit | null = null, signal = this.lifetime.signal): Promise<void> {
    signal.throwIfAborted();
    if (job.sessionId !== this.options.sessionId) throw new GenerationJobError('INVALID_RESPONSE', 'The task belongs to a different lecture.');
    this.emit({ job, result, error: null });
    if (job.status === 'succeeded') {
      if (!result) {
        const response = await this.options.transport.get(job.id, signal);
        return this.accept(response.job, response.result, signal);
      }
      // The worker has already saved the result (possibly as a copy). Never PUT it again.
      await this.options.refreshCloud(signal);
      signal.throwIfAborted();
    }
  }
  private poll = async () => {
    const job = this.snapshot.job;
    if (!job || this.locked || this.lifetime.signal.aborted) return;
    const controller = new AbortController(); this.polling = controller;
    const signal = AbortSignal.any([controller.signal, this.lifetime.signal]);
    try {
      const response = await this.options.transport.get(job.id, signal);
      signal.throwIfAborted();
      await this.accept(response.job, response.result, signal);
    } catch (error) { if (!signal.aborted) this.fail(error); }
    finally { if (this.polling === controller) { this.polling = null; this.schedule(); } }
  };
  restore = async () => {
    if (this.locked || this.lifetime.signal.aborted) return;
    this.locked = true; this.stopPolling(); this.emit({ restoring: true, error: null });
    try {
      const response = await this.options.transport.list(this.options.sessionId, this.lifetime.signal);
      this.lifetime.signal.throwIfAborted();
      const job = response.jobs[0];
      if (job) await this.accept(job);
      else this.emit({ job: null, result: null });
    } catch (error) { this.fail(error); }
    finally { this.locked = false; this.emit({ restoring: false }); this.delay = 2_000; this.schedule(); }
  };
  private submit = async (retry: boolean) => {
    if (this.locked || this.lifetime.signal.aborted || isActiveJob(this.snapshot.job)) return;
    if (retry && !this.intent && !['failed', 'cancelled'].includes(this.snapshot.job?.status ?? '')) return;
    this.locked = true; this.stopPolling(); this.emit({ action: retry ? 'retrying' : 'saving', error: null });
    let sent = false;
    try {
      if (!this.intent) {
        const expectedRevision = await this.options.ensureSaved(this.options.sessionId, this.lifetime.signal);
        this.lifetime.signal.throwIfAborted();
        this.intent = retry ? { retryId: this.snapshot.job!.id, key: crypto.randomUUID() }
          : { create: { sessionId: this.options.sessionId, expectedRevision, idempotencyKey: crypto.randomUUID() } };
      }
      this.emit({ action: retry ? 'retrying' : 'submitting' });
      sent = true;
      const response = 'create' in this.intent
        ? await this.options.transport.create(this.intent.create, this.lifetime.signal)
        : await this.options.transport.retry(this.intent.retryId, this.intent.key, this.lifetime.signal);
      this.lifetime.signal.throwIfAborted();
      this.intent = null;
      this.emit({ uncertain: false });
      await this.accept(response.job);
    } catch (error) {
      // Reuse the exact request key after an ambiguous timeout/lost response.
      const ambiguous = sent && this.intent !== null && (!(error instanceof GenerationJobError) || error.code === 'INVALID_RESPONSE' || !error.status || error.status >= 500);
      if (!ambiguous) this.intent = null;
      this.emit({ uncertain: ambiguous });
      this.fail(error);
    } finally { this.locked = false; this.emit({ action: null }); this.delay = 2_000; this.schedule(); }
  };
  create = () => this.submit(false);
  retry = () => this.submit(true);
  reconnect = () => this.intent ? this.submit('retryId' in this.intent) : this.restore();
  cancel = async () => {
    if (this.locked || !isActiveJob(this.snapshot.job) || this.lifetime.signal.aborted) return;
    this.locked = true; this.stopPolling(); this.emit({ action: 'cancelling', error: null });
    try {
      const response = await this.options.transport.cancel(this.snapshot.job!.id, this.lifetime.signal);
      this.lifetime.signal.throwIfAborted();
      await this.accept(response.job);
    } catch (error) { this.fail(error); }
    finally { this.locked = false; this.emit({ action: null }); this.schedule(); }
  };
  dispose = () => { this.stopPolling(); this.lifetime.abort(); this.listeners.clear(); this.intent = null; };
}
