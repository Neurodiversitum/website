// Every page, both languages, seven widths: no horizontal overflow, no cut-off text, no
// overlapping text. Pages with one section per screen are checked section by section.
// Screenshots land in e2e/screenshots/ (every section at 390 and 1440 px).
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { STORAGE } from './global-setup';
import { checkLayout } from './layout-check';
import {
  ALL_PAGES,
  LANGS,
  WIDTHS,
  localized,
  slug,
  type PageSpec,
} from './pages';

const shots = path.join(import.meta.dirname, 'screenshots');
mkdirSync(shots, { recursive: true });

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

/** Number of sections of a page with one section per screen (0 for plain pages). */
const sectionCount = (page: Page) =>
  page.evaluate(() => document.querySelectorAll('.sections > .sec').length);

/** Brings section `index` on screen, as a click on its dot does. */
async function showSection(page: Page, index: number) {
  await page.evaluate((i) => {
    document.querySelectorAll<HTMLButtonElement>('.dots button')[i]?.click();
  }, index);
  await page.waitForFunction(
    (i) =>
      document
        .querySelectorAll('.sections > .sec')
        [i]?.classList.contains('built'),
    index,
  );
  await page.waitForTimeout(50);
}

async function expectCleanLayout(page: Page, label: string) {
  const problems = await page.evaluate(checkLayout);
  expect(
    problems.map((p) => `${p.kind}: ${p.detail}`),
    label,
  ).toEqual([]);
}

for (const lang of LANGS) {
  for (const spec of ALL_PAGES) {
    const url = localized(lang, spec.path);
    test.describe(`${lang} ${spec.path}`, () => {
      if (spec.member) test.use({ storageState: STORAGE });
      for (const width of WIDTHS) {
        test(`fits at ${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          const response = await page.goto(url);
          expect(response?.status(), `status of ${url}`).toBe(
            spec.status ?? 200,
          );
          if (spec.member) {
            expect(page.url(), 'member page needs a session').not.toContain(
              '/members/login',
            );
          }
          await settle(page);
          const count = await sectionCount(page);
          const shoot = width === 390 || width === 1440;
          if (count === 0) {
            await page.screenshot({
              path: path.join(shots, `${slug(lang, spec.path)}-${width}.png`),
              fullPage: true,
            });
            await expectCleanLayout(page, `${url} at ${width}px`);
            return;
          }
          for (let i = 0; i < count; i += 1) {
            if (i > 0) await showSection(page, i);
            if (shoot || i === 0)
              await page.screenshot({
                path: path.join(
                  shots,
                  `${slug(lang, spec.path)}-${width}-s${i + 1}.png`,
                ),
              });
            await expectCleanLayout(
              page,
              `${url} section ${i + 1} at ${width}px`,
            );
          }
        });
      }
    });
  }
}

// The settings panel opens over the page and must not be cut off.
for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`${lang} settings panel fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(localized(lang, '/'));
      await settle(page);
      await page.click('[data-settings-open]');
      await expect(page.locator('[data-settings-panel]')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(shots, `${lang}-settings-${width}.png`),
      });
      await expectCleanLayout(page, `settings panel at ${width}px`);
    });
  }
}

// Easy read on the pages with the most text, without JavaScript-driven motion.
for (const spec of ['/', '/about', '/join', '/privacy'] as const) {
  for (const width of [320, 1440] as const) {
    test(`easy read on ${spec} at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        reducedMotion: 'reduce',
        viewport: { width, height: 900 },
      });
      await context.addInitScript(() => {
        localStorage.setItem('ndt_prefs', JSON.stringify({ font: 'easy' }));
      });
      const page = await context.newPage();
      await page.goto(spec);
      await settle(page);
      await expect(page.locator('html')).toHaveAttribute('data-easy', '1');
      const count = await sectionCount(page);
      for (let i = 0; i < Math.max(count, 1); i += 1) {
        if (i > 0) await showSection(page, i);
        await expectCleanLayout(
          page,
          `${spec} easy read, ${width}px, ${i + 1}`,
        );
      }
      await context.close();
    });
  }
}

export type { PageSpec };
