// Automatic deletion according to the retention periods in retention-rules.ts.
// Runs from the cron job once per hour. Every step is idempotent.
import { waitUntil } from 'cloudflare:workers';
import { enqueueNotionSync, now, type Member } from './db';
import { inactivityWarningMail, sendMail } from './mail';
import { processNotionQueue } from './notion';
import { daysBefore, RETENTION, retentionDue } from './retention-rules';
import { purgeMember } from './service';
import { site } from '@/data/site';
import { localePath } from '@/lib/i18n';

async function membersWhere(
  env: Env,
  where: string,
  ...values: unknown[]
): Promise<Member[]> {
  const { results } = await env.DB.prepare(
    `SELECT m.*, u."name", u."email" FROM "member" m JOIN "user" u ON u."id" = m."user_id" WHERE ${where} LIMIT 50`,
  )
    .bind(...values)
    .all<Member>();
  return results;
}

/** Expired sessions and sign-in links, old rate-limit counters, dead sync jobs. */
async function deleteTechnicalData(env: Env, at: Date): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM "session" WHERE "expiresAt" < ?').bind(
      at.toISOString(),
    ),
    env.DB.prepare('DELETE FROM "verification" WHERE "expiresAt" < ?').bind(
      at.toISOString(),
    ),
    env.DB.prepare('DELETE FROM "rateLimit" WHERE "lastRequest" < ?').bind(
      at.getTime() - RETENTION.rateLimitDays * 24 * 60 * 60 * 1000,
    ),
    env.DB.prepare(
      'DELETE FROM "notion_sync" WHERE "attempts" >= 5 AND "created_at" < ?',
    ).bind(daysBefore(at, RETENTION.failedSyncDays)),
  ]);
}

/** Registrations whose first sign-in link was never used. */
async function deleteUnconfirmed(env: Env, at: Date): Promise<void> {
  const stale = await membersWhere(
    env,
    'u."emailVerified" = 0 AND u."createdAt" < ?',
    daysBefore(at, RETENTION.unconfirmedDays),
  );
  for (const member of stale) await purgeMember(env, member, 'none');
}

/** Two years without activity: one warning, then deletion after the grace period. */
async function handleInactive(env: Env, at: Date): Promise<void> {
  const cutoff = daysBefore(at, RETENTION.inactiveDays);
  const toWarn = await membersWhere(
    env,
    'm."inactivity_warned_at" IS NULL AND COALESCE(m."last_seen_at", m."created_at") < ?',
    cutoff,
  );
  for (const member of toWarn) {
    const login = `${site.url}${localePath(member.language, '/members/login')}`;
    await sendMail(env, {
      to: member.email,
      ...inactivityWarningMail(
        member.language,
        member.name,
        login,
        RETENTION.warningGraceDays,
      ),
    });
    await env.DB.prepare(
      'UPDATE "member" SET "inactivity_warned_at" = ? WHERE "user_id" = ?',
    )
      .bind(now(), member.user_id)
      .run();
  }
  const toDelete = await membersWhere(
    env,
    'm."inactivity_warned_at" IS NOT NULL AND m."inactivity_warned_at" < ? AND COALESCE(m."last_seen_at", m."created_at") < ?',
    daysBefore(at, RETENTION.warningGraceDays),
    cutoff,
  );
  for (const member of toDelete) await purgeMember(env, member, 'inactive');
}

/** Registrations for events that ended more than a year ago, with their Notion pages. */
async function deleteOldRegistrations(env: Env, at: Date): Promise<void> {
  const cutoff = daysBefore(at, RETENTION.registrationDays);
  const { results } = await env.DB.prepare(
    `SELECT "id", "notion_page_id" FROM "event_registration"
     WHERE COALESCE("event_end", "event_start", "created_at") < ? LIMIT 200`,
  )
    .bind(cutoff)
    .all<{ id: string; notion_page_id: string | null }>();
  for (const row of results) {
    await env.DB.prepare('DELETE FROM "event_registration" WHERE "id" = ?')
      .bind(row.id)
      .run();
    if (row.notion_page_id)
      await enqueueNotionSync(env.DB, 'archive', row.notion_page_id);
  }
}

export async function runRetention(env: Env, at: Date): Promise<void> {
  if (!env.DB || !retentionDue(at)) return;
  const steps: Array<[string, () => Promise<void>]> = [
    ['technical', () => deleteTechnicalData(env, at)],
    ['unconfirmed', () => deleteUnconfirmed(env, at)],
    ['inactive', () => handleInactive(env, at)],
    ['registrations', () => deleteOldRegistrations(env, at)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      console.error(`retention ${name}`, error);
    }
  }
  waitUntil(
    processNotionQueue(env).catch((error) =>
      console.error('notion sync', error),
    ),
  );
}
