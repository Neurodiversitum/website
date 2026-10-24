// Event registrations as CSV, all events or one (`?event=<id>`), board and admins only.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { csv, csvResponse } from '@/lib/members/csv';
import { listAllRegistrations } from '@/lib/members/db';
import { isBoard } from '@/lib/members/roles';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  if (!isBoard(locals.member?.role))
    return new Response('Forbidden', { status: 403 });
  const eventId = url.searchParams.get('event');
  const rows = (await listAllRegistrations(env.DB)).filter(
    (row) => !eventId || row.event_id === eventId,
  );
  const body = csv(
    ['Event', 'Event date', 'Location', 'Name', 'Email', 'Registered at'],
    rows.map((row) => [
      row.event_title,
      row.event_start ?? '',
      row.event_location ?? '',
      row.name,
      row.email,
      row.created_at,
    ]),
  );
  const day = new Date().toISOString().slice(0, 10);
  return csvResponse(`neurodiversitum-registrations-${day}.csv`, body);
};
