import { expect, test, type Page, type Route } from '@playwright/test';
import { buildDemoOverviewRecord } from '../src/test/graphFixtures';

/**
 * W4 Independence groups — hosted-acceptance-style spec, made DETERMINISTIC
 * by stubbing every Netlify function route the review-queue page touches
 * (page.route). The real graph backend is NEVER touched: the stub answers
 * with the §-shaped payloads of the design of record
 * (/tmp/opencode/wave4-spec.md), including the honesty scenarios
 * (shared groups + caveat, honest zero groups, unavailable endpoint).
 *
 * Runs against `AFTERSHOCK_BASE_URL` (config default: the deployed
 * aftershock-demo site). Until this branch — and the W4 independence-groups
 * function — are deployed, point it at a local build:
 *
 *   npx vite build
 *   npx vite preview --port 4173 &
 *   AFTERSHOCK_BASE_URL=http://localhost:4173 \
 *     npx playwright test e2e/independence.spec.ts --project=desktop
 *
 * Integrity rules asserted here mirror AGENTS.md:
 *  - the panel is read-only: it never flips a review case state;
 *  - the server's caveat renders verbatim ("This alone never changes any
 *    review state.");
 *  - zero shared groups is an honest result, never a guarantee;
 *  - an unavailable endpoint says "not shown yet" — no fabricated groups.
 */

/** Spec §Endpoint standing caveat (server constant), byte-for-byte. */
const CAVEAT =
  'Claims appearing in the same group share a supporting publication record. Sharing a supporting record means the claims are not independent evidence for each other — review them together at the paper itself. This alone never changes any review state.';

const LIMITATIONS = [
  'Only same-publication sharing is detected in this tier; shared datasets, analyses, or review trees are not detected (Find Evidence responses disclose the same limitation).',
  'Historical mentions never contribute to these groups; only supporting citation uses do.',
];

const GROUPS_OK = {
  graphName: 'aftershock-demo',
  seeded: true,
  seedVersion: 'seed-v3',
  summary: { supportingCitationUses: 3, publicationsSupportingClaims: 2, sharedGroups: 1 },
  groups: [
    {
      publication: {
        id: 'pub-mehra-2020',
        doi: '10.1016/j.mehra.2020',
        title: 'A retracted registry analysis',
        isSynthetic: true,
      },
      citationUseIds: ['cu-A-supporting', 'cu-B-supporting'],
      claimCount: 2,
      claims: [
        { id: 'claim-A', text: null, status: null },
        { id: 'claim-B', text: null, status: null },
      ],
    },
  ],
  caveat: CAVEAT,
  limitations: LIMITATIONS,
};

const GROUPS_EMPTY = {
  graphName: 'aftershock-demo',
  seeded: true,
  seedVersion: 'seed-v3',
  summary: { supportingCitationUses: 2, publicationsSupportingClaims: 2, sharedGroups: 0 },
  groups: [],
  caveat: CAVEAT,
  limitations: LIMITATIONS,
};

/** Installs deterministic stubs for every function the queue page calls. */
async function installStubs(
  page: Page,
  options: {
    onIndependence?: (url: URL) => { status: number; body: unknown } | undefined;
  } = {},
) {
  await page.route('**/.netlify/functions/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/graph-edges')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildDemoOverviewRecord()) });
      return;
    }
    if (url.pathname.endsWith('/activity')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (url.pathname.endsWith('/independence-groups')) {
      const resolved =
        options.onIndependence?.(url) ?? { status: 200, body: GROUPS_OK };
      await route.fulfill({
        status: resolved.status,
        contentType: 'application/json',
        body: JSON.stringify(resolved.body),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
  });
}

test.describe('W4 independence groups (deterministic stubs, read-only)', () => {
  test('renders shared groups with publication identity, FICTIONAL / GUIDED DEMO label, and the caveat + limitations verbatim', async ({ page }) => {
    await installStubs(page);
    await page.goto('/review-queue');
    await page.getByTestId('independence-panel').waitFor({ state: 'visible' });

    const summary = page.getByTestId('independence-summary');
    await expect(summary).toContainText('3 supporting citation uses');
    await expect(summary).toContainText('2 publications supporting claims');
    await expect(summary).toContainText('1 shared group');

    const group = page.getByTestId('independence-group-pub-mehra-2020');
    await expect(group).toContainText('pub-mehra-2020');
    await expect(group).toContainText('A retracted registry analysis');
    await expect(group).toContainText('DOI 10.1016/j.mehra.2020');
    await expect(group).toContainText('not independent evidence for each other');
    await expect(group).toContainText('claim-A');
    await expect(group).toContainText('claim-B');

    await expect(page.getByTestId('independence-group-pub-mehra-2020-synthetic')).toHaveText(
      'FICTIONAL / GUIDED DEMO',
    );

    await expect(page.getByTestId('independence-caveat')).toHaveText(CAVEAT);
    const limitations = await page.getByTestId('independence-limitations').innerText();
    for (const limitation of LIMITATIONS) {
      expect(limitations).toContain(limitation);
    }

    // The panel informs review — the flagged case cards carry real state
    // governed ONLY by the graph-records payload, never by this panel.
    await expect(page.getByTestId('review-item-claim-A')).toHaveAttribute(
      'data-review-state',
      'needs-review',
    );
  });

  test('zero shared groups is the exact honest empty-state copy, with real summary zeros still visible', async ({ page }) => {
    await installStubs(page, { onIndependence: () => ({ status: 200, body: GROUPS_EMPTY }) });
    await page.goto('/review-queue');
    await page.getByTestId('independence-panel').waitFor({ state: 'visible' });

    await expect(page.getByTestId('independence-empty')).toHaveText(
      'No shared supporting publication among visible claims — honest result, never a guarantee of independence.',
    );
    expect(await page.locator('[data-testid="independence-groups"]').count()).toBe(0);
    await expect(page.getByTestId('independence-summary')).toContainText('0 shared groups');
    // Caveats remain visible in the empty state — the honest scope is standing.
    await expect(page.getByTestId('independence-caveat')).toHaveText(CAVEAT);

    // The queue itself is untouched by the read-only panel.
    await expect(page.getByTestId('review-item-claim-A')).toHaveAttribute(
      'data-review-state',
      'needs-review',
    );
  });

  test('HTTP 503 is a typed honest failure; no group data is fabricated and Retry is offered', async ({ page }) => {
    await installStubs(page, {
      onIndependence: () => ({ status: 503, body: { error: 'graph unreachable' } }),
    });
    await page.goto('/review-queue');
    await page.getByTestId('independence-failure-detail').waitFor({ state: 'visible' });

    await expect(page.getByTestId('independence-failure-detail')).toContainText('HTTP 503');
    await expect(page.getByTestId('independence-failure-detail')).toContainText('could not be read');
    expect(await page.locator('[data-testid^="independence-group-"]').count()).toBe(0);
    expect(await page.locator('[data-testid="independence-summary"]').count()).toBe(0);
    await page.getByTestId('independence-retry').waitFor({ state: 'visible' });

    // The review queue remains fully honest and interactive under the panel.
    await expect(page.getByTestId('review-item-claim-A')).toHaveAttribute(
      'data-review-state',
      'needs-review',
    );
  });

  test('an unwired function (404) reads as "not available yet" — no derived groups', async ({ page }) => {
    await installStubs(page, {
      onIndependence: () => ({ status: 404, body: { error: 'not found' } }),
    });
    await page.goto('/review-queue');
    await page.getByTestId('independence-missing').waitFor({ state: 'visible' });

    await expect(page.getByTestId('independence-missing')).toContainText(
      'No independence endpoint answered',
    );
    await expect(page.getByTestId('independence-missing')).toContainText('none are derived locally');
    expect(await page.locator('[data-testid^="independence-group-"]').count()).toBe(0);
  });
});
