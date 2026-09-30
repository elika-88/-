"use client";

import { useSyncExternalStore } from "react";

// Pinned lectures are a per-device UI preference; they are not synced to the account.
const KEY = "lumina.sidebar.pinned";
const EVENT = "lumina:pinned-changed";
const EMPTY: readonly string[] = [];
let cache: { raw: string | null; ids: readonly string[] } = { raw: null, ids: EMPTY };

function read(): readonly string[] {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { return cache.ids; }
  if (raw === cache.raw) return cache.ids;
  let ids: readonly string[] = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) ids = parsed.filter((value): value is string => typeof value === "string").slice(0, 50);
  } catch { /* ignore corrupt value */ }
  cache = { raw, ids };
  return ids;
}

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === KEY) callback(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(EVENT, callback); };
}

export function usePinnedLectures() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function togglePinnedLecture(id: string) {
  const current = read();
  const next = current.includes(id) ? current.filter((value) => value !== id) : [id, ...current];
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}
