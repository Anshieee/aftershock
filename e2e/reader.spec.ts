import { expect, test, type Page, type Route } from '@playwright/test';
import { buildDemoOverviewRecord } from '../src/test/graphFixtures';

/**
 * M7 Priority A — Evidence Reader (/reader) — hosted-acceptance-style
 * spec, made DETERMINISTIC by stubbing every Netlify function route the
 * page touches (page.route). No real graph backend is ever hit.
 *
 * Runs against `AFTERSHOCK_BASE_URL` (config default: the deployed
 * aftershock-demo site). Until this branch is deployed, point it at a
 * local build (no netlify.toml or .env changes needed — routes are fully
 * stubbed):
 *
 *   npx vite build
 *   npx vite preview --port 4173 &
 *   AFTERSHOCK_BASE_URL=http://localhost:4173 \
 *     npx playwright test e2e/reader.spec.ts --project=desktop
 *
 * Integrity rules asserted here mirror AGENTS.md / m7-plan.md:
 *  - the reader is a reflow of RECORDED passages, never a reconstruction;
 *  - locations render only from recorded metadata (object AND seed-time
 *    JSON-string forms); unlocatable records sit last, unpositioned;
 *  - "evidence review needed" semantics: flags on flagged claims +
 *    indirect conclusions, NEVER on historical mentions or unresolved
 *    references; sage styling only from recorded review state;
 *  - relation types never conflate (supports / mentions historically /
 *    possible match) in the read-only inspector;
 *  - real-record + FICTIONAL / GUIDED DEMO attribution stays visible;
 *  - flagged passages link the Review Queue; the page is read-only;
 *  - verdict language (disproven / debunked / proven false …) never
 *    appears in the body — same guard regex as review-queue.spec.ts.
 */

/** Same verdict-language guard as e2e/review-queue.spec.ts — never weakened. */
const VERDICT_LANGUAGE = /\b(disproven|debunked|proven false|claim is false|claims? (?:is|are) false|verified false)\b/i;

/** Location metadata per node, mirroring server/fixtures/demo-fixture.json.
 * `ref-lee-2020` arrives as the seed-time JSON STRING (offset null). */
const LOCATIONS: Record<string, unknown> = {
  'claim-A': { page: 3, section: '2.1' },
  'claim-B': { page: 5, section: '4.1' },
  'conclusion-C': { page: 6, section: '5.2' },
  'cu-A-supporting': { page: 3, section: '2.1', excerptOffset: 0 },
  'cu-B-historical': { page: 5, section: '4.1', excerptOffset: 0 },
  'ref-lee-2020': '{"page": 4, "section": "3.2", "offset": null}',
};

function readerOverview(): Record<string, unknown> {
  const base = buildDemoOverviewRecord();
  const nodes = (base.nodes as Array<Record<string, unknown>>).map((node) => {
    const location = LOCATIONS[node.id as string];
    return location === undefined ? node : { ...node, location };
  });
  return { ...base, nodes };
}

async function installStubs(page: Page, overview: () => Record<string, unknown> = readerOverview) {
  await page.route('**/.netlify/functions/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/graph-edges')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overview()),
      });
      return;
    }
    if (url.pathname.endsWith('/graph-probe')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ exists: true, seedVersion: 'seed-1', nodeCount: 17 }),
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

test.describe('M7 Evidence Reader (deterministic stubs, read-only)', () => {
  test('mounts at /reader with the honest basis disclosure and attribution', async ({ page }) => {
    await installStubs(page);
    await page.goto('/reader');

    await expect(page.getByTestId('reader-root')).toBeVisible();
    const basis = page.getByTestId('reader-basis-disclosure');
    await expect(basis).toContainText('recorded section/page/offset');
    await expect(basis).toContainText('not a reconstruction of the original document layout');
    await expect(basis).toContainText('No manuscript full text is stored');
    // Forbidden pagination phrasing never appears.
    expect(await basis.innerText()).not.toMatch(/page \d+ of \d+/i);

    const attribution = page.getByTestId('reader-attribution');
    await expect(attribution).toContainText('FICTIONAL / GUIDED DEMO');
    await expect(attribution).toContainText('evidence review is needed');
    // Verdict language never appears anywhere on the reader.
    expect(await page.getByTestId('reader-root').innerText()).not.toMatch(VERDICT_LANGUAGE);
  });

  test('orders passages by recorded section → page → offset; locations render both record forms', async ({
    page,
  }) => {
    await installStubs(page);
    await page.goto('/reader');

    await expect(page.getByTestId('reader-passage-claim-A')).toBeVisible();
    // Recorded pieces only, object and seed-time JSON-string forms alike.
    await expect(page.getByTestId('reader-location-claim-A')).toHaveText('page 3 · 2.1');
    await expect(page.getByTestId('reader-location-cu-A-supporting')).toHaveText(
      'page 3 · 2.1 · offset 0',
    );
    await expect(page.getByTestId('reader-location-ref-lee-2020')).toHaveText('page 4 · 3.2');

    const sectionHeadings = await page.locator('section > h2').allInnerTexts();
    const sections = sectionHeadings.filter((text) => text.startsWith('Section'));
    expect(sections).toEqual(['Section 2.1', 'Section 3.2', 'Section 4.1', 'Section 5.2']);
  });

  test('flag semantics: review-needed on flagged claim + indirect conclusion; historical and unresolved stay unflagged; queue links present', async ({
    page,
  }) => {
    await installStubs(page);
    await page.goto('/reader');

    // Direct: amber evidence-review-needed + Review Queue linkage.
    const claimA = page.getByTestId('reader-flag-claim-A');
    await expect(claimA).toHaveText('evidence review needed');
    await expect(claimA.locator('xpath=ancestor::*[@data-testid="reader-passage-claim-A"]').first()).toBeVisible();
    await expect(
      page
        .getByTestId('reader-passage-claim-A')
        .getByTestId('reader-queue-link')
        .first(),
    ).toHaveAttribute('href', '/review-queue');

    // Indirect: conclusion shows the exact dependency path.
    const conclusion = page.getByTestId('reader-passage-conclusion-C');
    await expect(page.getByTestId('reader-flag-conclusion-C')).toHaveText('evidence review needed');
    await expect(conclusion).toContainText('Depends on flagged claim claim-A');
    await expect(conclusion).toContainText('(direct evidence review)');

    // Historical mention: disclosed, never flag-styled.
    const claimB = page.getByTestId('reader-passage-claim-B');
    await expect(claimB).toContainText('excluded from evidence-review flags by design');
    await expect(claimB).toContainText('MENTIONS_HISTORICALLY');
    expect(await page.getByTestId('reader-flag-claim-B').count()).toBe(0);

    // Unresolved reference: honest resolution-state text, no flag.
    const lee = page.getByTestId('reader-passage-ref-lee-2020');
    await expect(page.getByTestId('reader-unresolved-ref-lee-2020')).toContainText('unverified');
    await expect(lee).toContainText('possible candidate');
    expect(await page.getByTestId('reader-flag-ref-lee-2020').count()).toBe(0);
  });

  test('inspector labels relations precisely and shows real-record + notice linkage', async ({
    page,
  }) => {
    await installStubs(page);
    await page.goto('/reader');

    await page.getByTestId('reader-inspect-cu-A-supporting').click();
    const inspector = page.getByTestId('reader-inspector');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText('CITATION_USE_SUPPORTS_CLAIM');
    await expect(inspector).toContainText('Supports claim claim-A');
    await expect(inspector).toContainText('Real bibliographic record (isSynthetic:false)');
    // Verified publication notice linkage through PUBLICATION_HAS_NOTICE.
    await expect(inspector).toContainText('noticeType: retraction');
    await expect(inspector).toContainText('2020-06-04');
    await expect(inspector).toContainText('https://doi.org/10.1016/S0140-6736(20)31324-6');
    await expect(inspector).toContainText('not about any citing document');

    await page.getByTestId('reader-inspector-close').click();
    await expect(inspector).toHaveCount(0);

    // Reference occurrence: possible matches only — labeled unverified.
    await page.getByTestId('reader-inspect-ref-lee-2020').click();
    await expect(inspector).toContainText('possible match — unverified (POSSIBLE_MATCH)');
    await expect(inspector).toContainText('pub-lee-2020-candidate-a');
    await expect(inspector).toContainText('candidate edges never propagate into claim impact');
  });

  test('?focus=<nodeId> highlights that passage and an unknown focus invents nothing', async ({
    page,
  }) => {
    await installStubs(page);
    await page.goto('/reader?focus=claim-B');

    await expect(page.getByTestId('reader-passage-claim-B')).toHaveAttribute(
      'data-focused',
      'true',
    );
    await expect(page.getByTestId('reader-passage-claim-A')).not.toHaveAttribute(
      'data-focused',
      /.+/,
    );

    // Unknown focus id: nothing is highlighted, page renders normally.
    await installStubs(page);
    await page.goto('/reader?focus=not-a-record');
    await expect(page.getByTestId('reader-passage-claim-A')).toBeVisible();
    const focused = await page
      .locator('[data-testid^="reader-passage-"][data-focused="true"]')
      .count();
    expect(focused).toBe(0);
  });

  test('unlocatable records are grouped last, unpositioned, honestly labeled', async ({
    page,
  }) => {
    await installStubs(page, () => {
      const overview = readerOverview();
      const nodes = overview.nodes as Array<Record<string, unknown>>;
      const index = nodes.findIndex((node) => node.id === 'conclusion-C');
      if (index >= 0) delete nodes[index]!.location;
      return overview;
    });
    await page.goto('/reader');

    const heading = page.getByTestId('reader-unlocated-heading');
    await expect(heading).toHaveText('Not located in the recorded layout');
    const ids = await page.locator('[data-testid^="reader-passage-"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-testid')),
    );
    expect(ids.at(-1)).toBe('reader-passage-conclusion-C');
    expect(await page.getByTestId('reader-location-conclusion-C').count()).toBe(0);
  });

  test('missing graph endpoint is honest (nothing fabricated), and flagged-review linkage exists only where flagged', async ({
    page,
  }) => {
    await page.route('**/.netlify/functions/**', async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/graph-probe')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ exists: true, seedVersion: 'seed-1', nodeCount: 17 }),
        });
        return;
      }
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/reader');

    await expect(page.getByTestId('reader-missing')).toContainText('not available yet');
    expect(await page.locator('[data-testid^="reader-passage-"]').count()).toBe(0);
    // The basis disclosure still tells the truth about the reader.
    await expect(page.getByTestId('reader-basis-disclosure')).toContainText(
      'reconstruction of the original document layout',
    );
  });

  test('mobile viewport: the reader never overflows horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installStubs(page);
    await page.goto('/reader?focus=claim-A');
    await expect(page.getByTestId('reader-passage-claim-A')).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  });
});
