import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * M4 import flow — hosted acceptance against the deployed site.
 *
 * DUAL-PATH BY DESIGN: the M4 frontend/backend deploys to production while
 * this suite runs, so every test first resolves the live state and then
 * asserts the honest contract of that state:
 *
 *   State A — Library is still the honest under-construction placeholder
 *             (no upload surface may fake data).
 *   State B — the M4 upload panel is live: a native file input, client-side
 *             format/size guards, an honest disclosure that document
 *             CONTENT is not stored (contentStored:false — free-tier graph
 *             carries metadata/records only), truthful progress, and a
 *             Library row with REAL metadata on success.
 *
 * The backend may legitimately 415/413/429/5xx a real upload (e.g. PDF
 * bytes it cannot parse yet). A typed, honest error is then the accepted
 * terminal state. What is NEVER accepted on either path: fabricated rows,
 * fabricated sizes, lorem/placeholder content, or any success claim
 * without a real document row.
 */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const TXT_FIXTURE = path.join(FIXTURES, 'demo-safe.txt');
const PDF_FIXTURE = path.join(FIXTURES, 'demo-safe.pdf');

/** Honest failure/limit wording in a typed status/alert region. */
const HONEST_ERROR =
  /\b(not wired|not implemented|not available|unavailable|failed|an error|error \(|HTTP \d{3}|\b4(13|15|29)\b|\b5\d\d\b|unsupported|not supported|not accepted|too large|too big|exceeds|rejected|cooldown|rate limit|try again later|malformed|invalid)\b/i;

/** Fabricated-content NEVER-case (safe against honest copy like "nothing is simulated"). */
const FABRICATED = /lorem ipsum|placeholder (content|results|data)|coming soon|simulated results|fake results|demo results will appear/i;

const fileInput = (page: Page) => page.locator('main input[type="file"]').first();

/**
 * Wave U1: the document picker lives in the collapsible document area on
 * the landing page. Opens it before any interaction with `#import-input`.
 * Idempotent by contract: if the area is already open
 * (aria-expanded="true") it never toggles a second time.
 */
async function openDocumentPicker(page: Page) {
  const toggle = page.locator('[data-testid="choose-document-toggle"]');
  await expect(toggle).toBeAttached();
  if ((await toggle.getAttribute('aria-expanded')) === 'true') return;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/**
 * Resolves which Library state production currently serves.
 * Returns 'list' when a real upload surface is present, 'placeholder'
 * for the honest under-construction empty area.
 *
 * Every terminal render of LibraryPage is covered (markers in DOM order):
 * seeded failure/unavailable panels first, then the seeded list, then the
 * imported list, then the both-empty placeholder. Missing
 * `library-imported-list` here caused a hard 20 s timeout whenever the
 * seeded cohort was empty while real user imports existed (unseeded-graph
 * sweeps) — a real terminal state that the union simply never matched.
 */
async function resolveLibraryState(
  page: Page,
): Promise<'list' | 'empty' | 'imports-only' | 'unavailable' | 'failed'> {
  await page.goto('/library');
  const terminal = page
    .locator('[data-testid="library-list"]')
    .or(page.locator('[data-testid="library-empty"]'))
    .or(page.locator('[data-testid="library-imported-list"]'))
    .or(page.locator('[data-testid="library-unavailable"]'))
    .or(page.locator('[data-testid="library-failed"]'))
    .first();
  await expect(terminal).toBeVisible({ timeout: 20_000 });
  const marker = await terminal.getAttribute('data-testid');
  if (marker === 'library-list') {
    const rows = await page.locator('[data-testid^="library-doc-"]').count();
    return rows > 0 ? 'list' : 'empty';
  }
  if (marker === 'library-empty') return 'empty';
  if (marker === 'library-imported-list') return 'imports-only';
  return (marker === 'library-unavailable' ? 'unavailable' : 'failed') as
    | 'unavailable'
    | 'failed';
}

/**
 * Counts POST requests the page actually sends to any Netlify function.
 * Used to prove client-side guards act BEFORE any network traffic.
 */
function trackFunctionPosts(page: Page): { posts: () => number } {
  let posts = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/.netlify/functions/')) posts += 1;
  });
  return { posts: () => posts };
}

/**
 * Waits for the first functions-POST response after a selection and
 * classifies it. A non-JSON 2xx is the SPA fallback shading an undeployed
 * function — classified "unavailable" (the same honest outcome the API
 * client derives from it), never a success.
 */
type ImportPostOutcome = { kind: 'json-ok'; status: number } | { kind: 'http-error'; status: number } | { kind: 'unavailable' } | { kind: 'no-request' };

async function firstFunctionPostOutcome(page: Page, timeoutMs: number): Promise<ImportPostOutcome> {
  try {
    const res = await page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('/.netlify/functions/'),
      { timeout: timeoutMs },
    );
    const contentType = res.headers()['content-type'] ?? '';
    if (!res.ok()) return { kind: 'http-error', status: res.status() };
    if (!/json/i.test(contentType)) return { kind: 'unavailable' };
    return { kind: 'json-ok', status: res.status() };
  } catch {
    return { kind: 'no-request' };
  }
}

/** True when a shown size string is consistent with the fixture's real bytes. */
function sizeMatches(shown: string, bytes: number): boolean {
  const match = shown.match(/(\d[\d,]*(?:\.\d+)?)\s*(bytes|byte|kb|mb|kib|mib)\b/i);
  if (!match) return true; // size not displayed for this row — acceptable
  const n = Number(match[1].replace(/,/g, ''));
  const unit = match[2].toLowerCase();
  if (unit === 'bytes' || unit === 'byte') return n === bytes;
  if (unit === 'kb' || unit === 'kib') return Math.abs(n - bytes / 1024) < 0.15;
  if (unit === 'mb' || unit === 'mib') return Math.abs(n - bytes / (1024 * 1024)) < 0.15;
  return false;
}

/**
 * After a successful upload, the Library must list a row carrying the real
 * file name, with any displayed size consistent with the real byte count
 * (a hardcoded fake size would be fabricated metadata).
 */
async function assertSuccessRow(page: Page, fileName: string, realBytes: number) {
  const rowText = page.locator('main').getByText(fileName).first();
  await expect(rowText, `Library lists the uploaded document "${fileName}"`).toBeVisible({
    timeout: 15_000,
  });
  // Walk to the enclosing row container when one exists, then check sizes.
  const container = rowText.locator(
    'xpath=ancestor::*[self::li or self::tr or self::article or self::section][1]',
  );
  const scope = (await container.count()) > 0 ? container : page.locator('main');
  const text = (await scope.first().innerText()) ?? '';
  expect(
    sizeMatches(text, realBytes),
    `any size shown for "${fileName}" must match the real ${realBytes} bytes (got: ${text
      .match(/(\d[\d,]*(?:\.\d+)?)\s*(bytes|byte|kb|mb|kib|mib)\b/i)?.[0] ?? 'none'})`,
  ).toBe(true);
  expect(text, 'no fabricated content in the row').not.toMatch(FABRICATED);
}

/** Asserts a typed honest error is surfaced in a status/alert region. */
async function assertHonestError(page: Page) {
  const statusRegions = page.locator(
    'main [role="status"], main [role="alert"], main [aria-live="polite"], main [aria-live="assertive"]',
  );
  await expect(statusRegions.filter({ hasText: HONEST_ERROR }).first()).toBeVisible({
    timeout: 10_000,
  });
  const main = await page.locator('main').innerText();
  expect(main, 'no fabricated content alongside the honest error').not.toMatch(FABRICATED);
}

test.describe('M4 import flow', () => {
  test('library resolves to the upload panel with honest disclosure, or the honest placeholder', async ({
    page,
  }) => {
    const state = await resolveLibraryState(page);
    const main = page.locator('main');

    if (state === 'empty' || state === 'unavailable' || state === 'failed') {
      // Honest states: sparse, truthful, no fabricated rows.
      await expect(main.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
      if (state === 'empty') {
        await expect(
          main.getByText(/no documents exist|never show placeholder records/i),
          'honest scope note shown',
        ).toBeVisible();
      }
      await expect(main.locator('table')).toHaveCount(0);
      const text = (await main.innerText()) ?? '';
      expect(text.length, 'stays sparse — no fabricated rows').toBeLessThan(1600);
      expect(text, 'no fabricated content').not.toMatch(FABRICATED);
      return;
    }

    if (state === 'imports-only') {
      // Seeded cohort empty while REAL user imports are listed: an honest
      // real-content state — every row must carry its contentStored: false
      // disclosure, and nothing fabricated may appear.
      await expect(main.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
      await expect(page.locator('[data-testid="library-imported-list"]')).toBeVisible();
      await expect(main.locator('table')).toHaveCount(0);
      const text = (await main.innerText()) ?? '';
      expect(
        text,
        'real import rows keep their contentStored:false disclosure',
      ).toMatch(/content not stored|contentStored: false/i);
      expect(text, 'no fabricated content').not.toMatch(FABRICATED);
      return;
    }

    // State: real list. Rows carry REAL metadata (ids/size/dates), the
    // synthetic demo document is labeled, and nothing is fabricated.
    const rows = await page.locator('[data-testid^="library-doc-"]').count();
    expect(rows, 'real document rows are listed').toBeGreaterThan(0);
    const mainText = (await main.innerText()) ?? '';
    expect(
      mainText,
      'library discloses limits honestly somewhere (demo labels or contentStored-family wording)',
    ).toMatch(/FICTIONAL \/ GUIDED DEMO|not stored|content is not stored|demo manuscript/i);
    expect(mainText, 'no fictional privacy/durability assurances').not.toMatch(
      /securely stored|encrypted storage|durable (?:storage|persistence)|private and secure/i,
    );
    expect(mainText, 'no fabricated content').not.toMatch(FABRICATED);
  });

  test('client-side format guard: a disallowed file type never triggers an upload request', async ({
    page,
  }) => {
    // The ImportPanel lives on the landing page in the integrated build —
    // inside the collapsible document area (Wave U1).
    await page.goto('/');
    await openDocumentPicker(page);
    const input = page.locator('[data-testid="import-input"]');
    await expect(input).toBeAttached();

    const { posts } = trackFunctionPosts(page);
    // Fake File via setInputFiles: disallowed extension, plausible bytes.
    await input.setInputFiles({
      name: 'guard-probe.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('not a document'),
    });

    // Give any (incorrect) network-fired path time to show itself.
    await page.waitForTimeout(3_000);
    const rejected = await page
      .locator('main')
      .getByText(/not supported|unsupported|not accepted|invalid|format|only .{0,30}(pdf|docx|txt)/i)
      .first()
      .isVisible()
      .catch(() => false);

    if (!rejected) {
      expect(
        posts(),
        'no upload POST for a disallowed format — client-side format guard must reject before any network traffic',
      ).toBe(0);
    }
    // NEVER-case: no success framing for the disallowed file.
    const main = await page.locator('main').innerText();
    expect(main, 'no fabricated success for a rejected format').not.toMatch(
      /uploaded successfully|import complete|successfully imported|analysis (has )?(started|completed)/i,
    );
    expect(main, 'no fabricated content').not.toMatch(FABRICATED);
  });

  test('client-side size guard: an oversized file never triggers an upload request', async ({
    page,
  }) => {
    // The ImportPanel lives on the landing page in the integrated build —
    // inside the collapsible document area (Wave U1).
    await page.goto('/');
    await openDocumentPicker(page);
    const input = page.locator('[data-testid="import-input"]');
    await expect(input).toBeAttached();

    const { posts } = trackFunctionPosts(page);
    // 40 MB — beyond every plausible demo limit and beyond the platform's
    // function body cap; kept in memory so no giant fixture is committed.
    // Bulk payload transfer is not an interactive action: it used to race
    // the default 10 s action timeout under parallel sweep load (observed
    // `setInputFiles: Timeout 10000ms exceeded` on desktop AND mobile, even
    // on retry), so it gets an explicit bounded timeout of its own.
    await input.setInputFiles(
      {
        name: 'size-probe.txt',
        mimeType: 'text/plain',
        buffer: Buffer.alloc(40 * 1024 * 1024, 0x61),
      },
      { timeout: 30_000 },
    );

    // Real signal instead of a fixed sleep: the client-side size guard runs
    // synchronously in onChange and renders its rejection BEFORE any network
    // path can run. Awaiting that gate state makes the "no upload fired"
    // window deterministic.
    const guard = page.locator('[data-testid="import-guard-rejection"]');
    await expect(guard).toBeVisible({ timeout: 30_000 });
    await expect(guard, 'honest size rejection names the limit').toContainText(
      /larger than the \d+ MB limit/i,
    );
    await expect(
      guard,
      'honest size rejection discloses that nothing left the browser',
    ).toContainText(/nothing was uploaded|rejected before any network request/i);

    // Settled counter: no functions POST at the gate, and none appears
    // during a bounded settle window after it.
    const postsAtGate = posts();
    expect(
      postsAtGate,
      'no upload POST for an oversized file — client-side size guard must reject before any network traffic',
    ).toBe(0);
    await page.waitForTimeout(2_000);
    expect(posts(), 'no late upload POST after the guard gate').toBe(postsAtGate);
    const main = await page.locator('main').innerText();
    expect(main, 'no fabricated success for an oversized file').not.toMatch(
      /uploaded successfully|import complete|successfully imported/i,
    );
    expect(main, 'no fabricated content').not.toMatch(FABRICATED);
  });

  for (const [label, fileName, realPath] of [
    ['txt', 'demo-safe.txt', TXT_FIXTURE],
    ['pdf', 'demo-safe.pdf', PDF_FIXTURE],
  ] as const) {
    test(`${label} fixture: success row with real metadata, or typed honest error`, async ({
      page,
    }) => {
      // The ImportPanel lives on the landing page in the integrated build —
      // inside the collapsible document area (Wave U1).
      await page.goto('/');
      await openDocumentPicker(page);
      const input = page.locator('[data-testid="import-input"]');
      await expect(input).toBeAttached();

      const realBytes = fs.statSync(realPath).size;
      await input.setInputFiles(realPath);

      // "Honest progress" contract: between selection and terminal state
      // the page must never claim completion without a real outcome. We
      // simply wait for the first real functions-POST round trip (or its
      // absence), then judge the terminal state — no mid-flight
      // fabricated "done" states are tolerated by the assertions below.
      const outcome = await firstFunctionPostOutcome(page, 25_000);

      if (outcome.kind === 'no-request' || outcome.kind === 'unavailable') {
        // No upload request fired, or the endpoint answered with the SPA
        // fallback page: the flow is not wired here and the panel must be
        // honestly disclosing that (never a fake success row).
        const main = await page.locator('main').innerText();
        expect(
          main,
          'no real upload happened — page must disclose the flow is not wired/available',
        ).toMatch(/not wired|not implemented|not available|under construction|nothing (?:was |is )?(?:uploaded|transmitted)/i);
        expect(main, 'no fabricated content').not.toMatch(FABRICATED);
        return;
      }

      if (outcome.kind === 'json-ok') {
        // 2xx: the import endpoint registered the document. On this
        // metadata-only tier, user imports are NOT marked `seeded`, so they
        // intentionally do NOT appear in the /documents (Library) read
        // surface — see server/importAnalyze.mjs honest-limitations note.
        // Verify the on-page registration result instead (the ImportPanel
        // shows it verbatim), and stay on the landing page.
        const importResult = page.locator('[data-testid="import-result"]');
        await expect(
          importResult,
          'import registration result must appear on the landing page after a 2xx upload',
        ).toBeVisible({ timeout: 10_000 });
        await expect(
          importResult.getByText(fileName),
          `registration result names the uploaded file "${fileName}"`,
        ).toBeVisible();
        await expect(
          importResult.getByText(/content stored: no/i),
          'registration result must disclose contentStored: false',
        ).toBeVisible();
        return;
      }

      // Backend said no (415/413/429/5xx on real bytes): a typed honest
      // error is the accepted terminal state — never a fake success row.
      expect(outcome.kind === 'http-error').toBe(true);
      await assertHonestError(page);
      const main = await page.locator('main').innerText();
      expect(
        main,
        'failed upload must not leave a success-looking row for the file',
      ).not.toMatch(new RegExp(`${fileName}[^\\n]{0,80}(uploaded successfully|imported|analysis started)`, 'i'));
    });
  }

  test.describe('Wave 3 — extraction disclosure (deterministic route stub)', () => {
    /**
     * NO real-file E2E dependence and NO live backend dependence: the import
     * function route is stubbed with small deterministic payloads (synthetic
     * fixture DOIs only), then the page's honest rendering is asserted.
     * Every payload keeps contentStored:false — extraction content is
     * UNVERIFIED candidate references and must never shadow the primary
     * metadata-only disclosure.
     */
    const PRIMARY_DISCLOSURE =
      'The document was registered; its text content is not stored in this build.';
    const CAVEAT =
      'Detected by pattern matching on a bounded excerpt; unverified — presence in the file proves nothing about claim support or reference validity.';

    const stubImport = (page: Page, body: unknown) =>
      page.route('**/.netlify/functions/import-document*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        }),
      );

    test('txt import with extraction payload: candidates render as unverified, contentStored disclosure stays primary', async ({
      page,
    }) => {
      await stubImport(page, {
        documentId: 'doc-e2e-w3',
        versionId: 'ver-e2e-w3',
        contentStored: false,
        disclosure: PRIMARY_DISCLOSURE,
        extraction: {
          attempted: true,
          format: 'txt',
          byteSelection: { scannedBytes: 96, maxBytes: 524288, truncated: false },
          dois: [
            {
              doi: '10.9999/e2e-fixture-alpha',
              occurrences: 2,
              snippet: 'prior work with doi 10.9999/e2e-fixture-alpha in the reference list',
            },
            { doi: '10.9999/e2e-fixture-beta', occurrences: 1 },
          ],
          caveat: CAVEAT,
        },
      });

      await page.goto('/');
      await openDocumentPicker(page);
      const input = page.locator('[data-testid="import-input"]');
      await expect(input).toBeAttached();

      // In-memory synthetic fixture — no real file, no real upload.
      await input.setInputFiles({
        name: 'e2e-w3-detections.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(
          'Synthetic fixture referring to 10.9999/e2e-fixture-alpha twice and 10.9999/e2e-fixture-beta once.\n',
        ),
      });

      const result = page.locator('[data-testid="import-result"]');
      await expect(result).toBeVisible({ timeout: 10_000 });
      // PRIMARY: the pre-existing honest contentStored:false disclosure.
      await expect(result.getByText(/content stored: no/i)).toBeVisible();

      const section = page.locator('[data-testid="import-extraction"]');
      await expect(
        section.getByText(/Detected in your file — unverified candidate references \(2\)/),
      ).toBeVisible();
      await expect(section.getByText(CAVEAT, { exact: false })).toBeVisible();
      await expect(section).toContainText('10.9999/e2e-fixture-alpha');
      await expect(section).toContainText('10.9999/e2e-fixture-beta');
      const doiItems = section.getByTestId('import-extraction-doi');
      await expect(doiItems).toHaveCount(2);

      const mainText = await page.locator('main').innerText();
      expect(mainText, 'no fabricated content alongside the candidates').not.toMatch(FABRICATED);
      // Honest framing present; never a verified-references claim.
      expect(mainText).toContain('unverified candidate references');
      expect(mainText).not.toMatch(/verified (references?|citations?)/i);
      expect(mainText, 'never claims stored content').not.toMatch(
        /content stored: yes|content (?:is|was) stored\b/i,
      );
    });

    test('attempted:false payload: one honest muted reason line, no candidate section', async ({
      page,
    }) => {
      const reason = 'Text extraction for PDF is not implemented in the demo tier.';
      await stubImport(page, {
        documentId: 'doc-e2e-w3-nope',
        versionId: 'ver-e2e-w3-nope',
        contentStored: false,
        disclosure: PRIMARY_DISCLOSURE,
        extraction: { attempted: false, format: 'pdf', reason },
      });

      await page.goto('/');
      await openDocumentPicker(page);
      const input = page.locator('[data-testid="import-input"]');
      await expect(input).toBeAttached();
      await input.setInputFiles({
        name: 'e2e-w3-skip.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 synthetic e2e fixture'),
      });

      const result = page.locator('[data-testid="import-result"]');
      await expect(result).toBeVisible({ timeout: 10_000 });
      await expect(result.getByText(/content stored: no/i)).toBeVisible();

      await expect(page.locator('[data-testid="import-extraction-skipped"]')).toHaveText(reason);
      await expect(page.locator('[data-testid="import-extraction"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="import-extraction-doi"]')).toHaveCount(0);
      const mainText = await page.locator('main').innerText();
      expect(mainText, 'no fabricated content').not.toMatch(FABRICATED);
    });

    test('older-deploy tolerance: import 200 without an extraction member renders neither section', async ({
      page,
    }) => {
      await stubImport(page, {
        documentId: 'doc-e2e-w3-legacy',
        versionId: 'ver-e2e-w3-legacy',
        contentStored: false,
        disclosure: PRIMARY_DISCLOSURE,
      });

      await page.goto('/');
      await openDocumentPicker(page);
      const input = page.locator('[data-testid="import-input"]');
      await expect(input).toBeAttached();
      await input.setInputFiles({
        name: 'e2e-w3-legacy.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Synthetic legacy fixture with no extraction payload.\n'),
      });

      const result = page.locator('[data-testid="import-result"]');
      await expect(result).toBeVisible({ timeout: 10_000 });
      await expect(result.getByText(/content stored: no/i)).toBeVisible();
      await expect(page.locator('[data-testid="import-extraction"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="import-extraction-skipped"]')).toHaveCount(0);
    });
  });
});
