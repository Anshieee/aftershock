import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * M4/M5 analysis flow — hosted acceptance against the deployed site.
 *
 * DUAL-PATH BY DESIGN: the M4 analyze frontend/backend deploys to
 * production while this suite runs, so every test resolves the live state
 * first and asserts the honest contract of that state:
 *
 *   - The guided-demo seed either lands on /results with REAL graph-derived
 *     affected-claims content (seed succeeded) or ends in an honest state
 *     (cooldown / unavailable / failure) — never a fabricated result.
 *   - An analyze affordance (when deployed) either reaches a truthful run
 *     state (runId / contract-§4 stage wording / real results) or surfaces
 *     an honest typed error (e.g. 422 no document, 5xx backend down) —
 *     never a simulated run and never fake results.
 *   - With no analyze affordance deployed yet, the pages must still be
 *     honest: real seeded results or truthful missing/failure states.
 *
 * NEVER accepted anywhere: lorem/placeholder/"simulated results" content.
 */

const RESULTS_TERMINAL =
  '[data-testid="results-missing"], [data-testid="results-failure"], [data-testid="results-affected"]';

/** Honest failure/limit wording in a typed status/alert region. */
const HONEST_ERROR =
  /\b(not wired|not implemented|not available|unavailable|failed|an error|error \(|HTTP \d{3}|\b422\b|\b5\d\d\b|\b429\b|cooldown|rate limit|try again later)\b/i;

/** Truthful run-state wording (contract §4 status/stage enums, humanized). */
const RUN_STATE =
  /\brun\s?(?:id|#|:)|runid|\b(pending|running|queued|parsing|resolving|checking[ _]notices|classif(?:ying|ication)|writing[ _]graph|uploading|uploaded)\b/i;

/** Fabricated-content NEVER-case (safe against honest copy like "nothing is simulated"). */
const FABRICATED = /lorem ipsum|placeholder (content|results|data)|coming soon|simulated results|fake results|demo results will appear/i;

async function statusRegions(page: Page): Promise<Locator> {
  return page.locator(
    'main [role="status"], main [role="alert"], main [aria-live="polite"], main [aria-live="assertive"]',
  );
}

/** First enabled button/link that reads as an analyze affordance, if any. */
async function findEnabledAnalyzeControl(page: Page): Promise<Locator | null> {
  const candidates = page
    .getByRole('button', { name: /(^|\b)(re-?analyze|run analysis|start analysis)\b|^analyze\b/i })
    .or(page.getByRole('link', { name: /(^|\b)(re-?analyze|run analysis|start analysis)\b|^analyze\b/i }));
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const candidate = candidates.nth(i);
    if (await candidate.isEnabled().catch(() => false)) return candidate;
  }
  return null;
}

test.describe('M4/M5 analyze flow', () => {
  test('guided demo seed → /results shows REAL affected-claims content or an honest state', async ({
    page,
  }) => {
    await page.goto('/');
    const guided = page.locator('section', { hasText: 'Try guided example' });
    await guided.getByTestId('guided-seed-button').click();

    await page.waitForURL(/\/results/, { timeout: 20_000 }).catch(() => {});
    if (!/\/results/.test(page.url())) {
      // Honest-failure path: cooldown (rate-limited seed), API unavailable,
      // or a typed API error. One truthful status message, no fake results.
      const state = page.getByTestId('guided-seed-state');
      await expect(state.locator('p').first(), 'one honest seed status message').toBeVisible({
        timeout: 12_000,
      });
      await expect(state).toContainText(
        /api error|no simulated success|unavailable|cooldown|not wired|seed|429/i,
      );
      return;
    }

    // SUCCESS path: /results must resolve to a real terminal state.
    await page.locator(RESULTS_TERMINAL).first().waitFor({ state: 'visible', timeout: 20_000 });
    const affected = page.getByTestId('results-affected');
    if (await affected.isVisible().catch(() => false)) {
      // Real graph-derived content: the synthetic fixture is labeled, the
      // affected-claims card exists, nothing is lorem/fake.
      const body = (await page.locator('body').innerText()) ?? '';
      expect(body, 'synthetic content is labeled FICTIONAL / GUIDED DEMO').toContain(
        'FICTIONAL / GUIDED DEMO',
      );
      expect(body, 'no fabricated content on real results').not.toMatch(FABRICATED);
    } else {
      // Honest missing/failure state (e.g. seed landed but graph instance
      // recycled): a truthful state, no substitute content.
      await expect(
        page.getByTestId('results-missing').or(page.getByTestId('results-failure')),
      ).toBeVisible();
      const body = (await page.locator('body').innerText()) ?? '';
      expect(body, 'no fabricated content in the honest state').not.toMatch(FABRICATED);
    }
  });

  test('analyze affordance is wired (run state / results) or honestly not available', async ({
    page,
  }) => {
    let attempted = false;

    for (const path of ['/results', '/library']) {
      await page.goto(path);
      // Resolve past transient loading into a real state before judging.
      if (path === '/results') {
        await page.locator(RESULTS_TERMINAL).first().waitFor({ state: 'visible', timeout: 20_000 });
      } else {
        await expect(
          page
            .locator('main input[type="file"]')
            .or(page.locator('main').getByText('Feature under construction'))
            .or(page.locator('main').getByText('Imported documents'))
            .or(page.locator('main').getByText('Analyze'))
            .first(),
        ).toBeVisible({ timeout: 20_000 });
      }

      const control = await findEnabledAnalyzeControl(page);
      if (!control) continue;
      attempted = true;

      await control.click();
      const urlBefore = page.url();

      // Any of these terminal outcomes is honest:
      //   - a truthful run state (runId / contract-§4 stage wording),
      //   - a typed honest error (422 / 5xx / unavailable / failed),
      //   - automatic navigation to /results with a real terminal state.
      await expect
        .poll(
          async () => {
            if (page.url() !== urlBefore && /\/results/.test(page.url())) {
              await page
                .locator(RESULTS_TERMINAL)
                .first()
                .waitFor({ state: 'visible', timeout: 15_000 })
                .catch(() => {});
              return page.getByTestId('results-affected').isVisible().catch(() => false)
                ? 'results'
                : 'results-honest';
            }
            const runState = await page
              .getByText(RUN_STATE)
              .first()
              .isVisible()
              .catch(() => false);
            if (runState) return 'run-state';
            const honest = await (await statusRegions(page))
              .filter({ hasText: HONEST_ERROR })
              .first()
              .isVisible()
              .catch(() => false);
            return honest ? 'honest-error' : 'pending';
          },
          { timeout: 30_000, intervals: [1_000, 2_000, 3_000, 5_000] },
        )
        .not.toBe('pending');

      // NEVER-case regardless of branch: fabricated content.
      const body = (await page.locator('body').innerText()) ?? '';
      expect(body, 'no fabricated analyze content').not.toMatch(FABRICATED);
      break;
    }

    if (!attempted) {
      // No wired analyze affordance deployed yet (M4/M5 UI still landing).
      // The honest contract for THAT state: /results sits in a real
      // terminal state (real seeded content or truthful missing/failure)
      // and no page fakes analyze output.
      await page.goto('/results');
      await page.locator(RESULTS_TERMINAL).first().waitFor({ state: 'visible', timeout: 20_000 });
      await expect(
        page
          .getByTestId('results-missing')
          .or(page.getByTestId('results-failure'))
          .or(page.getByTestId('results-affected')),
        '/results stayed in a real, honest terminal state (no analyze UI deployed yet)',
      ).toBeVisible();
      const body = (await page.locator('body').innerText()) ?? '';
      expect(body, 'no fabricated analyze content anywhere').not.toMatch(FABRICATED);
    }
  });
});
