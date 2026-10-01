import { NextResponse } from "next/server";
import { z } from "zod";
import { AccountError, readAccountJson, requireSameOrigin, USER_COOKIE, USER_SESSION_SECONDS, verifyEmailToken } from "@/lib/server/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VerifyRequestSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = VerifyRequestSchema.safeParse(await readAccountJson(request, 16 * 1024));
    if (!parsed.success) throw new AccountError("INVALID_REQUEST", "Use a valid verification link and an 8–128 character password.", 400);
    const { user, token } = await verifyEmailToken(parsed.data.token, parsed.data.password);
    const response = NextResponse.json({ user }, { status: 201, headers: { "Cache-Control": "no-store" } });
    response.cookies.set(USER_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: request.headers.get("origin")?.startsWith("https:") ?? false,
      maxAge: USER_SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    return error instanceof AccountError
      ? NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ error: "Verification is temporarily unavailable.", code: "UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
