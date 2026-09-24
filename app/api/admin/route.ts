import { NextRequest, NextResponse } from 'next/server';
import { AdminSettingsSchema, SaveAdminSettingsSchema } from '@/lib/admin-schema';
import { adminReady, adminSetupIssue, loginAdmin, logoutAdmin, readStoredSettings, saveStoredSettings, validAdminSession, withAdminDb, type AdminLoginResult } from '@/lib/server/admin-db';
import { ApiBaseUrlSchema, DEFAULT_API_BASE_URL, DEFAULT_MODEL } from '@/lib/provider';
import { validateGenerationInput } from '@/lib/input';
import { createOpenAIClient } from '@/lib/openai';
import { diagnoseAnalysis } from '@/lib/ai/diagnostics';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const cookieName = 'lumina_admin';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function authorized(request: NextRequest) { return validAdminSession(request.cookies.get(cookieName)?.value ?? ''); }
function sameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get('origin') ?? '');
    // Next may reconstruct request.url with localhost behind a bound listener.
    // Browser Host is authoritative for the host the user actually opened.
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === (request.headers.get('host') ?? new URL(request.url).host);
  } catch { return false; }
}
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
    if (!await authorized(request)) return json({ authenticated: false, configured: adminReady(), setupError: adminSetupIssue() }, 401);
    return json({ authenticated: true, settings: await settingsView(), audit: await withAdminDb(async (db) => (await db.execute('SELECT event,created_at FROM audit ORDER BY id DESC LIMIT 20')).rows) });
  } catch { return json({ error: 'Cannot read admin configuration.' }, 503); }
}
function loginResponse(request: NextRequest, result: AdminLoginResult) {
  if ('error' in result) {
    const messages = {
      LIMITED: 'Too many attempts. Wait five minutes.',
      UNCONFIGURED: 'Run admin setup first.',
      INVALID: 'Incorrect administrator credentials.',
    };
    return json({ error: messages[result.error], code: result.error }, result.error === 'LIMITED' ? 429 : result.error === 'UNCONFIGURED' ? 503 : 401);
  }
  const options = { httpOnly: true, sameSite: 'strict' as const, secure: request.headers.get('origin')?.startsWith('https:') ?? false, path: '/api/admin' };
  const response = json({ authenticated: true });
  response.cookies.set(cookieName, result.token, { ...options, maxAge: 8 * 3600 });
  return response;
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Missing request.' }, 400);
    let size = 0; let raw = ''; const decoder = new TextDecoder();
    try { while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 16384) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); } raw += decoder.decode(value, {stream:true}); } } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(raw + decoder.decode()); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, 400);
    if (body.action === 'login') {
      if (typeof body.password !== 'string' || body.password.length > 1024) return json({ error: 'Invalid password.' }, 400);
      return loginResponse(request, await loginAdmin(body.password));
    }
    if (!await authorized(request)) return json({ error: 'Please log in.' }, 401);
    if (body.action === 'diagnose_ai') {
      const input = validateGenerationInput(body.input);
      if (!input.success || input.data.provider || input.data.lecture.length > 6000) return json({ error: 'Provide 80 words to 6,000 characters without a provider override.' }, 400);
      return json(await diagnoseAnalysis(input.data, await createOpenAIClient()));
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
  } catch (error) { return json({ error: error instanceof Error && error.message === 'CONFLICT' ? 'Settings changed in another session. Reload before saving.' : 'Could not save configuration.' }, error instanceof Error && error.message === 'CONFLICT' ? 409 : 503); }
}
