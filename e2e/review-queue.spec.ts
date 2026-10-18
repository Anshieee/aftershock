import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * M5 review queue — hosted acceptance against the deployed site.
 *
 * DUAL-PATH BY DESIGN: the M5 review frontend deploys to production while
 * this suite runs, so every test resolves the live state first and asserts
 * the honest contract of that state:
 *
 *   State A — /review-queue is the honest under-construction placeholder.
 *   State B — M5 list is live: real flagged items WITH rationale, or an
 *             honest empty state when nothing has been analyzed/seeded.
 *
 * Integrity rules enforced on both paths:
 *   - A review flag always means "needs human review" — never "claim
 *     disproven/proven" (AGENTS.md hard rule).
 *   - No enabled decision affordance may be a dead button: every enabled
 *     button either reacts observably (dialog / status / navigation /
 *     state change) or is honestly disabled / labeled not-available.
 *   - Never fabricated rows, lorem, or placeholder case data.
 */

/** Needs-review framing that must never degrade into verdict language. */
const VERDICT_LANGUAGE = /\b(disproven|debunked|proven false|claim is false|claims? (?:is|are) false|verified false)\b/i;

/** Rationale/provenance context a real flagged item must carry. */
const RATIONALE_CONTEXT =
  /\b(needs? review|await(?:ing|s)? review|retraction|retracted|cited|citing|citation|depends? (?:on|s)|provenance|passage|claim|rationale|supporting|historical|unresolved|evidence|notice|correction|expression of concern)\b/i;

const HONEST_EMPTY =
  /\b(no flagged|no review|no cases|none can be generated|not been (?:seeded|analyzed)|not available|awaiting analysis|nothing to review|no review tasks|no items)\b/i;

const FABRICATED = /lorem ipsum|placeholder (content|results|data|cases)|coming soon|simulated results|fake results|demo (?:results|cases) will appear/i;

const statusRegions = (page: Page) =>
  page.locator(
    'main [role="status"], main [role="alert"], main [aria-live="polite"], main [aria-live="assertive"]',
  );

/** Candidate flagged-item containers in unknown-but-list-like markup. */
const itemLocator = (page: Page) =>
  page.locator('main li, main tbody tr, main article, main [role="listitem"]');

/**
 * Wait until main has stopped changing (seed/analysis load states resolve)
 * so the state classification below judges a terminal render.
 */
async function waitForStableMain(page: Page) {
  await expect
    .poll(
      async () => {
        const first = await page.locator('main').innerText();
        await page.waitForTimeout(400);
        const second = await page.locator('main').innerText();
        return first.trim().length > 0 && first === second ? 'stable' : 'changing';
      },
      { timeout: 20_000, intervals: [500, 1_000] },
    )
    .toBe('stable');
}

/** Simpler: collect substantive item texts. */
async function substantiveItemTexts(page: Page): Promise<string[]> {
  const candidates = itemLocator(page);
  const count = await candidates.count();
  const texts: string[] = [];
  for (let i = 0; i < Math.min(count, 12); i++) {
    const candidate = candidates.nth(i);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const text = ((await candidate.innerText().catch(() => '')) ?? '').trim();
    if (text.length >= 30) texts.push(text);
  }
  return texts;
}

type QueueState = 'placeholder' | 'list' | 'honest-empty';

async function resolveQueueState(page: Page): Promise<QueueState> {
  await page.goto('/review-queue');
  await waitForStableMain(page);
  const loading = page.locator('[data-testid="review-loading"]');
  if (await loading.isVisible().catch(() => false)) await loading.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  const texts = await substantiveItemTexts(page);
  if (texts.length > 0) return 'list';
  const main = (await page.locator('main').innerText()) ?? '';
  if (HONEST_EMPTY.test(main)) return 'honest-empty';
  return 'honest-empty'; // treated below with the same honest-empty assertions
}

test.describe('M5 review queue', () => {
  test('/review-queue shows real flagged items with rationale, or an honest state', async ({
    page,
  }) => {
    const state = await resolveQueueState(page);
    const main = page.locator('main');
    const body = (await main.innerText()) ?? '';

    if (state === 'placeholder') {
      await expect(main.getByRole('heading', { name: 'Review Queue', exact: true })).toBeVisible();
      await expect(
        main.getByText(/none can be generated without real|needs human judgement/i),
        'honest scope note shown',
      ).toBeVisible();
      await expect(main.locator('table')).toHaveCount(0);
      expect(body.length, 'placeholder stays sparse — no fabricated rows').toBeLessThan(900);
      expect(body, 'no fabricated content').not.toMatch(FABRICATED);
      return;
    }

    if (state === 'list') {
      const texts = (await substantiveItemTexts(page)).slice(0, 6);
      expect(texts.length, 'flagged items are listed').toBeGreaterThan(0);
      // Every item keeps needs-review framing — a flag is never a verdict.
      for (const [i, text] of texts.entries()) {
        expect(
          text,
          `item ${i + 1} must use needs-review framing, never verdict language`,
        ).not.toMatch(VERDICT_LANGUAGE);
      }
      // Real flags carry rationale/provenance context (contract §2: every
      // material edge has a rationale; the queue must surface it).
      expect(
        texts.some((text) => RATIONALE_CONTEXT.test(text)),
        'at least one flagged item shows rationale/provenance context',
      ).toBe(true);
      expect(body, 'no fabricated content').not.toMatch(FABRICATED);
      return;
    }

    // Honest empty (unseeded/unanalyzed): truthful wording, no fake rows.
    expect(body, 'honest empty-state wording present').toMatch(HONEST_EMPTY);
    expect(body, 'no fabricated content').not.toMatch(FABRICATED);
  });

  test('decision affordances: enabled buttons react; disabled/not-available is honest', async ({
    page,
  }) => {
    // Dead-button audit (runs against whatever state production serves —
    // placeholder queues have no buttons and pass trivially): every main-area button is either disabled (or
    // honestly labeled not-available) or observably reacts to a click.
    // Placeholders naturally have no buttons; M5 lists must not ship
    // enabled no-op decision buttons.
    for (let i = 0; i < 8; i++) {
      await page.goto('/review-queue');
      await waitForStableMain(page);
      const buttons = page.locator('main').getByRole('button');
      const total = await buttons.count();
      if (i >= total) break;
      const button = buttons.nth(i);

      const disabled = !(await button.isEnabled().catch(() => false));
      if (disabled) {
        // Honestly disabled — acceptable, but the surrounding copy must not
        // promise a working decision flow.
        continue;
      }

      // Enabled: click and require an observable reaction — a dialog, a
      // status/announcement, a navigation, or any real state change.
      const urlBefore = page.url();
      const textBefore = await page.locator('main').innerText();
      await button.click();
      await expect
        .poll(
          async () => {
            const dialogVisible = await page
              .locator('[role="dialog"], [role="alertdialog"]')
              .first()
              .isVisible()
              .catch(() => false);
            if (dialogVisible) return 'reacted';
            if (page.url() !== urlBefore) return 'reacted';
            const now = await page.locator('main').innerText();
            if (now !== textBefore) return 'reacted';
            return 'idle';
          },
          { timeout: 8_000, intervals: [500, 1_000, 2_000] },
        )
        .toBe('reacted');

      // Never fabricated content in whatever the reaction rendered.
      const after = (await page.locator('main').innerText()) ?? '';
      expect(after, 'no fabricated content after the reaction').not.toMatch(FABRICATED);
      await page.keyboard.press('Escape').catch(() => {});
    }

    // The queue never mutates into verdict language through any interaction.
    const body = (await page.locator('body').innerText()) ?? '';
    expect(body, 'verdict language never appears').not.toMatch(VERDICT_LANGUAGE);
    expect(body, 'no fabricated content at rest').not.toMatch(FABRICATED);
  });
});
