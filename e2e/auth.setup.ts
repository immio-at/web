import { test as setup, expect } from '@playwright/test';
import path from 'path';

// ADR-025 M2b — one-time login → saved storage state, reused by every spec.
// Auth is modal-only (no /login route): the landing page hosts a Sign In
// modal. We drive it once here and persist the Supabase session (localStorage
// + cookies) so the actual tests start already authenticated.
const authFile = path.join(__dirname, '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_USER_EMAIL;
  const password = process.env.PLAYWRIGHT_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Set PLAYWRIGHT_USER_EMAIL and PLAYWRIGHT_USER_PASSWORD to a test account before running e2e.',
    );
  }

  await page.goto('/');

  // Open the Sign In modal from the landing page.
  await page.getByRole('button', { name: /sign in|anmelden/i }).first().click();

  // The landing page has its own "Early access" email form (also type=email,
  // same placeholder). The modal renders as the first top-level element on
  // the page, so the modal's email input is the first occurrence in DOM order.
  // Only one input[type=password] exists on the page (it's modal-only).
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').fill(password);

  // Submit via Enter on the password field — avoids ambiguity between the
  // modal's "Sign in" button and the nav's "Sign in" button, which share
  // exact accessible name.
  await page.locator('input[type="password"]').press('Enter');

  // Land on the dashboard (de has no locale prefix, en is /en/...).
  await page.waitForURL(/dashboard/, { timeout: 20_000 });
  await expect(page).toHaveURL(/dashboard/);

  await page.context().storageState({ path: authFile });
});
