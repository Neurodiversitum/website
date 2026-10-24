// Download of one material file, members only (the middleware requires a session).
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { materialResponse } from '@/lib/members/material';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  if (!locals.member) return new Response('Unauthorized', { status: 401 });
  return materialResponse(env, params.id ?? '');
};
