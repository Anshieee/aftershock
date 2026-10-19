import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { buildDemoOverviewRecord } from '../src/test/graphFixtures';

/**
 * Accessibility acceptance — axe scans of the landing and Knowledge Graph
 * pages, skip-link presence, and behavior under emulated reduced motion.
 * The whole file runs with reduced motion emulated.
 */
test.use({ reducedMotion: 'reduce' });

function summarize(violations: Array<{ impact: string | null; id: string; nodes: unknown[] }>) {
  return violations.map((v) => `${v.impact}:${v.id}(x${v.nodes.length})`).join(', ');
}

async function scan(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  const critical = results.violations.filter((v) => v.impact === 'critical');
  const minor = results.violations.filter((v) => v.impact !== 'critical');
  if (minor.length > 0) {
    console.log(`[${label}] ${minor.length} minor violation(s): ${summarize(minor)}`);
  }
  return critical;
}

test('landing page has no critical axe violations', async ({ page }) => {
  await page.goto('/');
  const critical = await scan(page, 'landing');
  expect(critical, `critical violations: ${summarize(critical)}`).toEqual([]);
});

test('Knowledge Graph page has no critical axe violations', async ({ page }) => {
  await page.goto('/graph');
  const critical = await scan(page, 'graph');
  expect(critical, `critical violations: ${summarize(critical)}`).toEqual([]);
});

/**
 * Wave-3 a11y follow-up — the loaded graph state (route-stubbed exactly like
 * e2e/graph-explorer.spec.ts; the real backend is never touched) must keep
 * the canvas free of the two shipped violations:
 *  - heading-order: no heading elements inside the records list (styled
 *    paragraphs instead);
 *  - label-content-name-mismatch: every SVG node button's accessible name
 *    equals its visible label text.
 * Gated on these two IDs only — other pages' minor findings stay reported,
 * not failed, so the gate keeps stable across honest data states.
 */
test('loaded graph canvas keeps its shipped a11y violations fixed', async ({ page }) => {
  await page.route('**/.netlify/functions/**', async (route: import('@playwright/test').Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/graph-edges')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildDemoOverviewRecord()),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not found' }),
    });
  });
  await page.goto('/graph');
  await page.getByTestId('graph-canvas').waitFor();
  await page.getByTestId('graph-node-claim-A').click();
  await page.getByTestId('graph-selection-provenance').waitFor();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  const headingOrder = results.violations.filter((v) => v.id === 'heading-order');
  expect(
    headingOrder,
    `heading-order must stay absent on the loaded graph page (found: ${summarize(headingOrder)})`,
  ).toEqual([]);
  const canvasMismatch = (results.violations.find((v) => v.id === 'label-content-name-mismatch')?.nodes ?? [])
    .filter((n) => typeof n.html === 'string' && n.html.includes('data-testid="graph-node-'));
  expect(
    canvasMismatch.map((n) => n.target),
    'SVG node buttons must keep name == visible label (label-content-name-mismatch)',
  ).toEqual([]);
});

/**
 * Wave 5 hardening: extend the critical-violation axe scan to the remaining
 * primary workspace pages. Critical-only so the gate stays stable across
 * honest data states (empty/loaded/failure each render their own copy).
 * Each page is scanned after its h1 is visible so the scan never races the
 * SPA mount.
 */
const PRIMARY_PAGES = [
  { path: '/review-queue', label: 'review-queue' },
  { path: '/library', label: 'library' },
  { path: '/activity', label: 'activity' },
  { path: '/investigations', label: 'investigations' },
  { path: '/export', label: 'export' },
] as const;

test('remaining primary pages have no critical axe violations', async ({ page }) => {
  const offenders: Array<{ label: string; violations: string }> = [];
  for (const { path, label } of PRIMARY_PAGES) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { level: 1 }),
      `${label} mounts with an accessible h1`,
    ).toBeVisible({ timeout: 15_000 });
    const critical = await scan(page, label);
    if (critical.length > 0) {
      offenders.push({ label, violations: summarize(critical) });
    }
  }
  expect(
    offenders,
    `critical violations found: ${offenders.map((o) => `${o.label}: ${o.violations}`).join(' | ')}`,
  ).toEqual([]);
});

test('skip link exists and is exposed to keyboard by focus', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('a[href="#main-content"]');
  await expect(skip, 'skip link present in DOM').toHaveCount(1);
  await skip.focus();
  await expect(skip).toBeVisible();
  await expect(skip).toContainText(/skip/i);
});

test('pages render correctly under emulated reduced motion', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/graph');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Transitions must not create forced motion for reduced-motion users.
  const reducedStyle = await page.evaluate(() => {
    for (const sheet of document.styleSheets as StyleSheetList) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin stylesheet
      }
      for (const rule of Array.from(rules)) {
        if (rule.cssText.includes('motion-reduce') && rule.cssText.includes('transition')) return 'found';
      }
    }
    return 'not-found';
  });
  expect(reducedStyle).toBe('found');
});
