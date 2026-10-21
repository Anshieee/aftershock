/**
 * Smoke test for the public Netlify preview.
 *
 *   node scripts/live-smoke.mjs [baseUrl] [outDir]
 *
 * Verifies the deployed build — not the local dev server — against the
 * checks in the deployment brief, and records every network request the
 * page makes so we can prove nothing is sent to the production Aftershock
 * backend.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire('/home/ansh/Projects/aftershock/node_modules/');
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BASE = process.argv[2] ?? 'https://aftershock-minimax-preview.netlify.app';
const OUT = process.argv[3] ?? path.join(ROOT, 'deliverables', 'screenshots', 'live');

fs.mkdirSync(OUT, { recursive: true });

let failed = 0;
function record(name, ok, detail = '') {
  if (!ok) failed += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const consoleErrors = [];
const requests = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('request', (r) => requests.push(r.url()));

async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/* 1 — homepage -------------------------------------------------------- */
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const homeText = await page.locator('body').innerText();
record('1. Homepage loads', homeText.includes('Drop a manuscript here'), '');
record(
  '2. Fonts and styles load',
  (await page.evaluate(() => getComputedStyle(document.body).fontFamily)).includes('Inter Tight'),
);
record(
  '3. The public-preview disclosure is visible',
  homeText.includes('Not connected to live analysis'),
);
await shot('live-01-home');

/* 4 — guided example ------------------------------------------------- */
await page.getByRole('button', { name: /Open the guided example/i }).click();
await page.waitForURL(/\/i\/doc-demo-manuscript\/read/, { timeout: 15000 });
record('4. Guided example launches', page.url().includes('/read'));

/* 5 + 6 — PDF and worker ---------------------------------------------- */
await page.waitForTimeout(9000);
const canvasBox = await page.locator('canvas').first().boundingBox();
record(
  '5. The sample PDF renders',
  Boolean(canvasBox && canvasBox.width > 200 && canvasBox.height > 200),
  canvasBox ? `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}` : 'no canvas',
);
record(
  '6. The PDF.js worker is served from the site',
  requests.some((u) => u.includes('pdf.worker') && u.startsWith(BASE)),
  requests.find((u) => u.includes('pdf.worker')) ?? 'not found',
);
record(
  '7. The sample manuscript is served from the site',
  requests.some((u) => u.endsWith('/sample-manuscript.pdf') && u.startsWith(BASE)),
);

/* 8 — annotation geometry --------------------------------------------- */
const marks = await page.locator('.annotation-underline').count();
const hits = await page.locator('button[aria-label*="open evidence"]').count();
record('8. Annotation highlights are drawn', marks > 0 && hits >= 6, `${hits} anchored marks`);

/* 9 — inspector -------------------------------------------------------- */
await page.locator('button[aria-label*="open evidence"]').first().click();
await page.waitForTimeout(900);
const inspector = await page.locator('aside').last().innerText();
record('9. The Evidence Inspector opens', /Direct support|Unresolved reference/.test(inspector));
record('10. It leads with a plain-language explanation', /needs a decision|may need to be reviewed/.test(inspector));
await shot('live-02-inspector');

/* 11 — graph ----------------------------------------------------------- */
await page.goto(`${BASE}/i/doc-demo-manuscript/graph`, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
const graphCanvas = await page.locator('canvas').first().boundingBox();
const before = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return '';
  // Sample the pixels rather than the encoded size: PNG length barely moves
  // when a graph is panned.
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let hash = 0;
  for (let i = 0; i < data.length; i += 97) hash = (hash * 31 + data[i]) | 0;
  return String(hash);
});
if (graphCanvas) {
  await page.mouse.move(graphCanvas.x + graphCanvas.width / 2, graphCanvas.y + graphCanvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(graphCanvas.x + graphCanvas.width / 2 + 110, graphCanvas.y + graphCanvas.height / 2 + 50, {
    steps: 10,
  });
  await page.mouse.up();
  await page.mouse.wheel(0, -260);
  await page.waitForTimeout(900);
}
const after = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return '';
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let hash = 0;
  for (let i = 0; i < data.length; i += 97) hash = (hash * 31 + data[i]) | 0;
  return String(hash);
});
record(
  '11. The graph renders and responds to drag and zoom',
  Boolean(graphCanvas) && after.length > 0 && after !== before,
  `pixel hash ${before} -> ${after}`,
);
await shot('live-03-graph');

/* 12 — review state ---------------------------------------------------- */
await page.goto(`${BASE}/i/doc-demo-manuscript/read`, { waitUntil: 'networkidle' });
await page.waitForTimeout(7000);
await page.locator('button[aria-label*="open evidence"]').first().click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Revision needed', exact: true }).first().click();
await page.waitForTimeout(700);
const reviewed = await page.locator('aside').last().innerText();
record('12. A review decision updates client-side state', reviewed.includes('Revision needed'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const stored = await page.evaluate(() => {
  const raw = window.localStorage.getItem('aftershock.m31.state.v1');
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return parsed?.reviewDecisions?.['finding-unresolved-reference'] ?? null;
});
const persisted = await page.locator('body').innerText();
record(
  '13. The decision survives a refresh (local browser state)',
  stored?.outcome === 'revision_needed' && persisted.includes('Review recorded'),
  stored ? `stored outcome "${stored.outcome}", surfaced as "Review recorded"` : 'not stored',
);

/* 14 — revisions -------------------------------------------------------- */
await page.goto(`${BASE}/i/doc-demo-manuscript/evidence?focus=finding-direct-support`, {
  waitUntil: 'networkidle',
});
await page.getByRole('radio', { name: 'Revisions', exact: true }).click();
await page.waitForTimeout(700);
let text = (await page.locator('body').innerText()).toLowerCase();
record('14. Side-by-side revision comparison works', text.includes('original passage') && text.includes('suggested revision'));
await page.getByRole('radio', { name: 'Tracked changes', exact: true }).click();
await page.waitForTimeout(600);
text = (await page.locator('body').innerText()).toLowerCase();
record('15. Tracked changes render', text.includes('tracked changes'));
await shot('live-04-revisions');

/* 16 — report + exports -------------------------------------------------- */
await page.goto(`${BASE}/i/doc-demo-manuscript/report`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
record('16. The report preview loads', (await page.locator('body').innerText()).includes('Evidence impact report'));
const htmlDownload = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
await page.getByRole('button', { name: /HTML — a single self-contained file/i }).click();
const html = await htmlDownload;
record('17. The HTML export downloads', Boolean(html) && /\.html$/.test(html?.suggestedFilename() ?? ''), html?.suggestedFilename() ?? 'none');
const docxDownload = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
await page.getByRole('button', { name: /DOCX — editable in Word/i }).click();
const docx = await docxDownload;
record('18. The DOCX export downloads', Boolean(docx) && /\.docx$/.test(docx?.suggestedFilename() ?? ''), docx?.suggestedFilename() ?? 'none');
await shot('live-05-report');

/* 19 — print -------------------------------------------------------------- */
// A headless browser has no print dialogue, so the print path is asserted
// two ways: the report really calls window.print(), and the deployed
// stylesheet really carries the print rules.
const printCalled = await page.evaluate(() => {
  let called = false;
  const original = window.print;
  window.print = () => {
    called = true;
  };
  // The report's "PDF" button calls window.print(); click it directly.
  const button = [...document.querySelectorAll('button')].find((b) =>
    /PDF/.test(b.textContent ?? ''),
  );
  button?.click();
  window.print = original;
  return called;
});
const printCss = await page.evaluate(async () => {
  const link = [...document.querySelectorAll('link[rel=stylesheet]')][0];
  if (!link) return '';
  const text = await (await fetch(link.href)).text();
  return text.includes('@media print') ? 'present' : 'absent';
});
record(
  '19. The browser print pipeline is wired (window.print + print stylesheet)',
  printCalled && printCss === 'present',
  `window.print called: ${printCalled}, print stylesheet: ${printCss}`,
);

/* 20 — themes -------------------------------------------------------------- */
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Switch to dark theme/i }).click();
await page.waitForTimeout(600);
const dark = await page.evaluate(() => ({
  cls: document.documentElement.className,
  bg: getComputedStyle(document.body).backgroundColor,
}));
record('20. The dark theme applies', dark.cls.includes('theme-dark'), `${dark.cls} ${dark.bg}`);
await shot('live-06-dark');

/* 21 — mobile ---------------------------------------------------------------- */
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const mobilePage = await mobile.newPage();
const mobileErrors = [];
mobilePage.on('pageerror', (e) => mobileErrors.push(e.message));
await mobilePage.goto(`${BASE}/i/doc-demo-manuscript/read`, { waitUntil: 'networkidle' });
await mobilePage.waitForTimeout(8000);
const mobileText = await mobilePage.locator('body').innerText();
record('21. The mobile layout works at 390x844', mobileText.includes('Adaptive Marker Panels'), '');
// Mobile defaults to the reflowed reader, where the marked passages are
// highlighted inline rather than in the PDF overlay.
const mobileMarks = await mobilePage.locator('article button[title]').count();
const mobileHasPdfMode = (await mobilePage.locator('.annotation-underline').count()) > 0;
record(
  '22. Mobile still shows the marked passages',
  mobileMarks > 0 || mobileHasPdfMode,
  `${mobileMarks} inline marks in the reflowed reader`,
);
await mobilePage.screenshot({ path: path.join(OUT, 'live-07-mobile.png') });
await mobile.close();

/* 23 — deep-link refresh ------------------------------------------------------ */
await page.goto(`${BASE}/i/doc-demo-manuscript/review`, { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
record(
  '23. A nested route survives a browser refresh',
  (await page.locator('body').innerText()).includes('Review'),
);

/* 24 — no production traffic --------------------------------------------------- */
const offSite = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:'));
const production = offSite.filter(
  (u) => u.includes('aftershock-demo') || u.includes('netlify/functions') || u.includes('falkor'),
);
record(
  '24. No request is made to the production Aftershock backend',
  production.length === 0,
  production.join(', ') || `${offSite.length} external requests: ${[...new Set(offSite)].slice(0, 5).join(', ')}`,
);

record('25. No console errors on the deployed build', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();

process.stdout.write(`\nScreenshots written to ${OUT}\n`);
process.stdout.write(failed === 0 ? 'All live checks passed.\n' : `${failed} live check(s) failed.\n`);
if (failed > 0) process.exitCode = 1;
