// D1 side of the club inbox: conversations, thread ids and small cursors.
import { now } from '@/lib/members/db';

export type InboxStatus = 'new' | 'claimed' | 'answered' | 'closed';

export interface InboxRow {
  id: string;
  notion_page_id: string | null;
  from_email: string;
  from_name: string | null;
  subject: string;
  preview: string | null;
  received_at: string;
  status: InboxStatus;
  replies: number;
  reminded_at: string | null;
  answered_at: string | null;
  updated_at: string;
}

export async function getConversation(
  db: D1Database,
  id: string,
): Promise<InboxRow | null> {
  return db
    .prepare('SELECT * FROM "inbox_message" WHERE "id" = ?')
    .bind(id)
    .first<InboxRow>();
}

/** The conversation one of these message ids belongs to, if any. */
export async function findConversation(
  db: D1Database,
  messageIds: string[],
): Promise<InboxRow | null> {
  for (const id of messageIds.slice(0, 20)) {
    const row = await db
      .prepare(
        `SELECT m.* FROM "inbox_message" m
         JOIN "inbox_thread" t ON t."conversation_id" = m."id"
         WHERE t."message_id" = ?`,
      )
      .bind(id)
      .first<InboxRow>();
    if (row) return row;
  }
  return null;
}

export async function insertConversation(
  db: D1Database,
  row: Omit<
    InboxRow,
    'status' | 'replies' | 'reminded_at' | 'answered_at' | 'updated_at'
  >,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO "inbox_message" ("id", "notion_page_id", "from_email", "from_name", "subject", "preview", "received_at", "status", "updated_at")
         VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      )
      .bind(
        row.id,
        row.notion_page_id,
        row.from_email,
        row.from_name,
        row.subject,
        row.preview,
        row.received_at,
        now(),
      ),
    db
      .prepare(
        'INSERT OR IGNORE INTO "inbox_thread" ("message_id", "conversation_id") VALUES (?, ?)',
      )
      .bind(row.id, row.id),
  ]);
}

export async function addThreadId(
  db: D1Database,
  conversationId: string,
  messageId: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT OR IGNORE INTO "inbox_thread" ("message_id", "conversation_id") VALUES (?, ?)',
    )
    .bind(messageId, conversationId)
    .run();
}

export async function updateConversation(
  db: D1Database,
  id: string,
  changes: Partial<
    Pick<
      InboxRow,
      'notion_page_id' | 'status' | 'replies' | 'reminded_at' | 'answered_at'
    >
  >,
): Promise<void> {
  const sets: string[] = ['"updated_at" = ?'];
  const values: unknown[] = [now()];
  for (const [key, value] of Object.entries(changes)) {
    sets.push(`"${key}" = ?`);
    values.push(value);
  }
  values.push(id);
  await db
    .prepare(`UPDATE "inbox_message" SET ${sets.join(', ')} WHERE "id" = ?`)
    .bind(...values)
    .run();
}

/** Conversations whose Notion page is still missing (token missing or Notion down at the time). */
export async function listWithoutPage(db: D1Database): Promise<InboxRow[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM "inbox_message" WHERE "notion_page_id" IS NULL ORDER BY "received_at" LIMIT 20',
    )
    .all<InboxRow>();
  return results;
}

/** New conversations older than `minutes` that have not been reminded yet. */
export async function listReminderCandidates(
  db: D1Database,
  minutes: number,
): Promise<InboxRow[]> {
  const before = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT * FROM "inbox_message" WHERE "status" = 'new' AND "reminded_at" IS NULL
       AND "received_at" <= ? ORDER BY "received_at" LIMIT 20`,
    )
    .bind(before)
    .all<InboxRow>();
  return results;
}

/** Open conversations, for matching replies. */
export async function listOpenConversations(
  db: D1Database,
): Promise<InboxRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM "inbox_message" WHERE "status" IN ('new', 'claimed')
       ORDER BY "received_at" DESC LIMIT 200`,
    )
    .all<InboxRow>();
  return results;
}

export async function getState(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT "value" FROM "inbox_state" WHERE "key" = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setState(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO "inbox_state" ("key", "value") VALUES (?, ?) ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value"',
    )
    .bind(key, value)
    .run();
}

/** Conversations past their retention period (see retention-rules.ts). */
export async function listExpiredConversations(
  db: D1Database,
  closedBefore: string,
  receivedBefore: string,
): Promise<InboxRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM "inbox_message"
       WHERE ("status" IN ('answered', 'closed') AND "updated_at" < ?) OR "received_at" < ?
       LIMIT 50`,
    )
    .bind(closedBefore, receivedBefore)
    .all<InboxRow>();
  return results;
}

export async function deleteConversation(
  db: D1Database,
  id: string,
): Promise<void> {
  await db.batch([
    db
      .prepare('DELETE FROM "inbox_thread" WHERE "conversation_id" = ?')
      .bind(id),
    db.prepare('DELETE FROM "inbox_message" WHERE "id" = ?').bind(id),
  ]);
}
