// Browser checks of the built site: layout at seven widths, accessibility (axe), keyboard use.
// The dev server serves every page, including the member area with a local database and
// simulated mail (.wrangler/tmp/email). `npm run test:e2e` runs this; CI does the same.
import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 4500);
export const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '.',
  outputDir: './results',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL,
    reducedMotion: 'reduce',
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run dev -- --port ${port} --host 127.0.0.1 --ignore-lock`,
    url: `${baseURL}/`,
    cwd: '..',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
