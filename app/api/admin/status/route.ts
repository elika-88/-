import { NextRequest, NextResponse } from 'next/server';
import { adminReady, adminSetupIssue, validAdminSession } from '@/lib/server/admin-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public readiness check for the login page. It never returns credentials or database details.
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    return NextResponse.json({
      authenticated: await validAdminSession(request.cookies.get('lumina_admin')?.value ?? ''),
      configured: adminReady(),
      setupError: adminSetupIssue(),
    }, { headers });
  } catch {
    return NextResponse.json({ error: 'Could not check administrator session. Please retry.' }, { status: 503, headers });
  }
}
