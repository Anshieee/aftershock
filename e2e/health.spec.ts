import { expect, test, type Page } from '@playwright/test';

/**
 * Health chip acceptance — the chip reports only what it observed from the
 * real health endpoint. Online with the live endpoint; unavailable when the
 * endpoint is blocked. This proves the chip cannot fake "online".
 */

const chipIn = (page: Page) => page.locator('[data-testid="service-status"]');

test('chip shows API online against the live endpoint', async ({ page }) => {
  await page.goto('/overview');
  // The chip resolves after the real fetch round-trip.
  const chip = chipIn(page);
  await expect(chip).toContainText('API:', { timeout: 15_000 });
  await expect(chip).toContainText('API: online');
  // No claim here about the graph backend (M1 health does not probe it).
  await expect(chip).not.toContainText(/graph.*online/i);
});

test('chip honestly shows unavailable when the endpoint fails', async ({ page }) => {
  await page.route('**/.netlify/functions/health', (route) => route.abort('failed'));
  await page.goto('/overview');
  await expect(chipIn(page)).toContainText('API: unavailable');
});
