"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { authErrorText, useAuthCopy } from "@/lib/i18n/auth";

export default function ForgotPasswordPage() {
  const { a, language } = useAuthCopy();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-reset", email, language }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(authErrorText(a, body));
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : a.genericError);
    } finally { setPending(false); }
  }

  return <AuthShell>
    <h1 className="gpt-auth-title">{a.forgotTitle}</h1>
    {sent ? <div role="status" className="gpt-auth-verification"><h2>{a.sentTitle}</h2><p>{a.sentText}</p><Link href="/login">{a.backToSignIn}</Link></div> : <>
      <p className="gpt-auth-subtitle">{a.forgotLead}</p>
      {error && <p role="alert" className="gpt-auth-error">{error}</p>}
      <form className="gpt-auth-form" onSubmit={submit} aria-busy={pending}>
        <div className="gpt-auth-field"><label htmlFor="reset-email">{a.email}</label><input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={pending} /></div>
        <button type="submit" className="gpt-auth-submit" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />{a.pleaseWait}</> : a.sendLink}</button>
      </form>
      <p className="account-switch"><Link href="/login">{a.backToSignIn}</Link></p>
    </>}
  </AuthShell>;
}
