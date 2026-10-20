/**
 * Captures the visual-QA screenshot set from the running dev server.
 *
 *   node scripts/capture.mjs [baseUrl] [outDir]
 *
 * Uses the Playwright installation that already exists in the repository
 * root (no new browser download, no new dependency).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BASE = process.argv[2] ?? 'http://127.0.0.1:5183';
const OUT = process.argv[3] ?? path.join(ROOT, 'deliverables', 'screenshots');

const require = createRequire(import.meta.url);
const { chromium } = require('/home/ansh/Projects/aftershock/node_modules/playwright');

fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  {
    name: '01-home-light',
    path: '/',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
  },
  {
    name: '02-home-dark',
    path: '/',
    viewport: { width: 1440, height: 900 },
    theme: 'dark',
  },
  {
    name: '03-home-mobile',
    path: '/',
    viewport: { width: 390, height: 844 },
    theme: 'light',
  },
  {
    name: '04-reader-pdf',
    path: '/i/doc-demo-manuscript/read',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 7000,
  },
  {
    name: '05-reader-annotated',
    path: '/i/doc-demo-manuscript/read',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 7000,
    action: async (page) => {
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const target = buttons.find((b) => b.getAttribute('aria-label')?.includes('open evidence'));
        target?.click();
      });
      await page.waitForTimeout(1400);
    },
  },
  {
    name: '06-inspector-evidence',
    path: '/i/doc-demo-manuscript/read',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 7000,
    action: async (page) => {
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const target = buttons.find((b) => b.getAttribute('aria-label')?.includes('open evidence'));
        target?.click();
      });
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        const labels = [...document.querySelectorAll('button')];
        const expand = labels.find((b) => b.textContent?.includes('The evidence relationship'));
        expand?.click();
      });
      await page.waitForTimeout(700);
    },
  },
  {
    name: '07-inspector-graph',
    path: '/i/doc-demo-manuscript/read',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 7000,
    action: async (page) => {
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const target = buttons.find((b) => b.getAttribute('aria-label')?.includes('open evidence'));
        target?.click();
      });
      await page.waitForTimeout(1000);
      await page.evaluate(() => {
        const labels = [...document.querySelectorAll('button')];
        const expand = labels.find((b) => b.textContent?.trim() === 'Evidence graph');
        expand?.click();
      });
      await page.waitForTimeout(2200);
    },
  },
  {
    name: '08-graph-workspace',
    path: '/i/doc-demo-manuscript/graph',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 6500,
  },
  {
    name: '09-graph-workspace-dark',
    path: '/i/doc-demo-manuscript/graph',
    viewport: { width: 1440, height: 900 },
    theme: 'dark',
    wait: 6500,
  },
  {
    name: '10-review-queue',
    path: '/i/doc-demo-manuscript/review',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 1200,
  },
  {
    name: '11-revision-side-by-side',
    path: '/i/doc-demo-manuscript/evidence?focus=finding-direct-support',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 1200,
    action: async (page) => {
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const tab = buttons.find((b) => b.textContent?.trim() === 'Revisions');
        tab?.click();
      });
      await page.waitForTimeout(700);
    },
  },
  {
    name: '12-revision-tracked',
    path: '/i/doc-demo-manuscript/evidence?focus=finding-direct-support',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 1200,
    action: async (page) => {
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const tab = buttons.find((b) => b.textContent?.trim() === 'Revisions');
        tab?.click();
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const mode = buttons.find((b) => b.textContent?.trim() === 'Tracked changes');
        mode?.click();
      });
      await page.waitForTimeout(700);
    },
  },
  {
    name: '13-report-preview',
    path: '/i/doc-demo-manuscript/report',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 1200,
  },
  {
    name: '14-report-preview-dark',
    path: '/i/doc-demo-manuscript/report',
    viewport: { width: 1440, height: 900 },
    theme: 'dark',
    wait: 1200,
  },
  {
    name: '15-mobile-reflow',
    path: '/i/doc-demo-manuscript/read',
    viewport: { width: 390, height: 844 },
    theme: 'light',
    wait: 6500,
    action: async (page) => {
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const mode = buttons.find((b) => b.textContent?.trim() === 'Reflowed');
        mode?.click();
      });
      await page.waitForTimeout(700);
    },
  },
  {
    name: '16-mobile-inspector',
    path: '/i/doc-demo-manuscript/read',
    viewport: { width: 390, height: 844 },
    theme: 'light',
    wait: 6500,
    action: async (page) => {
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const target = buttons.find((b) =>
          b.getAttribute('aria-label')?.toLowerCase().includes('evidence inspector'),
        );
        target?.click();
      });
      await page.waitForTimeout(800);
    },
  },
  {
    name: '17-library',
    path: '/library',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 800,
  },
  {
    name: '18-activity',
    path: '/activity',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    wait: 800,
  },
  {
    name: '19-reader-1024',
    path: '/i/doc-demo-manuscript/read',
    viewport: { width: 1024, height: 768 },
    theme: 'light',
    wait: 6500,
  },
  {
    name: '20-reader-1366',
    path: '/i/doc-demo-manuscript/read',
    viewport: { width: 1366, height: 768 },
    theme: 'light',
    wait: 6500,
  },
  {
    name: '21-reader-768',
    path: '/i/doc-demo-manuscript/read',
    viewport: { width: 768, height: 1024 },
    theme: 'light',
    wait: 6500,
  },
  {
    name: '22-mobile-360',
    path: '/',
    viewport: { width: 360, height: 800 },
    theme: 'light',
    wait: 800,
  },
];

const browser = await chromium.launch();
const errors = [];

for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 2,
    colorScheme: shot.theme === 'dark' ? 'dark' : 'light',
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[${shot.name}] ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`[${shot.name}] ${error.message}`));

  await page.addInitScript((theme) => {
    try {
      window.localStorage.setItem('aftershock.m31.theme', theme);
      window.localStorage.setItem(
        'aftershock.m31.state.v1',
        JSON.stringify({ theme, sidebarCollapsed: false }),
      );
    } catch {
      /* ignore */
    }
  }, shot.theme);

  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(shot.wait ?? 1200);
  if (shot.action) await shot.action(page);
  await page.waitForTimeout(400);

  const file = path.join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  process.stdout.write(`captured ${shot.name}\n`);
  await context.close();
}

await browser.close();

if (errors.length > 0) {
  process.stdout.write(`\nConsole errors:\n${[...new Set(errors)].join('\n')}\n`);
} else {
  process.stdout.write('\nNo console errors.\n');
}
