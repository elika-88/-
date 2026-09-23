import { z } from 'zod';
import { revision, ServerStudySessionSchema, type StudyRecordsResponse } from '@/lib/contracts/study-records';
import { emptyHistory, parseHistory, serializeHistory, STORAGE_KEY, type SessionHistory, type StudySession } from './sessions';
import { StudyStorageError, type StudyTransport } from './study-records';

type Change = {
  id: string; session: StudySession | null; backup: StudySession; baseRevision: number;
  importSourceId?: string;
  attempted?: { session: StudySession | null; revision: number };
};
export type StudyConflict = { id: string; local: StudySession; deletedLocally: boolean; remote: StudySession | null; revision: number };
export type SyncSnapshot = {
  history: SessionHistory; ready: boolean; busy: boolean; pending: number;
  error: { code: string; message: string } | null; warning: string | null;
  conflicts: StudyConflict[]; guestCount: number; importing: boolean; importMessage: string | null;
};
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Options = {
  userId: string | null; transport?: StudyTransport; local: StoragePort; recovery: StoragePort;
  notify?: () => void; onIdentityError?: () => void; debounceMs?: number; newId?: () => string;
};
const ChangeSchema = z.object({
  id: z.string(), session: ServerStudySessionSchema.nullable(), backup: ServerStudySessionSchema,
  baseRevision: revision,
  importSourceId: z.string().max(100).optional(),
  attempted: z.object({ session: ServerStudySessionSchema.nullable(), revision }).optional(),
});
const JournalSchema = z.object({ version: z.literal(1), userId: z.string(), changes: z.array(ChangeSchema) });
const same = (a: StudySession | null | undefined, b: StudySession | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const problem = (e: unknown) => e instanceof StudyStorageError ? { code: e.code, message: e.message }
  : { code: 'UNAVAILABLE', message: 'Could not sync your lectures. Your edits are kept for retry.' };

/** One instance per authenticated identity. No account content is written to guest storage. */
export class StudySync {
  private snapshot: SyncSnapshot = { history: emptyHistory(), ready: false, busy: false, pending: 0, error: null, warning: null, conflicts: [], guestCount: 0, importing: false, importMessage: null };
  private listeners = new Set<() => void>();
  private changes = new Map<string, Change>();
  private revisions: Record<string, number> = Object.create(null);
  private controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private disposed = false;
  private guestWritable = true;
  private recoveryWritable = true;
  private refreshAgain = false;
  private importIds = new Set<string>();
  private importTotal = 0;
  private acknowledgedImports = new Set<string>();
  constructor(private options: Options) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private emit(patch: Partial<SyncSnapshot> = {}) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch, pending: this.changes.size };
    for (const listener of this.listeners) listener();
  }
  private journalKey() { return `lumina.pending.v1.${this.options.userId}`; }
  private importsKey() { return `lumina.imports.v1.${this.options.userId}`; }
  private persist() {
    if (!this.options.userId || !this.recoveryWritable) return;
    try {
      if (!this.changes.size) this.options.recovery.removeItem(this.journalKey());
      else this.options.recovery.setItem(this.journalKey(), JSON.stringify({ version: 1, userId: this.options.userId, changes: [...this.changes.values()] }));
    } catch {
      this.emit({ warning: 'This browser could not keep a recovery copy. Keep this tab open until cloud saving succeeds, or download your edits.' });
    }
  }
  private setHistory(history: SessionHistory) {
    this.emit({ history: { ...history, activeId: history.sessions.some(s => s.id === history.activeId) ? history.activeId : null } });
  }
  start = async () => {
    if (this.disposed) return;
    if (!this.options.userId) {
      try { this.setHistory(parseHistory(this.options.local.getItem(STORAGE_KEY))); }
      catch { this.guestWritable = false; this.emit({ warning: 'Saved history could not be opened. Existing saved data has not been overwritten. Download your edits before leaving.' }); }
      this.emit({ ready: true });
      return;
    }
    try {
      const raw = this.options.recovery.getItem(this.journalKey());
      if (raw) {
        const journal = JournalSchema.parse(JSON.parse(raw));
        if (journal.userId !== this.options.userId) throw new Error('Wrong owner');
        for (const change of journal.changes) {
          if (change.id !== change.backup.id || (change.session && change.id !== change.session.id) || (change.attempted?.session && change.id !== change.attempted.session.id)) throw new Error('Invalid journal');
          this.changes.set(change.id, change);
        }
      }
    } catch {
      this.recoveryWritable = false;
      this.emit({ warning: 'A recovery copy could not be read. It has not been overwritten. Download new edits before leaving if cloud saving fails.' });
    }
    this.readGuests();
    await this.refresh();
  };
  private readGuests() {
    try {
      const stored = JSON.parse(this.options.local.getItem(this.importsKey()) || '[]');
      for (const id of z.array(z.string()).parse(stored)) this.acknowledgedImports.add(id);
      const guest = parseHistory(this.options.local.getItem(STORAGE_KEY));
      this.emit({ guestCount: guest.sessions.filter(s => !this.acknowledgedImports.has(s.id)).length });
    } catch { this.emit({ warning: 'Guest history could not be read. It has not been changed.' }); }
  }
  /** Always reconcile against the latest local edits, including edits made while GET was in flight. */
  private reconcile(remote: StudyRecordsResponse) {
    const records = new Map(remote.sessions.map(s => [s.id, s]));
    const conflicts: StudyConflict[] = [];
    this.revisions = remote.revisions;
    for (const [id, change] of this.changes) {
      const current = records.get(id) ?? null;
      const serverRevision = Object.hasOwn(remote.revisions, id) ? remote.revisions[id] : 0;
      if (same(current, change.session) && (current !== null || serverRevision > 0 || change.baseRevision === 0)) {
        this.markImported(change); this.changes.delete(id); continue;
      }
      if (change.attempted && serverRevision === change.attempted.revision + 1 && same(current, change.attempted.session)) {
        change.baseRevision = serverRevision;
        change.attempted = undefined;
      }
      if (serverRevision !== change.baseRevision || (!current && serverRevision > 0)) {
        conflicts.push({ id, local: change.session ?? change.backup, deletedLocally: change.session === null, remote: current, revision: serverRevision });
      }
      if (change.session) records.set(id, change.session); else records.delete(id);
    }
    const previous = this.snapshot.history;
    const sessions = [...records.values()];
    const activeId = previous.activeId && records.has(previous.activeId) ? previous.activeId
      : !this.snapshot.ready ? sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null : null;
    this.emit({ history: { version: 1, sessions, activeId }, conflicts });
    this.persist();
  }
  refresh = async () => {
    if (this.disposed || !this.options.userId || !this.options.transport) return;
    if (this.running) { this.refreshAgain = true; return; }
    this.running = true; this.emit({ busy: true });
    try {
      const remote = await this.options.transport.list(this.controller.signal);
      if (this.disposed) return;
      this.reconcile(remote);
      this.emit({ ready: true, error: null });
    } catch (error) { this.fail(error); }
    finally {
      this.running = false; this.emit({ busy: false });
      this.refreshAgain = false;
      if (!this.disposed && !this.snapshot.error) this.schedule();
    }
  };
  private fail(error: unknown) {
    if (this.disposed) return;
    const issue = problem(error);
    this.emit({ error: issue });
    if (issue.code === 'UNAUTHENTICATED' || issue.code === 'ACCOUNT_CHANGED') this.options.onIdentityError?.();
  }
  save = (next: SessionHistory) => {
    if (this.disposed || !this.snapshot.ready) return;
    if (!this.options.userId) {
      this.setHistory(next);
      if (!this.guestWritable) { this.emit({ error: { code: 'LOCAL_STORAGE', message: 'Existing device storage is unreadable. Download your edits before leaving; it has not been overwritten.' } }); return; }
      try { this.options.local.setItem(STORAGE_KEY, serializeHistory(next)); this.emit({ error: null }); }
      catch { this.emit({ error: { code: 'LOCAL_STORAGE', message: 'Changes could not be saved on this device. Keep this tab open or download your edits.' } }); }
      return;
    }
    const previous = new Map(this.snapshot.history.sessions.map(s => [s.id, s]));
    const latest = new Map(next.sessions.map(s => [s.id, s]));
    for (const id of new Set([...previous.keys(), ...latest.keys()])) {
      if (same(previous.get(id), latest.get(id))) continue;
      const existing = this.changes.get(id);
      this.changes.set(id, { id, session: latest.get(id) ?? null, backup: latest.get(id) ?? previous.get(id)!,
        baseRevision: existing?.baseRevision ?? (Object.hasOwn(this.revisions, id) ? this.revisions[id] : 0), attempted: existing?.attempted, importSourceId: existing?.importSourceId });
    }
    this.setHistory(next); this.persist(); this.schedule();
  };
  private schedule() {
    clearTimeout(this.timer);
    if (this.disposed || this.snapshot.error) return;
    this.timer = setTimeout(() => { void this.flush(); }, this.options.debounceMs ?? 650);
  }
  flush = async () => {
    clearTimeout(this.timer);
    if (this.disposed || this.running || !this.options.transport || !this.snapshot.ready || this.snapshot.error) return;
    this.running = true; this.emit({ busy: true });
    try {
      while (!this.disposed) {
        const change = [...this.changes.values()].find(c => !this.snapshot.conflicts.some(conflict => conflict.id === c.id));
        if (!change) break;
        if (change.session === null && change.baseRevision === 0 && !change.attempted) { this.changes.delete(change.id); this.persist(); this.emit(); continue; }
        change.attempted = { session: change.session, revision: change.baseRevision };
        this.persist();
        const result = change.session
          ? await this.options.transport.save(change.session, change.baseRevision, this.controller.signal)
          : await this.options.transport.remove(change.id, change.baseRevision, this.controller.signal);
        if (this.disposed) return;
        this.revisions[change.id] = result.revision;
        const latest = this.changes.get(change.id);
        if (latest && same(latest.session, change.session)) { this.markImported(latest); this.changes.delete(change.id); }
        else if (latest) { latest.baseRevision = result.revision; latest.attempted = undefined; }
        this.persist(); this.emit(); this.options.notify?.();
      }
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof StudyStorageError && (error.code === 'CONFLICT' || error.code === 'NOT_FOUND')) {
        try {
          const remote = await this.options.transport.list(this.controller.signal);
          if (this.disposed) return;
          this.reconcile(remote);
          if (error.code === 'NOT_FOUND' && !this.snapshot.conflicts.length && this.changes.size) this.fail(error);
        }
        catch (readError) { this.fail(readError); }
      } else this.fail(error);
    } finally {
      this.running = false; this.emit({ busy: false });
      if (!this.disposed && this.refreshAgain) { this.refreshAgain = false; void this.refresh(); }
      else if (this.changes.size && !this.snapshot.error && [...this.changes.keys()].some(id => !this.snapshot.conflicts.some(c => c.id === id))) this.schedule();
    }
  };
  retry = async () => {
    if (!this.options.userId) { this.save(this.snapshot.history); return; }
    await this.refresh();
  };
  private waitForIdle(signal: AbortSignal) {
    signal.throwIfAborted();
    if (!this.running) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const done = () => { unsubscribe(); signal.removeEventListener('abort', aborted); };
      const aborted = () => { done(); reject(signal.reason); };
      const unsubscribe = this.subscribe(() => { if (!this.running) { done(); resolve(); } });
      signal.addEventListener('abort', aborted, { once: true });
    });
  }
  /** Wait for in-flight writes and the latest edit, not just the debounce timer. */
  ensureSaved = async (id: string, signal: AbortSignal): Promise<number> => {
    const lifetime = AbortSignal.any([signal, this.controller.signal, AbortSignal.timeout(60_000)]);
    if (!this.options.userId) throw new StudyStorageError('UNAUTHENTICATED', 'Sign in before starting a background task.');
    for (;;) {
      await this.waitForIdle(lifetime);
      lifetime.throwIfAborted();
      if (this.running) continue;
      if (this.snapshot.error) throw new StudyStorageError(this.snapshot.error.code, this.snapshot.error.message);
      if (!this.snapshot.ready) throw new StudyStorageError('NOT_READY', 'Wait for your cloud lectures to open.');
      if (this.snapshot.conflicts.some(conflict => conflict.id === id)) throw new StudyStorageError('CONFLICT', 'Resolve this lecture’s sync conflict before generating.');
      if (!this.snapshot.history.sessions.some(session => session.id === id)) throw new StudyStorageError('NOT_FOUND', 'Save this lecture before generating.');
      if (this.changes.has(id)) { await this.flush(); continue; }
      const savedRevision = this.revisions[id];
      if (!savedRevision) throw new StudyStorageError('NOT_SAVED', 'This lecture has not been saved to the cloud. Retry sync first.');
      return savedRevision;
    }
  };
  refreshConfirmed = async (signal: AbortSignal) => {
    const lifetime = AbortSignal.any([signal, this.controller.signal, AbortSignal.timeout(60_000)]);
    do {
      await this.waitForIdle(lifetime);
      lifetime.throwIfAborted();
    } while (this.running);
    await this.refresh();
    lifetime.throwIfAborted();
    if (this.snapshot.error) throw new StudyStorageError(this.snapshot.error.code, this.snapshot.error.message);
  };
  resolveConflict = (id: string, keepCopy: boolean) => {
    if (this.disposed || this.running) return;
    const conflict = this.snapshot.conflicts.find(c => c.id === id);
    if (!conflict) return;
    const local = this.changes.get(id)?.session ?? conflict.local;
    const importSourceId = this.changes.get(id)?.importSourceId;
    if (importSourceId && !keepCopy) this.markImported(this.changes.get(id)!);
    this.changes.delete(id);
    const sessions = this.snapshot.history.sessions.filter(s => s.id !== id);
    if (conflict.remote) sessions.push(conflict.remote);
    let activeId = this.snapshot.history.activeId;
    if (keepCopy) {
      const copy = { ...local, id: this.options.newId?.() ?? crypto.randomUUID(), title: `${(local.title || 'Untitled lecture').slice(0, 187)} (local copy)`, customTitle: true, updatedAt: Date.now() };
      sessions.push(copy); activeId = copy.id;
      this.changes.set(copy.id, { id: copy.id, session: copy, backup: copy, baseRevision: 0, importSourceId });
      if (this.importIds.delete(id)) this.importIds.add(copy.id);
    }
    this.emit({ conflicts: this.snapshot.conflicts.filter(c => c.id !== id), error: null });
    this.setHistory({ version: 1, sessions, activeId });
    this.persist(); this.schedule();
  };
  importGuests = async () => {
    if (!this.options.userId || !this.snapshot.ready || this.snapshot.importing || this.snapshot.error || this.disposed) return;
    this.emit({ importing: true });
    try {
      const guest = parseHistory(this.options.local.getItem(STORAGE_KEY));
      const additions: StudySession[] = [];
      const sourceIds = new Map<string, string>();
      for (const original of guest.sessions) {
        if (this.acknowledgedImports.has(original.id)) continue;
        // Deterministic per account/source IDs make partial retries and other tabs safe.
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${this.options.userId}:${original.id}`));
        if (this.disposed) return;
        const id = `import:${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')}`;
        if (Object.hasOwn(this.revisions, id)) { this.acknowledgedImports.add(original.id); continue; }
        if (this.changes.has(id)) continue;
        additions.push({ ...original, id }); this.importIds.add(id); sourceIds.set(id, original.id);
      }
      this.importTotal = this.importIds.size;
      this.emit({ importing: this.importTotal > 0, importMessage: additions.length ? `Importing ${additions.length} lectures. The originals remain on this device.` : 'These lectures have already been imported.' });
      this.save({ ...this.snapshot.history, sessions: [...this.snapshot.history.sessions, ...additions] });
      for (const [id, originalId] of sourceIds) { const change = this.changes.get(id); if (change) change.importSourceId = originalId; }
      this.persist();
      this.persistImportMarkers(); this.readGuests();
    } catch { this.emit({ importing: false, importMessage: 'Guest history could not be imported. The originals have not been changed.' }); }
  };
  private markImported(change: Change) {
    if (!change.importSourceId) return;
    this.acknowledgedImports.add(change.importSourceId);
    this.persistImportMarkers();
    this.importIds.delete(change.id);
    if (this.importTotal) this.emit({ importing: this.importIds.size > 0, importMessage: `${this.importTotal - this.importIds.size} of ${this.importTotal} lectures imported. Originals remain on this device.` });
    this.readGuests();
  }
  private persistImportMarkers() {
    try { this.options.local.setItem(this.importsKey(), JSON.stringify([...this.acknowledgedImports])); }
    catch { /* Deterministic server IDs still prevent duplicate imports. */ }
  }
  exportRecovery = () => serializeHistory({ version: 1, activeId: null,
    sessions: [...new Map([...this.snapshot.history.sessions, ...[...this.changes.values()].map(c => c.session ?? c.backup)].map(s => [s.id, s])).values()] });
  hasPending = () => this.changes.size > 0 || Boolean(this.snapshot.error && !this.options.userId);
  dispose = () => {
    this.persist(); this.disposed = true; clearTimeout(this.timer); this.controller.abort(); this.listeners.clear();
  };
}
