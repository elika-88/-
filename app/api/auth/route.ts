import { NextResponse } from 'next/server';
import { AccountError, AuthRequestSchema, getUserFromRequest, loginUser, logoutUser, readAccountJson, registerUser, requireSameOrigin, USER_COOKIE, USER_SESSION_SECONDS } from '@/lib/server/user-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  return error instanceof AccountError ? json({ error: error.message, code: error.code }, error.status)
    : json({ error: 'Account service is temporarily unavailable.', code: 'UNAVAILABLE' }, 503);
}

export async function GET(request: Request) {
  try { return json({ user: await getUserFromRequest(request) }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = AuthRequestSchema.safeParse(await readAccountJson(request, 16 * 1024));
    if (!parsed.success) throw new AccountError('INVALID_REQUEST', 'Check your username, email, and password. Usernames need 3–32 characters and passwords need 8–128 characters.', 400);
    const input = parsed.data;
    const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: request.headers.get('origin')?.startsWith('https:') ?? false };
    if (input.action === 'logout') {
      await logoutUser(request);
      const response = json({ user: null });
      response.cookies.set(USER_COOKIE, '', { ...cookieOptions, maxAge: 0 });
      return response;
    }
    const result = input.action === 'register' ? await registerUser(input, request) : await loginUser(input.identifier, input.password, request);
    const response = json({ user: result.user }, input.action === 'register' ? 201 : 200);
    response.cookies.set(USER_COOKIE, result.token, { ...cookieOptions, maxAge: USER_SESSION_SECONDS });
    return response;
  } catch (error) { return failure(error); }
}
