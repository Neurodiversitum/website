import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

const locales = ['en', 'de'];

export default defineConfig({
  site: 'https://neurodiversitum.org',
  output: 'static',
  // Images are optimized at build time, so the Worker needs no Images binding.
  adapter: cloudflare({ imageService: 'compile' }),
  // Public pages are static except Events (live from Notion); no server sessions, so no KV binding.
  session: false,
  trailingSlash: 'never',
  // Pages are written as `about.html`, not `about/index.html`. Cloudflare then serves `/about`
  // directly; with folders it answered every address without a slash with a redirect to `/about/`,
  // which cost a round trip and made the page switch fall back to a full load.
  build: { format: 'file' },
  devToolbar: { enabled: false },
  // English at /…, German at /de/…. Every page exists in both languages (src/pages and src/pages/de).
  i18n: {
    defaultLocale: 'en',
    locales,
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      // Member pages need a sign-in; search engines get the public pages only.
      filter: (page) => !/\/members(\/|$)/.test(new URL(page).pathname),
      i18n: { defaultLocale: 'en', locales: { en: 'en', de: 'de' } },
    }),
  ],
  // No Markdown code blocks on the site; Shiki's inline styles would conflict with the CSP.
  markdown: { syntaxHighlight: false },
  security: {
    // Content Security Policy as a <meta> tag on every page. Astro adds hashes for its own
    // scripts and styles. Third-party content is limited to the Tally forms and the YouTube
    // videos, which load only after consent (ConsentEmbed). frame-ancestors and the other
    // response headers live in public/_headers, because a <meta> policy cannot set them.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "media-src 'self'",
        "connect-src 'self' https://tally.so",
        'frame-src https://tally.so https://www.youtube-nocookie.com',
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: { resources: ["'self'", 'https://tally.so'] },
      // The hero scene sets its generated values (star positions, comet phases) through inline
      // style attributes, which the attribute directive allows; <style> elements stay hashed.
      styleDirective: {
        resources: [
          { resource: "'self'", kind: 'element' },
          { resource: "'unsafe-inline'", kind: 'attribute' },
        ],
      },
    },
  },
  vite: {
    build: {
      sourcemap: true,
    },
  },
});
