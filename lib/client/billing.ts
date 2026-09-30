"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { BillingSummary } from "@/lib/billing/plans";

// One shared, lazily loaded copy of /api/billing for the whole page.
type State = { summary: BillingSummary | null; error: string | null; loading: boolean };
let state: State = { summary: null, error: null, loading: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const SERVER_STATE: State = { summary: null, error: null, loading: false };

function set(next: Partial<State>) { state = { ...state, ...next }; listeners.forEach((listener) => listener()); }

export function refreshBilling(): Promise<void> {
  if (inflight) return inflight;
  set({ loading: true });
  inflight = fetch("/api/billing", { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || typeof body !== "object" || !("plan" in body)) throw new Error("Billing is unavailable.");
      set({ summary: body as BillingSummary, error: null });
    })
    .catch((error: unknown) => set({ error: error instanceof Error ? error.message : "Billing is unavailable." }))
    .finally(() => { inflight = null; set({ loading: false }); });
  return inflight;
}

export function setBillingSummary(summary: BillingSummary) { set({ summary, error: null }); }

function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** Current plan and usage. `accountKey` re-fetches when the signed-in account changes. */
export function useBilling(accountKey: string | null = null) {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  useEffect(() => { void refreshBilling(); }, [accountKey]);
  return snapshot;
}
