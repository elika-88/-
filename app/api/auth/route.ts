import { NextRequest, NextResponse } from "next/server";
import { saveUserToDb } from "@/lib/server/admin-db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || !body.email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = {
      id: body.id || "usr_" + Math.random().toString(36).slice(2, 9),
      name: body.name || body.email.split("@")[0] || "User",
      email: body.email,
      role: body.role || "Member",
    };

    saveUserToDb(user);
    return NextResponse.json({ success: true, user });
  } catch {
    return NextResponse.json({ error: "Failed to record user." }, { status: 500 });
  }
}
