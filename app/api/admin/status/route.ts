import { NextResponse } from 'next/server';
import { adminReady, adminMfaEnabled } from '@/lib/server/admin-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public readiness check for the login page. It never returns credentials or database details.
export async function GET() {
  try {
    const configured = adminReady();
    return NextResponse.json({ authenticated: false, configured, mfaEnabled: configured && await adminMfaEnabled(),
      setupError: configured ? null : 'Administrator sign-in is unavailable. Check the server configuration.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ authenticated: false, configured: false, setupError: 'Administrator sign-in is unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
