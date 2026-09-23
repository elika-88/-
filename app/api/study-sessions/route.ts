import { NextResponse } from 'next/server';
import { AccountError, getUserFromRequest, readAccountJson, requireSameOrigin } from '@/lib/server/user-auth';
import { DeleteStudySessionSchema, deleteStudySession, listStudySessions, SaveStudySessionSchema, saveStudySession, STUDY_REQUEST_BYTES } from '@/lib/server/study-records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  return error instanceof AccountError ? json({ error: error.message, code: error.code }, error.status)
    : json({ error: 'Study record storage is temporarily unavailable.', code: 'UNAVAILABLE' }, 503);
}
async function authenticated(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) throw new AccountError('UNAUTHENTICATED', 'Sign in to access your saved lectures.', 401);
  // A different tab may have replaced the cookie since the editor was opened.
  // The header is a consistency guard, never a substitute for authentication.
  const expectedUser = request.headers.get('x-lumina-account');
  if (expectedUser && expectedUser !== user.id) throw new AccountError('ACCOUNT_CHANGED', 'Your account changed. Reopen your workspace before saving.', 409);
  return user;
}
export async function GET(request: Request) {
  try { return json(await listStudySessions((await authenticated(request)).id)); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await authenticated(request);
    const input = SaveStudySessionSchema.safeParse(await readAccountJson(request, STUDY_REQUEST_BYTES));
    if (!input.success) throw new AccountError('INVALID_REQUEST', 'Provide a valid lecture and its expected revision.', 400);
    return json(await saveStudySession(user.id, input.data.session, input.data.expectedRevision));
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await authenticated(request);
    const input = DeleteStudySessionSchema.safeParse(await readAccountJson(request, 16 * 1024));
    if (!input.success) throw new AccountError('INVALID_REQUEST', 'Provide a lecture ID and its expected revision.', 400);
    return json(await deleteStudySession(user.id, input.data.id, input.data.expectedRevision));
  } catch (error) { return failure(error); }
}
