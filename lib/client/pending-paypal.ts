"use client";

import { useSyncExternalStore } from "react";

const prefix = "lumina:pending-paypal:";
const memory = new Map<string, string | null>();
const listeners = new Set<() => void>();
export const isPayPalSubscriptionId = (value: string) => /^I-[A-Z0-9]{6,40}$/.test(value);

export function readPendingPayPal(userId: string): string | null {
  if (typeof window === "undefined") return null;
  if (memory.has(userId)) return memory.get(userId) ?? null;
  try {
    const value = window.localStorage.getItem(prefix + userId);
    return value && isPayPalSubscriptionId(value) ? value : null;
  } catch { return null; }
}

// Recovery hints never grant access: the server verifies ownership and status.
export function savePendingPayPal(userId: string, subscriptionId: string) {
  if (!isPayPalSubscriptionId(subscriptionId)) return;
  memory.set(userId, subscriptionId);
  try { window.localStorage.setItem(prefix + userId, subscriptionId); } catch { /* Keep the in-memory recovery hint. */ }
  listeners.forEach(listener => listener());
}

export function clearPendingPayPal(userId: string, subscriptionId: string) {
  if (readPendingPayPal(userId) !== subscriptionId) return;
  memory.set(userId, null);
  try { window.localStorage.removeItem(prefix + userId); } catch { /* The verified result is still usable in this tab. */ }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && !event.key.startsWith(prefix)) return;
    if (event.key === null) memory.clear();
    else memory.delete(event.key.slice(prefix.length));
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function usePendingPayPal(userId: string | null) {
  return useSyncExternalStore(subscribe, () => userId ? readPendingPayPal(userId) : null, () => null);
}
