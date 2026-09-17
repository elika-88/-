"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveUser } from "@/lib/client/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }
    const name = email.split("@")[0] || "User";
    saveUser({
      id: "usr_" + Math.random().toString(36).slice(2, 9),
      email: email.trim(),
      name,
    });
    router.push("/");
  };

  return (
    <div className="gpt-auth-page">
      <div className="gpt-auth-header">
        <span className="gpt-auth-logo">Lumina</span>
      </div>

      <div className="gpt-auth-box">
        <h1 className="gpt-auth-title">Welcome back</h1>
        <p className="gpt-auth-subtitle">Log in to your Lumina account to continue</p>

        {error && <div className="gpt-auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="gpt-auth-form">
          <div className="gpt-auth-field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="gpt-auth-field">
            <div className="gpt-auth-label-row">
              <label htmlFor="password">Password</label>
              <a href="#" className="gpt-auth-forgot" onClick={(e) => e.preventDefault()}>Forgot?</a>
            </div>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="gpt-auth-submit">
            Continue
          </button>
        </form>

        <div className="gpt-auth-footer-prompt">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="gpt-auth-link">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
