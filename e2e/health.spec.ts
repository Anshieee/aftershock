import { expect, test, type Page } from '@playwright/test';

/**
 * Quiet status-line acceptance — the line reports only what it observed from
 * the real health endpoint. Online with the live endpoint; unavailable when
 * the endpoint is blocked. This proves the status cannot fake "online", and
 * that it lives as discreet diagnostics in the sidebar, not a prominent
 * header badge.
 */

const lineIn = (page: Page) => page.locator('header [data-testid="service-status-line"]');

test('quiet status line shows API online against the live endpoint', async ({ page }) => {
  await page.goto('/overview');
  // The line resolves after the real fetch round-trip.
  const line = lineIn(page);
  await expect(line).toContainText('API:', { timeout: 15_000 });
  await expect(line).toContainText('API: online');
  // No claim here about the graph backend (M1 health does not probe it).
  await expect(line).not.toContainText(/graph.*online/i);
});

test('quiet status line honestly shows unavailable when the endpoint fails', async ({ page }) => {
  await page.route('**/.netlify/functions/health', (route) => route.abort('failed'));
  await page.goto('/overview');
  await expect(lineIn(page)).toContainText('API: unavailable');
});
