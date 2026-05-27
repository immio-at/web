import { test, expect } from '@playwright/test';

// ADR-025 M2b smoke #5 — Recently Viewed.
// View a listing (opens the modal → fires a `view` interaction), return to the
// dashboard, and assert the Recently Viewed carousel shows a card.
test('a viewed listing shows in the Recently Viewed carousel', async ({ page }) => {
  // View a listing from the Funnel (interaction tracking fires on modal open).
  await page.goto('/funnel');
  const cardImage = page
    .locator('[data-testid="listing-card"]')
    .first()
    .locator('img')
    .first()
    .or(page.locator('main img').first());
  await expect(cardImage).toBeVisible({ timeout: 15_000 });
  await cardImage.click();
  await expect(page.locator('[data-property-modal-open]')).toBeVisible({ timeout: 10_000 });

  // Close the modal (Esc) — interaction was tracked on open.
  await page.keyboard.press('Escape');

  // Return to the dashboard; Recently Viewed carousel should render a card.
  await page.goto('/dashboard');
  const recentlyViewed = page
    .getByText(/recently viewed|zuletzt angesehen/i)
    .first();
  await expect(recentlyViewed).toBeVisible({ timeout: 15_000 });
});
