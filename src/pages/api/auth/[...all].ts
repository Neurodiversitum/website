// Better Auth endpoints (sign-in link, verify, session, sign-out) under /api/auth/*.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAuth, isConfigured, siteOrigin } from '@/lib/members/auth';
import { ensureSchema } from '@/lib/members/db';

export const prerender = false;

export const ALL: APIRoute = async ({ request, url }) => {
  if (!isConfigured(env)) {
    return new Response('Member area not configured', { status: 503 });
  }
  await ensureSchema(env.DB);
  return getAuth(env, siteOrigin(url)).handler(request);
};
