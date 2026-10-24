// Better Auth on the Worker: magic links only, sessions and tokens in D1. One instance per Worker
// and origin; the origin is the production domain or the preview address of the current build.
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { ensureSchema } from './db';
import { loginMail, sendMail, welcomeMail } from './mail';
import { site } from '@/data/site';
import type { Language } from '@/lib/i18n';

export const LINK_MINUTES = 15;
export const SESSION_DAYS = 30;

/** Hosts the site may be served from. Any other host gets links to the production domain. */
export function siteOrigin(requestUrl: URL): string {
  const host = requestUrl.hostname;
  if (
    host === 'neurodiversitum.org' ||
    host === 'www.neurodiversitum.org' ||
    host.endsWith('.workers.dev') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  ) {
    return requestUrl.origin;
  }
  return site.url;
}

const instances = new Map<string, ReturnType<typeof createAuth>>();

export function getAuth(env: Env, origin: string) {
  let auth = instances.get(origin);
  if (!auth) {
    auth = createAuth(env, origin);
    instances.set(origin, auth);
  }
  return auth;
}

export function isConfigured(env: Env): boolean {
  return Boolean(env.DB && env.BETTER_AUTH_SECRET);
}

function createAuth(env: Env, origin: string) {
  void ensureSchema(env.DB);
  return betterAuth({
    appName: 'Neurodiversitum',
    baseURL: origin,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [origin],
    session: {
      expiresIn: 60 * 60 * 24 * SESSION_DAYS,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 30,
      customRules: {
        '/sign-in/magic-link': { window: 600, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: 'ndtum',
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      useSecureCookies: origin.startsWith('https://'),
    },
    plugins: [
      magicLink({
        expiresIn: 60 * LINK_MINUTES,
        // Accounts are created by the registration form, never by a bare sign-in.
        disableSignUp: true,
        storeToken: 'hashed',
        async sendMagicLink({ email, token }, ctx) {
          const metadata = (ctx?.body?.metadata ?? {}) as {
            lang?: string;
            welcome?: string | null;
          };
          const lang: Language = metadata.lang === 'de' ? 'de' : 'en';
          // The link opens a page with a button instead of the verify endpoint, so a mail
          // scanner that opens links cannot use up the one-time token.
          const path = lang === 'de' ? '/de/members/verify' : '/members/verify';
          const url = `${origin}${path}?token=${encodeURIComponent(token)}`;
          const mail = metadata.welcome
            ? welcomeMail(lang, metadata.welcome, url, LINK_MINUTES)
            : loginMail(lang, url, LINK_MINUTES);
          await sendMail(env, { to: email, ...mail });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = NonNullable<
  Awaited<ReturnType<Auth['api']['getSession']>>
>;
