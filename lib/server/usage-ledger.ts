import 'server-only';
import type { Client, Transaction } from '@libsql/client';
import { UsageSummarySchema } from '@/lib/contracts/usage';
import { AccountError, initializeUserTables } from './user-auth';
import { withDatabase } from './database';

function integerSetting(name: string, fallback: number) {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 1_000_000) {
    throw new AccountError('USAGE_CONFIG', 'Generation limits are unavailable. Contact the administrator.', 503);
  }
  return Number(value);
}
export function usagePolicy() {
  const paused = process.env.LUMINA_GENERATION_PAUSED?.trim() || 'false';
  if (!['true', 'false'].includes(paused)) throw new AccountError('USAGE_CONFIG', 'Generation limits are unavailable. Contact the administrator.', 503);
  return { monthly: integerSetting('LUMINA_MONTHLY_GENERATION_LIMIT', 60), daily: integerSetting('LUMINA_GLOBAL_DAILY_GENERATION_LIMIT', 500), paused: paused === 'true' };
}
export function usagePeriod(now: number) {
  const date = new Date(now);
  return { start: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1), end: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) };
}

export async function initializeUsageTables(db: Client) {
  await initializeUserTables(db);
  await db.batch([
    `CREATE TABLE IF NOT EXISTS usage_reservations (
      job_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      period_start INTEGER NOT NULL, period_end INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('reserved','charged','released')),
      created_at INTEGER NOT NULL, settled_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS usage_owner_period ON usage_reservations(user_id,period_start,state)',
    'CREATE INDEX IF NOT EXISTS usage_admissions ON usage_reservations(created_at)',
    `CREATE TABLE IF NOT EXISTS usage_ledger (
      job_id TEXT NOT NULL REFERENCES usage_reservations(job_id) ON DELETE CASCADE,
      event TEXT NOT NULL CHECK(event IN ('reserve','charge','release')),
      created_at INTEGER NOT NULL, PRIMARY KEY(job_id,event)
    )`,
    // Keep request tombstones after task result retention expires. They contain no course content.
    `CREATE TABLE IF NOT EXISTS generation_request_keys (
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      request_key TEXT NOT NULL, job_id TEXT NOT NULL, session_id TEXT NOT NULL,
      source_revision INTEGER NOT NULL, retry_of TEXT, PRIMARY KEY(user_id,request_key)
    )`,
    'CREATE INDEX IF NOT EXISTS generation_request_job ON generation_request_keys(job_id)',
  ], 'write');
}

// Caller owns a write transaction shared with the job insert. Counting and
// reserving cannot race another process/instance or commit without the task.
export async function reserveGenerationCredit(tx: Transaction, userId: string, jobId: string, now: number) {
  const policy = usagePolicy();
  if (policy.paused) throw new AccountError('GENERATION_PAUSED', 'New generations are temporarily paused. Your saved materials are available.', 503);
  const period = usagePeriod(now);
  const used = (await tx.execute({ sql: "SELECT COUNT(*) AS n FROM usage_reservations WHERE user_id=? AND period_start=? AND state IN ('reserved','charged')", args: [userId, period.start] })).rows[0];
  if (Number(used.n) >= policy.monthly) throw new AccountError('QUOTA_EXCEEDED', 'Your monthly generation allowance is used or reserved. Wait for an active task or the next UTC month.', 429);
  const dayStart = Math.floor(now / 86400_000) * 86400_000;
  // Failures/cancellations still cost providers money, so they do not restore
  // global admissions. This is a task cap, not a claim about dollar spend.
  const daily = (await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM usage_reservations WHERE created_at>=? AND created_at<?', args: [dayStart, dayStart + 86400_000] })).rows[0];
  if (Number(daily.n) >= policy.daily) throw new AccountError('DAILY_CAPACITY', 'Daily generation capacity has been reached. Try again after midnight UTC.', 429);
  await tx.execute({ sql: "INSERT INTO usage_reservations (job_id,user_id,period_start,period_end,state,created_at) VALUES (?,?,?,?,'reserved',?)", args: [jobId, userId, period.start, period.end, now] });
  await tx.execute({ sql: "INSERT INTO usage_ledger (job_id,event,created_at) VALUES (?,'reserve',?)", args: [jobId, now] });
}

export async function settleGenerationCredit(tx: Transaction, jobId: string, state: 'charged' | 'released', now: number) {
  const updated = await tx.execute({ sql: "UPDATE usage_reservations SET state=?,settled_at=? WHERE job_id=? AND state='reserved'", args: [state, now, jobId] });
  if (updated.rowsAffected) await tx.execute({ sql: 'INSERT INTO usage_ledger (job_id,event,created_at) VALUES (?,?,?)', args: [jobId, state === 'charged' ? 'charge' : 'release', now] });
  // Pre-release tasks have no reservation; they finish without retroactive billing.
}

export async function releaseExpiredJobCredits(tx: Transaction, now: number) {
  await tx.execute({ sql: `INSERT INTO usage_ledger (job_id,event,created_at)
    SELECT r.job_id,'release',? FROM usage_reservations r JOIN generation_jobs j ON j.id=r.job_id
    WHERE r.state='reserved' AND j.status IN ('failed','cancelled')`, args: [now] });
  await tx.execute({ sql: `UPDATE usage_reservations SET state='released',settled_at=?
    WHERE state='reserved' AND job_id IN (SELECT id FROM generation_jobs WHERE status IN ('failed','cancelled'))`, args: [now] });
}

export async function getUsageSummary(userId: string) {
  const policy = usagePolicy();
  const period = usagePeriod(Date.now());
  return withDatabase(async db => {
    await initializeUsageTables(db);
    const counts = (await db.execute({ sql: `SELECT
      SUM(CASE WHEN state='charged' THEN 1 ELSE 0 END) AS used,
      SUM(CASE WHEN state='reserved' THEN 1 ELSE 0 END) AS reserved
      FROM usage_reservations WHERE user_id=? AND period_start=?`, args: [userId, period.start] })).rows[0];
    const used = Number(counts.used || 0), reserved = Number(counts.reserved || 0);
    return UsageSummarySchema.parse({ userId, plan: 'beta', unit: 'study_kit', period,
      limit: policy.monthly, used, reserved, remaining: Math.max(0, policy.monthly - used - reserved), generationPaused: policy.paused });
  });
}
