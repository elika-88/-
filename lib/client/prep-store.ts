"use client";

import { useSyncExternalStore } from "react";
import type { ExamId } from "@/lib/prep/exams";
import type { ReadingSet } from "@/lib/prep/schema";

// Per-device prep data (profile, recent attempts, last generated set). Account sync is a later step.
const KEY = "lumina.prep.v1";
const EVENT = "lumina:prep-changed";

export type ExamProfile = { target: number | null; date: string | null };
export type PrepAttempt = { id: string; exam: ExamId; title: string; correct: number; total: number; at: number };
export type SavedSet = { exam: ExamId; passage: string; types: string[]; set: ReadingSet; createdAt: number };
export type PrepState = { profiles: Partial<Record<ExamId, ExamProfile>>; attempts: PrepAttempt[]; sets: Partial<Record<ExamId, SavedSet>> };

const EMPTY: PrepState = { profiles: {}, attempts: [], sets: {} };
let cache: { raw: string | null; state: PrepState } = { raw: null, state: EMPTY };

function read(): PrepState {
  let raw: string | null;
  try { raw = window.localStorage.getItem(KEY); } catch { return cache.state; }
  if (raw === cache.raw) return cache.state;
  let state = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) as Partial<PrepState> : null;
    if (parsed && typeof parsed === "object") state = { profiles: parsed.profiles ?? {}, attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [], sets: parsed.sets ?? {} };
  } catch { /* ignore corrupt value */ }
  cache = { raw, state };
  return state;
}

function write(update: (state: PrepState) => PrepState) {
  const next = update(read());
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === KEY) callback(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(EVENT, callback); };
}

export const usePrepState = () => useSyncExternalStore(subscribe, read, () => EMPTY);

export function saveProfile(exam: ExamId, profile: ExamProfile) {
  write((state) => ({ ...state, profiles: { ...state.profiles, [exam]: profile } }));
}

export function saveSet(saved: SavedSet) {
  write((state) => ({ ...state, sets: { ...state.sets, [saved.exam]: saved } }));
}

export function clearSet(exam: ExamId) {
  write((state) => { const sets = { ...state.sets }; delete sets[exam]; return { ...state, sets }; });
}

export function recordAttempt(attempt: Omit<PrepAttempt, "id" | "at">) {
  write((state) => ({ ...state, attempts: [{ ...attempt, id: crypto.randomUUID(), at: Date.now() }, ...state.attempts].slice(0, 60) }));
}

export function daysUntil(date: string | null, now: number) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}
