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

  // Fill credentials (modal). Labels are localised — match either language.
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/password|passwort/i).fill(password);

  // Submit (the modal's own Sign In button).
  await page.getByRole('button', { name: /sign in|anmelden/i }).last().click();

  // Land on the dashboard (de has no locale prefix, en is /en/...).
  await page.waitForURL(/dashboard/, { timeout: 20_000 });
  await expect(page).toHaveURL(/dashboard/);

  await page.context().storageState({ path: authFile });
});
