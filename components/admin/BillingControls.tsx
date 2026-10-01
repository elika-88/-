"use client";

import { useEffect, useState } from "react";
import { useSettings } from '@/lib/i18n/SettingsContext';

type Channel = "paypal" | "revenuecat";
type State = { channels: { paypal: boolean; revenuecat: boolean; revision: number }; readiness: Record<Channel, { issues: string[]; environment: string }> };

export function BillingControls() {
  const { language } = useSettings();
  const zh = language === 'zh';
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Channel | null>(null);
  async function load() {
    const response = await fetch("/api/admin/billing", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load subscription settings.");
    setState(data);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch(error => setError(error instanceof Error ? error.message : "Could not load subscription settings.")); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function toggle(channel: Channel) {
    if (!state) return;
    const enabled = !state.channels[channel];
    setBusy(channel); setError("");
    try {
      const response = await fetch("/api/admin/billing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, enabled, revision: state.channels.revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update subscription settings.");
      setState(data);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update subscription settings."); }
    finally { setBusy(null); }
  }
  if (!state) return <div><p role={error ? 'alert' : 'status'}>{error || (zh ? '正在加载订阅设置…' : 'Loading subscription controls…')}</p>{error && <button onClick={() => void load().catch(error => setError(String(error)))}>{zh ? '重试' : 'Retry'}</button>}</div>;
  return <section className="gpt-admin-panel">
    <div className="gpt-admin-panel-header"><div><h2>{zh ? '订阅渠道' : 'Subscription channels'}</h2><p>{zh ? '开关立即保存，无需重新部署。关闭后停止新订阅；已付费会员、续费通知、恢复与取消功能继续保留。已经打开的结账可能仍会完成。' : 'Switches save immediately without a deployment. Closing a channel stops new checkouts; paid access, renewal notifications, restoration and cancellation remain available. A checkout already in progress may still finish.'}</p></div><button type="button" className="gpt-pill-btn" disabled={busy !== null} onClick={() => void load().then(() => setError('')).catch(error => setError(String(error)))}>{zh ? '刷新状态' : 'Reload'}</button></div>
    {error && <div className="gpt-admin-toast error" role="alert">{error}</div>}
    {(["paypal", "revenuecat"] as const).map(channel => {
      const info = state.readiness[channel];
      return <div key={channel} style={{ display: "flex", flexWrap: 'wrap', alignItems: "center", justifyContent: "space-between", gap: 18, padding: "18px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ minWidth: 0, flex: '1 1 240px', overflowWrap: 'anywhere' }}><strong>{channel === "paypal" ? "PayPal" : "RevenueCat"}</strong><p className="gpt-admin-help-text">{zh ? '环境' : 'Environment'}: {info.environment}{info.issues.length ? ` · ${zh ? '需配置' : 'Configure'}: ${info.issues.join(", ")}` : (zh ? ' · 配置已填写，仍需测试购买和 Webhook' : ' · Configuration present; verify checkout and webhook delivery')}</p></div>
        <button type="button" role="switch" aria-label={channel === 'paypal' ? 'PayPal' : 'RevenueCat'} aria-checked={state.channels[channel]} className={`gpt-pill-btn ${state.channels[channel] ? "primary" : ""}`} disabled={busy !== null || (state.channels[channel] === false && info.issues.length > 0)} onClick={() => void toggle(channel)}>{busy === channel ? (zh ? '保存中…' : 'Saving…') : state.channels[channel] ? (zh ? '已开启 · 关闭' : 'Enabled · Turn off') : (zh ? '已关闭 · 开启' : 'Disabled · Turn on')}</button>
      </div>;
    })}
  </section>;
}
