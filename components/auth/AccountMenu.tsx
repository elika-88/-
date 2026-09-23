"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, LogIn, LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSettings } from "@/lib/i18n/SettingsContext";

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, ready, error, signOut, refresh } = useAuth();
  const { t } = useSettings();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function logout() {
    setPending(true);
    setFailure(null);
    try { await signOut(); }
    catch (caught) { setFailure(caught instanceof Error ? caught.message : "Could not sign out."); }
    finally { setPending(false); }
  }

  return <div className={`account-menu${compact ? " compact" : ""}`}>
    {!ready ? <LoaderCircle className="animate-spin" size={18} aria-label="Checking account" /> : user ? <>
      <div className="account-identity" title={user.username}>
        <UserRound size={18} aria-hidden="true" />
        <span className={compact ? "sr-only" : ""}>{user.username}</span>
      </div>
      <button type="button" className={compact ? "gpt-rail-btn" : "gpt-nav-item"} onClick={() => void logout()} disabled={pending} title={t.signOut} aria-label={t.signOut}>
        {pending ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> : <LogOut size={18} aria-hidden="true" />}
        {!compact && <span>{t.signOut}</span>}
      </button>
    </> : <Link href="/login" className={compact ? "gpt-rail-btn" : "gpt-nav-item"} title={t.signInOrRegister} aria-label={t.signInOrRegister}>
      <LogIn size={18} aria-hidden="true" />{!compact && <span>{t.signInOrRegister}</span>}
    </Link>}
    {(failure || error) && <div role="alert" className="account-menu-error">
      <p>{failure || error}</p>
      {error && <button type="button" onClick={() => void refresh()}>Retry</button>}
    </div>}
    {!compact && <small>{t.savedLocally}</small>}
  </div>;
}
