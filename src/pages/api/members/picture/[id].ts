// A member's profile picture. The middleware requires a session; pictureResponse checks who may see it.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { pictureResponse } from '@/lib/members/pictures';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  if (!locals.member) return new Response('Unauthorized', { status: 401 });
  return pictureResponse(env, locals.member, params.id ?? '');
};
