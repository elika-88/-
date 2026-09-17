import { NextRequest, NextResponse } from 'next/server';
import { AdminSettingsSchema, SaveAdminSettingsSchema } from '@/lib/admin-schema';
import { adminReady, adminSetupIssue, loginAdmin, logoutAdmin, readStoredSettings, saveStoredSettings, validAdminSession, withAdminDb, readUsers } from '@/lib/server/admin-db';
import { DEFAULT_API_BASE_URL, DEFAULT_MODEL } from '@/lib/provider';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const cookieName = 'lumina_admin';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function authorized(request: NextRequest) { return validAdminSession(request.cookies.get(cookieName)?.value ?? ''); }
function sameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get('origin') ?? '');
    // Next may reconstruct request.url with localhost behind a bound listener.
    // Browser Host is authoritative for the host the user actually opened.
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === (request.headers.get('host') ?? new URL(request.url).host);
  } catch { return false; }
}
function settingsView() {
  const stored = readStoredSettings();
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
    if (!authorized(request)) return json({ authenticated: false, configured: adminReady(), setupError: adminSetupIssue() }, 401);
    return json({ authenticated: true, settings: settingsView(), audit: withAdminDb((db) => db.prepare('SELECT event,created_at FROM audit ORDER BY id DESC LIMIT 20').all()), users: readUsers() });
  } catch { return json({ error: 'Cannot read admin configuration.' }, 503); }
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
      const result = loginAdmin(body.password);
      if ('error' in result) return json({ error: result.error === 'LIMITED' ? 'Too many attempts. Wait five minutes.' : result.error === 'UNCONFIGURED' ? 'Run admin setup first.' : 'Incorrect password.' }, result.error === 'LIMITED' ? 429 : result.error === 'UNCONFIGURED' ? 503 : 401);
      const response = json({ authenticated: true });
      response.cookies.set(cookieName, result.token, { httpOnly: true, sameSite: 'strict', secure: request.headers.get('origin')?.startsWith('https:') ?? false, path: '/api/admin', maxAge: 8 * 3600 });
      return response;
    }
    if (!authorized(request)) return json({ error: 'Please log in.' }, 401);
    if (body.action === 'logout') {
      logoutAdmin(request.cookies.get(cookieName)?.value ?? '');
      const response = json({ authenticated: false });
      response.cookies.set(cookieName, '', { path: '/api/admin', maxAge: 0 });
      return response;
    }
    if (body.action !== 'save') return json({ error: 'Unknown action.' }, 400);
    const parsed = SaveAdminSettingsSchema.safeParse(body.settings);
    if (!parsed.success) return json({ error: 'Check the API URL, key, model and format.' }, 400);
    const {revision, ...input} = parsed.data;
    const old = readStoredSettings()?.settings;
    // Never forward a previous key to a newly selected destination.
    const previousURL = old?.baseURL ?? process.env.OPENAI_BASE_URL ?? DEFAULT_API_BASE_URL;
    const key = input.apiKey.trim() || (input.baseURL === previousURL.replace(/[/]+$/, '') ? old?.apiKey ?? process.env.OPENAI_API_KEY : undefined);
    const config = AdminSettingsSchema.safeParse({ ...input, apiKey: key });
    if (!config.success) return json({ error: 'Enter an API key. A changed API URL requires a new key.' }, 400);
    saveStoredSettings(config.data, revision);
    return json({ settings: settingsView() });
  } catch (error) { return json({ error: error instanceof Error && error.message === 'CONFLICT' ? 'Settings changed in another session. Reload before saving.' : 'Could not save configuration.' }, error instanceof Error && error.message === 'CONFLICT' ? 409 : 503); }
}
