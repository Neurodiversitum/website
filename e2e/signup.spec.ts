// The sign-up form shows one question at a time: the keyboard alone completes it, Back returns,
// each step is checked with the server's rules, and the account is created as before.
// Also: the settings panel closes on a click outside, and a click leaves no focus ring.
import { expect, test } from '@playwright/test';

test('sign-up: one question at a time, by keyboard, to the sent message', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/join');
  const count = page.locator('[data-step-count]');
  const step = () =>
    page.evaluate(
      () =>
        document.querySelector<HTMLElement>('[data-step]:not([hidden])')
          ?.dataset.step,
    );
  await expect(count).toHaveText('Question 1 of 10');
  await page.locator('#name').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-step="name"] .field-error')).toBeVisible();
  await page.keyboard.type('Keyboard Person');
  await page.keyboard.press('Enter');
  await expect(count).toHaveText('Question 2 of 10');
  await expect(page.locator('#email')).toBeFocused();
  await page.keyboard.type('someone@tum.de');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-step="email"] .field-error')).toBeVisible();
  await page.locator('#email').fill(`keyboard-${Date.now()}@example.com`);
  await page.keyboard.press('Enter');
  await expect(count).toHaveText('Question 3 of 10');
  await page.locator('[data-step-back]').click();
  expect(await step()).toBe('email');
  await page.locator('[data-step-next]').click();
  await page.locator('#university').selectOption('LMU');
  for (let i = 3; i < 10; i += 1) {
    await page.locator('[data-step-next]').click();
    await expect(count).toHaveText(`Question ${i + 1} of 10`);
  }
  await expect(page.locator('[data-step-next]')).toBeHidden();
  await page.locator('[name="privacyConsent"]').check();
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.notice[role="status"]')).toBeVisible();
});

test('settings close on a click outside; a click leaves no focus ring', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/about');
  await page.locator('[data-settings-open]').click();
  await expect(page.locator('[data-settings-panel]')).toBeVisible();
  const ring = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('[data-settings-open]')!)
        .outlineStyle,
  );
  expect(ring).toBe('none');
  await page.mouse.click(700, 700);
  await expect(page.locator('[data-settings-panel]')).toBeHidden();
});
