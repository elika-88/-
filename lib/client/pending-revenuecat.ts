"use client";
import { useSyncExternalStore } from 'react';

const prefix = 'lumina:pending-revenuecat:';
const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();
export function readPendingRevenueCat(userId: string) {
  if (memory.has(userId)) return memory.get(userId)!;
  try { return window.localStorage.getItem(prefix + userId) === 'pending'; } catch { return false; }
}
export function setPendingRevenueCat(userId: string, pending: boolean) {
  memory.set(userId, pending);
  try {
    if (pending) window.localStorage.setItem(prefix + userId, 'pending');
    else window.localStorage.removeItem(prefix + userId);
  } catch { /* In-memory hint remains available; it never grants access. */ }
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key && !event.key.startsWith(prefix)) return;
    if (event.key) memory.delete(event.key.slice(prefix.length)); else memory.clear();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}
export function usePendingRevenueCat(userId: string | null) {
  return useSyncExternalStore(subscribe, () => userId ? readPendingRevenueCat(userId) : false, () => false);
}
