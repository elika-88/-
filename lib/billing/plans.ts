// Plan catalogue shared by the server (enforcement) and the client (display).
// Advertised prices and setup defaults share a catalogue. PayPal controls actual charges.
import prices from "./prices.json";

export const PLAN_PRICES = prices;

export type PlanId = "free" | "basic" | "pro";
export type PaidPlanId = Exclude<PlanId, "free">;
export const PAID_PLANS: readonly PaidPlanId[] = ["basic", "pro"];
export type BillingInterval = "monthly" | "yearly";
export type UsageKind = "lecture" | "prep";

export type PlanLimits = {
  lectureGenerationsPerDay: number;
  maxLectureCharacters: number;
  prepSetsPerDay: number;
  maxPrepQuestions: number;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  // Guests and signed-in users without an active subscription.
  free: { lectureGenerationsPerDay: 3, maxLectureCharacters: 20_000, prepSetsPerDay: 0, maxPrepQuestions: 10 },
  // Basic: everything except the exam prep area. Caps are fair-use, not selling points.
  basic: { lectureGenerationsPerDay: 40, maxLectureCharacters: 60_000, prepSetsPerDay: 0, maxPrepQuestions: 10 },
  // Pro: all features.
  pro: { lectureGenerationsPerDay: 40, maxLectureCharacters: 60_000, prepSetsPerDay: 30, maxPrepQuestions: 15 },
};

/** Higher rank = more features; used to decide upgrades. */
export const PLAN_RANK: Record<PlanId, number> = { free: 0, basic: 1, pro: 2 };

export type BillingUsage = { used: number; limit: number };
export type PlanPrice = { id: string; price: string } | null;

/** Response of GET /api/billing. Nothing secret: the PayPal client id and plan ids are public by design. */
export type BillingSummary = {
  plan: PlanId;
  signedIn: boolean;
  limits: PlanLimits;
  usage: Record<UsageKind, BillingUsage>;
  resetsAt: number;
  subscription: null | {
    tier: PaidPlanId;
    status: string;
    interval: BillingInterval | null;
    nextBillingAt: number | null;
    paidThrough: number | null;
    cancelled: boolean;
  };
  paypal: null | {
    clientId: string;
    currency: string;
    plans: Record<PaidPlanId, Record<BillingInterval, PlanPrice>>;
  };
};
