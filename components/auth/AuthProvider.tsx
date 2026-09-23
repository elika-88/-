"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { UserProfileSchema } from "@/lib/contracts/auth";
import { AUTH_EVENT_KEY, notifyAuthChanged } from '@/lib/client/auth-events';

export type Account = { id: string; username: string; email: string; createdAt: string };
type AuthContextValue = {
  user: Account | null;
  ready: boolean;
  verified: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  recheckIdentity: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++accountVersion.current;
    try {
      const response = await fetch("/api/auth", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not check your account.");
      const account = body.user === null ? null : UserProfileSchema.parse(body.user);
      if (version !== accountVersion.current) return;
      setUser(account);
      setError(null);
    } catch {
      if (version === accountVersion.current) setError("Could not check your account. Please retry.");
    } finally { if (version === accountVersion.current) { setReady(true); setVerified(true); } }
  }, []);
  const recheckIdentity = useCallback(async () => { setVerified(false); await refresh(); }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++accountVersion.current;
    fetch("/api/auth", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error("Account unavailable");
        const account = body.user === null ? null : UserProfileSchema.parse(body.user);
        if (!controller.signal.aborted && version === accountVersion.current) { setUser(account); setError(null); }
      })
      .catch(() => { if (!controller.signal.aborted && version === accountVersion.current) setError("Could not check your account. Please retry."); })
      .finally(() => { if (!controller.signal.aborted && version === accountVersion.current) { setReady(true); setVerified(true); } });
    return () => controller.abort();
  }, []);

  const signOut = useCallback(async () => {
    const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    if (!response.ok) throw new Error("Could not sign out. Try again.");
    // Ignore checks started before logout completed: their cookie may be stale.
    ++accountVersion.current;
    setUser(null);
    setReady(true);
    setVerified(true);
    setError(null);
    // Notify other open Lumina tabs without persisting credentials or profiles.
    notifyAuthChanged();
  }, []);

  useEffect(() => {
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("lumina-auth");
    const changed = () => { void recheckIdentity(); };
    const storage = (event: StorageEvent) => { if (event.key === AUTH_EVENT_KEY || event.key === null) changed(); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    if (channel) channel.onmessage = changed;
    window.addEventListener('storage', storage); document.addEventListener('visibilitychange', visible);
    return () => { channel?.close(); window.removeEventListener('storage', storage); document.removeEventListener('visibilitychange', visible); };
  }, [refresh, recheckIdentity]);

  return <AuthContext.Provider value={{ user, ready, verified, error, refresh, recheckIdentity, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
