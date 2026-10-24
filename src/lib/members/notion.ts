// Copy of the member data in Notion. D1 is the source of truth; this module pushes changes
// from the `notion_sync` queue to the Members and Registrations databases with the separate
// member integration (secret NOTION_MEMBERS_TOKEN). Without the token the queue waits.
import { ensureSchema, getMember, now, type RegistrationRow } from './db';
import { date, memberProperties, select, text } from './notion-properties';

const API = 'https://api.notion.com/v1';
const MAX_ATTEMPTS = 5;
const BATCH = 10;
/** The scheduled retry gives up on a job after this many days and leaves it for the board view. */
const RETRY_DAYS = 30;

interface QueueRow {
  id: number;
  kind: 'member' | 'registration' | 'archive';
  ref: string;
  payload: string | null;
  attempts: number;
}

async function notion(
  env: Env,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_MEMBERS_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Notion ${response.status}: ${String(data.message ?? '')}`);
  }
  return data;
}

/** Creates or updates the member's page. */
async function syncMember(env: Env, userId: string): Promise<void> {
  const member = await getMember(env.DB, userId);
  if (!member) return; // deleted in the meantime; the archive job handles the page
  const properties = memberProperties(member);
  if (member.notion_page_id) {
    await notion(env, `/pages/${member.notion_page_id}`, 'PATCH', {
      properties,
    });
    return;
  }
  const page = await notion(env, '/pages', 'POST', {
    parent: { database_id: env.NOTION_MEMBERS_DB },
    properties,
  });
  await env.DB.prepare(
    'UPDATE "member" SET "notion_page_id" = ? WHERE "user_id" = ? AND "notion_page_id" IS NULL',
  )
    .bind(page.id, userId)
    .run();
}

async function syncRegistration(
  env: Env,
  registrationId: string,
  payload: string | null,
) {
  const registration = await env.DB.prepare(
    'SELECT * FROM "event_registration" WHERE "id" = ?',
  )
    .bind(registrationId)
    .first<RegistrationRow>();
  // A cancelled registration is gone from D1; the payload carries what the page needs.
  const cancelled = registration
    ? null
    : (JSON.parse(payload ?? 'null') as {
        notion_page_id: string | null;
      } | null);
  if (!registration) {
    if (cancelled?.notion_page_id) {
      await notion(env, `/pages/${cancelled.notion_page_id}`, 'PATCH', {
        properties: { Status: select('cancelled') },
      });
    }
    return;
  }
  const member = await getMember(env.DB, registration.user_id);
  if (!member) return;
  if (!member.notion_page_id) {
    // The member page must exist first; requeue behind it.
    throw new Error('member page not synced yet');
  }
  const properties = {
    Title: {
      title: [
        { text: { content: `${member.name}: ${registration.event_title}` } },
      ],
    },
    Member: { relation: [{ id: member.notion_page_id }] },
    Event: text(registration.event_title),
    'Event ID': text(registration.event_id),
    'Event date': date(registration.event_start),
    Status: select('registered'),
    'Registered at': date(registration.created_at),
    'Registration ID': text(registration.id),
  };
  if (registration.notion_page_id) {
    await notion(env, `/pages/${registration.notion_page_id}`, 'PATCH', {
      properties,
    });
    return;
  }
  const page = await notion(env, '/pages', 'POST', {
    parent: { database_id: env.NOTION_REGISTRATIONS_DB },
    properties,
  });
  await env.DB.prepare(
    'UPDATE "event_registration" SET "notion_page_id" = ? WHERE "id" = ?',
  )
    .bind(page.id, registrationId)
    .run();
}

/** Moves a page to the trash (account deleted). */
async function archivePage(env: Env, pageId: string) {
  await notion(env, `/pages/${pageId}`, 'PATCH', { in_trash: true });
}

/** Works through the queue. Called with waitUntil after writes; safe to call often. */
export async function processNotionQueue(
  env: Env,
  limit = BATCH,
): Promise<void> {
  if (!env.NOTION_MEMBERS_TOKEN) return;
  const { results } = await env.DB.prepare(
    'SELECT * FROM "notion_sync" WHERE "attempts" < ? ORDER BY "id" LIMIT ?',
  )
    .bind(MAX_ATTEMPTS, limit)
    .all<QueueRow>();
  for (const job of results) {
    try {
      if (job.kind === 'member') await syncMember(env, job.ref);
      else if (job.kind === 'registration')
        await syncRegistration(env, job.ref, job.payload);
      else if (job.kind === 'archive') await archivePage(env, job.ref);
      await env.DB.prepare('DELETE FROM "notion_sync" WHERE "id" = ?')
        .bind(job.id)
        .run();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await env.DB.prepare(
        'UPDATE "notion_sync" SET "attempts" = "attempts" + 1, "last_error" = ? WHERE "id" = ?',
      )
        .bind(reason.slice(0, 500), job.id)
        .run();
    }
  }
}

/**
 * Scheduled retry (cron). Queues members and registrations that never reached Notion, gives
 * jobs that used up their attempts another round (for up to RETRY_DAYS), then pushes the queue.
 * Without this, a job that failed while the integration was not connected yet would wait for
 * the next write of the same member.
 */
export async function retryNotionSync(env: Env): Promise<void> {
  if (!env.NOTION_MEMBERS_TOKEN || !env.DB) return;
  await ensureSchema(env.DB);
  const stamp = now();
  const since = new Date(
    Date.now() - RETRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO "notion_sync" ("kind", "ref", "created_at")
       SELECT 'member', m."user_id", ? FROM "member" m
       WHERE m."notion_page_id" IS NULL
         AND NOT EXISTS (SELECT 1 FROM "notion_sync" q WHERE q."kind" = 'member' AND q."ref" = m."user_id")`,
    ).bind(stamp),
    env.DB.prepare(
      `INSERT INTO "notion_sync" ("kind", "ref", "created_at")
       SELECT 'registration', r."id", ? FROM "event_registration" r
       WHERE r."notion_page_id" IS NULL
         AND NOT EXISTS (SELECT 1 FROM "notion_sync" q WHERE q."kind" = 'registration' AND q."ref" = r."id")`,
    ).bind(stamp),
    env.DB.prepare(
      'UPDATE "notion_sync" SET "attempts" = 0 WHERE "attempts" >= ? AND "created_at" >= ?',
    ).bind(MAX_ATTEMPTS, since),
  ]);
  await processNotionQueue(env, 25);
}

/** For the board page: how many changes still wait for Notion. */
export async function pendingNotionJobs(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM "notion_sync" WHERE "attempts" < ?',
  )
    .bind(MAX_ATTEMPTS)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export { now };
