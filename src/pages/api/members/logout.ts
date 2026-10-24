// Sign out through a plain form post, then back to the public login page.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAuth, siteOrigin } from '@/lib/members/auth';
import { asLanguage, localePath } from '@/lib/i18n';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, currentLocale }) => {
  const auth = getAuth(env, siteOrigin(url));
  const { headers } = await auth.api.signOut({
    headers: request.headers,
    returnHeaders: true,
  });
  const form = await request.formData().catch(() => null);
  const lang = asLanguage(String(form?.get('lang') ?? currentLocale));
  headers.set('Location', `${localePath(lang, '/members/logged-out')}`);
  return new Response(null, { status: 303, headers });
};
