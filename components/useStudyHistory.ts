"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { StudySync, type SyncSnapshot } from '@/lib/client/study-sync';
import { StudyStorageError, studyTransport } from '@/lib/client/study-records';
import { emptyHistory, type SessionHistory } from '@/lib/client/sessions';

const initial = (): SyncSnapshot => ({ history: emptyHistory(), ready: false, busy: false, pending: 0, error: null, warning: null, conflicts: [], guestCount: 0, importing: false, importMessage: null });
// Lazy access also handles browsers which throw when reading the storage property.
const storage = (kind: 'localStorage' | 'sessionStorage') => ({
  getItem: (key: string) => window[kind].getItem(key),
  setItem: (key: string, value: string) => window[kind].setItem(key, value),
  removeItem: (key: string) => window[kind].removeItem(key),
});

export function useStudyHistory(userId: string | null, refreshAuth: () => Promise<void>) {
  const [state, setState] = useState(initial);
  const engine = useRef<StudySync | null>(null);
  const historyRef = useRef(state.history);
  useEffect(() => {
    const channel = userId && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lumina-records') : null;
    const instance = new StudySync({ userId, transport: userId ? studyTransport(userId) : undefined,
      local: storage('localStorage'), recovery: storage('sessionStorage'),
      notify: () => channel?.postMessage({ userId }), onIdentityError: () => { void refreshAuth(); },
    });
    engine.current = instance;
    const unsubscribe = instance.subscribe(() => { historyRef.current = instance.getSnapshot().history; setState(instance.getSnapshot()); });
    if (channel) channel.onmessage = event => { if (event.data?.userId === userId) void instance.refresh(); };
    const online = () => { void instance.retry(); };
    const focus = () => { if (document.visibilityState === 'visible') void instance.refresh(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (instance.hasPending()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', focus);
    const interval = userId ? setInterval(focus, 30_000) : undefined;
    void instance.start();
    return () => {
      unsubscribe(); instance.dispose(); engine.current = null; channel?.close(); clearInterval(interval);
      window.removeEventListener('online', online); window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [userId, refreshAuth]);
  function save(next: SessionHistory) { engine.current?.save(next); }
  const revisionFor = useCallback((id: string) => engine.current?.revisionFor(id) ?? 0, []);
  const ensureSaved = useCallback((id: string, signal: AbortSignal) => {
    if (!engine.current) return Promise.reject(new StudyStorageError('NOT_READY', 'Wait for your cloud lectures to open.'));
    return engine.current.ensureSaved(id, signal);
  }, []);
  const refreshCloud = useCallback((signal: AbortSignal) => {
    if (!engine.current) return Promise.reject(new StudyStorageError('NOT_READY', 'Wait for your cloud lectures to open.'));
    return engine.current.refreshConfirmed(signal);
  }, []);
  function download() {
    if (!engine.current) return;
    const url = URL.createObjectURL(new Blob([engine.current.exportRecovery()], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `lumina-study-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { ...state, historyRef, save, download, ensureSaved, refreshCloud, revisionFor,
    retry: () => { void engine.current?.retry(); },
    importGuests: () => { void engine.current?.importGuests(); },
    resolveConflict: (id: string, keepCopy: boolean) => engine.current?.resolveConflict(id, keepCopy),
  };
}
