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

export type EmailLanguage = "en" | "zh" | "ru" | "kk";

type Template = { subject: string; text: (link: string) => string };
const VERIFY: Record<EmailLanguage, Template> = {
  en: { subject: "Verify your Lumina email", text: (link) => `Open this link to verify your Lumina email address and choose your password. The link expires in 30 minutes and can be used once.\n\n${link}\n\nIf you did not request this, you can ignore this email.` },
  zh: { subject: "验证你的 Lumina 邮箱", text: (link) => `打开下面的链接，验证你的 Lumina 邮箱并设置密码。链接 30 分钟内有效，只能使用一次。\n\n${link}\n\n如果不是你本人操作，请忽略这封邮件。` },
  ru: { subject: "Подтвердите почту для Lumina", text: (link) => `Откройте ссылку, чтобы подтвердить адрес почты в Lumina и задать пароль. Ссылка действует 30 минут и только один раз.\n\n${link}\n\nЕсли вы этого не запрашивали, просто проигнорируйте письмо.` },
  kk: { subject: "Lumina поштаңызды растаңыз", text: (link) => `Lumina-дағы пошта мекенжайыңызды растап, құпиясөз орнату үшін сілтемені ашыңыз. Сілтеме 30 минут жарамды және бір рет қана қолданылады.\n\n${link}\n\nЕгер мұны сіз сұрамасаңыз, хатты елемей-ақ қойыңыз.` },
};
const RESET: Record<EmailLanguage, Template> = {
  en: { subject: "Reset your Lumina password", text: (link) => `Open this link to choose a new password for your Lumina account. The link expires in 30 minutes and can be used once. Choosing a new password signs you out on your other devices.\n\n${link}\n\nIf you did not ask to reset your password, you can ignore this email. Your password stays the same.` },
  zh: { subject: "重置你的 Lumina 密码", text: (link) => `打开下面的链接，为你的 Lumina 账号设置新密码。链接 30 分钟内有效，只能使用一次。设置新密码后，其他设备上的登录会退出。\n\n${link}\n\n如果不是你本人申请重置密码，请忽略这封邮件，原密码不会改变。` },
  ru: { subject: "Сброс пароля Lumina", text: (link) => `Откройте ссылку, чтобы задать новый пароль для аккаунта Lumina. Ссылка действует 30 минут и только один раз. После смены пароля вы выйдете из аккаунта на других устройствах.\n\n${link}\n\nЕсли вы не запрашивали сброс, просто проигнорируйте письмо. Пароль останется прежним.` },
  kk: { subject: "Lumina құпиясөзін қалпына келтіру", text: (link) => `Lumina аккаунтына жаңа құпиясөз орнату үшін сілтемені ашыңыз. Сілтеме 30 минут жарамды және бір рет қана қолданылады. Жаңа құпиясөз орнатқанда басқа құрылғылардағы кіру тоқтатылады.\n\n${link}\n\nЕгер құпиясөзді қалпына келтіруді сұрамасаңыз, хатты елемей-ақ қойыңыз. Құпиясөзіңіз өзгермейді.` },
};

async function send(to: string, template: Template, link: string) {
  const { apiKey, from } = configuration();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: template.subject, text: template.text(link) }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Email could not be sent.");
}

export async function sendVerificationEmail(to: string, token: string, language: EmailLanguage = "en") {
  const { origin } = configuration();
  await send(to, VERIFY[language] ?? VERIFY.en, `${origin}/verify-email#token=${token}`);
}

export async function sendPasswordResetEmail(to: string, token: string, language: EmailLanguage = "en") {
  const { origin } = configuration();
  await send(to, RESET[language] ?? RESET.en, `${origin}/reset-password#token=${token}`);
}
