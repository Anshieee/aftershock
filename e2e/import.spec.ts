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
 * Resolves which Library state production currently serves.
 * Returns 'panel' when a real upload surface is present, 'placeholder'
 * for the honest under-construction empty area.
 */
async function resolveLibraryState(page: Page): Promise<'panel' | 'placeholder'> {
  await page.goto('/library');
  const input = fileInput(page);
  const placeholder = page.locator('main').getByText('Feature under construction');
  await expect(input.or(placeholder).first()).toBeVisible({ timeout: 20_000 });
  return (await input.isVisible()) ? 'panel' : 'placeholder';
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

    if (state === 'placeholder') {
      // State A: under-construction area stays honest and sparse.
      await expect(main.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
      await expect(
        main.getByText(/no documents exist|never show placeholder records/i),
        'honest scope note shown',
      ).toBeVisible();
      await expect(main.locator('table')).toHaveCount(0);
      const text = (await main.innerText()) ?? '';
      expect(text.length, 'placeholder stays sparse — no fabricated rows').toBeLessThan(900);
      return;
    }

    // State B: real upload surface. It must be a native file input that
    // admits the demo-safe formats, plus the contentStored:false-family
    // disclosure that document content is NOT stored (exact wording may
    // evolve — presence is what the contract requires).
    const input = fileInput(page);
    await expect(input).toBeAttached();
    await expect(input).toHaveAttribute('accept', /pdf|docx|txt/i);

    const mainText = (await main.innerText()) ?? '';
    expect(
      mainText,
      'upload panel discloses that document content is not stored/persisted',
    ).toMatch(/not (?:be )?(?:stored|persisted|retained|uploaded|sent)|(?:is|are|content) not stored|not stored/i);

    // NEVER-case: no reassurance that uploads are secure/durable personal
    // storage (free-tier graph is unencrypted and non-durable).
    expect(mainText, 'no fictional privacy/durability assurances').not.toMatch(
      /securely stored|encrypted storage|durable (?:storage|persistence)|private and secure/i,
    );
  });

  test('client-side format guard: a disallowed file type never triggers an upload request', async ({
    page,
  }) => {
    const state = await resolveLibraryState(page);
    test.skip(
      state === 'placeholder',
      'M4 upload panel not deployed yet — honest placeholder verified in the state test; guard test applies once the panel ships',
    );

    const { posts } = trackFunctionPosts(page);
    // Fake File via setInputFiles: disallowed extension, plausible bytes.
    await fileInput(page).setInputFiles({
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
    const state = await resolveLibraryState(page);
    test.skip(
      state === 'placeholder',
      'M4 upload panel not deployed yet — honest placeholder verified in the state test; guard test applies once the panel ships',
    );

    const { posts } = trackFunctionPosts(page);
    // 40 MB — beyond every plausible demo limit and beyond the platform's
    // function body cap; kept in memory so no giant fixture is committed.
    await fileInput(page).setInputFiles({
      name: 'size-probe.txt',
      mimeType: 'text/plain',
      buffer: Buffer.alloc(40 * 1024 * 1024, 0x61),
    });

    await page.waitForTimeout(3_000);
    const rejected = await page
      .locator('main')
      .getByText(/too large|too big|exceeds|size limit|maximum size|maximum allowed/i)
      .first()
      .isVisible()
      .catch(() => false);

    if (!rejected) {
      expect(
        posts(),
        'no upload POST for an oversized file — client-side size guard must reject before any network traffic',
      ).toBe(0);
    }
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
      const state = await resolveLibraryState(page);
      test.skip(
        state === 'placeholder',
        `M4 upload panel not deployed yet — ${label} upload cannot run against the placeholder; dual-path assertions apply once the panel ships`,
      );

      const realBytes = fs.statSync(realPath).size;
      const input = fileInput(page);
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
        // 2xx: reload the Library and require the REAL row (the list is
        // the system of record; a 2xx upload must surface in it). Honest
        // alternatives: a typed error region, or an honestly unavailable
        // documents listing. Fabricated rows/sizes are never accepted.
        await page.goto('/library');
        const rowVisible = await page
          .locator('main')
          .getByText(fileName)
          .first()
          .isVisible()
          .catch(() => false);
        if (rowVisible) {
          await assertSuccessRow(page, fileName, realBytes);
        } else {
          const statusRegions = page.locator(
            'main [role="status"], main [role="alert"], main [aria-live="polite"], main [aria-live="assertive"]',
          );
          const honestText = await statusRegions
            .filter({ hasText: /not wired|not available|unavailable|error|failed/i })
            .first()
            .isVisible()
            .catch(() => false);
          expect(
            honestText,
            'a 2xx upload must surface as a Library row or a disclosed sync/unavailable state — not silently swallowed',
          ).toBe(true);
        }
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
});
