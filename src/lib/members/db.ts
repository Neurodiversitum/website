// D1 access for the member area: schema migrations, row types and small query helpers.
import { migrations } from './schema';

export type Role = 'member' | 'board' | 'admin';
export type University = 'TUM' | 'LMU';
export type Gender = 'female' | 'male' | 'non_binary' | 'not_said';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: number;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberRow {
  user_id: string;
  university: University;
  language: 'en' | 'de';
  linkedin: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  privacy_consent_at: string;
  directory_opt_in: number;
  mail_events: number;
  mail_newsletter: number;
  picture_key: string | null;
  role: Role;
  notion_page_id: string | null;
  last_seen_at: string | null;
  inactivity_warned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationRow {
  id: string;
  user_id: string;
  event_id: string;
  event_title: string;
  event_start: string | null;
  event_end: string | null;
  event_location: string | null;
  notion_page_id: string | null;
  created_at: string;
}

/** User and club profile together, as the pages need them. */
export interface Member extends MemberRow {
  name: string;
  email: string;
}

let schemaReady: Promise<void> | undefined;

/** Applies pending migrations once per Worker instance. Safe to call on every request. */
export function ensureSchema(db: D1Database): Promise<void> {
  schemaReady ??= applyMigrations(db).catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

async function applyMigrations(db: D1Database): Promise<void> {
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS "schema_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TEXT NOT NULL)',
    )
    .run();
  const applied = new Set(
    (
      await db
        .prepare('SELECT "name" FROM "schema_migrations"')
        .all<{ name: string }>()
    ).results.map((row) => row.name),
  );
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    await db.batch([
      ...migration.statements.map((sql) => db.prepare(sql)),
      db
        .prepare(
          'INSERT OR IGNORE INTO "schema_migrations" ("name", "applied_at") VALUES (?, ?)',
        )
        .bind(migration.name, new Date().toISOString()),
    ]);
  }
}

export function now(): string {
  return new Date().toISOString();
}

export async function getMember(
  db: D1Database,
  userId: string,
): Promise<Member | null> {
  return db
    .prepare(
      'SELECT m.*, u."name", u."email" FROM "member" m JOIN "user" u ON u."id" = m."user_id" WHERE m."user_id" = ?',
    )
    .bind(userId)
    .first<Member>();
}

export async function getUserByEmail(
  db: D1Database,
  email: string,
): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM "user" WHERE "email" = ?')
    .bind(email)
    .first<UserRow>();
}

export async function listRegistrations(
  db: D1Database,
  userId: string,
): Promise<RegistrationRow[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM "event_registration" WHERE "user_id" = ? ORDER BY "event_start"',
    )
    .bind(userId)
    .all<RegistrationRow>();
  return results;
}

export async function getRegistration(
  db: D1Database,
  userId: string,
  eventId: string,
): Promise<RegistrationRow | null> {
  return db
    .prepare(
      'SELECT * FROM "event_registration" WHERE "user_id" = ? AND "event_id" = ?',
    )
    .bind(userId, eventId)
    .first<RegistrationRow>();
}

/** Members who opted in to the directory, with only the fields the directory shows. */
export interface DirectoryEntry {
  user_id: string;
  name: string;
  university: University;
  linkedin: string | null;
  picture_key: string | null;
}

export async function listDirectory(db: D1Database): Promise<DirectoryEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT m."user_id", u."name", m."university", m."linkedin", m."picture_key"
       FROM "member" m JOIN "user" u ON u."id" = m."user_id"
       WHERE m."directory_opt_in" = 1 ORDER BY u."name" COLLATE NOCASE`,
    )
    .all<DirectoryEntry>();
  return results;
}

/** Every member, for the board view. */
export async function listMembers(db: D1Database): Promise<Member[]> {
  const { results } = await db
    .prepare(
      'SELECT m.*, u."name", u."email" FROM "member" m JOIN "user" u ON u."id" = m."user_id" ORDER BY u."name" COLLATE NOCASE',
    )
    .all<Member>();
  return results;
}

export interface RegistrationWithMember extends RegistrationRow {
  name: string;
  email: string;
}

/** Every registration with the member's name and email, newest events first. */
export async function listAllRegistrations(
  db: D1Database,
): Promise<RegistrationWithMember[]> {
  const { results } = await db
    .prepare(
      `SELECT r.*, u."name", u."email" FROM "event_registration" r
       JOIN "user" u ON u."id" = r."user_id"
       ORDER BY r."event_start" DESC, r."created_at"`,
    )
    .all<RegistrationWithMember>();
  return results;
}

export async function countAdmins(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM "member" WHERE "role" = ?')
    .bind('admin')
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Records that the member was active. Writes at most once a day, so page views stay cheap.
 * Activity also cancels a pending inactivity warning.
 */
export async function touchMember(
  db: D1Database,
  member: Member,
): Promise<void> {
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (member.last_seen_at && member.last_seen_at > day) return;
  await db
    .prepare(
      'UPDATE "member" SET "last_seen_at" = ?, "inactivity_warned_at" = NULL WHERE "user_id" = ?',
    )
    .bind(now(), member.user_id)
    .run();
}

export async function getJobState(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT "value" FROM "job_state" WHERE "key" = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setJobState(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO "job_state" ("key", "value") VALUES (?, ?) ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value"',
    )
    .bind(key, value)
    .run();
}

/** Queues a change for the Notion copy. `processNotionQueue` in notion.ts sends it. */
export async function enqueueNotionSync(
  db: D1Database,
  kind: 'member' | 'registration' | 'archive',
  ref: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO "notion_sync" ("kind", "ref", "payload", "created_at") VALUES (?, ?, ?, ?)',
    )
    .bind(kind, ref, payload ? JSON.stringify(payload) : null, now())
    .run();
}
