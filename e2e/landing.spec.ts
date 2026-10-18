import { expect, test } from '@playwright/test';

/**
 * Landing page acceptance — the import-first entry point must be real and
 * honest: a keyboard-reachable native file picker, truthfully disabled
 * secondary affordances, and a guided example that is gated (not faked).
 */

test('primary "Choose a document" is reachable via keyboard', async ({ page }) => {
  await page.goto('/');
  // Walk focus with Tab from the document start; the picker must be
  // reachable without a pointer.
  await page.locator('body').first().focus();
  let reached = false;
  for (let i = 0; i < 30 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.id === 'import-input');
  }
  expect(reached, 'file input #import-input reachable by keyboard Tab').toBe(true);
  // The visible "Choose a document" label is wired to that input.
  const label = page.getByTestId('import-panel').locator('label[for="import-input"]').first();
  await expect(label).toHaveText('Choose a document');
});

test('a native file input is present (no fake uploader)', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('[data-testid="import-input"]');
  await expect(input).toBeAttached();
  await expect(input).toHaveAttribute('type', 'file');
  await expect(input).toHaveAttribute('accept', /\.pdf|\.docx|\.txt/);

  // Selecting a real file updates the UI with honest disclosure that
  // nothing was uploaded and no analysis exists yet.
  await input.setInputFiles({
    name: 'manuscript.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('placeholder'),
  });
  const status = page.locator('[data-testid="selection-state"]');
  await expect(status).toContainText('manuscript.txt');
  await expect(status).toContainText(/not wired|not been uploaded|no analysis backend|Registering|API error|nothing was registered|No simulated success/i);
  await expect(status).not.toContainText(/analyzed|extracted citation|verified/i);
});

test('secondary Bibliography / Single DOI are honestly gated, not faked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Bibliography' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Single DOI' })).toBeDisabled();
  // Honest scope note: these cannot produce passage-level claim dependencies.
  await expect(page.getByText(/cannot detect passage-level claim dependencies/i)).toBeVisible();
});

test('guided example runs the real guarded seed flow and shows no fabricated results', async ({ page }) => {
  await page.goto('/');
  const guided = page.locator('section', { hasText: 'Try guided example' });
  await expect(guided.getByRole('heading', { name: 'Try guided example' })).toBeVisible();
  // The guided example is an ACTIVE flow in M2: it calls the guarded,
  // rate-limited demo-seed API through the real client. Its copy must be
  // truthful about what runs and what is synthetic.
  await expect(guided.getByTestId('guided-seed-button')).toBeVisible();
  await expect(
    guided.getByText(/guarded, rate-limited/i),
    'discloses the guarded API path',
  ).toBeVisible();
  const disclosure = guided.getByRole('button', { name: /What does that involve\?/i });
  await disclosure.click();
  await expect(guided.getByText(/FICTIONAL \/ GUIDED DEMO/i)).toBeVisible();
  await expect(guided.getByText(/synthetic demo data only/i)).toBeVisible();

  // The backend is LIVE (dash-path handlers): clicking either seeds the real
  // demo graph and navigates to real results, or ends in an honest failure
  // state. Both are acceptable; fabricated content never is.
  await guided.getByTestId('guided-seed-button').click();
  await page.waitForURL(/\/results/, { timeout: 15_000 }).catch(() => {});
  if (page.url().match(/\/results/)) {
    // SUCCESS path — results must be REAL graph-derived content: the
    // affected-claims card with the fixture's provenance, never lorem/fake.
    await expect(
      page.getByTestId('results-affected'),
      'real affected-claims results after a successful seed',
    ).toBeVisible({ timeout: 15_000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('FICTIONAL / GUIDED DEMO');
    expect(body?.toLowerCase()).not.toMatch(/lorem ipsum|placeholder|coming soon/i);
  } else {
    // HONEST-FAILURE path — API down / cooldown / not wired: a truthful
    // state message and NO fabricated results.
    const state = page.getByTestId('guided-seed-state');
    await expect(state.locator('p')).toHaveCount(1, { timeout: 12_000 });
    await expect(
      state.getByText(/api error|no simulated success|unavailable|cooldown|not wired|seed/i),
    ).toBeVisible();
  }
});
