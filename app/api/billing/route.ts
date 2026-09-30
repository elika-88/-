import { NextResponse } from "next/server";
import { billingSummary, resolveSubject } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Plan, today's usage and the public PayPal configuration for the pricing page.
export async function GET(request: Request) {
  try {
    const subject = await resolveSubject(request);
    // Anonymous visitors get no cookie here; one is minted on their first generation.
    return NextResponse.json(await billingSummary({ ...subject, newAnonId: null }), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Billing is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
