import { expect, test, type Page } from '@playwright/test';

/**
 * Service-status acceptance — the status reports only what it observed from
 * the real health endpoint. Online with the live endpoint; unavailable when
 * the endpoint is blocked. This proves the status cannot fake "online".
 *
 * Placement: current builds render a quiet diagnostics line at the bottom
 * of the sidebar (data-testid="service-status-line"); earlier deployments
 * render the truthful chip beside the Overview heading
 * (data-testid="service-status"). The truthful labels and semantics are
 * identical, so this deployed-site spec accepts either; the exact new
 * placement (sidebar line, no chip in the heading row) is pinned by
 * OverviewPage.test.tsx. No claim may be made about the graph backend
 * (M1 health does not probe it).
 */

const statusIn = (page: Page) =>
  page
    .locator('[data-testid="service-status-line"], [data-testid="service-status"]')
    .first();

test('status reports API online against the live endpoint', async ({ page }) => {
  await page.goto('/overview');
  // The status resolves after the real fetch round-trip.
  const status = statusIn(page);
  await expect(status).toContainText('API:', { timeout: 15_000 });
  await expect(status).toContainText('API: online', { timeout: 15_000 });
  // No claim here about the graph backend (M1 health does not probe it).
  await expect(status).not.toContainText(/graph.*online/i);
});

test('status honestly shows unavailable when the endpoint fails', async ({ page }) => {
  await page.route('**/.netlify/functions/health', (route) => route.abort('failed'));
  await page.goto('/overview');
  await expect(statusIn(page)).toContainText('API: unavailable');
});
