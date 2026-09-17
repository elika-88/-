"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Cpu,
  Globe,
  Key,
  Layers,
  LogOut,
  Save,
  CheckCircle2,
  AlertCircle,
  Users,
  FileText,
  Search,
} from "lucide-react";

type Settings = {
  baseURL: string;
  model: string;
  apiFormat: "responses" | "chat_completions";
  revision: number;
  hasApiKey: boolean;
  source: string;
  updatedAt: number | null;
};

type DbUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: number;
};

type AdminTab = "relay" | "users" | "logs";

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
  const [users, setUsers] = useState<DbUser[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>("relay");
  const [userSearch, setUserSearch] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin", { cache: "no-store" });
    const data = await response.json();
    setAuthenticated(data.authenticated === true);
    if (data.configured !== undefined) setConfigured(data.configured);
    setSetupError(data.setupError ?? "");
    setSettings(data.settings ?? null);
    setAudit(data.audit ?? []);
    setUsers(data.users ?? []);
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
        setUsers(data.users ?? []);
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
      if (name === "save") {
        setMessage("Configuration updated. New AI generations will use these settings.");
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }

  // 1. Unauthenticated Login Card (ChatGPT Clean Auth Style)
  if (!authenticated) {
    return (
      <div className="gpt-auth-page">
        <div className="gpt-auth-header">
          <Link href="/" className="gpt-admin-back-link">
            <ArrowLeft size={16} /> Back to study
          </Link>
        </div>

        <div className="gpt-auth-box">
          <h1 className="gpt-auth-title">Admin Console</h1>
          <p className="gpt-auth-subtitle">Enter administrator credentials to manage workspace</p>

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
                placeholder="Enter password (default: 123123)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={1024}
                disabled={busy}
                autoFocus
              />
            </div>

            <button type="submit" className="gpt-auth-submit" disabled={busy || !configured}>
              {busy ? "Authenticating..." : "Continue"}
            </button>
          </form>

          <div className="gpt-auth-footer-prompt">
            Default password is <span className="gpt-code-tag">123123</span>
          </div>
        </div>
      </div>
    );
  }

  // Filter real users from database
  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="gpt-admin-app">
      {/* Top Header */}
      <header className="gpt-admin-topbar">
        <div className="gpt-admin-topbar-left">
          <Link href="/" className="gpt-admin-top-back" title="Back to study workspace">
            <ArrowLeft size={16} />
            <span>Study Workspace</span>
          </Link>
          <span className="gpt-admin-divider">/</span>
          <span className="gpt-admin-current-brand">Admin Console</span>
        </div>

        <div className="gpt-admin-topbar-right">
          <div className="gpt-admin-user-pill">
            <div className="gpt-user-avatar guest" style={{ width: 26, height: 26 }}>
              <span>A</span>
            </div>
            <span>Administrator</span>
          </div>
          <button
            type="button"
            className="gpt-admin-logout-link"
            onClick={(e) => action(e, "logout")}
            disabled={busy}
            title="Sign out of admin"
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <div className="gpt-admin-layout">
        {/* Left Category Sidebar */}
        <aside className="gpt-admin-sidebar">
          <div className="gpt-admin-sidebar-section">
            <div className="gpt-admin-sidebar-title">Management</div>
            <nav className="gpt-admin-nav-list">
              <button
                type="button"
                className={`gpt-admin-nav-item ${activeTab === "relay" ? "active" : ""}`}
                onClick={() => setActiveTab("relay")}
              >
                <Cpu size={16} />
                <span>AI Relay & Model</span>
              </button>
              <button
                type="button"
                className={`gpt-admin-nav-item ${activeTab === "users" ? "active" : ""}`}
                onClick={() => setActiveTab("users")}
              >
                <Users size={16} />
                <span>User Directory</span>
              </button>
              <button
                type="button"
                className={`gpt-admin-nav-item ${activeTab === "logs" ? "active" : ""}`}
                onClick={() => setActiveTab("logs")}
              >
                <FileText size={16} />
                <span>Audit Logs</span>
              </button>
            </nav>
          </div>

          <div className="gpt-admin-sidebar-footer">
            <div className="gpt-admin-version-tag">Lumina Server v1.2</div>
          </div>
        </aside>

        {/* Right Content View */}
        <main className="gpt-admin-main">
          {/* Notifications */}
          {message && (
            <div className="gpt-admin-toast success">
              <CheckCircle2 size={16} />
              <span>{message}</span>
            </div>
          )}

          {errorMsg && (
            <div className="gpt-admin-toast error">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: AI Relay & Model Settings (Real DB connection) */}
          {activeTab === "relay" && settings && (
            <section className="gpt-admin-panel">
              <div className="gpt-admin-panel-header">
                <div>
                  <h2>AI Relay & Model Connection</h2>
                  <p>Manage upstream API gateway, credentials and transmission protocol in database.</p>
                </div>
                <div className="gpt-admin-header-actions">
                  <button
                    type="button"
                    className="gpt-pill-btn primary"
                    onClick={(e) => action(e, "save")}
                    disabled={busy}
                  >
                    <Save size={15} />
                    <span>{busy ? "Saving..." : "Save Changes"}</span>
                  </button>
                </div>
              </div>

              <div className="gpt-admin-form-grid">
                {/* Base URL */}
                <div className="gpt-admin-form-group">
                  <div className="gpt-admin-form-label">
                    <label htmlFor="admin-url">Gateway Base URL</label>
                    <span>Upstream endpoint</span>
                  </div>
                  <div className="gpt-admin-input-wrap">
                    <Globe size={16} className="gpt-admin-input-icon" />
                    <input
                      id="admin-url"
                      type="url"
                      className="gpt-admin-text-input"
                      placeholder="https://api.openai.com/v1"
                      value={settings.baseURL}
                      onChange={(e) => setSettings({ ...settings, baseURL: e.target.value })}
                      disabled={busy}
                    />
                  </div>
                  <p className="gpt-admin-help-text">
                    Custom relay, reverse proxy or official OpenAI root endpoint.
                  </p>
                </div>

                {/* API Key */}
                <div className="gpt-admin-form-group">
                  <div className="gpt-admin-form-label">
                    <label htmlFor="admin-key">Authorization API Key</label>
                    <span className={settings.hasApiKey ? "text-success" : "text-warning"}>
                      {settings.hasApiKey ? "Active in Vault ✓" : "Unset"}
                    </span>
                  </div>
                  <div className="gpt-admin-input-wrap">
                    <Key size={16} className="gpt-admin-input-icon" />
                    <input
                      id="admin-key"
                      type="password"
                      autoComplete="off"
                      className="gpt-admin-text-input"
                      placeholder={settings.hasApiKey ? "•••••••••••••••••••••••• (Leave blank to keep)" : "sk-..."}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      maxLength={4096}
                      disabled={busy}
                    />
                  </div>
                  <p className="gpt-admin-help-text">
                    Encrypted with AES-256-GCM in server database.
                  </p>
                </div>

                {/* Model Identifier */}
                <div className="gpt-admin-form-group">
                  <div className="gpt-admin-form-label">
                    <label htmlFor="admin-model">Model Identifier</label>
                    <span>Target engine</span>
                  </div>
                  <div className="gpt-admin-input-wrap">
                    <Cpu size={16} className="gpt-admin-input-icon" />
                    <input
                      id="admin-model"
                      type="text"
                      className="gpt-admin-text-input"
                      placeholder="gpt-5.5"
                      value={settings.model}
                      onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                      disabled={busy}
                    />
                  </div>
                  <p className="gpt-admin-help-text">
                    e.g. gpt-5.5, gpt-4o, or upstream custom models.
                  </p>
                </div>

                {/* API Format */}
                <div className="gpt-admin-form-group">
                  <div className="gpt-admin-form-label">
                    <label htmlFor="admin-format">Transmission Protocol</label>
                    <span>API Standard</span>
                  </div>
                  <div className="gpt-admin-input-wrap">
                    <Layers size={16} className="gpt-admin-input-icon" />
                    <select
                      id="admin-format"
                      className="gpt-admin-select-input"
                      value={settings.apiFormat}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          apiFormat: e.target.value as Settings["apiFormat"],
                        })
                      }
                      disabled={busy}
                    >
                      <option value="chat_completions">Chat Completions (Strict JSON Schema - Compatible)</option>
                      <option value="responses">Responses API (OpenAI Native)</option>
                    </select>
                  </div>
                  <p className="gpt-admin-help-text">
                    Chat Completions is recommended for third-party proxy relays.
                  </p>
                </div>
              </div>

              {/* Status Footer */}
              <div className="gpt-admin-status-bar">
                <div>
                  Configuration source: <strong>{settings.source}</strong> · Revision <strong>#{settings.revision}</strong>
                </div>
                {settings.updatedAt && (
                  <div>
                    Last updated: {new Date(settings.updatedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 2: User Directory (Connected to Real Server Database) */}
          {activeTab === "users" && (
            <section className="gpt-admin-panel">
              <div className="gpt-admin-panel-header">
                <div>
                  <h2>User Directory</h2>
                  <p>Registered users saved in the server database.</p>
                </div>
              </div>

              {/* Search & Stats toolbar */}
              <div className="gpt-admin-table-toolbar">
                <div className="gpt-admin-search-box">
                  <Search size={15} />
                  <input
                    type="search"
                    placeholder="Search users by name or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>
                <div className="gpt-admin-toolbar-stats">
                  Total: {filteredUsers.length} accounts
                </div>
              </div>

              {/* Real Users Table */}
              <div className="gpt-admin-table-container">
                <table className="gpt-admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>User ID</th>
                      <th>Registered At</th>
                      <th style={{ textAlign: "right" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="gpt-table-empty">
                          No users registered yet. Users will appear here when signing in or registering.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="gpt-table-user-cell">
                              <div className="gpt-user-avatar guest" style={{ width: 30, height: 30, fontSize: 12 }}>
                                {u.name.slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <div className="gpt-table-name">{u.name}</div>
                                <div className="gpt-table-sub">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="gpt-badge role">{u.role}</span>
                          </td>
                          <td className="gpt-table-code">{u.id}</td>
                          <td className="gpt-table-sub">{new Date(u.created_at).toLocaleString()}</td>
                          <td style={{ textAlign: "right" }}>
                            <span className="gpt-badge status active">Active</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB 3: Audit & System Logs (Real Server DB Logs) */}
          {activeTab === "logs" && (
            <section className="gpt-admin-panel">
              <div className="gpt-admin-panel-header">
                <div>
                  <h2>Audit & Security Logs</h2>
                  <p>Real-time event trail recorded in SQLite database.</p>
                </div>
              </div>

              <div className="gpt-admin-table-container">
                <table className="gpt-admin-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Event Type</th>
                      <th>Origin</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="gpt-table-empty">
                          No audit logs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      audit.map((entry, idx) => (
                        <tr key={idx}>
                          <td className="gpt-table-code">
                            {new Date(entry.created_at).toLocaleString()}
                          </td>
                          <td>
                            <strong style={{ fontWeight: 500 }}>
                              {entry.event === "login" ? "Administrator Signed In" : "AI Relay Configuration Updated"}
                            </strong>
                          </td>
                          <td className="gpt-table-sub">127.0.0.1 (Local Session)</td>
                          <td>
                            <span className="gpt-badge status active">Success</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
