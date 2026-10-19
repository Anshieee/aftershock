import { expect, test, type Page, type Route } from '@playwright/test';
import { buildDemoOverviewRecord } from '../src/test/graphFixtures';

/**
 * P4 Find Evidence — hosted-acceptance-style spec, made DETERMINISTIC by
 * stubbing every Netlify function route the page touches (page.route).
 * The real Crossref API is NEVER hit: the search stubs answer with the
 * exact §-shaped payloads of the design of record, including honesty
 * scenarios (empty provider result, provider timeout, HTTP 503).
 *
 * Runs against `AFTERSHOCK_BASE_URL` (config default: the deployed
 * aftershock-demo site). Until this branch — and the P4 evidence-find
 * function — are deployed, point it at a local build:
 *
 *   npx vite build
 *   npx vite preview --port 4173 &
 *   AFTERSHOCK_BASE_URL=http://localhost:4173 \
 *     npx playwright test e2e/find-evidence.spec.ts --project=desktop
 *
 * Integrity rules asserted here mirror AGENTS.md:
 *  - candidates are metadata only (REAL METADATA chip; unverified status row);
 *  - an empty result is honest, never "proof that no evidence exists";
 *  - provider outage is not an HTTP error;
 *  - nothing mutates the review cases (no state writes from this flow).
 */

type EvidenceFindMode = 'prepare' | 'scenarios';

const CLAIM_TEXT =
  'Agent P-9 was selected on the strength of the registry analysis we cite (Mehra et al., 2020), which we read as establishing a drug-treatment mortality signal in the target cohort.';

const PREPARE = {
  mode: 'prepare',
  claimId: 'claim-A',
  claimText: CLAIM_TEXT,
  label: 'Claim',
  manuscriptId: 'doc-demo-manuscript',
  concern: {
    summary:
      'The supporting citation use points at a publication with a verified retraction notice.',
    direction: 'direct',
  },
  suggestedQuery: 'registry analysis drug-treatment mortality cohort P-9',
  queryEditable: true,
  providers: [
    {
      id: 'crossref',
      displayName: 'Crossref',
      scopeNote: 'public bibliographic metadata',
      landingUrl: 'https://www.crossref.org',
    },
  ],
  caveats: [
    'Candidates come from public bibliographic metadata (Crossref). Relevance ranking is the provider’s bibliographic relevance — not a statement that a paper supports the claim.',
    'Finding a publication never proves a claim; assessing support/contrast is human work done at the paper itself.',
    'Independence between candidates is not verified by this search: different DOIs can still share datasets, analyses or review trees.',
    'Full text is not fetched. Only bibliographic metadata and a DOI link are returned.',
    'This search does not modify citations, review states, or the manuscript.',
  ],
};

function searchResponse(
  query: string,
  candidates: unknown[],
  providersStatus: Array<Record<string, unknown>>,
) {
  return {
    mode: 'search',
    claimId: 'claim-A',
    claimText: CLAIM_TEXT,
    label: 'Claim',
    manuscriptId: 'doc-demo-manuscript',
    concern: PREPARE.concern,
    query,
    candidates,
    providersStatus,
    providers: PREPARE.providers,
    caveats: PREPARE.caveats,
    searchedAt: '2026-10-19T05:00:00.000Z',
  };
}

const TWO_CANDIDATES = [
  {
    candidateId: 'doi:10.1016/s0140-6736(20)31180-6',
    doi: '10.1016/S0140-6736(20)31180-6',
    title:
      'Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis',
    authors: ['Mehra M.R.', 'Patel S.S.'],
    year: 2020,
    container: 'The Lancet',
    publicationType: 'journal-article',
    publisher: 'Elsevier',
    isSynthetic: false,
    retractionStatus: 'notice_present',
    evidenceRelationship: 'unverified',
    independence: 'unknown',
    fullTextAvailability: 'unknown',
    relevanceBasis:
      "Retrieved by Crossref bibliographic relevance for 'registry analysis' — a metadata match only; support/contrast relationships are unverified.",
    urls: { sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31180-6' },
  },
  {
    candidateId: 'candidate-openalex-2',
    title: 'Outcome modelling after respiratory support adjustment',
    authors: [],
    year: 2021,
    publicationType: 'preprint',
    isSynthetic: false,
    retractionStatus: 'unknown',
  },
];

/** Installs deterministic stubs for every function the queue page calls. */
async function stubAllRoutes(page: Page, handler: (url: URL, body: unknown) => { status: number; body: unknown } | undefined) {
  await page.route('**/.netlify/functions/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    let payload: unknown = null;
    if (request.method() === 'POST') {
      try {
        payload = request.postDataJSON() as unknown;
      } catch {
        payload = null;
      }
    }
    const resolved = handler(url, payload);
    if (!resolved) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
      return;
    }
    await route.fulfill({
      status: resolved.status,
      contentType: 'application/json',
      body: JSON.stringify(resolved.body),
    });
  });
}

/** Baseline stubbng: queue data + honest health/activity; search configurable per test. */
async function installStubs(
  page: Page,
  options: {
    onEvidenceFind?: (url: URL, body: unknown) => { status: number; body: unknown } | undefined;
  } = {},
) {
  const evidenceFindCalls: Array<{ body: unknown; when: string }> = [];
  await stubAllRoutes(page, (url, body) => {
    if (url.pathname.endsWith('/graph-edges')) {
      return { status: 200, body: buildDemoOverviewRecord() };
    }
    if (url.pathname.endsWith('/activity')) {
      return { status: 200, body: [] };
    }
    if (url.pathname.endsWith('/health')) {
      return { status: 200, body: { ok: true, service: 'aftershock-demo', version: 'stub' } };
    }
    if (url.pathname.endsWith('/evidence-find')) {
      evidenceFindCalls.push({ body, when: new Date().toISOString() });
      return options.onEvidenceFind?.(url, body) ?? { status: 200, body: PREPARE };
    }
    return undefined;
  });
  return evidenceFindCalls;
}

async function openFindEvidence(page: Page) {
  await page.goto('/review-queue');
  await page.getByTestId('review-item-claim-A').waitFor({ state: 'visible' });
  await page.getByTestId('find-evidence-claim-A').click();
  await page.getByTestId('find-evidence-dialog').waitFor({ state: 'visible' });
  await page.getByTestId('find-evidence-search').waitFor({ state: 'visible' });
}

test.describe('P4 Find Evidence (deterministic stubs, no real Crossref call)', () => {
  test('opens with the prepared claim data before any external search', async ({ page }) => {
    const calls = await installStubs(page);
    await openFindEvidence(page);

    // Exactly one prepare POST with an empty {} body — no query, no fetch.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({});

    const dialog = page.getByTestId('find-evidence-dialog');
    await expect(dialog.locator('blockquote[data-testid="find-evidence-claim-text"]')).toContainText(CLAIM_TEXT);
    await expect(page.getByTestId('find-evidence-concern-summary')).toContainText('verified retraction notice');
    await expect(page.getByTestId('find-evidence-query-hint')).toContainText('/400 characters');
    await expect(page.getByTestId('find-evidence-query')).toHaveValue(
      'registry analysis drug-treatment mortality cohort P-9',
    );
    // Full caveats BEFORE search output exists.
    const caveats = await page.getByTestId('find-evidence-caveats').innerText();
    expect(caveats).toContain('Finding a publication never proves a claim');
    expect(caveats).toContain('Independence between candidates is not verified');
    // No candidate rows can exist yet.
    expect(await page.locator('[data-testid^="find-evidence-candidate-"]').count()).toBe(0);
    await expect(page.getByTestId('find-evidence-footer-disclosure')).toContainText(
      'This search does not modify citations, review states, or the manuscript.',
    );
  });

  test('search renders candidate cards with honest metadata, DOI links and the fixed status row', async ({ page }) => {
    await installStubs(page, {
      onEvidenceFind: (_url, body) =>
        body && typeof body === 'object' && 'query' in (body as Record<string, unknown>)
          ? { status: 200, body: searchResponse((body as { query: string }).query, TWO_CANDIDATES, [{ id: 'crossref', status: 'ok' }]) }
          : { status: 200, body: PREPARE },
    });
    await openFindEvidence(page);

    await page.getByTestId('find-evidence-query').fill('  registry analysis  ');
    await page.getByTestId('find-evidence-search').click();

    const card0 = page.getByTestId('find-evidence-candidate-0');
    await expect(card0).toBeVisible();
    await expect(card0).toContainText('Hydroxychloroquine or chloroquine');
    await expect(page.getByTestId('find-evidence-candidate-0-chip-real')).toHaveText('REAL METADATA');

    const doi = page.getByTestId('find-evidence-candidate-0-doi');
    await expect(doi).toHaveAttribute('href', 'https://doi.org/10.1016/S0140-6736(20)31180-6');
    await expect(doi).toHaveAttribute('target', '_blank');
    await expect(doi).toHaveAttribute('rel', 'noopener noreferrer');

    await expect(page.getByTestId('find-evidence-candidate-0-status')).toContainText(
      'relationship unverified · independence unknown · full text unknown · retraction notice_present',
    );
    await expect(page.getByTestId('find-evidence-candidate-1-status')).toContainText('retraction unknown');
    await expect(page.getByTestId('find-evidence-candidate-1-doi-missing')).toContainText('No DOI link returned');
    await expect(page.getByTestId('find-evidence-provider-crossref')).toContainText('ok');

    // Second card is honest about the missing fields.
    await expect(page.getByTestId('find-evidence-candidate-1')).toContainText('No authors recorded');
    await expect(page.getByTestId('find-evidence-candidate-1')).toContainText('venue not recorded');
  });

  test('empty provider result is honest, not an error (exact coverage copy)', async ({ page }) => {
    await installStubs(page, {
      onEvidenceFind: (_url, body) =>
        body && typeof body === 'object' && 'query' in (body as Record<string, unknown>)
          ? { status: 200, body: searchResponse((body as { query: string }).query, [], [{ id: 'crossref', status: 'empty' }]) }
          : { status: 200, body: PREPARE },
    });
    await openFindEvidence(page);
    await page.getByTestId('find-evidence-query').fill('narrow nonsense query');
    await page.getByTestId('find-evidence-search').click();

    const empty = page.getByTestId('find-evidence-empty');
    await expect(empty).toContainText(
      'No records returned for this query — provider search coverage only; an empty result is not proof that no evidence exists.',
    );
    await expect(page.getByTestId('find-evidence-provider-crossref')).toContainText('empty');
    expect(await page.locator('[data-testid^="find-evidence-candidate-"]').count()).toBe(0);
  });

  test('provider timeout is reported as missing (not zero) results, retried included', async ({ page }) => {
    await installStubs(page, {
      onEvidenceFind: (_url, body) =>
        body && typeof body === 'object' && 'query' in (body as Record<string, unknown>)
          ? {
              status: 200,
              body: searchResponse((body as { query: string }).query, [], [
                { id: 'crossref', status: 'timeout', retried: true, message: 'AbortError from crossref' },
              ]),
            }
          : { status: 200, body: PREPARE },
    });
    await openFindEvidence(page);
    await page.getByTestId('find-evidence-query').fill('registry analysis');
    await page.getByTestId('find-evidence-search').click();

    const row = page.getByTestId('find-evidence-provider-crossref');
    await expect(row).toContainText('timeout');
    await expect(row).toContainText('timed out');
    await expect(row).toContainText('One retry was already attempted');
    await expect(page.getByTestId('find-evidence-empty')).toContainText(
      'the providers that failed or timed out are named above; their missing results are not zero.',
    );
  });

  test('HTTP 503 failure is typed and honest; the case stays needs-review', async ({ page }) => {
    await installStubs(page, {
      onEvidenceFind: (_url, body) =>
        body && typeof body === 'object' && 'query' in (body as Record<string, unknown>)
          ? { status: 503, body: { error: 'graph unreachable' } }
          : { status: 200, body: PREPARE },
    });
    await openFindEvidence(page);
    await page.getByTestId('find-evidence-query').fill('registry analysis');
    await page.getByTestId('find-evidence-search').click();

    await expect(page.getByTestId('find-evidence-error')).toContainText('HTTP 503');
    await expect(page.getByTestId('find-evidence-retry')).toBeVisible();
    expect(await page.locator('[data-testid^="find-evidence-candidate-"]').count()).toBe(0);

    // The case card was never touched by the search flow.
    const item = page.getByTestId('review-item-claim-A');
    await expect(item).toHaveAttribute('data-review-state', 'needs-review');
  });

  test('Escape closes the panel and restores the queue', async ({ page }) => {
    await installStubs(page);
    await openFindEvidence(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('find-evidence-dialog')).toHaveCount(0);
    await expect(page.getByTestId('review-item-claim-A')).toBeVisible();
  });

  test('mobile viewport: the open panel never overflows horizontally', async ({ page }) => {
    // Per-test override (test.use() is illegal inside a test body): the
    // desktop project gives us 1440x900; we shrink to a Pixel-7-class view.
    const mobileWidth = 390;
    const mobileHeight = 844;
    await page.setViewportSize({ width: mobileWidth, height: mobileHeight });
    await installStubs(page, {
      onEvidenceFind: (_url, body) =>
        body && typeof body === 'object' && 'query' in (body as Record<string, unknown>)
          ? { status: 200, body: searchResponse((body as { query: string }).query, TWO_CANDIDATES, [{ id: 'crossref', status: 'ok' }]) }
          : { status: 200, body: PREPARE },
    });
    await openFindEvidence(page);

    // Search, so the panel is at its tallest/most content-laden.
    await page.getByTestId('find-evidence-search').click();
    await page.getByTestId('find-evidence-candidate-0').waitFor({ state: 'visible' });

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

    const dialogBox = await page.getByTestId('find-evidence-dialog').boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(390);

    // The card content itself does not force horizontal scroll (long DOI wraps).
    const cardBox = await page.getByTestId('find-evidence-candidate-0').boundingBox();
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(390);
  });
});

/**
 * M7 Priority B — the results page (DemoResultsPage) mounts the SAME panel
 * with origin context when its affected claim/conclusion rows ask for
 * evidence. Same stubbing convention: every function route is intercepted,
 * the real Crossref API is never hit, and the search stays read-only.
 */
test.describe('M7 Priority B — Find Evidence opened from the results page (origin context)', () => {
  test('affected-claim row opens the panel with origin context, claimId = item id, and viewing-only links', async ({ page }) => {
    const calls = await installStubs(page);
    await page.goto('/results');
    await page.getByTestId('affected-claim-A').waitFor({ state: 'visible' });

    await page.getByTestId('results-find-evidence-claim-A').click();
    await page.getByTestId('find-evidence-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('find-evidence-search').waitFor({ state: 'visible' });

    // One prepare call for the right case, exactly like the queue mount.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({});
    expect(page.url()).toContain('/results');

    // Origin context header (optional prop; never rendered on the queue).
    await expect(page.getByTestId('find-evidence-origin-label')).toHaveText(
      'Results — affected claim claim-A',
    );
    const back = page.getByTestId('find-evidence-origin-return');
    await expect(back).toHaveAttribute('href', '/results');
    await expect(back).toHaveAttribute(
      'aria-label',
      'Return to origin (Results — affected claim claim-A)',
    );

    // Review-queue link: navigation only, framed as viewing-only (no state change).
    const queueLink = page.getByTestId('find-evidence-review-queue');
    await expect(queueLink).toHaveAttribute('href', '/review-queue');
    await expect(queueLink).toHaveText('Open review queue');
    await expect(queueLink).toHaveAttribute(
      'aria-label',
      'Open review queue for case claim-A (viewing only)',
    );

    // The honest core is unchanged by the origin context.
    await expect(page.getByTestId('find-evidence-footer-disclosure')).toContainText(
      'This search does not modify citations, review states, or the manuscript.',
    );
  });

  test('affected-conclusion row opens the panel for that passage with its own origin label', async ({ page }) => {
    await installStubs(page);
    await page.goto('/results');
    await page.getByTestId('affected-conclusion-C').waitFor({ state: 'visible' });

    await page.getByTestId('results-find-evidence-conclusion-C').click();
    await page.getByTestId('find-evidence-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('find-evidence-search').waitFor({ state: 'visible' });

    await expect(page.getByTestId('find-evidence-origin-label')).toHaveText(
      'Results — affected conclusion conclusion-C',
    );
  });

  test('Escape closes the panel and the results page rows keep their honest states', async ({ page }) => {
    await installStubs(page);
    await page.goto('/results');
    await page.getByTestId('affected-claim-A').waitFor({ state: 'visible' });
    await page.getByTestId('results-find-evidence-claim-A').click();
    await page.getByTestId('find-evidence-dialog').waitFor({ state: 'visible' });

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('find-evidence-dialog')).toHaveCount(0);
    await expect(page.getByTestId('affected-claim-A')).toBeVisible();
    await expect(page.getByTestId('affected-claim-A')).toContainText('direct evidence review');
  });
});
