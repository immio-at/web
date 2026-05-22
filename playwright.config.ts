import { defineConfig, devices } from '@playwright/test';

/**
 * ADR-025 M2b — Playwright smoke safety net (Phase 0).
 *
 * Five smoke tests guard the user-facing critical paths so the M2b refactor
 * (and future schema work) fails loud and fast. These are smoke tests, not an
 * exhaustive suite.
 *
 * Running them:
 *   1. Pick a target:  PLAYWRIGHT_BASE_URL=https://dev.immio.at  (or http://localhost:3000)
 *   2. Provide a test login (storage-state auth — saved once, reused per test):
 *        PLAYWRIGHT_USER_EMAIL=...   PLAYWRIGHT_USER_PASSWORD=...
 *   3. npx playwright install   (first run only — downloads browsers)
 *   4. npm run e2e
 *
 * The `setup` project logs in once and writes e2e/.auth/user.json; every test
 * project reuses that storage state, so we never test the login flow itself
 * (that's out of scope for M2b) and avoid per-test auth flakiness.
 *
 * NOTE: selectors in the specs are best-effort against the documented DOM and
 * may need a one-line tweak per assertion the first time you run them — see
 * e2e/README.md.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
});
