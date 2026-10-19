import { expect, test } from '@playwright/test';

/**
 * Landing page acceptance — the import-first entry point must be real and
 * honest: a keyboard-reachable native file picker, truthfully disabled
 * secondary affordances, and a guided example that is gated (not faked).
 */

test('the intake toggle "Register a file (metadata only)" is reachable via keyboard', async ({ page }) => {
  await page.goto('/');
  // V4 desk: the intake disclosure is the card's secondary action
  // ("Have a document? Register a file (metadata only)",
  // data-testid choose-document-toggle) and reveals sheet 02 · INTAKE.
  // Walk focus with Tab to that toggle, press Enter to expand it, and the
  // next Tab must land on the native file input — still fully reachable
  // without a pointer.
  await page.locator('body').first().focus();
  let reachedToggle = false;
  for (let i = 0; i < 40 && !reachedToggle; i++) {
    await page.keyboard.press('Tab');
    const handle = await page.evaluateHandle(() => document.activeElement);
    reachedToggle = await page.evaluate(
      (el) => el instanceof Element && el.getAttribute('data-testid') === 'choose-document-toggle',
      handle,
    );
    await handle.dispose();
  }
  expect(reachedToggle, 'intake toggle reachable by keyboard Tab').toBe(true);
  await page.keyboard.press('Enter');
  const toggle = page.getByTestId('choose-document-toggle');
  await toggle.waitFor({ state: 'visible' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // After expanding, a short Tab walk (≤ the launcher's small focus set)
  // must land on the native file input — reachability preserved.
  let inputReached = false;
  for (let i = 0; i < 5 && !inputReached; i++) {
    await page.keyboard.press('Tab');
    inputReached = await page.evaluate(() => document.activeElement?.id === 'import-input');
  }
  expect(inputReached, 'file input #import-input reachable after expanding the picker').toBe(true);
  // The visible "Choose a document" label is wired to that input.
  const label = page.getByTestId('import-panel').locator('label[for="import-input"]').first();
  await expect(label).toHaveText('Choose a document');
});

test('a native file input is present (no fake uploader)', async ({ page }) => {
  await page.goto('/');
  // Expand the intake sheet first: the picker is honest progressive
  // disclosure, not removed.
  await page.getByTestId('choose-document-toggle').click();
  const input = page.locator('[data-testid="import-input"]');
  await expect(input).toBeAttached();
  await expect(input).toHaveAttribute('type', 'file');
  await expect(input).toHaveAttribute('accept', /\.pdf|\.docx|\.txt/);

  // Selecting a real file triggers an honest client-side state change:
  // the selection state reflects the file name and never fabricates
  // analysis results. The server may accept, reject, or still be
  // processing — all are honest outcomes.
  await input.setInputFiles({
    name: 'manuscript.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('placeholder'),
  });
  const status = page.locator('[data-testid="selection-state"]');
  // The file name must appear in the selection state (client-side, instant).
  await expect(status).toContainText('manuscript.txt');
  const statusText = await status.textContent();
  // Never fabricate analysis/extraction/verification claims.
  expect(statusText).not.toMatch(/analyzed|extracted citation|verified/i);
  expect(statusText).not.toMatch(/imported successfully|analysis complete|registered successfully/i);
});

test('secondary Bibliography / Single DOI are honestly gated, not faked', async ({ page }) => {
  await page.goto('/');
  // The demoted affordances live inside the collapsed intake sheet —
  // expand it first, then verify they are visible-disabled (honest
  // gating, never fake inputs).
  await page.getByTestId('choose-document-toggle').click();
  await expect(page.getByRole('button', { name: 'Bibliography' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bibliography' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Single DOI' })).toBeDisabled();
  // Honest scope note: these cannot produce passage-level claim dependencies.
  await expect(page.getByText(/cannot detect passage-level claim dependencies/i)).toBeVisible();
});

test('guided example runs the real guarded seed flow and shows no fabricated results', async ({ page }) => {
  await page.goto('/');
  // Wave U1: the launcher card (data-testid investigation-launcher) hosts
  // the single seed flow — no "Try guided example" heading anymore.
  const guided = page.getByTestId('investigation-launcher');
  await expect(guided.getByTestId('guided-seed-button')).toBeVisible();
  // The launcher shows the quiet integrity line before anything expands.
  await expect(
    guided.getByText(/clearly labeled synthetic content .* nothing is simulated/),
  ).toBeVisible();
  // The guided example is an ACTIVE flow: it calls the guarded,
  // rate-limited demo-seed API through the real client, on demand — its
  // copy must be truthful about what runs and what is synthetic.
  const disclosure = guided.getByRole('button', { name: /What does that involve\?/i });
  await disclosure.click();
  const note = guided.getByRole('note');
  await expect(note.getByText(/guarded, rate-limited/i), 'discloses the guarded API path').toBeVisible();
  await expect(note.getByText(/FICTIONAL \/ GUIDED DEMO/i)).toBeVisible();
  await expect(note.getByText(/synthetic demo data only/i)).toBeVisible();

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
