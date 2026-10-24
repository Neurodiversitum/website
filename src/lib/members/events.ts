// Event registration: members register for upcoming events from Notion (src/lib/events), get a
// confirmation mail with a calendar file, and can cancel. Every change is copied to Notion
// through the queue. A registration stores the Notion page id of the event as `event_id`.
import { waitUntil } from 'cloudflare:workers';
import {
  enqueueNotionSync,
  getRegistration,
  listRegistrations,
  now,
  type Member,
  type RegistrationRow,
} from './db';
import { calendarFile, calendarFileName, type CalendarEvent } from './ics';
import { registrationMail, sendMail } from './mail';
import { processNotionQueue } from './notion';
import {
  formatEventDate,
  localized,
  type Event,
  type EventDate,
} from '@/lib/content';
import { eventSnapshot } from '@/lib/events/rules';
import { localePath, type Language } from '@/lib/i18n';
import { site } from '@/data/site';

/** The calendar entry of a Notion event, in the member's language. */
export function eventToCalendar(event: Event, lang: Language): CalendarEvent {
  return {
    id: event.id,
    title: localized(event.title, lang),
    start: event.date!.start,
    end: event.date!.end,
    location: event.location || null,
    description: localized(event.summary, lang) || null,
    url: `${site.url}${localePath(lang, '/events')}`,
  };
}

/** The calendar entry of a stored registration (the event may be over or gone from Notion). */
export function registrationToCalendar(
  row: RegistrationRow,
): CalendarEvent | null {
  if (!row.event_start) return null;
  return {
    id: row.event_id,
    title: row.event_title,
    start: row.event_start,
    end: row.event_end,
    location: row.event_location,
    description: null,
    url: `${site.url}/events`,
  };
}

export function registrationDate(row: RegistrationRow): EventDate | null {
  if (!row.event_start) return null;
  return {
    start: row.event_start,
    end: row.event_end,
    isDatetime: row.event_start.length > 10,
  };
}

function syncLater(env: Env): void {
  waitUntil(
    processNotionQueue(env).catch((error) =>
      console.error('notion sync', error),
    ),
  );
}

/** Registers the member; a second click is a no-op. Sends the confirmation when the member wants event mail. */
export async function registerForEvent(
  env: Env,
  member: Member,
  event: Event,
): Promise<void> {
  const existing = await getRegistration(env.DB, member.user_id, event.id);
  if (existing) return;
  const id = crypto.randomUUID();
  const snapshot = eventSnapshot(event);
  await env.DB.prepare(
    `INSERT INTO "event_registration" ("id", "user_id", "event_id", "event_title", "event_start", "event_end", "event_location", "created_at")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      member.user_id,
      event.id,
      snapshot.title,
      snapshot.start,
      snapshot.end,
      snapshot.location,
      now(),
    )
    .run();
  await enqueueNotionSync(env.DB, 'registration', id);
  syncLater(env);
  if (member.mail_events === 1 && event.date) {
    const lang = member.language;
    const calendar = eventToCalendar(event, lang);
    const mail = registrationMail(lang, member.name, {
      title: calendar.title,
      when: formatEventDate(event.date, lang),
      location: calendar.location,
      eventsUrl: calendar.url!,
    });
    waitUntil(
      sendMail(env, {
        to: member.email,
        ...mail,
        attachments: [
          {
            content: calendarFile(calendar),
            filename: calendarFileName(calendar.title),
            type: 'text/calendar',
            disposition: 'attachment',
          },
        ],
      }).catch((error) => console.error('registration mail', error)),
    );
  }
}

/** Cancels the registration; the Notion page is marked cancelled through the queue. */
export async function unregisterFromEvent(
  env: Env,
  member: Member,
  eventId: string,
): Promise<void> {
  const existing = await getRegistration(env.DB, member.user_id, eventId);
  if (!existing) return;
  await env.DB.prepare('DELETE FROM "event_registration" WHERE "id" = ?')
    .bind(existing.id)
    .run();
  await enqueueNotionSync(env.DB, 'registration', existing.id, {
    notion_page_id: existing.notion_page_id,
  });
  syncLater(env);
}

export { listRegistrations };
