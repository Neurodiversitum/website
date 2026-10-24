// Download of the member's own data as JSON (Art. 15 and 20 GDPR). The middleware checks the session.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { exportData } from '@/lib/members/service';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.member) return new Response('Unauthorized', { status: 401 });
  const data = await exportData(env, locals.member);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition':
        'attachment; filename="neurodiversitum-my-data.json"',
      'Cache-Control': 'no-store',
    },
  });
};
