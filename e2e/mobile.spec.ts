import { expect, test, type Page } from '@playwright/test';

/**
 * Mobile resilience (360–430 px class devices). Core routes must not
 * visibly break: no horizontal page overflow, primary navigation reachable
 * and usable by touch, primary actions visible without horizontal
 * scrolling. When the backend is not live, the honest failure / missing
 * states are the expected assertions — never fabricated content.
 *
 * Runs only on the existing `mobile` Playwright project; each test checks
 * both the 390×844 and 360×800 viewports.
 */

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

const TERMINAL_STATES = {
  '/overview': '[data-testid="overview-probe-failure"], [data-testid="continue-card"], [data-testid="import-first-card"]',
  '/graph': '[data-testid="graph-missing"], [data-testid="graph-failure"], [data-testid="graph-canvas"], [data-testid="graph-empty"]',
  '/results': '[data-testid="results-missing"], [data-testid="results-failure"], [data-testid="results-affected"]',
} as const;

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'mobile', 'mobile-only spec');
});

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `document must not overflow horizontally at ${overflow.innerWidth}px (scrollWidth ${overflow.scrollWidth}px)`,
  ).toBeLessThanOrEqual(overflow.innerWidth);
}

async function assertNavReachable(page: Page) {
  const nav = page.locator('nav[aria-label="Primary"]');
  await expect(nav).toBeVisible();
  const firstLink = nav.locator('a').first();
  await expect(firstLink).toBeVisible();
  await expect(firstLink).toBeInViewport();
}

/**
 * CTAs stack below the (visible) nav on mobile, so they may sit below the
 * initial fold — but they must be reachable by pure vertical scrolling:
 * scrolled into view, fully visible, with no horizontal page overflow.
 */
async function assertVerticallyReachable(page: Page, locator: ReturnType<Page['locator']>) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport();
  await assertNoHorizontalOverflow(page);
}

test('landing: no overflow, nav reachable by touch, primary action in viewport', async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/', { waitUntil: 'load' });

    await assertNoHorizontalOverflow(page);
    await assertNavReachable(page);

    // The primary import affordance is reachable by vertical scrolling —
    // no horizontal scrolling needed.
    const choose = page.getByTestId('import-panel').locator('label[for="import-input"]').first();
    await assertVerticallyReachable(page, choose);

    // Touch usability: a nav link actually navigates on tap.
    await page.locator('nav[aria-label="Primary"] a', { hasText: 'Overview' }).tap();
    await expect(page).toHaveURL(/\/overview$/);
  }
});

test('overview: no overflow, nav reachable, card or honest failure in viewport', async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/overview', { waitUntil: 'load' });

    // Resolve past the transient checking state into a real, honest state.
    await page.locator(TERMINAL_STATES['/overview']).first().waitFor({ state: 'visible', timeout: 20_000 });

    await assertNoHorizontalOverflow(page);
    await assertNavReachable(page);

    // Whenever a primary card is shown, its first action must be vertically
    // reachable; otherwise the honest failure state must be.
    const primaryAction = page
      .locator('[data-testid="continue-card"] a, [data-testid="import-first-card"] a')
      .first();
    if ((await primaryAction.count()) > 0) {
      await assertVerticallyReachable(page, primaryAction);
    } else {
      // Backend not live: the honest failure state is the accepted content.
      await assertVerticallyReachable(page, page.getByTestId('overview-probe-failure'));
    }
  }
});

test('graph: no overflow, nav reachable, records list reachable without canvas breaking layout', async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/graph', { waitUntil: 'load' });

    await page.locator(TERMINAL_STATES['/graph']).first().waitFor({ state: 'visible', timeout: 20_000 });

    await assertNoHorizontalOverflow(page);
    await assertNavReachable(page);

    const missing = page.getByTestId('graph-missing');
    if (await missing.isVisible()) {
      // Honest missing state — its jump-off must be vertically reachable
      // without horizontal scrolling.
      const cta = missing.getByRole('link', { name: 'Try guided example' });
      await assertVerticallyReachable(page, cta);
    } else if (await page.getByTestId('graph-canvas').isVisible()) {
      // The records LIST view is the accepted mobile equivalent of the
      // canvas: it must be present and scrollable into view.
      const nodesList = page.getByTestId('graph-nodes-list');
      await expect(nodesList).toBeAttached();
      await nodesList.scrollIntoViewIfNeeded();
      await expect(nodesList).toBeVisible();
      // The canvas may pan internally, but it must not widen the page.
      await assertNoHorizontalOverflow(page);
    }
  }
});

test('results via the honest failure path: no overflow, honest state shown', async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/results', { waitUntil: 'load' });

    await page.locator(TERMINAL_STATES['/results']).first().waitFor({ state: 'visible', timeout: 20_000 });

    await assertNoHorizontalOverflow(page);
    await assertNavReachable(page);

    // No fabricated results may appear when the API is silent.
    await expect(
      page.getByTestId('results-missing').or(page.getByTestId('results-failure')).or(page.getByTestId('results-affected')),
    ).toBeVisible();
  }
});
