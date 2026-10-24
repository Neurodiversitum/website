# Neurodiversitum website

The website of Neurodiversitum, an independent neurodiversity student initiative at the Technical University of Munich. Live at [neurodiversitum.org](https://neurodiversitum.org).

The site has public pages in English and German (home, about, team, projects, events, ideas, join, newsletter, imprint, privacy, cookies) and a member area with sign-in by email link.

## Tech stack

- [Astro](https://astro.build) 7 with TypeScript in strict mode. Public pages are static.
- Hosting on Cloudflare Workers with static assets. The member area and the events page run on the Worker with D1 (database), R2 (files), Email Sending and a cron trigger.
- [Better Auth](https://www.better-auth.com) with magic links for the member area.
- Team, projects and events come from Notion. `scripts/fetch-content.mjs` refreshes `src/data/content.json` before each build. Without a Notion token the build uses the committed file.
- Forms through Tally embeds. Self-hosted Geist font. No tracking scripts.
- Checks: Astro type check, Node unit tests, HTML validation, link check, Playwright with axe, Lighthouse CI.

## Project structure

- `src/pages/` and `src/pages/de/`: one file per page and language. Each page imports a view from `src/views/`.
- `src/components/`: small building blocks. `src/layouts/`: the document shell.
- `src/data/copy.ts`: all text in English and German. `src/data/site.ts`: facts such as addresses and form ids.
- `src/lib/`: client scripts (router, sky canvas, sections) and Worker code (`members/`, `events/`, `inbox/`).
- `src/worker.ts`: the Worker entry (requests, cron, incoming email).
- `docs/`: design system and media rules.

## Run locally

Use Node 22.12 or newer (see `.nvmrc`).

```sh
npm install
cp .dev.vars.example .dev.vars   # set BETTER_AUTH_SECRET to a long random string
npm run dev
```

Optional: copy `.env.example` to `.env` and add a Notion token and database ids to load live content at build time.

Other commands:

```sh
npm run build    # production build into dist/
npm run test     # unit tests
npm run check    # type check
npm run ci       # the complete quality gate, including browser checks
```

## Deploy your own copy

`wrangler.jsonc` holds placeholders (`YOUR_...`, `admin@example.org`) for the Cloudflare and Notion ids, and `src/data/inbox.ts` holds placeholder board addresses. Replace them with your own values. Set the secrets (`BETTER_AUTH_SECRET`, `NOTION_TOKEN`, `NOTION_MEMBERS_TOKEN`, `NOTION_INBOX_TOKEN`) with `wrangler secret put` or in the Cloudflare dashboard. Then run `npm run deploy`.

Never commit `.env`, `.dev.vars` or any other file with secrets.
