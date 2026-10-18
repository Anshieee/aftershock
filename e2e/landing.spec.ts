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
  for (let i = 0; i < 12 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.id === 'import-input');
  }
  expect(reached, 'file input #import-input reachable by keyboard Tab').toBe(true);
  // The visible "Choose a document" label is wired to that input.
  const label = page.locator('label[for="import-input"]');
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
  await expect(status).toContainText(/not wired|not been uploaded|no analysis backend/i);
  await expect(status).not.toContainText(/analyzed|extracted citation|verified/i);
});

test('secondary Bibliography / Single DOI are honestly gated, not faked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Bibliography' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Single DOI' })).toBeDisabled();
  // Honest scope note: these cannot produce passage-level claim dependencies.
  await expect(page.getByText(/cannot detect passage-level claim dependencies/i)).toBeVisible();
});

test('guided example is gated and does not show fabricated results', async ({ page }) => {
  await page.goto('/');
  const guided = page.locator('section', { hasText: 'Try guided example' });
  await expect(guided.getByRole('heading', { name: 'Try guided example' })).toBeVisible();
  // Honest gate: available only after the graph seed — no fake results shown.
  await expect(guided.getByText(/available after graph seed/i)).toBeVisible();
  const disclosure = guided.getByRole('button', { name: /Why isn’t it available\?/i });
  await disclosure.click();
  await expect(guided.getByText(/nothing to show yet|not an option/i)).toBeVisible();
});
