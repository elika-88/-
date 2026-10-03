"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { notifyAuthChanged } from "@/lib/client/auth-events";
import { authErrorText, useAuthCopy } from "@/lib/i18n/auth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { a } = useAuthCopy();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const initialToken = useRef<string | null>(null);

  // The token travels in the URL fragment so it never reaches server logs; drop it from the address bar.
  useEffect(() => {
    const value = initialToken.current ?? new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    initialToken.current = value;
    window.history.replaceState(null, "", window.location.pathname);
    const frame = requestAnimationFrame(() => setToken(/^[a-f0-9]{64}$/.test(value) ? value : ""));
    return () => cancelAnimationFrame(frame);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || pending) return;
    if (password !== confirmPassword) { setError(a.mismatch); return; }
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-password", token, password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(authErrorText(a, body));
      await refresh();
      notifyAuthChanged();
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : a.genericError);
      setPending(false);
    }
  }

  return <AuthShell>
    <h1 className="gpt-auth-title">{a.resetTitle}</h1>
    {token === null ? <p className="gpt-auth-subtitle">{a.verifyOpening}</p> : !token ? <div role="alert" className="gpt-auth-error">{a.resetInvalid} <Link href="/forgot-password">{a.requestNewLink}</Link>.</div> : <>
      <p className="gpt-auth-subtitle">{a.resetLead}</p>
      {error && <p role="alert" className="gpt-auth-error">{error}{error === a.errors.INVALID_RESET || /reset link/i.test(error) ? <> <Link href="/forgot-password">{a.requestNewLink}</Link></> : null}</p>}
      <form className="gpt-auth-form" onSubmit={submit} aria-busy={pending}>
        <div className="gpt-auth-field"><label htmlFor="reset-password">{a.newPassword}</label><input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} /><small>{a.passwordHint}</small></div>
        <div className="gpt-auth-field"><label htmlFor="reset-confirm">{a.confirmPassword}</label><input id="reset-confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={pending} /></div>
        <button type="submit" className="gpt-auth-submit" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />{a.pleaseWait}</> : a.resetSubmit}</button>
      </form>
    </>}
  </AuthShell>;
}
