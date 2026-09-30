import "server-only";
import { randomBytes } from "node:crypto";
import type { Client } from "@libsql/client";
import { PLAN_LIMITS, type BillingInterval, type BillingSummary, type PlanId, type UsageKind } from "@/lib/billing/plans";
import { withDatabase } from "@/lib/server/database";
import { getUserFromRequest, initializeUserTables } from "@/lib/server/user-auth";
import { intervalForPlan, paypalConfig, type PayPalConfig, type PayPalSubscription } from "@/lib/server/paypal";

export const ANON_COOKIE = "lumina_anon";
export const ANON_COOKIE_SECONDS = 365 * 24 * 60 * 60;

export class BillingError extends Error {
  constructor(public readonly code: "PLAN_LIMIT" | "PRO_REQUIRED", message: string, public readonly status = 402) { super(message); }
}

/** Who a request counts against: a signed-in user, or an anonymous browser (soft limit). */
export type Subject = { key: string; userId: string | null; newAnonId: string | null };

export async function initializeBillingTables(db: Client) {
  await initializeUserTables(db);
  await db.batch([
    `CREATE TABLE IF NOT EXISTS billing_subscriptions (
      user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL, subscription_id TEXT NOT NULL UNIQUE, plan_id TEXT NOT NULL,
      billing_interval TEXT, status TEXT NOT NULL, next_billing_at INTEGER, paid_through INTEGER,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS usage_counters (
      subject TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY (subject, kind, day)
    )`,
  ], "write");
}

const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);
const nextUtcMidnight = (now: number) => { const date = new Date(now); date.setUTCHours(24, 0, 0, 0); return date.getTime(); };
const parseTime = (value?: string) => { const time = value ? Date.parse(value) : NaN; return Number.isFinite(time) ? time : null; };

function anonId(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ANON_COOKIE}=`))?.slice(ANON_COOKIE.length + 1);
  return value && /^[a-f0-9]{32}$/.test(value) ? value : null;
}

export async function resolveSubject(request: Request): Promise<Subject> {
  const user = await getUserFromRequest(request);
  if (user) return { key: `user:${user.id}`, userId: user.id, newAnonId: null };
  const existing = anonId(request);
  if (existing) return { key: `anon:${existing}`, userId: null, newAnonId: null };
  const created = randomBytes(16).toString("hex");
  return { key: `anon:${created}`, userId: null, newAnonId: created };
}

/** Attach the anonymous id cookie when a new one was minted for this request. */
export function withAnonCookie(response: Response, subject: Subject, request: Request) {
  if (!subject.newAnonId) return response;
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("origin")?.startsWith("https:");
  response.headers.append("Set-Cookie", `${ANON_COOKIE}=${subject.newAnonId}; Path=/; Max-Age=${ANON_COOKIE_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);
  return response;
}

type SubscriptionRow = { status: string; billing_interval: string | null; next_billing_at: number | null; paid_through: number | null };

function planFor(row: SubscriptionRow | null, now: number): PlanId {
  if (!row) return "free";
  if (row.status === "ACTIVE") return "pro";
  // A cancelled subscription keeps Pro until the period that was already paid for ends.
  if (row.status === "CANCELLED" && row.paid_through && row.paid_through > now) return "pro";
  return "free";
}

async function readState(db: Client, subject: Subject, now: number) {
  const row = subject.userId
    ? (await db.execute({ sql: "SELECT status, billing_interval, next_billing_at, paid_through FROM billing_subscriptions WHERE user_id = ?", args: [subject.userId] })).rows[0] as unknown as SubscriptionRow | undefined
    : undefined;
  const counts = await db.execute({ sql: "SELECT kind, count FROM usage_counters WHERE subject = ? AND day = ?", args: [subject.key, dayKey(now)] });
  const used = { lecture: 0, prep: 0 } as Record<UsageKind, number>;
  for (const count of counts.rows) if (count.kind === "lecture" || count.kind === "prep") used[count.kind] = Number(count.count);
  return { row: row ?? null, plan: planFor(row ?? null, now), used };
}

export async function billingSummary(subject: Subject, now = Date.now()): Promise<BillingSummary> {
  const state = await withDatabase(async (db) => { await initializeBillingTables(db); return readState(db, subject, now); });
  const limits = PLAN_LIMITS[state.plan];
  const config = paypalConfig();
  return {
    plan: state.plan,
    signedIn: Boolean(subject.userId),
    limits,
    usage: {
      lecture: { used: state.used.lecture, limit: limits.lectureGenerationsPerDay },
      prep: { used: state.used.prep, limit: limits.prepSetsPerDay },
    },
    resetsAt: nextUtcMidnight(now),
    subscription: state.row ? {
      status: state.row.status,
      interval: state.row.billing_interval === "monthly" || state.row.billing_interval === "yearly" ? state.row.billing_interval : null,
      nextBillingAt: state.row.next_billing_at,
      paidThrough: state.row.paid_through,
      cancelled: state.row.status === "CANCELLED",
    } : null,
    paypal: config ? { clientId: config.clientId, currency: config.currency, plans: config.plans } : null,
  };
}

/**
 * Throws a BillingError when the request is outside the subject's plan.
 * Call before starting expensive work; call recordUsage once it succeeded.
 */
export async function assertAllowance(subject: Subject, kind: UsageKind, request: { characters?: number; questions?: number } = {}, now = Date.now()) {
  const state = await withDatabase(async (db) => { await initializeBillingTables(db); return readState(db, subject, now); });
  const limits = PLAN_LIMITS[state.plan];
  if (kind === "prep" && limits.prepSetsPerDay === 0) throw new BillingError("PRO_REQUIRED", "Exam prep is part of Lumina Pro. Upgrade to practise SAT, IELTS and TOEFL reading.", 403);
  if (kind === "prep" && request.questions && request.questions > limits.maxPrepQuestions) throw new BillingError("PRO_REQUIRED", `Sets of ${request.questions} questions are part of Lumina Pro.`, 403);
  if (kind === "lecture" && request.characters && request.characters > limits.maxLectureCharacters) {
    throw new BillingError(state.plan === "free" ? "PRO_REQUIRED" : "PLAN_LIMIT", state.plan === "free"
      ? `Free lectures can be up to ${limits.maxLectureCharacters.toLocaleString("en-US")} characters. Upgrade to Pro for up to ${PLAN_LIMITS.pro.maxLectureCharacters.toLocaleString("en-US")}.`
      : `Lectures can be up to ${limits.maxLectureCharacters.toLocaleString("en-US")} characters.`, 403);
  }
  const limit = kind === "lecture" ? limits.lectureGenerationsPerDay : limits.prepSetsPerDay;
  if (state.used[kind] >= limit) {
    throw new BillingError("PLAN_LIMIT", state.plan === "free"
      ? `You have used today's ${limit} free generations. Upgrade to Pro or come back tomorrow.`
      : `You have reached today's fair-use limit of ${limit}. It resets at midnight UTC.`, 429);
  }
  return state.plan;
}

export async function recordUsage(subject: Subject, kind: UsageKind, now = Date.now()) {
  await withDatabase(async (db) => {
    await initializeBillingTables(db);
    await db.execute({
      sql: "INSERT INTO usage_counters (subject, kind, day, count) VALUES (?, ?, ?, 1) ON CONFLICT(subject, kind, day) DO UPDATE SET count = count + 1",
      args: [subject.key, kind, dayKey(now)],
    });
  });
}

/**
 * Stores PayPal's view of a subscription for the user named in custom_id.
 * Unknown plans or users are ignored so a foreign subscription cannot grant Pro.
 */
export async function syncSubscription(config: PayPalConfig, subscription: PayPalSubscription, expectedUserId?: string, now = Date.now()) {
  const userId = subscription.custom_id?.trim();
  if (!userId || (expectedUserId && userId !== expectedUserId)) return { applied: false as const, reason: "owner" };
  const interval: BillingInterval | null = intervalForPlan(config, subscription.plan_id);
  if (!interval) return { applied: false as const, reason: "plan" };
  const nextBillingAt = parseTime(subscription.billing_info?.next_billing_time);
  return withDatabase(async (db) => {
    await initializeBillingTables(db);
    const user = await db.execute({ sql: "SELECT id FROM app_users WHERE id = ?", args: [userId] });
    if (!user.rows.length) return { applied: false as const, reason: "user" };
    await db.execute({
      sql: `INSERT INTO billing_subscriptions (user_id, provider, subscription_id, plan_id, billing_interval, status, next_billing_at, paid_through, updated_at)
            VALUES (?, 'paypal', ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              subscription_id = excluded.subscription_id, plan_id = excluded.plan_id, billing_interval = excluded.billing_interval,
              status = excluded.status, next_billing_at = COALESCE(excluded.next_billing_at, billing_subscriptions.next_billing_at),
              paid_through = MAX(COALESCE(billing_subscriptions.paid_through, 0), COALESCE(excluded.paid_through, 0)),
              updated_at = excluded.updated_at
            WHERE billing_subscriptions.subscription_id = excluded.subscription_id OR billing_subscriptions.status <> 'ACTIVE'`,
      args: [userId, subscription.id, subscription.plan_id, interval, subscription.status, nextBillingAt, nextBillingAt, now],
    });
    return { applied: true as const, userId };
  });
}

export async function activeSubscriptionId(userId: string) {
  return withDatabase(async (db) => {
    await initializeBillingTables(db);
    const row = (await db.execute({ sql: "SELECT subscription_id, status FROM billing_subscriptions WHERE user_id = ?", args: [userId] })).rows[0];
    return row && row.status === "ACTIVE" ? String(row.subscription_id) : null;
  });
}
