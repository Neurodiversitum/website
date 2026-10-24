// Member area: loads the session for member pages and sends visitors without one to the login page.
// Every page the Worker renders (member area, join, events) gets the security headers here;
// prerendered pages get them from public/_headers.
import type { APIContext, MiddlewareNext } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { env, waitUntil } from 'cloudflare:workers';
import { getAuth, isConfigured, siteOrigin } from '@/lib/members/auth';
import { ensureSchema, getMember, touchMember } from '@/lib/members/db';
import { asLanguage, localePath, stripLocale } from '@/lib/i18n';
import { withSecurityHeaders } from '@/lib/security-headers';

/** Member pages that work without a session. */
const PUBLIC = new Set([
  '/members/login',
  '/members/verify',
  '/members/logged-out',
]);

export const onRequest = defineMiddleware(async (context, next) =>
  withSecurityHeaders(await memberGate(context, next)),
);

async function memberGate(
  context: APIContext,
  next: MiddlewareNext,
): Promise<Response> {
  const path = stripLocale(context.url.pathname).replace(/\/$/, '') || '/';
  const isMemberPage = path === '/members' || path.startsWith('/members/');
  const isMemberApi = path.startsWith('/api/members');
  if (!isMemberPage && !isMemberApi && path !== '/join') return next();

  context.locals.configured = isConfigured(env);
  context.locals.session = null;
  context.locals.member = null;
  if (!context.locals.configured) {
    if (isMemberApi)
      return new Response('Member area not configured', { status: 503 });
    return next();
  }

  await ensureSchema(env.DB);
  const auth = getAuth(env, siteOrigin(context.url));
  const session = await auth.api.getSession({
    headers: context.request.headers,
  });
  if (session) {
    context.locals.session = session;
    context.locals.member = await getMember(env.DB, session.user.id);
    const member = context.locals.member;
    if (member)
      waitUntil(
        touchMember(env.DB, member).catch((error) =>
          console.error('touch member', error),
        ),
      );
  }

  const needsLogin = isMemberPage && !PUBLIC.has(path);
  if (needsLogin && !session) {
    const lang = asLanguage(context.currentLocale);
    const back = encodeURIComponent(context.url.pathname);
    return context.redirect(
      `${localePath(lang, '/members/login')}?next=${back}`,
      303,
    );
  }
  if (isMemberApi && !session) {
    return new Response('Unauthorized', { status: 401 });
  }
  return next();
}
