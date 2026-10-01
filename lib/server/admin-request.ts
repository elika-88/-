import 'server-only';
import { AccountError } from './user-auth';

export const ADMIN_SESSION_SECONDS = 2 * 60 * 60;
export const ADMIN_IDLE_MS = 30 * 60_000;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60_000;
export const ADMIN_LOGIN_ATTEMPTS = 5;

export function requireAdminOrigin(request: Request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new Error();
    const origin = new URL(request.headers.get('origin') ?? '');
    const configured = process.env.APP_BASE_URL?.trim();
    const expected = configured ? new URL(configured).origin : new URL(request.url).origin;
    const local = process.env.NODE_ENV !== 'production' && !configured
      && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
      && origin.protocol === 'http:'
      && origin.host === (request.headers.get('host') ?? new URL(request.url).host);
    if (!['http:', 'https:'].includes(origin.protocol) || (origin.origin !== expected && !local)) throw new Error();
    if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error();
  } catch { throw new AccountError('INVALID_ORIGIN', 'Invalid request origin.', 403); }
}
