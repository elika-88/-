import { serve } from 'inngest/next';
import type { NextRequest } from 'next/server';
import { inngest } from '@/lib/server/inngest';
import { generateInBackground, recoverBackgroundJobs } from '@/lib/server/generation-functions';
import { isLocalInngest } from '@/lib/server/generation-job-config';

export const runtime = 'nodejs';
export const maxDuration = 300;
const handlers = serve({ client: inngest, functions: [generateInBackground, recoverBackgroundJobs] });
// No unsigned production worker endpoint. The SDK validates signed requests.
function available() { return isLocalInngest() || Boolean(process.env.INNGEST_SIGNING_KEY?.trim()); }
export const GET = (request: NextRequest, context: unknown) => available() ? handlers.GET(request, context) : new Response(null, { status: 503 });
export const POST = (request: NextRequest, context: unknown) => available() ? handlers.POST(request, context) : new Response(null, { status: 503 });
export const PUT = (request: NextRequest, context: unknown) => available() ? handlers.PUT(request, context) : new Response(null, { status: 503 });
