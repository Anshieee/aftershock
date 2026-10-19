import { expect, test } from '@playwright/test';

/**
 * Console hygiene across the core walk landing → overview → Knowledge
 * Graph: no console errors (React Router future-flag warnings are known
 * build-time noise from the router version and are filtered), and no
 * missing assets (404s) on the deployed site.
 */

const FUTURE_FLAG_NOISE = /Future Flag Warning|v7_\w+ will move to React Router 7/i;

test('landing → overview → Knowledge Graph: no console errors, no asset 404s', async ({ page }) => {
  const errors: string[] = [];
  const notFound: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !FUTURE_FLAG_NOISE.test(msg.text())) {
      errors.push(`[console.error] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  page.on('response', (res) => {
    const url = res.url();
    if (res.status() === 404 && !FUTURE_FLAG_NOISE.test(url)) {
      notFound.push(`404: ${url}`);
    }
  });

  await page.goto('/', { waitUntil: 'load' });
  // Wave U1: the sidebar entry was renamed Overview → Home, so this
  // console-hygiene walk navigates directly to the (still-mounted)
  // /overview route instead of a nav link that no longer exists.
  await page.goto('/overview', { waitUntil: 'load' });
  await expect(page).toHaveURL(/\/overview$/);

  await page.locator('nav[aria-label="Explore"] a, nav[aria-label="Primary"] a, header a, main a')
    .filter({ hasText: 'Knowledge Graph' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/graph$/);
  // Let lazy chunks/fonts settle before declaring hygiene.
  await page.waitForLoadState('networkidle').catch(() => {});

  expect(notFound, `missing assets:\n${notFound.join('\n')}`).toEqual([]);
  expect(errors, `console ${errors.length > 0 ? 'errors' : ''}:\n${errors.join('\n')}`).toEqual([]);
});
