import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Client, Row, Transaction } from '@libsql/client';
import { getEncoding } from 'js-tiktoken';
import { z } from 'zod';
import { CreateGenerationJobSchema, GenerationJobSchema, type CreateGenerationJob, type JobError } from '@/lib/contracts/generation-jobs';
import type { GenerationStage } from '@/lib/contracts/generation';
import { ServerStudySessionSchema } from '@/lib/contracts/study-records';
import { ERROR_HTTP_STATUS } from '@/lib/contracts/errors';
import { INPUT_LIMITS, validateGenerationInput, type GenerateRequest } from '@/lib/input';
import { StudyKitSchema, type StudyKit } from '@/lib/schemas/studyMaterials';
import { withDatabase } from './database';
import { AccountError } from './user-auth';
import { initializeStudyTables, MAX_STUDY_RECORDS, STUDY_REQUEST_BYTES } from './study-records';
import { JOB_LIMITS } from './generation-job-config';

let tokenizer: ReturnType<typeof getEncoding> | undefined;
const terminal = ['succeeded', 'failed', 'cancelled'];
const publicColumns = `id, user_id, session_id, source_revision, status, stage, attempt,
  created_at, updated_at, started_at, finished_at, next_attempt_at, error_json,
  saved_session_id, saved_revision, save_disposition, retry_of`;

export async function initializeGenerationTables(db: Client) {
  await initializeStudyTables(db);
  await db.batch([
    `CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL, source_revision INTEGER NOT NULL,
      request_key TEXT NOT NULL, snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
      stage TEXT, attempt INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_until INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER,
      finished_at INTEGER, next_attempt_at INTEGER NOT NULL, dispatch_after INTEGER NOT NULL,
      delivery INTEGER NOT NULL DEFAULT 0, error_json TEXT, result_json TEXT,
      saved_session_id TEXT, saved_revision INTEGER, save_disposition TEXT, retry_of TEXT,
      UNIQUE(user_id, request_key)
    )`,
    'CREATE INDEX IF NOT EXISTS generation_jobs_owner ON generation_jobs(user_id, created_at DESC, id DESC)',
    'CREATE INDEX IF NOT EXISTS generation_jobs_dispatch ON generation_jobs(status, next_attempt_at, dispatch_after)',
    'CREATE INDEX IF NOT EXISTS generation_jobs_lease ON generation_jobs(status, lease_until)',
  ], 'write');
}
async function jobs<T>(action: (db: Client) => Promise<T>) {
  return withDatabase(async db => { await initializeGenerationTables(db); return action(db); });
}
async function transaction<T>(action: (tx: Transaction) => Promise<T>) {
  return jobs(async db => {
    const tx = await db.transaction('write');
    try { const result = await action(tx); await tx.commit(); return result; }
    finally { if (!tx.closed) await tx.rollback(); tx.close(); }
  });
}
function view(row: Row) {
  return GenerationJobSchema.parse({
    id: row.id, userId: row.user_id, sessionId: row.session_id, sourceRevision: Number(row.source_revision),
    status: row.status, stage: row.stage, attempt: Number(row.attempt), maxAttempts: 2,
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    startedAt: row.started_at === null ? null : Number(row.started_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    nextAttemptAt: Number(row.next_attempt_at),
    error: row.error_json ? JSON.parse(String(row.error_json)) : null,
    savedSessionId: row.saved_session_id, savedRevision: row.saved_revision === null ? null : Number(row.saved_revision),
    saveDisposition: row.save_disposition, retryOf: row.retry_of,
  });
}
async function owned(tx: Client | Transaction, userId: string, id: string) {
  const row = (await tx.execute({ sql: 'SELECT * FROM generation_jobs WHERE id = ? AND user_id = ?', args: [id, userId] })).rows[0];
  if (!row) throw new AccountError('NOT_FOUND', 'Generation task not found.', 404);
  return row;
}
function snapshotInput(snapshot: z.infer<typeof ServerStudySessionSchema>): GenerateRequest {
  const validated = validateGenerationInput({ title: snapshot.title, lecture: snapshot.lecture, outputLanguage: snapshot.outputLanguage });
  if (!validated.success) throw new AccountError(validated.error.code, validated.error.message, ERROR_HTTP_STATUS[validated.error.code]);
  tokenizer ??= getEncoding('o200k_base');
  if (tokenizer.encode(validated.data.lecture).length > INPUT_LIMITS.maxInputTokens) {
    throw new AccountError('INPUT_TOO_LONG', 'The lecture exceeds 16,000 input tokens.', 413);
  }
  return validated.data;
}
async function create(userId: string, input: CreateGenerationJob | { idempotencyKey: string; retryOf: string }) {
  return transaction(async tx => {
    const retryOf = 'retryOf' in input ? input.retryOf : null;
    const existing = (await tx.execute({ sql: 'SELECT * FROM generation_jobs WHERE user_id = ? AND request_key = ?', args: [userId, input.idempotencyKey] })).rows[0];
    if (existing) {
      const same = retryOf ? existing.retry_of === retryOf
        : existing.retry_of === null && existing.session_id === (input as CreateGenerationJob).sessionId && Number(existing.source_revision) === (input as CreateGenerationJob).expectedRevision;
      if (!same) throw new AccountError('IDEMPOTENCY_CONFLICT', 'This request key belongs to a different submission.', 409);
      return { job: view(existing), reused: true };
    }
    let snapshot: z.infer<typeof ServerStudySessionSchema>;
    let sourceRevision: number;
    if ('retryOf' in input) {
      const original = await owned(tx, userId, input.retryOf);
      if (!['failed', 'cancelled'].includes(String(original.status))) throw new AccountError('NOT_RETRYABLE', 'Only failed or cancelled tasks can be retried.', 409);
      snapshot = ServerStudySessionSchema.parse(JSON.parse(String(original.snapshot_json)));
      sourceRevision = Number(original.source_revision);
      const course = (await tx.execute({ sql: 'SELECT deleted FROM study_records WHERE id = ? AND user_id = ?', args: [snapshot.id, userId] })).rows[0];
      if (!course || Number(course.deleted)) throw new AccountError('NOT_FOUND', 'This lecture was deleted. Create a new lecture before generating.', 404);
    } else {
      const course = (await tx.execute({ sql: 'SELECT document, revision, deleted FROM study_records WHERE id = ? AND user_id = ?', args: [input.sessionId, userId] })).rows[0];
      if (!course || Number(course.deleted)) throw new AccountError('NOT_FOUND', 'Saved lecture not found.', 404);
      if (Number(course.revision) !== input.expectedRevision) throw new AccountError('CONFLICT', 'Save or reload this lecture before generating.', 409);
      snapshot = ServerStudySessionSchema.parse(JSON.parse(String(course.document)));
      sourceRevision = Number(course.revision);
    }
    // Keep an immutable original snapshot, but do not copy the previous result.
    snapshot = { ...snapshot, kit: null };
    snapshotInput(snapshot);
    const now = Date.now();
    const active = (await tx.execute({ sql: `SELECT * FROM generation_jobs WHERE user_id = ?
      AND (status IN ('queued','running') OR (status = 'cancelled' AND lease_until > ?)) LIMIT 1`, args: [userId, now] })).rows[0];
    if (active) {
      if (!retryOf && active.session_id === snapshot.id && Number(active.source_revision) === sourceRevision && !terminal.includes(String(active.status))) {
        return { job: view(active), reused: true };
      }
      throw new AccountError('CONCURRENCY_LIMIT', 'One generation task is already active. Wait for it to finish or cancel it.', 429);
    }
    const counts = (await tx.execute({ sql: `SELECT
      SUM(CASE WHEN user_id = ? AND created_at > ? THEN 1 ELSE 0 END) AS user_hour,
      SUM(CASE WHEN user_id = ? AND created_at > ? THEN 1 ELSE 0 END) AS user_day,
      SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS global_hour,
      SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS global_day,
      SUM(CASE WHEN status IN ('queued','running') OR (status = 'cancelled' AND lease_until > ?) THEN 1 ELSE 0 END) AS active
      FROM generation_jobs WHERE created_at > ? OR status IN ('queued','running')`,
      args: [userId, now - 3600_000, userId, now - 86400_000, now - 3600_000, now - 86400_000, now, now - 86400_000] })).rows[0];
    if (Number(counts.user_hour) >= JOB_LIMITS.perUserHour || Number(counts.user_day) >= JOB_LIMITS.perUserDay
      || Number(counts.global_hour) >= JOB_LIMITS.globalHour || Number(counts.global_day) >= JOB_LIMITS.globalDay
      || Number(counts.active) >= JOB_LIMITS.activeGlobal) throw new AccountError('RATE_LIMITED', 'Generation capacity has been reached. Try again later.', 429);
    const id = randomUUID();
    await tx.execute({ sql: `INSERT INTO generation_jobs
      (id,user_id,session_id,source_revision,request_key,snapshot_json,status,created_at,updated_at,next_attempt_at,dispatch_after,retry_of)
      VALUES (?,?,?,?,?,?,'queued',?,?,?,?,?)`,
      args: [id, userId, snapshot.id, sourceRevision, input.idempotencyKey, JSON.stringify(snapshot), now, now, now, now, retryOf] });
    return { job: view(await owned(tx, userId, id)), reused: false };
  });
}
export function createGenerationJob(userId: string, input: CreateGenerationJob) {
  return create(userId, CreateGenerationJobSchema.parse(input));
}
export function retryGenerationJob(userId: string, id: string, idempotencyKey: string) {
  return create(userId, { retryOf: z.uuid().parse(id), idempotencyKey: z.uuid().parse(idempotencyKey) });
}
export async function getGenerationJob(userId: string, id: string) {
  return jobs(async db => {
    const row = await owned(db, userId, id);
    return { userId, job: view(row), result: row.result_json ? StudyKitSchema.parse(JSON.parse(String(row.result_json))) : null };
  });
}
export async function listGenerationJobs(userId: string, options: { sessionId?: string; active?: boolean; cursor?: string; limit?: number } = {}) {
  return jobs(async db => {
    const args: (string | number)[] = [userId];
    let where = 'user_id = ?';
    if (options.sessionId) { where += ' AND session_id = ?'; args.push(options.sessionId); }
    if (options.active) where += " AND status IN ('queued','running')";
    if (options.cursor) {
      const cursor = await owned(db, userId, options.cursor);
      where += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
      args.push(Number(cursor.created_at), Number(cursor.created_at), String(cursor.id));
    }
    const limit = Math.max(1, Math.min(50, options.limit ?? 20));
    args.push(limit + 1);
    const rows = (await db.execute({ sql: `SELECT ${publicColumns} FROM generation_jobs WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`, args })).rows;
    const page = rows.slice(0, limit).map(view);
    return { userId, jobs: page, nextCursor: rows.length > limit ? page.at(-1)!.id : null };
  });
}
export async function cancelGenerationJob(userId: string, id: string) {
  return transaction(async tx => {
    const row = await owned(tx, userId, id);
    if (!terminal.includes(String(row.status))) {
      const now = Date.now();
      await tx.execute({ sql: "UPDATE generation_jobs SET status='cancelled', updated_at=?, finished_at=?, error_json=NULL WHERE id=?", args: [now, now, id] });
    }
    return view(await owned(tx, userId, id));
  });
}

// Outbox delivery is reserved in the database before contacting the broker. A
// crash or rejected send becomes eligible again without any browser being open.
export async function reserveJobDeliveries(id?: string) {
  return transaction(async tx => {
    const now = Date.now();
    const rows = (await tx.execute({ sql: `SELECT id, delivery FROM generation_jobs WHERE status='queued'
      AND next_attempt_at <= ? AND dispatch_after <= ? ${id ? 'AND id = ?' : ''} ORDER BY created_at LIMIT 25`, args: id ? [now, now, id] : [now, now] })).rows;
    for (const row of rows) await tx.execute({ sql: 'UPDATE generation_jobs SET delivery=delivery+1, dispatch_after=? WHERE id=?', args: [now + JOB_LIMITS.deliveryRetryMs, row.id] });
    return rows.map(row => ({ id: String(row.id), delivery: Number(row.delivery) + 1 }));
  });
}
export async function recoverGenerationJobs() {
  return transaction(async tx => {
    const now = Date.now();
    const staleError = JSON.stringify({ code: 'WORKER_INTERRUPTED', message: 'The worker was interrupted. Retry this task.', retryable: true });
    await tx.execute({ sql: `UPDATE generation_jobs SET status=CASE WHEN attempt < ? THEN 'queued' ELSE 'failed' END,
      finished_at=CASE WHEN attempt < ? THEN NULL ELSE ? END, updated_at=?, next_attempt_at=?, dispatch_after=?,
      lease_token=NULL, lease_until=NULL, error_json=? WHERE status='running' AND lease_until <= ?`,
      args: [JOB_LIMITS.attempts, JOB_LIMITS.attempts, now, now, now, now, staleError, now] });
    await tx.execute({ sql: `UPDATE generation_jobs SET status='failed', finished_at=?, updated_at=?, error_json=?
      WHERE status='queued' AND created_at < ?`, args: [now, now, JSON.stringify({ code: 'QUEUE_TIMEOUT', message: 'The task could not start in time. Retry later.', retryable: true }), now - JOB_LIMITS.queueTimeoutMs] });
    // Cancellation retains the lease until worker acknowledgement or expiry.
    await tx.execute({ sql: "UPDATE generation_jobs SET lease_token=NULL, lease_until=NULL WHERE status='cancelled' AND lease_until <= ?", args: [now] });
    await tx.execute({ sql: "DELETE FROM generation_jobs WHERE status IN ('succeeded','failed','cancelled') AND finished_at < ?", args: [now - JOB_LIMITS.retentionMs] });
  });
}
export async function claimGenerationJob(id: string) {
  return transaction(async tx => {
    const now = Date.now();
    const row = (await tx.execute({ sql: 'SELECT * FROM generation_jobs WHERE id=?', args: [id] })).rows[0];
    if (!row || row.status !== 'queued' || Number(row.next_attempt_at) > now || Number(row.attempt) >= JOB_LIMITS.attempts) return null;
    const token = randomUUID();
    await tx.execute({ sql: `UPDATE generation_jobs SET status='running', stage='validating', attempt=attempt+1,
      lease_token=?, lease_until=?, started_at=COALESCE(started_at,?), updated_at=?, error_json=NULL WHERE id=?`,
      args: [token, now + JOB_LIMITS.leaseMs, now, now, id] });
    const snapshot = ServerStudySessionSchema.parse(JSON.parse(String(row.snapshot_json)));
    return { id, token, input: snapshotInput(snapshot), attempt: Number(row.attempt) + 1 };
  });
}
export async function updateJobStage(id: string, token: string, stage?: GenerationStage) {
  return jobs(async db => {
    const result = await db.execute({ sql: `UPDATE generation_jobs SET stage=COALESCE(?,stage), updated_at=?
      WHERE id=? AND lease_token=? AND status='running' AND lease_until > ?`, args: [stage ?? null, Date.now(), id, token, Date.now()] });
    return result.rowsAffected === 1;
  });
}
export async function acknowledgeCancellation(id: string, token: string) {
  return jobs(async db => { await db.execute({ sql: "UPDATE generation_jobs SET lease_token=NULL, lease_until=NULL WHERE id=? AND lease_token=? AND status='cancelled'", args: [id, token] }); });
}
export async function failGenerationAttempt(id: string, token: string, error: JobError) {
  return transaction(async tx => {
    const row = (await tx.execute({ sql: "SELECT attempt FROM generation_jobs WHERE id=? AND lease_token=? AND status='running' AND lease_until > ?", args: [id, token, Date.now()] })).rows[0];
    if (!row) return;
    const again = error.retryable && Number(row.attempt) < JOB_LIMITS.attempts;
    const now = Date.now();
    await tx.execute({ sql: `UPDATE generation_jobs SET status=?, error_json=?, updated_at=?, finished_at=?,
      next_attempt_at=?, dispatch_after=?, lease_token=NULL, lease_until=NULL WHERE id=?`,
      args: [again ? 'queued' : 'failed', JSON.stringify(error), now, again ? null : now, now + JOB_LIMITS.retryDelayMs, now + JOB_LIMITS.retryDelayMs, id] });
  });
}
export async function completeGenerationJob(id: string, token: string, output: StudyKit) {
  const result = StudyKitSchema.parse(output);
  return transaction(async tx => {
    const now = Date.now();
    const row = (await tx.execute({ sql: "SELECT * FROM generation_jobs WHERE id=? AND lease_token=? AND status='running' AND lease_until > ?", args: [id, token, now] })).rows[0];
    if (!row) return false;
    const snapshot = ServerStudySessionSchema.parse(JSON.parse(String(row.snapshot_json)));
    const expectedInput = snapshotInput(snapshot);
    if (result.runId !== id || result.source.text !== expectedInput.lecture) throw new Error('Generated result does not match its task.');
    const resultJson = JSON.stringify(result);
    if (Buffer.byteLength(resultJson) > STUDY_REQUEST_BYTES) throw new AccountError('RESULT_TOO_LARGE', 'Generated result exceeds storage limits.', 413);
    const current = (await tx.execute({ sql: 'SELECT document, revision, deleted FROM study_records WHERE id=? AND user_id=?', args: [row.session_id, row.user_id] })).rows[0];
    let savedId: string | null = null;
    let savedRevision: number | null = null;
    let disposition: 'updated' | 'copy' | 'result_only' = 'result_only';
    // Never resurrect a deleted course. Its owner can still retrieve this result.
    if (current && !Number(current.deleted)) {
      const unchanged = Number(current.revision) === Number(row.source_revision);
      const count = (await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM study_records WHERE user_id=? AND deleted=0', args: [row.user_id] })).rows[0];
      if (unchanged || Number(count.n) < MAX_STUDY_RECORDS) {
        savedId = unchanged ? snapshot.id : randomUUID();
        savedRevision = unchanged ? Number(current.revision) + 1 : 1;
        disposition = unchanged ? 'updated' : 'copy';
        const document = ServerStudySessionSchema.parse({ ...snapshot, id: savedId, lecture: expectedInput.lecture,
          title: snapshot.customTitle ? snapshot.title : result.lectureTitle.slice(0, INPUT_LIMITS.maxTitleCharacters),
          kit: result, updatedAt: now });
        const serialized = JSON.stringify(document);
        if (Buffer.byteLength(serialized) > STUDY_REQUEST_BYTES) { savedId = null; savedRevision = null; disposition = 'result_only'; }
        else await tx.execute({ sql: `INSERT INTO study_records (id,user_id,document,revision,deleted,updated_at) VALUES (?,?,?,?,0,?)
          ON CONFLICT(id) DO UPDATE SET document=excluded.document, revision=excluded.revision, updated_at=excluded.updated_at`,
          args: [savedId, row.user_id, serialized, savedRevision, now] });
      }
    }
    // Result persistence and course update commit atomically; redelivery is a no-op.
    await tx.execute({ sql: `UPDATE generation_jobs SET status='succeeded', stage='complete', result_json=?,
      saved_session_id=?, saved_revision=?, save_disposition=?, updated_at=?, finished_at=?,
      error_json=NULL, lease_token=NULL, lease_until=NULL WHERE id=?`,
      args: [resultJson, savedId, savedRevision, disposition, now, now, id] });
    return true;
  });
}
