import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudySync } from '@/lib/client/study-sync';
import { StudyStorageError, type StudyTransport } from '@/lib/client/study-records';
import { createSession, emptyHistory, serializeHistory, STORAGE_KEY, type StudySession } from '@/lib/client/sessions';

const userId = 'a20e5041-118e-4de0-b7b6-6ecf279c5b23';
function memory() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function fixture() {
  const records = new Map<string, StudySession>();
  const revisions: Record<string, number> = {};
  const transport: StudyTransport = {
    list: vi.fn(async () => ({ userId, sessions: structuredClone([...records.values()]), revisions: { ...revisions }, storage: 'local' as const })),
    save: vi.fn(async (session, expected) => {
      if ((revisions[session.id] ?? 0) !== expected || (revisions[session.id] && !records.has(session.id))) throw new StudyStorageError('CONFLICT', 'Changed', 409);
      records.set(session.id, structuredClone(session)); revisions[session.id] = expected + 1;
      return { session, revision: expected + 1 };
    }),
    remove: vi.fn(async (id, expected) => {
      if (revisions[id] !== expected) throw new StudyStorageError('CONFLICT', 'Changed', 409);
      records.delete(id); revisions[id]++;
      return { deleted: true as const, revision: revisions[id] };
    }),
  };
  const local = memory(), recovery = memory();
  const instances: StudySync[] = [];
  const make = (id: string | null = userId) => {
    const sync = new StudySync({ userId: id, transport, local, recovery, debounceMs: 600_000 });
    instances.push(sync); return sync;
  };
  const sync = make();
  return { sync, make, transport, records, revisions, local, recovery, dispose: () => instances.forEach(s => s.dispose()) };
}
const cleanups: (() => void)[] = [];
function setup() { const value = fixture(); cleanups.push(value.dispose); return value; }
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); });
const session = (title = 'Local') => ({ ...createSession(), title, lecture: 'Original lecture' });
function edit(sync: StudySync, item: StudySession) {
  const current = sync.getSnapshot().history;
  sync.save({ ...current, activeId: item.id, sessions: [...current.sessions.filter(s => s.id !== item.id), item] });
}

describe('account study synchronization', () => {
  it('confirms the newest revision after an in-flight save and subsequent edits', async () => {
    const f = setup(); await f.sync.start(); const first = session();
    const gate = deferred<{ session: StudySession; revision: number }>(); const actual = f.transport.save;
    f.transport.save = vi.fn().mockImplementationOnce(() => gate.promise).mockImplementation(actual);
    edit(f.sync, first); const writing = f.sync.flush();
    const latest = { ...first, lecture: 'The exact version to generate' }; edit(f.sync, latest);
    let confirmed = false;
    const saving = f.sync.ensureSaved(first.id, new AbortController().signal).then(revision => { confirmed = true; return revision; });
    await Promise.resolve(); expect(confirmed).toBe(false);
    f.records.set(first.id, first); f.revisions[first.id] = 1; gate.resolve({ session: first, revision: 1 });
    await writing; expect(await saving).toBe(2); expect(f.records.get(first.id)).toEqual(latest);
  });
  it('refuses generation when a save fails or conflicts and cancels waiters on disposal', async () => {
    const f = setup(); await f.sync.start(); const item = session(); edit(f.sync, item);
    f.transport.save = vi.fn(async () => { throw new StudyStorageError('NETWORK', 'Offline'); });
    await expect(f.sync.ensureSaved(item.id, new AbortController().signal)).rejects.toMatchObject({ code: 'NETWORK' });
    f.transport.save = vi.fn(async () => { throw new StudyStorageError('CONFLICT', 'Changed'); });
    f.records.set(item.id, { ...item, lecture: 'Other device' }); f.revisions[item.id] = 2;
    await f.sync.refresh();
    await expect(f.sync.ensureSaved(item.id, new AbortController().signal)).rejects.toMatchObject({ code: 'CONFLICT' });
    const gate = deferred<Awaited<ReturnType<StudyTransport['list']>>>(); f.transport.list = vi.fn(() => gate.promise);
    const refresh = f.sync.refresh(); const waiter = f.sync.ensureSaved(item.id, new AbortController().signal);
    const rejected = expect(waiter).rejects.toMatchObject({ name: 'AbortError' }); f.sync.dispose(); await rejected;
    gate.resolve({ userId, sessions: [], revisions: {}, storage: 'local' }); await refresh;
  });
  it('waits for an in-flight save before refreshing worker results and copies', async () => {
    const f = setup(); await f.sync.start(); const item = session(); edit(f.sync, item);
    const gate = deferred<{ session: StudySession; revision: number }>(); f.transport.save = vi.fn(() => gate.promise);
    const writing = f.sync.flush(); const refreshed = f.sync.refreshConfirmed(new AbortController().signal);
    await Promise.resolve(); expect(f.transport.list).toHaveBeenCalledTimes(1);
    const copy = session('Generated copy'); f.records.set(item.id, item); f.revisions[item.id] = 1;
    f.records.set(copy.id, copy); f.revisions[copy.id] = 1;
    gate.resolve({ session: item, revision: 1 }); await writing; await refreshed;
    expect(f.sync.getSnapshot().history.sessions).toEqual(expect.arrayContaining([copy, item]));
  });
  it('loads cloud records, never presents or uploads guest history without explicit import', async () => {
    const f = setup(); const guest = session('Guest private'); const cloud = session('Cloud');
    f.local.setItem(STORAGE_KEY, serializeHistory({ version: 1, activeId: guest.id, sessions: [guest] }));
    f.records.set(cloud.id, cloud); f.revisions[cloud.id] = 1;
    await f.sync.start();
    expect(f.sync.getSnapshot().history.sessions).toEqual([cloud]);
    expect(f.sync.getSnapshot().guestCount).toBe(1); expect(f.transport.save).not.toHaveBeenCalled();
    await f.sync.importGuests(); await f.sync.flush();
    expect(f.records.size).toBe(2); expect(f.local.getItem(STORAGE_KEY)).toContain('Guest private');
    expect(f.sync.getSnapshot().guestCount).toBe(0);
    await f.sync.importGuests(); await f.sync.flush(); expect(f.records.size).toBe(2);
  });
  it('serializes edits made while a save is in flight and saves the latest revision', async () => {
    const f = setup(); await f.sync.start(); const first = session();
    const gate = deferred<{ session: StudySession; revision: number }>();
    const actual = f.transport.save;
    f.transport.save = vi.fn().mockImplementationOnce(() => gate.promise).mockImplementation(actual);
    edit(f.sync, first); const writing = f.sync.flush();
    const latest = { ...first, lecture: 'Newest text' }; edit(f.sync, latest);
    f.records.set(first.id, first); f.revisions[first.id] = 1; gate.resolve({ session: first, revision: 1 });
    await writing;
    expect(f.records.get(first.id)).toEqual(latest); expect(f.revisions[first.id]).toBe(2);
    expect(f.sync.getSnapshot().pending).toBe(0);
  });
  it('retains failed saves across reload, and recovers a committed write whose response was lost', async () => {
    const f = setup(); await f.sync.start(); const item = session();
    const actual = f.transport.save;
    f.transport.save = vi.fn(async (...args: Parameters<StudyTransport['save']>) => { await actual(...args); throw new StudyStorageError('NETWORK', 'Lost response'); });
    edit(f.sync, item); await f.sync.flush();
    expect(f.sync.getSnapshot().error?.code).toBe('NETWORK');
    expect(f.recovery.getItem(`lumina.pending.v1.${userId}`)).toContain(item.lecture);
    f.sync.dispose(); const restored = f.make(); await restored.start();
    expect(restored.getSnapshot().history.sessions).toEqual([item]);
    expect(restored.getSnapshot().pending).toBe(0); expect(restored.getSnapshot().conflicts).toEqual([]);
    expect(f.transport.save).toHaveBeenCalledTimes(1);
  });
  it('keeps newer edits when an older committed write loses its response', async () => {
    const f = setup(); await f.sync.start(); const item = session();
    const gate = deferred<void>(); const actual = f.transport.save;
    f.transport.save = vi.fn(async (...args: Parameters<StudyTransport['save']>) => { await actual(...args); await gate.promise; throw new StudyStorageError('NETWORK', 'Lost response'); });
    edit(f.sync, item); const writing = f.sync.flush(); await Promise.resolve();
    const latest = { ...item, lecture: 'Changed during request' }; edit(f.sync, latest);
    gate.resolve(); await writing;
    f.transport.save = actual; await f.sync.retry(); await f.sync.flush();
    expect(f.records.get(item.id)).toEqual(latest); expect(f.revisions[item.id]).toBe(2);
  });
  it('detects changed/deleted records and keeps local copies without overwriting or resurrecting originals', async () => {
    const f = setup(); const item = session(); f.records.set(item.id, item); f.revisions[item.id] = 1;
    await f.sync.start(); edit(f.sync, { ...item, lecture: 'My unsaved changes' });
    f.records.set(item.id, { ...item, lecture: 'Other device' }); f.revisions[item.id] = 2;
    await f.sync.flush(); expect(f.sync.getSnapshot().conflicts).toHaveLength(1);
    f.sync.resolveConflict(item.id, true); await f.sync.flush();
    expect(f.records.get(item.id)?.lecture).toBe('Other device');
    expect([...f.records.values()].some(s => s.id !== item.id && s.lecture === 'My unsaved changes')).toBe(true);
    edit(f.sync, { ...item, lecture: 'Local after deletion' }); f.records.delete(item.id); f.revisions[item.id] = 3;
    await f.sync.flush(); expect(f.sync.getSnapshot().conflicts[0].remote).toBeNull();
    f.sync.resolveConflict(item.id, false); await f.sync.flush(); expect(f.records.has(item.id)).toBe(false);
  });
  it('does not confuse the account storage limit with a revision conflict', async () => {
    const f = setup(); await f.sync.start(); const item = session(); edit(f.sync, item);
    f.transport.save = vi.fn(async () => { throw new StudyStorageError('STORAGE_LIMIT', 'Storage full', 409); });
    await f.sync.flush();
    expect(f.sync.getSnapshot().error?.code).toBe('STORAGE_LIMIT'); expect(f.sync.getSnapshot().conflicts).toEqual([]);
    expect(f.sync.getSnapshot().history.sessions).toEqual([item]);
  });
  it('preserves pending deletion on failure and does not delete a newer remote revision', async () => {
    const f = setup(); const item = session(); f.records.set(item.id, item); f.revisions[item.id] = 1;
    await f.sync.start(); f.sync.save(emptyHistory());
    f.records.set(item.id, { ...item, title: 'Updated elsewhere' }); f.revisions[item.id] = 2;
    await f.sync.flush(); expect(f.sync.getSnapshot().conflicts[0].deletedLocally).toBe(true);
    expect(f.sync.exportRecovery()).toContain(item.lecture);
    f.sync.resolveConflict(item.id, false);
    expect(f.sync.getSnapshot().history.sessions[0].title).toBe('Updated elsewhere');
  });
  it('prevents disposed account responses from updating state or issuing additional writes', async () => {
    const f = setup(); await f.sync.start(); const item = session();
    const gate = deferred<{ session: StudySession; revision: number }>();
    f.transport.save = vi.fn(() => gate.promise); edit(f.sync, item);
    const writing = f.sync.flush(); edit(f.sync, { ...item, lecture: 'Retained recovery' }); f.sync.dispose();
    gate.resolve({ session: item, revision: 1 }); await writing;
    expect(f.transport.save).toHaveBeenCalledTimes(1);
    expect(f.recovery.getItem(`lumina.pending.v1.${userId}`)).toContain('Retained recovery');
    const other = f.make('1a6c8cc9-8707-43b0-9072-3708383773c4'); await other.start();
    expect(other.getSnapshot().history.sessions).toEqual([]);
  });
  it('never loads guest data when account storage cannot be loaded', async () => {
    const f = setup(); const guest = session('Guest'); f.local.setItem(STORAGE_KEY, serializeHistory({ version: 1, activeId: guest.id, sessions: [guest] }));
    f.transport.list = vi.fn(async () => { throw new StudyStorageError('NETWORK', 'Offline'); });
    await f.sync.start(); expect(f.sync.getSnapshot().ready).toBe(false); expect(f.sync.getSnapshot().history.sessions).toEqual([]);
    edit(f.sync, session()); expect(f.sync.getSnapshot().pending).toBe(0);
  });
  it('does not discard edits created during a cloud refresh', async () => {
    const f = setup(); await f.sync.start(); const result = await f.transport.list(new AbortController().signal);
    const gate = deferred<typeof result>(); f.transport.list = vi.fn(() => gate.promise);
    const refreshing = f.sync.refresh(); const item = session(); edit(f.sync, item); gate.resolve(result); await refreshing;
    expect(f.sync.getSnapshot().history.sessions).toEqual([item]); await f.sync.flush(); expect(f.records.get(item.id)).toEqual(item);
  });
  it('keeps unreadable guest storage intact and permits an in-memory recovery export', async () => {
    const f = setup(); f.local.setItem(STORAGE_KEY, '{broken'); const guest = f.make(null); await guest.start();
    edit(guest, session('New text')); expect(f.local.getItem(STORAGE_KEY)).toBe('{broken');
    expect(guest.exportRecovery()).toContain('New text'); expect(guest.getSnapshot().warning).toBeTruthy();
  });
  it('imports valid long guest IDs and resumes a partial import without duplicating successful records', async () => {
    const f = setup(); const a = { ...session('First import'), id: 'a'.repeat(100) }; const b = session('Second import');
    const original = serializeHistory({ version: 1, activeId: a.id, sessions: [a, b] }); f.local.setItem(STORAGE_KEY, original);
    await f.sync.start(); const actual = f.transport.save; let calls = 0;
    f.transport.save = vi.fn(async (...args: Parameters<StudyTransport['save']>) => {
      if (++calls === 2) throw new StudyStorageError('NETWORK', 'Connection interrupted');
      return actual(...args);
    });
    await f.sync.importGuests(); await f.sync.flush(); expect(f.records.size).toBe(1);
    expect(f.sync.getSnapshot().importMessage).toContain('1 of 2'); expect(f.sync.getSnapshot().guestCount).toBe(1);
    f.sync.dispose(); const resumed = f.make(); f.transport.save = actual;
    await resumed.start(); await resumed.flush();
    expect(f.records.size).toBe(2); expect(resumed.getSnapshot().guestCount).toBe(0);
    expect(f.local.getItem(STORAGE_KEY)).toBe(original);
    await resumed.importGuests(); await resumed.flush(); expect(f.records.size).toBe(2);
  });
  it('ignores a conflict reload arriving after account disposal', async () => {
    const f = setup(); await f.sync.start(); const item = session(); edit(f.sync, item);
    f.transport.save = vi.fn(async () => { throw new StudyStorageError('CONFLICT', 'Changed', 409); });
    const response = { userId, sessions: [item], revisions: { [item.id]: 1 }, storage: 'local' as const };
    const gate = deferred<typeof response>(); f.transport.list = vi.fn(() => gate.promise);
    const writing = f.sync.flush(); await Promise.resolve(); f.sync.dispose();
    const journal = f.recovery.getItem(`lumina.pending.v1.${userId}`);
    gate.resolve(response); await writing;
    expect(f.recovery.getItem(`lumina.pending.v1.${userId}`)).toBe(journal);
  });
  it('automatically saves the last edit after the debounce period', async () => {
    vi.useFakeTimers();
    const f = setup();
    try {
      await f.sync.start(); const item = session(); edit(f.sync, item); edit(f.sync, { ...item, lecture: 'Final typing' });
      expect(f.transport.save).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(f.transport.save).toHaveBeenCalledTimes(1); expect(f.records.get(item.id)?.lecture).toBe('Final typing');
    } finally { f.dispose(); vi.useRealTimers(); }
  });
});
