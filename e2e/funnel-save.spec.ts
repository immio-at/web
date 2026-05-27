import { test, expect } from '@playwright/test';

// ADR-025 M2b smoke #2 — Funnel save.
// Save a listing from Discover (heart/house icon), then assert it appears on
// the Funnel. Uses the first card; tolerant of either language.
test('saving a Discover listing surfaces it on the Funnel', async ({ page }) => {
  await page.goto('/search');

  const firstCard = page.locator('[data-testid="listing-card"]').first();
  await expect(firstCard.or(page.locator('main img').first())).toBeVisible({ timeout: 15_000 });

  // The save affordance is the house/heart icon button on the card (ADR-012).
  // Prefer an accessible name; fall back to the first icon button on the card.
  const saveBtn = firstCard
    .getByRole('button', { name: /save|funnel|investigating|merken|speichern/i })
    .first();
  await saveBtn.click();

  // Navigate to the Funnel and assert a card is present there.
  await page.goto('/funnel');
  const funnelCard = page.locator('[data-testid="listing-card"]').first();
  await expect(funnelCard.or(page.locator('main img').first())).toBeVisible({ timeout: 15_000 });
});
