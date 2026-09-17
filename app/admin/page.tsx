"use client";
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
type Settings = { baseURL: string; model: string; apiFormat: 'responses' | 'chat_completions'; revision: number; hasApiKey: boolean; source: string; updatedAt: number | null };
export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [audit, setAudit] = useState<{ event: string; created_at: number }[]>([]);
  async function refresh() {
    const response = await fetch('/api/admin', { cache: 'no-store' });
    const data = await response.json();
    setAuthenticated(data.authenticated === true);
    if (data.configured !== undefined) setConfigured(data.configured);
    setSettings(data.settings ?? null); setAudit(data.audit ?? []);
    if (response.status !== 401 && !response.ok) throw new Error(data.error ?? 'Could not load settings.');
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin', { cache: 'no-store', signal: controller.signal }).then((response) => response.json()).then((data) => {
      setAuthenticated(data.authenticated === true);
      if (data.configured !== undefined) setConfigured(data.configured);
      setSettings(data.settings ?? null); setAudit(data.audit ?? []);
      if (data.error) setMessage(data.error);
    }).catch(() => { if (!controller.signal.aborted) setMessage('Could not load administration.'); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  async function action(event: FormEvent, name: 'login' | 'save' | 'logout') {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(name === 'login' ? { action: name, password } : name === 'save' && settings ? { action: name, settings: { baseURL: settings.baseURL, model: settings.model, apiFormat: settings.apiFormat, apiKey, revision: settings.revision } } : { action: name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Request failed.');
      setPassword(''); setApiKey(''); await refresh();
      setMessage(name === 'save' ? 'Saved. New generations will use this configuration.' : '');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 760, margin: '40px auto', padding: '0 24px' }}>
    <Link href="/">← Back to study</Link>
    <h1 style={{ fontSize: 28, margin: '24px 0 8px' }}>Administration</h1>
    <p style={{ marginBottom: 24 }}>Manage the default AI connection for this installation.</p>
    {message && <p role="alert" style={{ padding: 16, background: '#f1f5f3', marginBottom: 20 }}>{message}</p>}
    {!authenticated ? <form onSubmit={(event) => action(event, 'login')}>
      {!configured && <p role="status">Run <code>npm run admin:setup</code> on the server, then restart the app.</p>}
      <label htmlFor="admin-password">Administrator password</label>
      <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="text-field" required maxLength={1024} disabled={busy} />
      <Button type="submit" disabled={busy || !configured} className="mt-4">{busy ? 'Loading…' : 'Sign in'}</Button>
    </form> : settings && <>
      <form onSubmit={(event) => action(event, 'save')}>
        <fieldset disabled={busy} style={{ display: 'grid', gap: 16 }}>
          <div><label htmlFor="admin-url">API Base URL</label><input id="admin-url" type="url" className="text-field" required value={settings.baseURL} onChange={(e) => setSettings({ ...settings, baseURL: e.target.value })} /></div>
          <div><label htmlFor="admin-key">API key {settings.hasApiKey ? '(configured; leave blank to keep)' : '(required)'}</label><input id="admin-key" type="password" autoComplete="off" className="text-field" value={apiKey} onChange={(e) => setApiKey(e.target.value)} maxLength={4096} /><small>A changed API URL requires a new key. Existing keys are never displayed.</small></div>
          <div><label htmlFor="admin-model">Model ID</label><input id="admin-model" className="text-field" required value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} /></div>
          <div><label htmlFor="admin-format">API format</label><select id="admin-format" className="text-field" value={settings.apiFormat} onChange={(e) => setSettings({ ...settings, apiFormat: e.target.value as Settings['apiFormat'] })}><option value="responses">Responses API</option><option value="chat_completions">Chat Completions (strict JSON Schema)</option></select></div>
          <p>Current source: {settings.source}. Revision {settings.revision}. {settings.updatedAt ? `Saved ${new Date(settings.updatedAt).toLocaleString()}` : 'Not yet saved to database.'}</p>
          <Button type="submit">{busy ? 'Saving…' : 'Save configuration'}</Button>
        </fieldset>
      </form>
      <form onSubmit={(event) => action(event, 'logout')} className="mt-4"><Button type="submit" variant="outline" disabled={busy}>Sign out</Button></form>
      <h2 style={{ fontSize: 20, marginTop: 32 }}>Recent activity</h2>
      <ul>{audit.map((entry, i) => <li key={i}>{new Date(entry.created_at).toLocaleString()} — {entry.event === 'login' ? 'Administrator signed in' : 'Configuration updated'}</li>)}</ul>
      <p className="mt-4">Configuration is encrypted in the server database. Back up the database and encryption key separately. Saving does not verify model availability.</p>
    </>}
  </main>;
}
