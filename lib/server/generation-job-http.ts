import 'server-only';
import { z } from 'zod';
import { AccountError, getUserFromRequest } from './user-auth';

export const jobJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function jobFailure(error: unknown) {
  if (error instanceof AccountError) return jobJson({ error: error.message, code: error.code }, error.status);
  if (error instanceof z.ZodError) return jobJson({ error: 'Invalid task request.', code: 'INVALID_REQUEST' }, 400);
  return jobJson({ error: 'Generation task storage is temporarily unavailable.', code: 'UNAVAILABLE' }, 503);
}
export async function authenticateJobRequest(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) throw new AccountError('UNAUTHENTICATED', 'Sign in to use background generation.', 401);
  // Required on every request so an old tab cannot create work in a new account.
  const expected = request.headers.get('x-lumina-account');
  if (expected !== user.id) throw new AccountError('ACCOUNT_CHANGED', 'Verify your account and send X-Lumina-Account before accessing tasks.', 409);
  return user;
}
export function jobId(value: string) { return z.uuid().parse(value); }
