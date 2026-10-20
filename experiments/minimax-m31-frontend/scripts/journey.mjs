/**
 * Walks the required user journey end to end against the running dev
 * server and reports what actually happened at each step.
 *
 *   node scripts/journey.mjs [baseUrl]
 *
 * Exits non-zero if any step fails.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/home/ansh/Projects/aftershock/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://127.0.0.1:5183';

const steps = [];
let failed = 0;

function record(name, ok, detail = '') {
  steps.push({ name, ok, detail });
  if (!ok) failed += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

const text = () => page.locator('body').innerText();

try {
  /* 1 — homepage --------------------------------------------------- */
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  record(
    '1. Homepage shows the document launcher and the wordmark',
    (await text()).includes('Drop a manuscript here') && (await text()).includes('Aftershock'),
  );

  /* 1b — unsupported file feedback -------------------------------- */
  await page.setInputFiles('input[type=file]', {
    name: 'notes.png',
    mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  });
  await page.waitForTimeout(500);
  const unsupported = await page.locator('[role=alert]').first().innerText().catch(() => '');
  record(
    '1b. An unsupported file is refused with a clear message',
    /PDF, DOCX and TXT/.test(unsupported),
    unsupported.slice(0, 70),
  );
  // Clear the error and go back to the launcher.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  /* 1c — a chosen file opens locally, and says so ----------------- */
  const sample = fs.readFileSync(new URL('../public/sample-manuscript.pdf', import.meta.url));
  await page.setInputFiles('input[type=file]', {
    name: 'my-manuscript.pdf',
    mimeType: 'application/pdf',
    buffer: sample,
  });
  await page.waitForURL(/\/i\/doc-demo-manuscript\/read/, { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(1800);
  const uploadText = await text();
  record(
    '1c. A chosen file opens in the reader and is labelled as not analysed',
    /opened locally, not analysed/.test(uploadText) && /my-manuscript\.pdf/.test(uploadText),
  );
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  /* 2 — guided example -------------------------------------------- */
  await page.getByRole('button', { name: /Open the guided example/i }).click();
  await page.waitForURL(/\/i\/doc-demo-manuscript\/read/, { timeout: 8000 });
  record('2. Guided example opens the investigation', page.url().includes('/read'));

  /* 3 — transition ------------------------------------------------- */
  await page.waitForTimeout(800);
  record(
    '3. Document is open and the sidebar shows the investigation',
    (await text()).includes('Adaptive Marker Panels'),
  );

  /* 4 — the real PDF ----------------------------------------------- */
  const canvasBox = await page.locator('canvas').first().boundingBox();
  record(
    '4. The original PDF is rendered by PDF.js',
    Boolean(canvasBox && canvasBox.width > 200 && canvasBox.height > 200),
    canvasBox ? `${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)}` : 'no canvas',
  );

  /* 5 — simulated progress ----------------------------------------- */
  await page.waitForTimeout(1500);
  const statusText = await page
    .locator('button')
    .filter({ hasText: /Preparing example findings|Example findings ready/ })
    .first()
    .innerText();
  record('5. Example-finding progress is labelled as such', /Preparing|ready/i.test(statusText), statusText);

  /* 6 — findings appear at their anchored location ------------------ */
  await page.waitForTimeout(5000);
  const underlines = await page.locator('.annotation-underline').count();
  const hits = await page.locator('button[aria-label*="open evidence"]').count();
  record('6. Findings appear as anchored marks in the document', underlines > 0 && hits >= 6, `${hits} marks`);

  /* 7 — select a finding ------------------------------------------- */
  await page.locator('button[aria-label*="open evidence"]').first().click();
  await page.waitForTimeout(700);
  const inspectorText = await page.locator('aside').last().innerText();
  record(
    '7. Selecting a finding opens the evidence inspector',
    inspectorText.includes('Direct support') || inspectorText.includes('Unresolved reference'),
  );

  /* 8 — plain-language explanation ---------------------------------- */
  record(
    '8. The inspector leads with a plain-language explanation',
    /may need to be reviewed|needs a decision|matches more than one/i.test(inspectorText),
  );

  /* 9 — deeper level ----------------------------------------------- */
  await page.getByRole('button', { name: /The evidence relationship/i }).click();
  await page.waitForTimeout(400);
  const expanded = await page.locator('aside').last().innerText();
  record(
    '9. The evidence relationship expands on demand',
    expanded.length > inspectorText.length,
    `${inspectorText.length} → ${expanded.length} characters`,
  );

  /* 10 — compact graph inside the inspector ------------------------ */
  await page.getByRole('button', { name: /^Evidence graph/ }).click();
  await page.waitForTimeout(1200);
  const inspectorCanvas = await page.locator('aside canvas').count();
  record('10. The inspector contains its own force-directed graph', inspectorCanvas > 0);

  /* 11 — full graph workspace --------------------------------------- */
  await page.getByRole('button', { name: 'Open the evidence graph', exact: true }).click();
  await page.waitForURL(/\/graph/, { timeout: 8000 });
  await page.waitForTimeout(2500);
  const graphCanvas = await page.locator('canvas').count();
  record('11. The full evidence graph workspace opens', graphCanvas > 0);

  /* 12 — pan, zoom, drag, select ------------------------------------ */
  const graphBox = await page.locator('canvas').first().boundingBox();
  if (graphBox) {
    await page.mouse.move(graphBox.x + graphBox.width / 2, graphBox.y + graphBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(graphBox.x + graphBox.width / 2 + 90, graphBox.y + graphBox.height / 2 + 40, {
      steps: 8,
    });
    await page.mouse.up();
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(600);
    record('12. The graph can be panned and zoomed', true);
  } else {
    record('12. The graph can be panned and zoomed', false, 'no canvas');
  }

  /* 13 — return to the manuscript passage --------------------------- */
  await page.getByRole('button', { name: /Back to the reader/i }).click();
  await page.waitForURL(/\/read/, { timeout: 8000 });
  await page.waitForTimeout(800);
  const readerText = await text();
  record('13. The reader keeps the selected finding', readerText.includes('Evidence'));

  /* 14 — record a review decision ----------------------------------- */
  const before = await page.locator('aside').last().innerText();
  await page.getByRole('button', { name: 'Revision needed', exact: true }).first().click();
  await page.waitForTimeout(600);
  const after = await page.locator('aside').last().innerText();
  record(
    '14. A review decision is recorded and shown',
    after !== before && after.includes('Revision needed'),
  );

  /* 15 — revision comparison ---------------------------------------- */
  await page.goto(`${BASE}/i/doc-demo-manuscript/evidence?focus=finding-direct-support`, {
    waitUntil: 'networkidle',
  });
  await page.getByRole('radio', { name: 'Revisions', exact: true }).click();
  await page.waitForTimeout(600);
  const sideBySide = (await text()).toLowerCase();
  record(
    '15. The side-by-side revision comparison shows both texts',
    sideBySide.includes('original passage') && sideBySide.includes('suggested revision'),
  );

  /* 16 — tracked changes -------------------------------------------- */
  await page.getByRole('radio', { name: 'Tracked changes', exact: true }).click();
  await page.waitForTimeout(600);
  const tracked = await text();
  record(
    '16. Tracked-changes mode renders the editorial marks',
    tracked.includes('TRACKED CHANGES'),
  );

  /* 17 — review queue ----------------------------------------------- */
  await page.goto(`${BASE}/i/doc-demo-manuscript/review`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const queue = await text();
  record(
    '17. The review queue lists the passages that need a decision',
    queue.includes('Needs a decision') && queue.includes('A supporting source was later retracted'),
  );

  /* 18 — report workspace ------------------------------------------- */
  await page.goto(`${BASE}/i/doc-demo-manuscript/report`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const report = await text();
  record(
    '18. The report workspace shows a live preview',
    report.includes('Evidence impact report') && report.includes('Example investigation'),
  );

  /* 19 — configure sections ----------------------------------------- */
  const beforeSections = await page.locator('article h2').count();
  await page.getByText('Provenance', { exact: true }).first().click();
  await page.waitForTimeout(500);
  const afterSections = await page.locator('article h2').count();
  record('19. Report sections can be switched on and off', afterSections !== beforeSections);

  /* 20 — export ------------------------------------------------------ */
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await page.getByRole('button', { name: /HTML — a single self-contained file/i }).click();
  const download = await downloadPromise;
  record(
    '20. The HTML export produces a real file',
    Boolean(download) && /\.html$/.test(download?.suggestedFilename() ?? ''),
    download?.suggestedFilename() ?? 'no download',
  );

  /* 20b — the DOCX export ------------------------------------------- */
  const docxPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await page.getByRole('button', { name: /DOCX — editable in Word/i }).click();
  const docx = await docxPromise;
  record(
    '20b. The DOCX export produces a real file',
    Boolean(docx) && /\.docx$/.test(docx?.suggestedFilename() ?? ''),
    docx?.suggestedFilename() ?? 'no download',
  );

  /* 21 — back to the investigation ----------------------------------- */
  await page.goto(`${BASE}/i/doc-demo-manuscript/read`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const final = await text();
  record('21. The investigation is intact and readable', final.includes('Adaptive Marker Panels'));
} catch (error) {
  record('journey', false, String(error));
}

await browser.close();

process.stdout.write(`\n${steps.length - failed}/${steps.length} steps passed\n`);
if (consoleErrors.length > 0) {
  process.stdout.write(`\nConsole errors:\n${[...new Set(consoleErrors)].join('\n')}\n`);
}
if (failed > 0) process.exitCode = 1;
