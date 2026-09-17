"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveUser } from "@/lib/client/auth";

export default function SignupPage() {
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
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
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
        <h1 className="gpt-auth-title">Create your account</h1>
        <p className="gpt-auth-subtitle">Get started with Lumina for your study materials</p>

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
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="•••••••• (min 6 characters)"
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
          Already have an account?{" "}
          <Link href="/login" className="gpt-auth-link">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
