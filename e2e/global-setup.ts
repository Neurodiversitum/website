// Prepares the member area for the browser checks: a member account with the admin role, one
// upcoming event in the local database, and one registration for it. Runs once before the tests.
// The sign-in goes through the real flow: registration form, simulated mail in .wrangler/tmp/email,
// the emailed link, the verify button. The role and the event are written with wrangler into the
// same local D1 database the dev server uses.
import { chromium, type FullConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mailRoot = path.join(root, '.wrangler/tmp/email');
export const STORAGE = path.join(import.meta.dirname, 'results/member.json');
export const EVENT_ID = 'e2e-event-0000-0000-000000000001';

function latestMail(after: number): string | null {
  const found: { time: number; file: string }[] = [];
  const walk = (dir: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry);
      const info = statSync(file);
      if (info.isDirectory()) walk(file);
      else if (file.endsWith('.txt') && info.mtimeMs >= after)
        found.push({ time: info.mtimeMs, file });
    }
  };
  walk(mailRoot);
  found.sort((a, b) => b.time - a.time);
  return found[0] ? readFileSync(found[0].file, 'utf8') : null;
}

function d1(sql: string): void {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'neurodiversitum-members-eu',
      '--local',
      '--command',
      sql,
    ],
    { cwd: root, stdio: 'pipe', env: { ...process.env, CI: '1' } },
  );
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL as string;
  const email = `member-${Date.now()}@example.com`;
  mkdirSync(path.dirname(STORAGE), { recursive: true });

  // One upcoming event, as the Worker would load it from Notion.
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 14);
  start.setUTCHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const event = {
    id: EVENT_ID,
    title: { en: 'Quiet study evening', de: 'Ruhiger Lernabend' },
    summary: {
      en: 'Two hours of calm study time with headphones, snacks and no pressure to talk.',
      de: 'Zwei Stunden ruhige Lernzeit mit Kopfhörern, Snacks und ohne Redezwang.',
    },
    date: {
      start: start.toISOString(),
      end: end.toISOString(),
      isDatetime: true,
    },
    location: 'TUM main campus, room 0501',
    registrationLink: null,
    image: null,
  };
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  );
  const page = await browser.newPage({ baseURL, reducedMotion: 'reduce' });
  // The first request creates the schema; the event row needs the table.
  await page.goto('/members/login');
  d1(
    `INSERT OR REPLACE INTO "event" ("id", "data", "image_source", "synced_at") VALUES (${sqlString(event.id)}, ${sqlString(JSON.stringify(event))}, NULL, ${sqlString(new Date().toISOString())}); ` +
      `INSERT INTO "job_state" ("key", "value") VALUES ('events_synced_at', ${sqlString(new Date().toISOString())}) ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value";`,
  );

  // Register through the form and sign in with the emailed link.
  const before = Date.now() - 1000;
  // The form shows one question at a time (src/lib/stepper.ts): answer, then Next.
  await page.goto('/join');
  const next = () => page.click('[data-step-next]');
  await page.fill('#name', 'Test Member');
  await next();
  await page.fill('#email', email);
  await next();
  await page.selectOption('#university', 'TUM');
  await next();
  await page.selectOption('#language', 'en');
  await next(); // LinkedIn, date of birth and gender stay empty
  await next();
  await next();
  await next();
  await page.check('input[name="mailEvents"]');
  await next();
  await page.check('input[name="directoryOptIn"]');
  await next();
  await page.check('input[name="privacyConsent"]');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.notice');
  let mail: string | null = null;
  for (let attempt = 0; attempt < 20 && !mail; attempt += 1) {
    mail = latestMail(before);
    if (!mail) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!mail) throw new Error('No sign-in mail found under .wrangler/tmp/email');
  const link = mail.match(/https?:\/\/\S+\/members\/verify\?token=\S+/)?.[0];
  if (!link) throw new Error('The sign-in mail has no verify link');
  await page.goto(link.replace(/^https?:\/\/[^/]+/, baseURL));
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/members$/);

  // Admin role for the board pages, then one registration for the event.
  d1(
    `UPDATE "member" SET "role" = 'admin' WHERE "user_id" = (SELECT "id" FROM "user" WHERE "email" = ${sqlString(email)});`,
  );
  await page.goto('/members/events');
  await page.click(`form:has(input[name="event"][value="${EVENT_ID}"]) button`);
  await page.waitForSelector('.badge');
  await page.context().storageState({ path: STORAGE });
  await browser.close();
}
