"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { notifyAuthChanged } from "@/lib/client/auth-events";

export default function VerifyEmailPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const initialToken = useRef<string | null>(null);

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
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Verification failed. Request a new link.");
      await refresh();
      notifyAuthChanged();
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed. Try again.");
      setPending(false);
    }
  }

  return <main className="gpt-auth-page">
    <Link href="/" className="account-back">Back to study</Link>
    <div className="gpt-auth-box">
      <p className="account-brand"><Image src="/brand/lumina-logo.png" alt="" width={42} height={42} priority /><span>Lumina</span></p>
      <h1 className="gpt-auth-title">Verify your email</h1>
      {token === null ? <p className="gpt-auth-subtitle">Opening verification link…</p> : !token ? <div role="alert" className="gpt-auth-error">This verification link is invalid. <Link href="/signup">Register again</Link>.</div> : <>
        <p className="gpt-auth-subtitle">Choose a password to finish creating your account.</p>
        {error && <p role="alert" className="gpt-auth-error">{error}</p>}
        <form className="gpt-auth-form" onSubmit={submit} aria-busy={pending}>
          <div className="gpt-auth-field"><label htmlFor="verify-password">Password</label><input id="verify-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} /><small>Use at least 8 characters.</small></div>
          <div className="gpt-auth-field"><label htmlFor="verify-confirm">Confirm password</label><input id="verify-confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={pending} /></div>
          <button type="submit" className="gpt-auth-submit" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />Please wait</> : "Verify and create account"}</button>
        </form>
      </>}
    </div>
  </main>;
}
