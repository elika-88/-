"use client";

import { useEffect, useRef, useState } from 'react';
import { emptyJobSnapshot, GenerationJobMonitor, type JobSnapshot } from '@/lib/client/generation-job-monitor';
import { generationJobsTransport, isActiveJob } from '@/lib/client/generation-jobs';

export function useGenerationJob({ userId, sessionId, ready, ensureSaved, refreshCloud, refreshAuth }: {
  userId: string | null; sessionId: string; ready: boolean;
  ensureSaved: (id: string, signal: AbortSignal) => Promise<number>;
  refreshCloud: (signal: AbortSignal) => Promise<void>;
  refreshAuth: () => Promise<void>;
}) {
  const [state, setState] = useState<{ owner: string; sessionId: string; value: JobSnapshot } | null>(null);
  const monitor = useRef<GenerationJobMonitor | null>(null);
  const enabled = Boolean(userId && ready && sessionId !== 'draft');
  useEffect(() => {
    if (!enabled || !userId) return;
    const instance = new GenerationJobMonitor({ sessionId, transport: generationJobsTransport(userId), ensureSaved, refreshCloud, onIdentityError: refreshAuth });
    monitor.current = instance;
    const unsubscribe = instance.subscribe(() => setState({ owner: userId, sessionId, value: instance.getSnapshot() }));
    const reconnect = () => { void instance.reconnect(); };
    window.addEventListener('online', reconnect);
    void instance.restore();
    return () => { unsubscribe(); instance.dispose(); monitor.current = null; window.removeEventListener('online', reconnect); };
  }, [enabled, userId, sessionId, ensureSaved, refreshCloud, refreshAuth]);
  const value = enabled ? state?.owner === userId && state.sessionId === sessionId ? state.value : { ...emptyJobSnapshot, restoring: true } : emptyJobSnapshot;
  return { ...value,
    blocked: value.restoring || Boolean(value.action) || isActiveJob(value.job) || Boolean(value.error) || value.uncertain,
    create: () => { void monitor.current?.create(); },
    cancel: () => { void monitor.current?.cancel(); },
    retry: () => { void monitor.current?.retry(); },
    reconnect: () => { void monitor.current?.reconnect(); },
  };
}
