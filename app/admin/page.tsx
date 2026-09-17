"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Key,
  Globe,
  Cpu,
  Layers,
  LogOut,
  Save,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react';

type Settings = {
  baseURL: string;
  model: string;
  apiFormat: "responses" | "chat_completions";
  revision: number;
  hasApiKey: boolean;
  source: string;
  updatedAt: number | null;
};

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [setupError, setSetupError] = useState("");
  const [password, setPassword] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(true);
  const [audit, setAudit] = useState<{ event: string; created_at: number }[]>([]);

  async function refresh() {
    const response = await fetch("/api/admin", { cache: "no-store" });
    const data = await response.json();
    setAuthenticated(data.authenticated === true);
    if (data.configured !== undefined) setConfigured(data.configured);
    setSetupError(data.setupError ?? "");
    setSettings(data.settings ?? null);
    setAudit(data.audit ?? []);
    if (response.status !== 401 && !response.ok) {
      throw new Error(data.error ?? "Could not load settings.");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        setAuthenticated(data.authenticated === true);
        if (data.configured !== undefined) setConfigured(data.configured);
        setSetupError(data.setupError ?? "");
        setSettings(data.settings ?? null);
        setAudit(data.audit ?? []);
        if (data.error) setErrorMsg(data.error);
      })
      .catch(() => {
        if (!controller.signal.aborted) setErrorMsg("Could not load administration.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);

  async function action(event: FormEvent, name: "login" | "save" | "logout") {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setErrorMsg("");

    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          name === "login"
            ? { action: name, password }
            : name === "save" && settings
            ? {
                action: name,
                settings: {
                  baseURL: settings.baseURL,
                  model: settings.model,
                  apiFormat: settings.apiFormat,
                  apiKey,
                  revision: settings.revision,
                },
              }
            : { action: name }
        ),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Operation failed.");

      setPassword("");
      setApiKey("");
      await refresh();
      if (name === "save") setMessage("Configuration updated successfully. New generations will use these settings.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }

  // 1. Unauthenticated Login Card (Matching ChatGPT Login style)
  if (!authenticated) {
    return (
      <div className="gpt-auth-page">
        <div className="gpt-auth-header">
          <Link href="/" className="gpt-admin-back-link">
            <ArrowLeft size={16} /> Back to study
          </Link>
        </div>

        <div className="gpt-auth-box">
          
          <h1 className="gpt-auth-title">System Admin</h1>
          <p className="gpt-auth-subtitle">Enter administrator password to manage AI relays</p>

          {!configured && (
            <div className="gpt-auth-error">
              {setupError || "Administration is not configured on this server."}
            </div>
          )}

          {errorMsg && <div className="gpt-auth-error">{errorMsg}</div>}

          <form onSubmit={(e) => action(e, "login")} className="gpt-auth-form">
            <div className="gpt-auth-field">
              <label htmlFor="admin-password">Administrator Password</label>
              <input
                id="admin-password"
                type="password"
                placeholder="Enter admin password (default: 123123)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={1024}
                disabled={busy}
                autoFocus
              />
            </div>

            <button type="submit" className="gpt-auth-submit" disabled={busy || !configured}>
              {busy ? "Authenticating..." : "Sign in to Admin"}
            </button>
          </form>

          <div className="gpt-auth-footer-prompt">
            Default credentials: password <span className="gpt-code-tag">123123</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Authenticated Dashboard Card (Pure Clean ChatGPT Panel Style)
  return (
    <div className="gpt-admin-dashboard-page">
      <div className="gpt-admin-container">
        {/* Top Navbar */}
        <header className="gpt-admin-nav">
          <Link href="/" className="gpt-admin-back-btn">
            <ArrowLeft size={16} /> Back to study workspace
          </Link>

          <button
            type="button"
            className="gpt-admin-signout-btn"
            onClick={(e) => action(e, "logout")}
            disabled={busy}
          >
            <LogOut size={15} /> Sign out
          </button>
        </header>

        {/* Title Area */}
        <div className="gpt-admin-hero">
          <div className="gpt-admin-hero-badge">
            <ShieldCheck size={16} /> Administrator Mode
          </div>
          <h1>AI Relay & Engine Settings</h1>
          <p>Configure model endpoints, authentication keys and transmission formats.</p>
        </div>

        {/* Feedback Messages */}
        {message && (
          <div className="gpt-admin-alert success">
            <CheckCircle2 size={18} />
            <span>{message}</span>
          </div>
        )}

        {errorMsg && (
          <div className="gpt-admin-alert error">
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Settings Form Card */}
        {settings && (
          <div className="gpt-admin-card">
            <form onSubmit={(e) => action(e, "save")}>
              <div className="gpt-admin-fields">
                {/* API Base URL */}
                <div className="gpt-admin-field">
                  <label htmlFor="admin-url">
                    <Globe size={15} /> API Base URL
                  </label>
                  <input
                    id="admin-url"
                    type="url"
                    className="gpt-admin-input"
                    required
                    placeholder="https://api.openai.com/v1"
                    value={settings.baseURL}
                    onChange={(e) => setSettings({ ...settings, baseURL: e.target.value })}
                    disabled={busy}
                  />
                  <small>The root gateway endpoint where LLM completions will be directed.</small>
                </div>

                {/* API Key */}
                <div className="gpt-admin-field">
                  <label htmlFor="admin-key">
                    <Key size={15} /> API Key {settings.hasApiKey ? "(Configured ✓)" : "(Required)"}
                  </label>
                  <input
                    id="admin-key"
                    type="password"
                    autoComplete="off"
                    className="gpt-admin-input"
                    placeholder={settings.hasApiKey ? "Leave empty to keep current key" : "sk-..."}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    maxLength={4096}
                    disabled={busy}
                  />
                  <small>Encrypted with AES-256-GCM in local database. Raw keys are never leaked.</small>
                </div>

                {/* Model ID */}
                <div className="gpt-admin-field">
                  <label htmlFor="admin-model">
                    <Cpu size={15} /> Model Identifier
                  </label>
                  <input
                    id="admin-model"
                    className="gpt-admin-input"
                    required
                    placeholder="gpt-5.5"
                    value={settings.model}
                    onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                    disabled={busy}
                  />
                  <small>e.g. gpt-5.5, gpt-4o, or your custom fine-tuned model name.</small>
                </div>

                {/* API Format Select */}
                <div className="gpt-admin-field">
                  <label htmlFor="admin-format">
                    <Layers size={15} /> Protocol / Format
                  </label>
                  <select
                    id="admin-format"
                    className="gpt-admin-select"
                    value={settings.apiFormat}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        apiFormat: e.target.value as Settings["apiFormat"],
                      })
                    }
                    disabled={busy}
                  >
                    <option value="chat_completions">Chat Completions (Strict JSON Schema - Recommended)</option>
                    <option value="responses">Responses API</option>
                  </select>
                  <small>Select the request standard compatible with your provider/relay station.</small>
                </div>
              </div>

              {/* Status Info bar */}
              <div className="gpt-admin-meta-row">
                <span className="gpt-admin-meta-item">
                  Source: <strong>{settings.source}</strong>
                </span>
                <span className="gpt-admin-meta-item">
                  Revision: <strong>#{settings.revision}</strong>
                </span>
                {settings.updatedAt && (
                  <span className="gpt-admin-meta-item">
                    Last updated: <strong>{new Date(settings.updatedAt).toLocaleTimeString()}</strong>
                  </span>
                )}
              </div>

              <div className="gpt-admin-submit-row">
                <button type="submit" className="gpt-auth-submit" disabled={busy}>
                  <Save size={16} /> {busy ? "Saving changes..." : "Save Configuration"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Audit Log Card */}
        <div className="gpt-admin-card audit">
          <div className="gpt-admin-card-header">
            <Clock size={16} />
            <h2>Security & Audit Trail</h2>
          </div>
          {audit.length === 0 ? (
            <p className="gpt-admin-empty-audit">No audit logs recorded yet.</p>
          ) : (
            <ul className="gpt-admin-audit-list">
              {audit.map((entry, idx) => (
                <li key={idx}>
                  <span className="gpt-audit-time">{new Date(entry.created_at).toLocaleString()}</span>
                  <span className="gpt-audit-event">
                    {entry.event === "login" ? "Administrator signed in" : "AI Configuration updated"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
