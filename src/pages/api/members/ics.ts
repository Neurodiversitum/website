// Calendar file for one event. Upcoming events come from Notion; past ones from the member's registration.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getRegistration } from '@/lib/members/db';
import { findUpcomingEvent } from '@/lib/events/store';
import { eventToCalendar, registrationToCalendar } from '@/lib/members/events';
import { calendarFile, calendarFileName } from '@/lib/members/ics';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const member = locals.member;
  if (!member) return new Response('Unauthorized', { status: 401 });
  const eventId = url.searchParams.get('event') ?? '';
  const upcoming = await findUpcomingEvent(env, eventId);
  let calendar = upcoming?.date
    ? eventToCalendar(upcoming, member.language)
    : null;
  if (!calendar) {
    const row = await getRegistration(env.DB, member.user_id, eventId);
    calendar = row ? registrationToCalendar(row) : null;
  }
  if (!calendar) return new Response('Not found', { status: 404 });
  return new Response(calendarFile(calendar), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${calendarFileName(calendar.title)}"`,
      'Cache-Control': 'no-store',
    },
  });
};
