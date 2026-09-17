"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Account = { id: string; username: string; email: string; createdAt: string };
type AuthContextValue = {
  user: Account | null;
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not check your account.");
      setUser(body.user);
      setError(null);
    } catch {
      setError("Could not check your account. Refresh before editing saved lectures.");
    } finally { setReady(true); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error("Account unavailable");
        if (!controller.signal.aborted) { setUser(body.user); setError(null); }
      })
      .catch(() => { if (!controller.signal.aborted) setError("Could not check your account. Refresh before editing saved lectures."); })
      .finally(() => { if (!controller.signal.aborted) setReady(true); });
    return () => controller.abort();
  }, []);

  const signOut = useCallback(async () => {
    const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    if (!response.ok) throw new Error("Could not sign out. Try again.");
    setUser(null);
    setError(null);
    // Notify other open Lumina tabs without persisting credentials or profiles.
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("lumina-auth");
    channel?.postMessage("changed");
    channel?.close();
  }, []);

  useEffect(() => {
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("lumina-auth");
    if (channel) channel.onmessage = () => { void refresh(); };
    return () => channel?.close();
  }, [refresh]);

  return <AuthContext.Provider value={{ user, ready, error, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
