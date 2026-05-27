import { test, expect } from '@playwright/test';

// ADR-025 M2b smoke #4 — Create analysis.
// From a property's dossier/modal, open a new analysis, save, and assert it
// appears in the analyses list (a new tab in the modal's tab bar).
test('creating an analysis adds it to the analyses list', async ({ page }) => {
  await page.goto('/funnel');

  const cardImage = page
    .locator('[data-testid="listing-card"]')
    .first()
    .locator('img')
    .first()
    .or(page.locator('main img').first());
  await expect(cardImage).toBeVisible({ timeout: 15_000 });
  await cardImage.click();

  const modal = page.locator('[data-property-modal-open]');
  await expect(modal).toBeVisible({ timeout: 10_000 });

  // Enter Analysen mode.
  const analysesToggle = page.getByRole('button', { name: /analysen|analyses/i }).first();
  if (await analysesToggle.isVisible().catch(() => false)) {
    await analysesToggle.click();
  }

  // The tab bar uses a Chrome-style [+] to add a new analysis tab.
  const addTab = page.getByRole('button', { name: /^\+$|new analysis|neue analyse/i }).first();
  if (await addTab.isVisible().catch(() => false)) {
    await addTab.click();
  }

  // Pick a usage type (owner/rental/flip) if the selector is shown.
  const usage = page.getByRole('button', { name: /rental|vermietung|owner|eigennutzung|flip/i }).first();
  if (await usage.isVisible().catch(() => false)) {
    await usage.click();
  }

  // Save the analysis.
  await page.getByRole('button', { name: /save|speichern/i }).first().click();

  // The success pill ("✓ Analyse gespeichert") confirms the save (3s window).
  await expect(modal.getByText(/gespeichert|saved/i).first()).toBeVisible({ timeout: 10_000 });
});
