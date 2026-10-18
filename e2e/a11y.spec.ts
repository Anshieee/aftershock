import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
