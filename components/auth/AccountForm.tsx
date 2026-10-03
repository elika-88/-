"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { notifyAuthChanged } from '@/lib/client/auth-events';
import { authErrorText, useAuthCopy } from '@/lib/i18n/auth';
import { AuthShell } from './AuthShell';

export function AccountForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const registering = mode === "signup";
  const { a, language } = useAuthCopy();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registering ? { action: "register", username, email, language } : { action: "login", identifier: username, password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(authErrorText(a, body));
      if (registering) { setVerificationSent(true); setPending(false); return; }
      // The root provider survives client navigation, even without BroadcastChannel.
      await refresh();
      notifyAuthChanged();
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : a.genericError);
      setPending(false);
    }
  }

  return <AuthShell>
    <h1 className="gpt-auth-title">{registering ? a.signUpTitle : a.signInTitle}</h1>
    <p className="gpt-auth-subtitle">{registering ? a.signUpLead : a.signInLead}</p>
    {verificationSent ? <div role="status" className="gpt-auth-verification"><h2>{a.checkInboxTitle}</h2><p>{a.checkInboxText}</p><Link href="/login">{a.backToSignIn}</Link></div> : <>
    {error && <p role="alert" className="gpt-auth-error">{error}</p>}
    <form className="gpt-auth-form" onSubmit={submit} aria-busy={pending}>
      <div className="gpt-auth-field"><label htmlFor="account-username">{registering ? a.username : a.usernameOrEmail}</label><input id="account-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={registering ? 3 : 1} maxLength={registering ? 32 : 254} disabled={pending} />{registering && <small>{a.usernameHint}</small>}</div>
      {!registering && <div className="gpt-auth-field"><div className="account-label-row"><label htmlFor="account-password">{a.password}</label><Link href="/forgot-password" className="account-forgot">{a.forgot}</Link></div><div className="account-password"><input id="account-password" value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128} disabled={pending} /><button type="button" aria-label={showPassword ? a.hidePassword : a.showPassword} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>}
      {registering && <div className="gpt-auth-field"><label htmlFor="account-email">{a.email}</label><input id="account-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={pending} /></div>}
      {registering && <p className="account-legal">{a.agree[0]}<Link href="/terms">{a.agree[1]}</Link>{a.agree[2]}<Link href="/privacy">{a.agree[3]}</Link>{a.agree[4]}</p>}
      <button type="submit" className="gpt-auth-submit" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />{a.pleaseWait}</> : registering ? a.createAccount : a.signIn}</button>
    </form>
    <p className="account-switch">{registering ? a.haveAccount : a.newHere}<Link href={registering ? "/login" : "/signup"}>{registering ? a.signIn : a.signUpTitle}</Link></p>
    </>}
  </AuthShell>;
}
