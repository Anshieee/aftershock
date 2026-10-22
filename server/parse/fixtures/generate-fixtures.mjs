#!/usr/bin/env node
/**
 * generate-fixtures.mjs — deterministic generator for the synthetic parsing
 * fixture corpus in this directory (see README.md for provenance).
 *
 * Every artifact is FICTIONAL / GUIDED DEMO content, written fully offline.
 * PDF metadata (Title, Author, CreationDate, ModDate) is pinned so that
 * re-running this script produces byte-identical PDFs — the committed
 * artifacts are the exact output of this script and must never be
 * hand-edited. (pdfkit derives its file ID from the info dictionary, so a
 * fixed CreationDate makes the whole byte stream reproducible.)
 *
 * The image-only PDF (synthetic-scanned-image-only.pdf) is intentionally NOT
 * generated here: it is rasterized from synthetic-article-1p.pdf with the two
 * external commands documented in README.md (ghostscript + img2pdf).
 *
 * Usage: node generate-fixtures.mjs   (parameterless)
 */

import { createRequire } from 'node:module';
import { writeFile, stat } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');

/** All artifacts are written next to this script. */
const OUT_DIR = new URL('.', import.meta.url);

/** First text line of every fixture document (contract). */
const FICTIONAL_HEADER =
  'FICTIONAL / GUIDED DEMO — Aftershock parsing fixture (not real research)';

const PDF_DATES = new Date('2026-01-01T00:00:00Z');
const PDF_AUTHOR = 'Aftershock (demo fixtures)';

/** Pinned pdfinfo for deterministic bytes. */
function pdfInfo(title) {
  return {
    Title: title,
    Author: PDF_AUTHOR,
    CreationDate: PDF_DATES,
    ModDate: PDF_DATES,
  };
}

/**
 * Largest font size (<= maxSize) at which `lines` each fit on one line of the
 * current page. Needed because pdfkit breaks long words at slashes/hyphens —
 * a DOI URL must never wrap mid-string, so reference blocks are shrunk until
 * every entry fits a single line. Deterministic: Helvetica metrics are fixed.
 */
function fitFontSize(doc, lines, maxSize = 10, minSize = 6) {
  const usable =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    doc.fontSize(size);
    if (lines.every((line) => doc.widthOfString(line) <= usable)) return size;
  }
  doc.fontSize(minSize);
  return minSize;
}

/** Render a pdfkit document to a Buffer. */
function renderPdf(info, build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ info, margin: 72 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

/** Reference entries (contract-literal text; DOIs must render unbroken). */
const ENTRIES_1P = [
  '[1] Demo, A. (2020). A local fixture study. Fixtures Quarterly, 1(1), 1-2. https://doi.org/10.5555/aft-fixture-001',
  '[2] Sample, B. (2021). Bounding extraction work offline. Local Notes, 3(2), 10-12. https://doi.org/10.5555/aft-fixture-002',
  '[3] Placeholder, C. (2019). Undated plain entry.',
];

/**
 * 1-page article. DOIs on this page (exactly two occurrences of
 * 10.5555/aft-fixture-001 — one raw in body prose, one as a URL in the
 * references) plus one reference-only DOI (10.5555/aft-fixture-002) and one
 * reference with no identifier at all.
 */
function buildArticle1p(doc) {
  doc.font('Helvetica').fontSize(9).text(FICTIONAL_HEADER);
  doc.moveDown(1);

  doc.fontSize(15).text('On the Persistence of Fixtures in Local Test Suites (Fixture)');
  doc.moveDown(1);

  doc.fontSize(11);
  doc.text(
    'Local test suites often rely on small synthetic documents to exercise text-extraction pipelines. ' +
      'This fixture is one such document: it was written entirely offline and describes no real study, dataset, or result. ' +
      'Its sentences are intentionally plain so that layout artifacts do not distract from extraction behavior.',
  );
  doc.moveDown(1);
  doc.text(
    'For reference, the primary fictional identifier used by this fixture is 10.5555/aft-fixture-001, which appears again in the reference list below.',
  );
  doc.moveDown(1.5);

  doc.fontSize(13).text('References');
  doc.moveDown(0.5);
  fitFontSize(doc, ENTRIES_1P);
  for (const entry of ENTRIES_1P) {
    doc.text(entry);
    doc.moveDown(0.3);
  }
}

/** Reference entries (contract-literal text; DOIs must render unbroken). */
const ENTRIES_2P = [
  '[1] Demo, A. (2020). A local fixture study. Fixtures Quarterly, 1(1), 1-2. https://doi.org/10.5555/aft-fixture-003',
  '[2] Casebook, D. (2018). URL-style entry. https://doi.org/10.5555/aft-fixture-004',
  '[3] Lee, E., Park, F. (2020). An entry without any identifier.',
  '[4] Trailing, G. (2017). Entry ending with a period and a sentence after the link. https://doi.org/10.5555/aft-fixture-005.',
];

/**
 * 2-page article. Page 1 mentions one DOI twice in different surface forms
 * (URL + raw) to exercise dedupe; page 2 repeats that DOI in the references
 * (occurrences across pages) and adds a URL entry, an entry with no
 * identifier, and an entry whose DOI URL is followed by trailing punctuation.
 */
function buildArticle2p(doc) {
  doc.font('Helvetica').fontSize(9).text(FICTIONAL_HEADER);
  doc.moveDown(1);

  doc.fontSize(15).text('Cross-Page Occurrence Tracking in Two-Page Fixtures (Fixture)');
  doc.moveDown(1);

  doc.fontSize(11);
  doc.text(
    'Two-page fixtures check that extracted occurrences survive a page boundary. ' +
      'The motivating example, as shown by https://doi.org/10.5555/aft-fixture-003, is revisited below so the same identifier must be recognized in more than one surface form.',
  );
  doc.moveDown(1);
  doc.text(
    'The bare identifier 10.5555/aft-fixture-003 appears here in raw form; dedupe logic must reconcile it with the URL form above.',
  );
  doc.moveDown(1);
  doc.text(
    'A mention of earlier work in this paragraph is historical discussion only; discussing a source never means this fixture relies on it.',
  );

  doc.addPage();
  doc.fontSize(13).text('References');
  doc.moveDown(0.5);
  fitFontSize(doc, ENTRIES_2P);
  for (const entry of ENTRIES_2P) {
    doc.text(entry);
    doc.moveDown(0.3);
  }
}

/** Plain-text mirror of the 1p article structure. */
const NOTES_TXT =
  `${FICTIONAL_HEADER}\n` +
  'Plain-text parsing fixtures mirror the PDF fixtures so text extraction can be compared without a PDF layer. ' +
  'This document is fictional, was written offline, and describes no real study or result.\n' +
  'References\n' +
  '[1] Demo, A. (2020). A local fixture study. Fixtures Quarterly, 1(1), 1-2. https://doi.org/10.5555/aft-fixture-001\n' +
  '[2] Sample, B. (2021). Bounding extraction work offline. Local Notes, 3(2), 10-12. 10.5555/aft-fixture-002\n';

async function main() {
  const outputs = [
    [
      'synthetic-article-1p.pdf',
      await renderPdf(
        pdfInfo('On the Persistence of Fixtures in Local Test Suites (Fixture)'),
        buildArticle1p,
      ),
    ],
    [
      'synthetic-article-2p.pdf',
      await renderPdf(
        pdfInfo('Cross-Page Occurrence Tracking in Two-Page Fixtures (Fixture)'),
        buildArticle2p,
      ),
    ],
    ['synthetic-notes.txt', Buffer.from(NOTES_TXT, 'utf8')],
  ];

  for (const [name, buffer] of outputs) {
    const url = new URL(name, OUT_DIR);
    await writeFile(url, buffer);
    const { size } = await stat(url);
    console.log(`wrote ${name} (${size} bytes)`);
  }
}

main().catch((err) => {
  console.error('fixture generation failed:', err);
  process.exit(1);
});
