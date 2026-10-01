import { NextRequest, NextResponse } from 'next/server';
import { AdminSettingsSchema, SaveAdminSettingsSchema } from '@/lib/admin-schema';
import { adminMfaEnabled, beginAdminMfa, confirmAdminMfa, loginAdmin, logoutAdmin, readStoredSettings, saveStoredSettings, validAdminSession, withAdminDb, type AdminLoginResult } from '@/lib/server/admin-db';
import { ADMIN_LOGIN_WINDOW_MS, ADMIN_SESSION_SECONDS, requireAdminOrigin } from '@/lib/server/admin-request';
import { AccountError } from '@/lib/server/user-auth';
import { ApiBaseUrlSchema, DEFAULT_API_BASE_URL, DEFAULT_MODEL } from '@/lib/provider';
import { validateGenerationInput } from '@/lib/input';
import { createOpenAIClient } from '@/lib/openai';
import { diagnoseAnalysis, diagnoseGeneration } from '@/lib/ai/diagnostics';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const cookieName = 'lumina_admin';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function authorized(request: NextRequest) { return validAdminSession(request.cookies.get(cookieName)?.value ?? ''); }
async function settingsView() {
  const stored = await readStoredSettings();
  return {
    baseURL: stored?.settings.baseURL ?? process.env.OPENAI_BASE_URL ?? DEFAULT_API_BASE_URL,
    model: stored?.settings.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
    apiFormat: stored?.settings.apiFormat ?? process.env.OPENAI_API_FORMAT ?? 'responses',
    hasApiKey: Boolean(stored?.settings.apiKey ?? process.env.OPENAI_API_KEY),
    revision: stored?.revision ?? 0, updatedAt: stored?.updatedAt ?? null,
    source: stored ? 'database' : 'environment',
  };
}
export async function GET(request: NextRequest) {
  try {
    if (!await authorized(request)) return json({ authenticated: false, error: 'Please log in as administrator.' }, 401);
    return json({ authenticated: true, mfaEnabled: await adminMfaEnabled(), settings: await settingsView(), audit: await withAdminDb(async (db) => (await db.execute('SELECT event,created_at FROM audit ORDER BY id DESC LIMIT 20')).rows) });
  } catch { return json({ error: 'Cannot read admin configuration.' }, 503); }
}
function loginResponse(request: NextRequest, result: AdminLoginResult & { recoveryCodes?: string[] }) {
  if ('error' in result) {
    const messages = {
      LIMITED: 'Too many attempts. Wait fifteen minutes before trying again.',
      UNCONFIGURED: 'Administrator sign-in is unavailable. Check the server configuration.',
      INVALID: 'Incorrect administrator credentials.',
    };
    const response = json({ error: messages[result.error], code: result.error }, result.error === 'LIMITED' ? 429 : result.error === 'UNCONFIGURED' ? 503 : 401);
    if (result.error === 'LIMITED') response.headers.set('Retry-After', String(ADMIN_LOGIN_WINDOW_MS / 1000));
    return response;
  }
  const options = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production' || request.headers.get('origin')?.startsWith('https:') === true, path: '/api/admin' };
  const response = json({ authenticated: true, ...(result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {}) });
  response.cookies.set(cookieName, result.token, { ...options, maxAge: ADMIN_SESSION_SECONDS });
  return response;
}
export async function POST(request: NextRequest) {
  try {
    requireAdminOrigin(request);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: 'Expected application/json.' }, 415);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Missing request.' }, 400);
    let size = 0; let raw = ''; const decoder = new TextDecoder();
    try { while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 16384) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); } raw += decoder.decode(value, {stream:true}); } } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(raw + decoder.decode()); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, 400);
    if (body.action === 'login') {
      if (typeof body.password !== 'string' || body.password.length > 1024) return json({ error: 'Invalid password.' }, 400);
      if (body.code !== undefined && (typeof body.code !== 'string' || body.code.length > 32)) return json({ error: 'Invalid verification code.' }, 400);
      return loginResponse(request, await loginAdmin(body.password, body.code?.trim() ?? ''));
    }
    if (!await authorized(request)) return json({ error: 'Please log in.' }, 401);
    if (body.action === 'mfa_begin') {
      if (typeof body.password !== 'string' || body.password.length > 1024) return json({ error: 'Enter your administrator password.' }, 400);
      const result = await beginAdminMfa(request.cookies.get(cookieName)?.value ?? '', body.password);
      if ('secret' in result) return json({ secret: result.secret });
      if (result.error === 'ALREADY_ENABLED') return json({ error: 'Two-factor authentication is already enabled.' }, 409);
      return loginResponse(request, result);
    }
    if (body.action === 'mfa_confirm') {
      if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) return json({ error: 'Enter the six-digit authenticator code.' }, 400);
      const result = await confirmAdminMfa(request.cookies.get(cookieName)?.value ?? '', body.code);
      if ('error' in result && result.error === 'ALREADY_ENABLED') return json({ error: 'Two-factor authentication is already enabled.' }, 409);
      return loginResponse(request, result);
    }
    if (body.action === 'diagnose_ai') {
      const input = validateGenerationInput(body.input);
      if (!input.success || input.data.provider || input.data.lecture.length > 6000) return json({ error: 'Provide 80 words to 6,000 characters without a provider override.' }, 400);
      const connection = await createOpenAIClient();
      return json(body.mode === 'generation' ? await diagnoseGeneration(input.data, connection) : await diagnoseAnalysis(input.data, connection));
    }
    if (body.action === 'logout') {
      await logoutAdmin(request.cookies.get(cookieName)?.value ?? '');
      const response = json({ authenticated: false });
      response.cookies.set(cookieName, '', { path: '/api/admin', maxAge: 0 });
      return response;
    }
    if (body.action === 'fetch_models') {
      const target = ApiBaseUrlSchema.safeParse(body.baseURL);
      if (!target.success) return json({ error: 'Enter a valid HTTPS API base URL, without credentials, query or fragment.' }, 400);
      const stored = (await readStoredSettings())?.settings;
      const previous = ApiBaseUrlSchema.safeParse(stored?.baseURL ?? process.env.OPENAI_BASE_URL ?? DEFAULT_API_BASE_URL);
      const enteredKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      const sameDestination = previous.success && target.data === previous.data;
      if (!sameDestination && !enteredKey) return json({ error: 'A changed API URL requires a new API key.' }, 400);
      const key = AdminSettingsSchema.shape.apiKey.safeParse(enteredKey || (sameDestination ? stored?.apiKey ?? process.env.OPENAI_API_KEY : undefined));
      if (!key.success) return json({ error: 'Enter a valid API key to fetch models.' }, 400);
      const targetUrl = target.data;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const modelsEndpoint = targetUrl.endsWith('/models') ? targetUrl : `${targetUrl}/models`;
        const headers = { Accept: 'application/json', Authorization: `Bearer ${key.data}` };
        const res = await fetch(modelsEndpoint, { headers, signal: controller.signal, cache: 'no-store', redirect: 'error' });
        if (!res.ok) {
          return json({ error: `Upstream error ${res.status}: ${res.statusText}` }, 400);
        }
        const data = await res.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
        const modelIds: string[] = list.map((m: { id?: string } | string) => typeof m === 'string' ? m : m?.id).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
        return json({ models: modelIds });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : 'Failed to fetch models from endpoint.' }, 502);
      } finally {
        clearTimeout(timeout);
      }
    }
    if (body.action !== 'save') return json({ error: 'Unknown action.' }, 400);
    const parsed = SaveAdminSettingsSchema.safeParse(body.settings);
    if (!parsed.success) return json({ error: 'Check the API URL, key, model and format.' }, 400);
    const {revision, ...input} = parsed.data;
    const old = (await readStoredSettings())?.settings;
    // Never forward a previous key to a newly selected destination.
    const previousURL = old?.baseURL ?? process.env.OPENAI_BASE_URL ?? DEFAULT_API_BASE_URL;
    const key = input.apiKey.trim() || (input.baseURL === previousURL.replace(/[/]+$/, '') ? old?.apiKey ?? process.env.OPENAI_API_KEY : undefined);
    const config = AdminSettingsSchema.safeParse({ ...input, apiKey: key });
    if (!config.success) return json({ error: 'Enter an API key. A changed API URL requires a new key.' }, 400);
    await saveStoredSettings(config.data, revision);
    return json({ settings: await settingsView() });
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error && error.message === 'CONFLICT' ? 'Settings changed in another session. Reload before saving.' : 'Could not save configuration.' }, error instanceof Error && error.message === 'CONFLICT' ? 409 : 503);
  }
}
