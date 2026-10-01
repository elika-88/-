"use client";

import { useState, type FormEvent } from 'react';
import { useSettings } from '@/lib/i18n/SettingsContext';

export function AdminSecurity({ enabled, onChanged }: { enabled: boolean; onChanged: () => Promise<void> }) {
  const { language } = useSettings();
  const zh = language === 'zh';
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secret ? { action: 'mfa_confirm', code } : { action: 'mfa_begin', password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not configure two-factor authentication.');
      setPassword(''); setCode('');
      if (data.secret) setSecret(data.secret);
      else {
        setSecret(''); setRecoveryCodes(data.recoveryCodes ?? []);
        await onChanged();
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Request failed.'); }
    finally { setBusy(false); }
  }

  return <section className="gpt-admin-panel">
    <div className="gpt-admin-panel-header"><div>
      <h2>{zh ? '管理员安全' : 'Administrator security'}</h2>
      <p>{zh ? '登录会话最长 2 小时，30 分钟未访问后台接口后需重新登录。' : 'Sessions expire after 2 hours, or 30 minutes without an admin request.'}</p>
    </div></div>
    <div className="gpt-admin-form-grid">
      <div className="gpt-admin-form-group">
        <h3>{zh ? '验证器动态码' : 'Authenticator codes'}</h3>
        <p>{enabled ? (zh ? '已启用。登录时需要密码和动态码。' : 'Enabled. Sign-in requires both your password and an authenticator code.') : (zh ? '尚未启用。完成下方绑定后，每次登录都需要动态码。' : 'Not enabled. Complete setup below to require a code at every sign-in.')}</p>
        {error && <p className="gpt-auth-error" role="alert">{error}</p>}
        {!enabled && <form onSubmit={submit} className="gpt-auth-form">
          {!secret ? <div className="gpt-auth-field">
            <label htmlFor="mfa-password">{zh ? '再次输入管理员密码' : 'Confirm administrator password'}</label>
            <input id="mfa-password" type="password" autoComplete="current-password" maxLength={1024} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
          </div> : <>
            <p>{zh ? '在 Google / Microsoft Authenticator 中手动添加账号：名称填 LectorAI Admin，选择基于时间，输入下方密钥。请勿分享此密钥。' : 'In Google / Microsoft Authenticator, add “LectorAI Admin” manually, choose time-based codes and enter this key. Keep it private.'}</p>
            <code style={{ overflowWrap: 'anywhere', userSelect: 'all' }}>{secret}</code>
            <p>{zh ? '输入验证器显示的 6 位动态码完成绑定（此设置 10 分钟内有效）。' : 'Enter the six-digit code to complete setup within 10 minutes.'}</p>
            <div className="gpt-auth-field"><label htmlFor="mfa-code">{zh ? '动态码' : 'Authenticator code'}</label>
              <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} disabled={busy} />
            </div>
            <button type="button" disabled={busy} onClick={() => { setSecret(''); setCode(''); }}>{zh ? '重新开始绑定' : 'Restart setup'}</button>
          </>}
          <button type="submit" className="gpt-auth-submit" disabled={busy}>{busy ? (zh ? '正在验证…' : 'Verifying…') : secret ? (zh ? '确认并启用动态码' : 'Confirm and enable') : (zh ? '开始绑定验证器' : 'Set up authenticator')}</button>
        </form>}
        {recoveryCodes.length > 0 && <div role="status">
          <h3>{zh ? '请立即保存恢复码' : 'Save your recovery codes now'}</h3>
          <p>{zh ? '这些恢复码只显示一次。每个仅能使用一次，与管理员密码一起登录。请保存到密码管理器，保存后点击下方按钮。' : 'These codes are shown once. Each can replace an authenticator code for one sign-in, together with your password. Save them in a password manager.'}</p>
          <pre style={{ userSelect: 'all' }}>{recoveryCodes.join('\n')}</pre>
          <button type="button" onClick={() => setRecoveryCodes([])}>{zh ? '已安全保存，隐藏恢复码' : 'Saved securely — hide codes'}</button>
        </div>}
      </div>
    </div>
  </section>;
}
