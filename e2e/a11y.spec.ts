// Accessibility: axe (WCAG 2.2 AA rules) on every page in both languages at a desktop and a
// phone width, every section of a page on screen in turn, zero serious or critical issues.
// Plus keyboard use: Tab reaches every control with a visible ring (and brings its section on
// screen), the arrow keys move between sections, the settings panel works from the keyboard.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STORAGE } from './global-setup';
import { ALL_PAGES, LANGS, localized } from './pages';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const lang of LANGS) {
  for (const spec of ALL_PAGES) {
    const url = localized(lang, spec.path);
    test.describe(`${lang} ${spec.path}`, () => {
      if (spec.member) test.use({ storageState: STORAGE });
      for (const width of [1440, 390] as const) {
        test(`has no serious axe issues at ${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(url);
          const count = await page.evaluate(
            () => document.querySelectorAll('.sections > .sec').length,
          );
          const lines: string[] = [];
          const minor = new Set<string>();
          for (let i = 0; i < Math.max(count, 1); i += 1) {
            if (i > 0) {
              await page.evaluate((k) => {
                document
                  .querySelectorAll<HTMLButtonElement>('.dots button')
                  [k]?.click();
              }, i);
              await page.waitForTimeout(150);
            }
            const results = await new AxeBuilder({ page })
              .withTags(TAGS)
              .analyze();
            for (const v of results.violations) {
              if (v.impact === 'serious' || v.impact === 'critical')
                lines.push(
                  `section ${i + 1}: ${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
                    .map((n) => n.target.join(' '))
                    .slice(0, 5)
                    .join('\n  ')}`,
                );
              else minor.add(v.id);
            }
          }
          expect(lines, `${url} at ${width}px`).toEqual([]);
          if (minor.size)
            console.log(`axe notes for ${url}: ${[...minor].join(', ')}`);
        });
      }
    });
  }
}

test('keyboard: every control on the start page gets a visible focus ring', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const controls = await page
    .locator('a[href], button, input, select, textarea')
    .count();
  expect(controls).toBeGreaterThan(10);
  const seen = new Set<string>();
  for (let i = 0; i < controls + 5; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        key: `${el.tagName}:${el.textContent?.trim().slice(0, 30)}:${el.getAttribute('href') ?? ''}`,
        ring:
          style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 1,
        visible:
          rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
        hidden: Boolean(el.closest('[hidden]')),
      };
    });
    if (!info) break;
    if (seen.has(info.key)) break;
    seen.add(info.key);
    expect(info.hidden, `${info.key} is inside a hidden panel`).toBe(false);
    expect(info.visible, `${info.key} is visible`).toBe(true);
    expect(info.ring, `${info.key} has a focus ring`).toBe(true);
  }
  expect(seen.size).toBeGreaterThan(10);
});

test('keyboard: settings panel opens, pauses the motion and closes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  // Under reduced motion the pause switch is on and locked; this test needs motion.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('[data-settings-open]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-settings-panel]')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#pref-motion')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveClass(/motion-paused/);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-settings-panel]')).toBeHidden();
  await expect(page.locator('[data-settings-open]')).toBeFocused();
});

test('keyboard: arrow keys move between the sections', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const on = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('.sections > .sec')).findIndex(
        (sec) => sec.classList.contains('on') && !sec.classList.contains('out'),
      ),
    );
  expect(await on()).toBe(0);
  await page.keyboard.press('ArrowDown');
  await expect.poll(on).toBe(1);
  await page.waitForTimeout(300);
  await page.keyboard.press('End');
  await expect.poll(on).toBeGreaterThan(1);
  await page.waitForTimeout(300);
  await page.keyboard.press('Home');
  await expect.poll(on).toBe(0);
});

test('big headings never show a focus ring', async ({ page }) => {
  await page.goto('/about');
  const ring = await page.evaluate(() => {
    const h1 = document.querySelector<HTMLElement>('h1')!;
    h1.tabIndex = -1;
    h1.focus();
    return getComputedStyle(h1).outlineStyle;
  });
  expect(ring).toBe('none');
});

test('skip link reaches the main content', async ({ page }) => {
  await page.goto('/about');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});
