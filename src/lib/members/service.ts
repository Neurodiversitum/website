// The member area's write operations: registration, profile changes, account deletion, data export.
// Every write queues a Notion update and pushes the queue in the background.
import { waitUntil } from 'cloudflare:workers';
import { getAuth, LINK_MINUTES, type Auth } from './auth';
import {
  enqueueNotionSync,
  getMember,
  getUserByEmail,
  listRegistrations,
  now,
  type Member,
} from './db';
import {
  deletedMail,
  inactiveDeletedMail,
  sendMail,
  welcomeMail,
} from './mail';
import { processNotionQueue } from './notion';
import type { ProfileInput } from './validate';
import type { Language } from '@/lib/i18n';

/** True when the caller may continue; false when the rate limit for `key` is used up. */
export async function allowed(env: Env, key: string): Promise<boolean> {
  if (!env.LOGIN_RATE) return true;
  const { success } = await env.LOGIN_RATE.limit({ key });
  return success;
}

function isAdmin(env: Env, email: string): boolean {
  return env.ADMIN_EMAILS.split(',')
    .map((entry) => entry.trim().toLowerCase())
    .includes(email);
}

function syncLater(env: Env): void {
  waitUntil(
    processNotionQueue(env).catch((error) =>
      console.error('notion sync', error),
    ),
  );
}

/**
 * Creates the account and sends the first sign-in link. When the address already has an
 * account, a normal sign-in link goes out instead, so the form never reveals who is a member.
 */
export async function register(
  env: Env,
  auth: Auth,
  email: string,
  input: ProfileInput,
  headers: Headers,
): Promise<void> {
  const existing = await getUserByEmail(env.DB, email);
  if (!existing) {
    const id = crypto.randomUUID();
    const stamp = now();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, 0, ?, ?)',
      ).bind(id, input.name, email, stamp, stamp),
      env.DB.prepare(
        `INSERT INTO "member" ("user_id", "university", "language", "linkedin", "date_of_birth", "gender",
          "privacy_consent_at", "directory_opt_in", "mail_events", "mail_newsletter", "role", "created_at", "updated_at")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        input.university,
        input.language,
        input.linkedin,
        input.dateOfBirth,
        input.gender,
        stamp,
        input.directoryOptIn ? 1 : 0,
        input.mailEvents ? 1 : 0,
        input.mailNewsletter ? 1 : 0,
        isAdmin(env, email) ? 'admin' : 'member',
        stamp,
        stamp,
      ),
    ]);
    await enqueueNotionSync(env.DB, 'member', id);
    syncLater(env);
  }
  await sendLink(
    auth,
    email,
    input.language,
    headers,
    existing ? undefined : input.name,
  );
}

/** Asks Better Auth for a one-time link. Unknown addresses fail silently on purpose. */
export async function sendLink(
  auth: Auth,
  email: string,
  lang: Language,
  headers: Headers,
  welcomeName?: string,
): Promise<void> {
  try {
    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: lang === 'de' ? '/de/members' : '/members',
        metadata: { lang, welcome: welcomeName ?? null },
      },
      headers,
    });
  } catch (error) {
    // "User not found" must look like success to the visitor.
    console.warn('magic link', error instanceof Error ? error.message : error);
  }
}

export function firstLinkMail(lang: Language, name: string, url: string) {
  return welcomeMail(lang, name, url, LINK_MINUTES);
}

export async function updateProfile(
  env: Env,
  member: Member,
  input: ProfileInput,
): Promise<void> {
  const stamp = now();
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE "user" SET "name" = ?, "updatedAt" = ? WHERE "id" = ?',
    ).bind(input.name, stamp, member.user_id),
    env.DB.prepare(
      `UPDATE "member" SET "university" = ?, "language" = ?, "linkedin" = ?, "date_of_birth" = ?,
        "gender" = ?, "directory_opt_in" = ?,
        "mail_events" = ?, "mail_newsletter" = ?, "updated_at" = ? WHERE "user_id" = ?`,
    ).bind(
      input.university,
      input.language,
      input.linkedin,
      input.dateOfBirth,
      input.gender,
      input.directoryOptIn ? 1 : 0,
      input.mailEvents ? 1 : 0,
      input.mailNewsletter ? 1 : 0,
      stamp,
      member.user_id,
    ),
  ]);
  await enqueueNotionSync(env.DB, 'member', member.user_id);
  syncLater(env);
}

/** Everything the club holds about one member, for the download in the profile. */
export async function exportData(env: Env, member: Member) {
  const registrations = await listRegistrations(env.DB, member.user_id);
  return {
    exportedAt: now(),
    account: {
      id: member.user_id,
      name: member.name,
      email: member.email,
      joined: member.created_at,
      role: member.role,
    },
    profile: {
      university: member.university,
      language: member.language,
      linkedin: member.linkedin,
      dateOfBirth: member.date_of_birth,
      gender: member.gender,
      privacyConsentAt: member.privacy_consent_at,
      directoryOptIn: member.directory_opt_in === 1,
      mailEvents: member.mail_events === 1,
      mailNewsletter: member.mail_newsletter === 1,
      picture: member.picture_key
        ? 'stored (download it from your profile)'
        : null,
      lastActive: member.last_seen_at,
    },
    eventRegistrations: registrations.map((row) => ({
      event: row.event_title,
      start: row.event_start,
      end: row.event_end,
      location: row.event_location,
      registeredAt: row.created_at,
    })),
  };
}

/**
 * Removes a member completely: all rows in D1, the picture in R2, and (through the queue) the
 * Notion pages. Used by account deletion and by the retention job. Sends the deletion mail.
 */
export async function purgeMember(
  env: Env,
  member: Member,
  mail: 'deleted' | 'inactive' | 'none' = 'deleted',
): Promise<void> {
  const registrations = await listRegistrations(env.DB, member.user_id);
  if (member.picture_key && env.FILES) {
    await env.FILES.delete(member.picture_key).catch((error) =>
      console.error('picture delete', error),
    );
  }
  const pages = [
    member.notion_page_id,
    ...registrations.map((row) => row.notion_page_id),
  ].filter((id): id is string => Boolean(id));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM "event_registration" WHERE "user_id" = ?').bind(
      member.user_id,
    ),
    env.DB.prepare('DELETE FROM "member" WHERE "user_id" = ?').bind(
      member.user_id,
    ),
    env.DB.prepare('DELETE FROM "session" WHERE "userId" = ?').bind(
      member.user_id,
    ),
    env.DB.prepare('DELETE FROM "account" WHERE "userId" = ?').bind(
      member.user_id,
    ),
    env.DB.prepare('DELETE FROM "verification" WHERE "identifier" LIKE ?').bind(
      `%${member.email}%`,
    ),
    env.DB.prepare('DELETE FROM "user" WHERE "id" = ?').bind(member.user_id),
    env.DB.prepare('DELETE FROM "notion_sync" WHERE "ref" = ?').bind(
      member.user_id,
    ),
  ]);
  for (const page of pages) await enqueueNotionSync(env.DB, 'archive', page);
  syncLater(env);
  if (mail === 'none') return;
  const message =
    mail === 'inactive'
      ? inactiveDeletedMail(member.language, member.name)
      : deletedMail(member.language, member.name);
  waitUntil(
    sendMail(env, { to: member.email, ...message }).catch((error) =>
      console.error('deleted mail', error),
    ),
  );
}

/** Account deletion by the member. Returns the headers that clear the session cookie. */
export async function deleteAccount(
  env: Env,
  origin: string,
  member: Member,
  headers: Headers,
): Promise<Headers> {
  const auth = getAuth(env, origin);
  const { headers: signOutHeaders } = await auth.api.signOut({
    headers,
    returnHeaders: true,
  });
  await purgeMember(env, member, 'deleted');
  return signOutHeaders;
}

export { getMember };
