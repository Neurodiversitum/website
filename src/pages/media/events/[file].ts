// Event images, copied from Notion to R2 by the event sync. The file name carries a content
// hash, so a changed image gets a new address and browsers may cache each one for a year.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { MEDIA_FILE } from '@/lib/events/rules';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const name = params.file ?? '';
  if (!MEDIA_FILE.test(name) || !env.FILES) {
    return new Response('Not found', { status: 404 });
  }
  const object = await env.FILES.get(`events/${name}`);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
