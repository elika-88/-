import "server-only";
import { z } from "zod";

function configuration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const site = process.env.APP_BASE_URL?.trim();
  const address = z.email().safeParse(from);
  if (!apiKey || !address.success || !site) throw new Error("Verification email is not configured.");
  let url: URL;
  try { url = new URL(site); } catch { throw new Error("Verification email site URL is invalid."); }
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Verification email site URL is invalid.");
  }
  return { apiKey, from: address.data, origin: url.origin };
}

export function requireVerificationEmailConfiguration() {
  configuration();
}

export async function sendVerificationEmail(to: string, token: string) {
  const { apiKey, from, origin } = configuration();
  const link = `${origin}/verify-email#token=${token}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Verify your Lumina email",
      text: `Open this link to verify your Lumina email address and choose your password. The link expires in 30 minutes and can be used once.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Verification email could not be sent.");
}
