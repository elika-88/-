"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export function AccountForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const registering = mode === "signup";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registering ? { action: "register", username, email, password } : { action: "login", identifier: username, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not complete sign-in.");
      // The root provider survives client navigation, even without BroadcastChannel.
      await refresh();
      const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("lumina-auth");
      channel?.postMessage("changed"); channel?.close();
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connection failed. Try again.");
      setPending(false);
    }
  }

  return <main className="gpt-auth-page">
    <Link href="/" className="account-back"><ArrowLeft size={16} aria-hidden="true" />Back to study</Link>
    <div className="gpt-auth-box">
      <p className="account-brand">
        <Image src="/brand/lumina-logo.png" alt="" width={42} height={42} priority />
        <span>Lumina</span>
      </p>
      <h1 className="gpt-auth-title">{registering ? "Create an account" : "Welcome back"}</h1>
      <p className="gpt-auth-subtitle">{registering ? "Create your Lumina account." : "Sign in to your Lumina account."} Lecture history is currently saved on this device.</p>
      {error && <p role="alert" className="gpt-auth-error">{error}</p>}
      <form className="gpt-auth-form" onSubmit={submit} aria-busy={pending}>
        <div className="gpt-auth-field"><label htmlFor="account-username">{registering ? "Username" : "Username or email"}</label><input id="account-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={registering ? 3 : 1} maxLength={registering ? 32 : 254} disabled={pending} />{registering && <small>3–32 letters, numbers, underscores or hyphens.</small>}</div>
        <div className="gpt-auth-field"><label htmlFor="account-password">Password</label><div className="account-password"><input id="account-password" value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={registering ? "new-password" : "current-password"} required minLength={registering ? 8 : 1} maxLength={128} disabled={pending} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{registering && <small>Use at least 8 characters.</small>}</div>
        {registering && <div className="gpt-auth-field"><label htmlFor="account-email">Email</label><input id="account-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={pending} /></div>}
        <button type="submit" className="gpt-auth-submit" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />Please wait</> : registering ? "Create account" : "Sign in"}</button>
      </form>
      <p className="account-switch">{registering ? "Already have an account? " : "New to Lumina? "}<Link href={registering ? "/login" : "/signup"}>{registering ? "Sign in" : "Create an account"}</Link></p>
    </div>
  </main>;
}
