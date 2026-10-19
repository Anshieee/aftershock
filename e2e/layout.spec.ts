import { expect, test } from '@playwright/test';

/**
 * Layout acceptance — exactly the five primary sidebar areas, one visible
 * secondary destination (Knowledge Graph), and navigation that stays
 * accessible on the mobile viewport instead of collapsing into a burger
 * menu that could hide IA (or vanish entirely).
 */

const PRIMARY_AREAS = ['Home', 'Investigations', 'Library', 'Review Queue', 'Activity'];

test('exactly five primary sidebar areas', async ({ page }) => {
  await page.goto('/');
  const primaryNav = page.locator('nav[aria-label="Primary"]');
  await expect(primaryNav).toBeVisible();
  const links = primaryNav.locator('a');
  await expect(links).toHaveCount(5);
  for (const area of PRIMARY_AREAS) {
    await expect(
      links.filter({ hasText: area }),
      `primary area "${area}" present`,
    ).toHaveCount(1);
  }
});

test('one visible secondary "Knowledge Graph" destination', async ({ page }) => {
  await page.goto('/');
  const exploreNav = page.locator('nav[aria-label="Explore"]');
  await expect(exploreNav).toBeVisible();
  const links = exploreNav.locator('a');
  await expect(links, 'exactly one secondary destination').toHaveCount(1);
  await expect(links).toHaveText('Knowledge Graph');
  await expect(exploreNav.getByText('Knowledge Graph')).toBeVisible();

  // It is reachable from the landing page and resolves to its page.
  await links.click();
  await expect(page).toHaveURL(/\/graph$/);
});

test('Evidence Reader / Export are not a sixth primary area', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('header');
  await expect(header.locator('a', { hasText: 'Evidence Reader' })).toHaveCount(0);
  await expect(header.locator('a', { hasText: 'Export' })).toHaveCount(0);
});

test('mobile viewport: navigation stays accessible (not permanently hidden)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const primaryNav = page.locator('nav[aria-label="Primary"]');
  await expect(primaryNav).toBeVisible();
  for (const area of PRIMARY_AREAS) {
    await expect(
      primaryNav.locator('a').filter({ hasText: area }),
    ).toBeVisible();
  }
  const explore = page.locator('nav[aria-label="Explore"]');
  await expect(explore).toBeVisible();
});
