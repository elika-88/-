// Plan catalogue shared by the server (enforcement) and the client (display).
// Prices themselves live in PayPal; see docs/billing.md.

export type PlanId = "free" | "pro";
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
  // Generous fair-use caps protect model costs without feeling limited.
  pro: { lectureGenerationsPerDay: 40, maxLectureCharacters: 60_000, prepSetsPerDay: 30, maxPrepQuestions: 15 },
};

export type BillingUsage = { used: number; limit: number };

/** Response of GET /api/billing. Nothing secret: the PayPal client id and plan ids are public by design. */
export type BillingSummary = {
  plan: PlanId;
  signedIn: boolean;
  limits: PlanLimits;
  usage: Record<UsageKind, BillingUsage>;
  resetsAt: number;
  subscription: null | {
    status: string;
    interval: BillingInterval | null;
    nextBillingAt: number | null;
    paidThrough: number | null;
    cancelled: boolean;
  };
  paypal: null | {
    clientId: string;
    currency: string;
    plans: Record<BillingInterval, { id: string; price: string } | null>;
  };
};
