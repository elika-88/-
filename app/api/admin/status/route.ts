import { NextResponse } from 'next/server';
import { adminReady, adminSetupIssue } from '@/lib/server/admin-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public readiness check for the login page. It never returns credentials or database details.
export async function GET() {
  return NextResponse.json({
    authenticated: false,
    configured: adminReady(),
    setupError: adminSetupIssue(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
