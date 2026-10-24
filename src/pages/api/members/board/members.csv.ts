// Member list as CSV, board and admins only.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { csv, csvResponse } from '@/lib/members/csv';
import { listMembers } from '@/lib/members/db';
import { isBoard } from '@/lib/members/roles';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!isBoard(locals.member?.role))
    return new Response('Forbidden', { status: 403 });
  const members = await listMembers(env.DB);
  const body = csv(
    [
      'Name',
      'Email',
      'University',
      'Language',
      'Role',
      'Joined',
      'Directory',
      'Event news',
      'Newsletter',
      'LinkedIn',
      'Date of birth',
      'Gender',
    ],
    members.map((m) => [
      m.name,
      m.email,
      m.university,
      m.language,
      m.role,
      m.created_at.slice(0, 10),
      m.directory_opt_in === 1 ? 'yes' : 'no',
      m.mail_events === 1 ? 'yes' : 'no',
      m.mail_newsletter === 1 ? 'yes' : 'no',
      m.linkedin ?? '',
      m.date_of_birth ?? '',
      m.gender ?? '',
    ]),
  );
  const day = new Date().toISOString().slice(0, 10);
  return csvResponse(`neurodiversitum-members-${day}.csv`, body);
};
