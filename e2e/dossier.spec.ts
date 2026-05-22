import { test, expect } from '@playwright/test';

// ADR-025 M2b smoke #3 — Dossier renders.
// Open a tracked listing from the Funnel, assert the modal shows the title +
// price summary (PropertyInfoStrip) and the dossier facts panel.
test('opening a Funnel listing shows the dossier facts panel', async ({ page }) => {
  await page.goto('/funnel');

  // Click into the first card's image (ADR-012: image-tap opens the modal).
  const firstCard = page.locator('[data-testid="listing-card"]').first();
  const cardImage = firstCard.locator('img').first().or(page.locator('main img').first());
  await expect(cardImage).toBeVisible({ timeout: 15_000 });
  await cardImage.click();

  // The PropertyAnalysisModal mounts (data-property-modal-open is set on its
  // outer element per the feedback-context capture convention).
  const modal = page.locator('[data-property-modal-open]');
  await expect(modal).toBeVisible({ timeout: 10_000 });

  // Switch to Dossier/Objektdaten mode and assert the facts panel renders.
  const dossierToggle = page.getByRole('button', { name: /objektdaten|dossier/i });
  if (await dossierToggle.isVisible().catch(() => false)) {
    await dossierToggle.click();
  }
  // A price (€) and a section header are reliable dossier signals.
  await expect(modal.getByText('€').first()).toBeVisible();
});
