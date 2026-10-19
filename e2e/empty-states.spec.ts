import { expect, test } from '@playwright/test';

/**
 * Empty-state acceptance — unimplemented areas must show honest
 * under-construction messaging with no fabricated rows or cards that
 * could be mistaken for real data.
 *
 * DUAL-STATE: the M4/M5 frontends (Library upload panel, Review Queue
 * list) deploy to production while the hosted suite runs. When an area is
 * still the placeholder, the full placeholder contract is asserted; once
 * an area ships its real UI, the honest-real contract applies instead
 * (real content or truthful empty/error states — never fabricated data).
 */

const AREAS = [
  { path: '/library', title: 'Library', honest: /no documents exist|never show placeholder records/i },
  { path: '/investigations', title: 'Investigations', honest: /nothing to investigate yet|nothing is displayed/i },
  { path: '/review-queue', title: 'Review Queue', honest: /none can be generated without real|needs human judgement/i },
  { path: '/activity', title: 'Activity', honest: /no entries are fabricated|once events exist/i },
];

for (const { path, title, honest } of AREAS) {
  test(`honest under-construction state at ${path}`, async ({ page }) => {
    await page.goto(path);
    const main = page.locator('main');

    // Deterministic settle BEFORE the dual-state probe: /library renders no
    // heading at all while its two list requests are in flight (every
    // terminal state has exactly one h1), and the API client gives up after
    // 10 s — so a 20 s bound always resolves to a terminal render first.
    // Without it the probe below raced the async load: it sampled
    // "not placeholder" during the loading phase and the follow-up h1
    // assertion then timed out while the page still showed "Loading…".
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

    // DUAL-STATE: the render is terminal now, so this one-shot probe is
    // stable — either honest variant below is assertable, and the honesty
    // assertions for the sampled variant run in full.
    const isPlaceholder = await main
      .getByText('Feature under construction')
      .first()
      .isVisible()
      .catch(() => false);

    if (!isPlaceholder) {
      // Real area deployed (M4 Library panel / M5 Review Queue list): the
      // real honest contract lives in import.spec.ts / review-queue.spec.ts.
      // Here: still no fabricated content of any kind.
      await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
      const text = (await main.innerText()) ?? '';
      expect(text, 'no fabricated content in the live area').not.toMatch(
        /lorem ipsum|placeholder (?:content|results|data)|coming soon|simulated results|fake results/i,
      );
      return;
    }

    await expect(main.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('Feature under construction')).toBeVisible();
    // Truthful, area-specific scope note — never promises or seeded props.
    const note = main.locator('p').filter({ hasText: honest });
    await expect(note.first(), 'honest scoped note shown').toBeVisible();

    // No fabricated data rows/cards in the empty state. The honest
    // empty-state wrapper itself may carry a test id (the /library
    // placeholder renders inside `[data-testid="library-empty"]`), so the
    // scan is scoped past that one honest marker — any other test id in main
    // would be a row/card/component, i.e. fabricated content.
    await expect(main.locator('table')).toHaveCount(0);
    await expect(main.locator('img')).toHaveCount(0);
    await expect(
      main.locator('[data-testid]:not([data-testid="library-empty"])'),
    ).toHaveCount(0);
    // The area stays sparse — a wall of matching "items" would indicate
    // placeholder data.
    const text = (await main.innerText()) ?? '';
    expect(text.length, 'empty area stays sparse').toBeLessThan(900);
  });
}
