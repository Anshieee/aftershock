import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { buildDemoOverviewRecord } from '../src/test/graphFixtures';

/**
 * M7 wave-3 — graph-explorer refinements, verified end-to-end against a
 * deterministic stub of the graph API (page.route). The real backend is
 * NEVER touched. Covers, with data actually loaded:
 *  - node text search, honest about its scope (loaded overview slice only);
 *  - edge-provenance surfacing in the selection panel (contract fields
 *    shown only where the payload carries them; "not provided" otherwise);
 *  - the sr-only synchronized node list + polite live status region,
 *    reachable and operable with the keyboard alone;
 *  - an axe scan of the loaded + selected state (critical-only gate).
 *
 * Runs against `AFTERSHOCK_BASE_URL` (config default: the deployed site).
 * Against a local build:
 *
 *   npx vite build
 *   npx vite preview --port 4173 &
 *   AFTERSHOCK_BASE_URL=http://localhost:4173 \
 *     npx playwright test e2e/graph-explorer.spec.ts --project=desktop
 */

async function stubGraph(page: Page) {
  await page.route('**/.netlify/functions/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/graph-edges')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildDemoOverviewRecord()),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not found' }),
    });
  });
}

test.describe('M7 wave-3 graph explorer (deterministic stubs)', () => {
  test('search scope is honest, live region announces, keyboard-only selection works', async ({
    page,
  }) => {
    await stubGraph(page);
    await page.goto('/graph');
    await page.getByTestId('graph-canvas').waitFor();

    // Labeled search input (name + for/id association).
    await expect(page.locator('label[for="graph-search-input"]')).toHaveText('Search loaded nodes');
    const search = page.getByTestId('graph-search');

    // Typing filters the slice; the count and the scope limitation are
    // stated honestly ("mehra" matches 4 of the 17 loaded overview nodes).
    await search.fill('mehra');
    await expect(page.getByTestId('graph-node-pub-mehra-2020')).toBeVisible();
    await expect(page.getByTestId('graph-search-scope')).toContainText(
      '4 of 17 loaded nodes match',
    );
    await expect(page.getByTestId('graph-search-scope')).toContainText(
      'within the currently loaded overview nodes (17)',
    );

    // The polite live region announces the filtered counts.
    await expect(page.getByTestId('graph-status')).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByTestId('graph-status')).toContainText('4 of 17 loaded nodes');
    await expect(page.getByTestId('graph-status')).toContainText(
      'within the currently loaded overview nodes (17)',
    );

    // Keyboard-only path: Tab from the search input reaches the sr-only
    // node list, and Enter on a node button selects that node.
    await search.fill('');
    const list = page.getByTestId('graph-node-list');
    await expect(list.locator('button')).toHaveCount(17);
    await search.focus();
    let reachedList = false;
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      const inList = await page.evaluate(
        () => !!document.activeElement?.closest('[data-testid="graph-node-list"]'),
      );
      if (inList) {
        reachedList = true;
        break;
      }
    }
    expect(reachedList, 'Tab from search reaches the sr-only node list').toBe(true);

    const claimButton = list.locator('button', { hasText: /\(claim-A\)$/ });
    await claimButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('context-inspector')).toBeVisible();
    await expect(page.getByTestId('inspector-id')).toHaveText('claim-A');

    // Provenance panel: raw relation types (never reworded), the static
    // relation-type legend, contract fields present vs absent.
    const panel = page.getByTestId('graph-selection-provenance');
    await expect(panel).toContainText('CONCLUSION_DEPENDS_ON_CLAIM');
    await expect(panel).toContainText('CLAIM_HAS_CITATION_USE');
    await expect(page.getByTestId('graph-relation-legend')).toContainText(
      'cites ≠ discusses ≠ supports ≠ contrasts ≠ method-reuse ≠ has-status-notice',
    );
    await expect(panel.getByTestId('edge-analysis-version').first()).toHaveText('seed-1');
    await expect(panel.getByTestId('edge-rationale').first()).toHaveText('not provided');
  });

  test('no critical axe violations with the graph loaded and a node selected', async ({ page }) => {
    await stubGraph(page);
    await page.goto('/graph');
    await page.getByTestId('graph-canvas').waitFor();
    await page.getByTestId('graph-node-claim-A').click();
    await page.getByTestId('graph-selection-provenance').waitFor();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    const minor = results.violations.filter((v) => v.impact !== 'critical');
    if (minor.length > 0) {
      console.log(
        `[graph-loaded] ${minor.length} minor violation(s): ${minor
          .map(
            (v) =>
              `${v.impact}:${v.id}(x${v.nodes.length}) → ${v.nodes
                .slice(0, 3)
                .map((n) => (n as { target: unknown[] }).target.join(' '))
                .join(' | ')}`,
          )
          .join(', ')}`,
      );
    }
    expect(
      critical.map((v) => `${v.impact}:${v.id}(x${v.nodes.length})`).join(', '),
      'critical axe violations on the loaded graph page',
    ).toBe('');
  });
});
