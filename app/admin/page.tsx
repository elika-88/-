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
  FileText,
  Settings,
  RefreshCw
} from "lucide-react";
import { useSettings } from "@/lib/i18n/SettingsContext";
import { SettingsModal } from "@/components/settings/SettingsModal";

type Settings = {
  baseURL: string;
  model: string;
  apiFormat: "responses" | "chat_completions";
  revision: number;
  hasApiKey: boolean;
  source: string;
  updatedAt: number | null;
};

type AdminTab = "relay" | "logs";

export default function AdminPage() {
  const { t } = useSettings();
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
  const [activeTab, setActiveTab] = useState<AdminTab>("relay");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Model Fetcher State (like ccswitch)
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchMsg, setModelFetchMsg] = useState("");

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
    fetch("/api/admin/status", { cache: "no-store", signal: controller.signal })
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

  async function handleFetchModels() {
    if (!settings?.baseURL) return;
    setFetchingModels(true);
    setFetchedModels([]);
    setModelFetchMsg("");
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fetch_models",
          baseURL: settings.baseURL,
          apiKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to query models from endpoint.");

      if (Array.isArray(data.models) && data.models.length > 0) {
        setFetchedModels(data.models);
        setModelFetchMsg(`Found ${data.models.length} models available on this relay.`);
      } else {
        setModelFetchMsg("Endpoint responded, but returned an empty model list.");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to fetch model list.");
    } finally {
      setFetchingModels(false);
    }
  }

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
        setMessage(t.saveChangesBtn + " ✓");
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }

  // 1. Unauthenticated Login Card
  if (!authenticated) {
    return (
      <div className="gpt-auth-page">
        <div className="gpt-auth-header">
          <Link href="/" className="gpt-admin-back-link">
            <ArrowLeft size={16} /> {t.backToStudy}
          </Link>
        </div>

        <div className="gpt-auth-box">
          <h1 className="gpt-auth-title">{t.adminConsole}</h1>
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
                placeholder="Enter administrator password"
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
        </div>
      </div>
    );
  }

  return (
    <div className="gpt-admin-app">
      {/* Top Header */}
      <header className="gpt-admin-topbar">
        <div className="gpt-admin-topbar-left">
          <Link href="/" className="gpt-admin-top-back" title={t.backToStudy}>
            <ArrowLeft size={16} />
            <span>{t.backToStudy}</span>
          </Link>
          <span className="gpt-admin-divider">/</span>
          <span className="gpt-admin-current-brand">{t.adminConsole}</span>
        </div>

        <div className="gpt-admin-topbar-right">
          <button
            type="button"
            className="gpt-icon-action-btn"
            title={t.settingsTitle}
            onClick={() => setSettingsModalOpen(true)}
            style={{ width: 34, height: 34 }}
          >
            <Settings size={17} />
          </button>

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
            title={t.signOut}
          >
            <LogOut size={15} />
            <span>{t.signOut}</span>
          </button>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <div className="gpt-admin-layout">
        {/* Left Category Sidebar */}
        <aside className="gpt-admin-sidebar">
          <div className="gpt-admin-sidebar-section">
            <div className="gpt-admin-sidebar-title">{t.management}</div>
            <nav className="gpt-admin-nav-list">
              <button
                type="button"
                className={`gpt-admin-nav-item ${activeTab === "relay" ? "active" : ""}`}
                onClick={() => setActiveTab("relay")}
              >
                <Cpu size={16} />
                <span>{t.aiRelayTab}</span>
              </button>
              <button
                type="button"
                className={`gpt-admin-nav-item ${activeTab === "logs" ? "active" : ""}`}
                onClick={() => setActiveTab("logs")}
              >
                <FileText size={16} />
                <span>{t.auditLogsTab}</span>
              </button>
            </nav>
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

          {/* TAB 1: AI Relay & Model Settings (with ccswitch-style model fetcher) */}
          {activeTab === "relay" && settings && (
            <section className="gpt-admin-panel">
              <div className="gpt-admin-panel-header">
                <div>
                  <h2>{t.aiRelayTab}</h2>
                  <p>{t.gatewayUrlDesc}</p>
                </div>
                <div className="gpt-admin-header-actions">
                  <button
                    type="button"
                    className="gpt-pill-btn primary"
                    onClick={(e) => action(e, "save")}
                    disabled={busy}
                  >
                    <Save size={15} />
                    <span>{busy ? "Saving..." : t.saveChangesBtn}</span>
                  </button>
                </div>
              </div>

              <div className="gpt-admin-form-grid">
                {/* Base URL with Test / Fetch Models Button */}
                <div className="gpt-admin-form-group">
                  <div className="gpt-admin-form-label">
                    <label htmlFor="admin-url">{t.gatewayUrl}</label>
                    <button
                      type="button"
                      className="gpt-fetch-models-btn"
                      onClick={handleFetchModels}
                      disabled={fetchingModels || !settings.baseURL}
                      title="Fetch available models from endpoint"
                    >
                      <RefreshCw size={13} className={fetchingModels ? "animate-spin" : ""} />
                      <span>{fetchingModels ? "Scanning..." : "Fetch Models (获取模型)"}</span>
                    </button>
                  </div>
                  <div className="gpt-admin-input-wrap">
                    <Globe size={16} className="gpt-admin-input-icon" />
                    <input
                      id="admin-url"
                      type="url"
                      className="gpt-admin-text-input"
                      placeholder="https://api.openai.com/v1"
                      value={settings.baseURL}
                      onChange={(e) => {
                        setSettings({ ...settings, baseURL: e.target.value });
                        setFetchedModels([]);
                        setModelFetchMsg("");
                      }}
                      disabled={busy || fetchingModels}
                    />
                  </div>
                  <p className="gpt-admin-help-text">
                    Custom relay, reverse proxy or official OpenAI root endpoint.
                  </p>
                </div>

                {/* API Key */}
                <div className="gpt-admin-form-group">
                  <div className="gpt-admin-form-label">
                    <label htmlFor="admin-key">{t.apiKeyLabel}</label>
                    <span className={settings.hasApiKey ? "text-success" : "text-warning"}>
                      {settings.hasApiKey ? t.activeInVault : t.unset}
                    </span>
                  </div>
                  <div className="gpt-admin-input-wrap">
                    <Key size={16} className="gpt-admin-input-icon" />
                    <input
                      id="admin-key"
                      type="password"
                      autoComplete="off"
                      className="gpt-admin-text-input"
                      placeholder={settings.hasApiKey ? "••••••••••••••••••••••••" : "sk-..."}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setFetchedModels([]);
                        setModelFetchMsg("");
                      }}
                      maxLength={4096}
                      disabled={busy || fetchingModels}
                    />
                  </div>
                  <p className="gpt-admin-help-text">{t.apiKeyDesc}</p>
                </div>

                {/* Model Identifier with Dropdown / Tag Picker */}
                <div className="gpt-admin-form-group">
                  <div className="gpt-admin-form-label">
                    <label htmlFor="admin-model">{t.modelLabel}</label>
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

                  {/* ccswitch Style Available Models Capsule List */}
                  {fetchedModels.length > 0 && (
                    <div className="gpt-model-picker-area">
                      <div className="gpt-model-picker-title">
                        <span>Available upstream models (click to apply):</span>
                      </div>
                      <div className="gpt-model-chips-container">
                        {fetchedModels.map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={`gpt-model-chip ${settings.model === m ? "active" : ""}`}
                            onClick={() => setSettings({ ...settings, model: m })}
                          >
                            <span>{m}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {modelFetchMsg && (
                    <p className="gpt-admin-help-text" style={{ color: "#10a37f" }}>
                      {modelFetchMsg}
                    </p>
                  )}
                  {!modelFetchMsg && (
                    <p className="gpt-admin-help-text">{t.modelDesc}</p>
                  )}
                </div>

                {/* API Format */}
                <div className="gpt-admin-form-group">
                  <div className="gpt-admin-form-label">
                    <label htmlFor="admin-format">{t.protocolLabel}</label>
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
                  <p className="gpt-admin-help-text">{t.protocolDesc}</p>
                </div>
              </div>

              {/* Status Footer */}
              <div className="gpt-admin-status-bar">
                <div>
                  Source: <strong>{settings.source}</strong> · Revision <strong>#{settings.revision}</strong>
                </div>
                {settings.updatedAt && (
                  <div>
                    Last updated: {new Date(settings.updatedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Audit logs */}
          {activeTab === "logs" && (
            <section className="gpt-admin-panel">
              <div className="gpt-admin-panel-header">
                <div>
                  <h2>{t.auditLogsTab}</h2>
                  <p>Real event logs stored in database.</p>
                </div>
              </div>

              <div className="gpt-admin-table-container">
                <table className="gpt-admin-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Event Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="gpt-table-empty">
                          {t.noLogsYet}
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
                              {entry.event === "login"
                                ? "Administrator Signed In"
                                : entry.event === "settings_updated"
                                ? "AI Relay Configuration Updated"
                                : entry.event}
                            </strong>
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

      <SettingsModal isOpen={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
    </div>
  );
}
