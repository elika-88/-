import 'server-only';
import type { Client } from '@libsql/client';
import type { StudySession } from '@/lib/client/sessions';
import { DeleteStudySessionSchema, SaveStudySessionSchema, ServerStudySessionSchema } from '@/lib/contracts/study-records';
import { databaseConfiguration, withDatabase } from '@/lib/server/database';
import { AccountError, initializeUserTables } from '@/lib/server/user-auth';

export const STUDY_REQUEST_BYTES = 2 * 1024 * 1024;
export const MAX_STUDY_RECORDS = 1000;
export { DeleteStudySessionSchema, SaveStudySessionSchema, ServerStudySessionSchema };

export async function initializeStudyTables(db: Client) {
  await initializeUserTables(db);
  await db.batch([
    `CREATE TABLE IF NOT EXISTS study_records (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      document TEXT, revision INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS study_records_owner ON study_records(user_id, deleted, updated_at)',
  ], 'write');
}

export async function listStudySessions(userId: string) {
  return withDatabase(async (db) => {
    await initializeStudyTables(db);
    const rows = (await db.execute({ sql: 'SELECT id, document, revision, deleted FROM study_records WHERE user_id = ? ORDER BY updated_at DESC, id', args: [userId] })).rows;
    const sessions: StudySession[] = [];
    // Deleted revisions stay visible to their owner so stale clients can detect deletion.
    const revisions: Record<string, number> = Object.create(null);
    for (const row of rows) {
      revisions[String(row.id)] = Number(row.revision);
      if (!Number(row.deleted)) sessions.push(ServerStudySessionSchema.parse(JSON.parse(String(row.document))));
    }
    return { userId, sessions, revisions, storage: databaseConfiguration().mode };
  });
}

export async function saveStudySession(userId: string, session: StudySession, expectedRevision: number) {
  const input = SaveStudySessionSchema.safeParse({ session, expectedRevision });
  if (!input.success) throw new AccountError('INVALID_REQUEST', 'Invalid study record.', 400);
  const document = JSON.stringify(input.data.session);
  if (Buffer.byteLength(document, 'utf8') > STUDY_REQUEST_BYTES) throw new AccountError('REQUEST_TOO_LARGE', 'Study record is too large.', 413);
  return withDatabase(async (db) => {
    await initializeStudyTables(db);
    const tx = await db.transaction('write');
    try {
      const row = (await tx.execute({ sql: 'SELECT user_id, revision, deleted FROM study_records WHERE id = ?', args: [session.id] })).rows[0];
      if (row && row.user_id !== userId) throw new AccountError('NOT_FOUND', 'Study record not found.', 404);
      if (row && Number(row.deleted)) throw new AccountError('CONFLICT', 'This lecture was deleted. Save it as a new lecture to keep a copy.', 409);
      if ((row ? Number(row.revision) : 0) !== expectedRevision) throw new AccountError('CONFLICT', 'This lecture changed in another session. Reload before saving.', 409);
      if (!row) {
        const count = (await tx.execute({ sql: 'SELECT COUNT(*) AS total FROM study_records WHERE user_id = ? AND deleted = 0', args: [userId] })).rows[0];
        if (Number(count.total) >= MAX_STUDY_RECORDS) throw new AccountError('STORAGE_LIMIT', 'Your account has reached the limit of 1,000 saved lectures.', 409);
      }
      const nextRevision = expectedRevision + 1;
      await tx.execute({
        sql: `INSERT INTO study_records (id, user_id, document, revision, deleted, updated_at) VALUES (?, ?, ?, ?, 0, ?)
          ON CONFLICT(id) DO UPDATE SET document = excluded.document, revision = excluded.revision, updated_at = excluded.updated_at`,
        args: [session.id, userId, document, nextRevision, Date.now()],
      });
      await tx.commit();
      return { session: input.data.session, revision: nextRevision };
    } finally { if (!tx.closed) await tx.rollback(); tx.close(); }
  });
}

export async function deleteStudySession(userId: string, id: string, expectedRevision: number) {
  const input = DeleteStudySessionSchema.safeParse({ id, expectedRevision });
  if (!input.success) throw new AccountError('INVALID_REQUEST', 'Invalid study record.', 400);
  return withDatabase(async (db) => {
    await initializeStudyTables(db);
    const tx = await db.transaction('write');
    try {
      const row = (await tx.execute({ sql: 'SELECT user_id, revision, deleted FROM study_records WHERE id = ?', args: [id] })).rows[0];
      if (!row || row.user_id !== userId) throw new AccountError('NOT_FOUND', 'Study record not found.', 404);
      if (Number(row.revision) !== expectedRevision) throw new AccountError('CONFLICT', 'This lecture changed in another session. Reload before deleting.', 409);
      if (Number(row.deleted)) throw new AccountError('NOT_FOUND', 'Study record not found.', 404);
      const nextRevision = expectedRevision + 1;
      await tx.execute({ sql: 'UPDATE study_records SET document = NULL, deleted = 1, revision = ?, updated_at = ? WHERE id = ? AND user_id = ?', args: [nextRevision, Date.now(), id, userId] });
      await tx.commit();
      return { deleted: true as const, revision: nextRevision };
    } finally { if (!tx.closed) await tx.rollback(); tx.close(); }
  });
}
