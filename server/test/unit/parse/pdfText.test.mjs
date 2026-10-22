/**
 * Unit tests for `server/parse/pdfText.mjs` — M9 offline PDF text extraction
 * via the pinned `pdfjs-dist@4.10.38` legacy ESM build.
 *
 * Honesty rules under test: extraction is 100 % local (no OCR, no network,
 * no graph writes); every line carries `observed` provenance with the
 * module's text-layer rationale and `parse-1`; page-budget truncation and
 * no-text-layer pages are DISCLOSED in `notes`, never fabricated; every
 * failure surfaces as `{ attempted: false, reason }` with a fixed string —
 * raw pdf.js error text/stacks never leak into results (content-redaction
 * rule), and the function NEVER throws. Synthetic fixtures only (see
 * `server/parse/fixtures/README.md`) — no real manuscripts.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractPdfText } from '../../../parse/pdfText.mjs';
import {
  DETECTION_PROVENANCE_KIND,
  MAX_PDF_PAGES_EXTRACTED,
  PARSE_ANALYSIS_VERSION,
} from '../../../parse/schema.mjs';

/**
 * Intentionally a LITERAL, not an import: if the module's rationale string
 * ever drifts, this test must break (self-referential imports cannot).
 */
const LINE_RATIONALE =
  'Recovered from the document text layer with reading-order grouping by pdf.js (offline).';

const BUDGET_NOTE_2P =
  'Document has 2 pages; only the first 1 were extracted (page budget).';
const NO_TEXT_PAGE_NOTE =
  'Page 1 contains no extractable text (no text layer — likely a scanned image); no OCR was performed.';
const NO_TEXT_DOC_NOTE =
  'No text layer was recoverable from this PDF; nothing text-based can be detected.';
const GROUPING_NOTE =
  'Line grouping is a deterministic MVP heuristic (end-of-line markers plus a 2.0-unit baseline jump); no full layout reconstruction was performed.';

const fixtureUrl = (name) => new URL(`../../../parse/fixtures/${name}`, import.meta.url);
const fixtureBytes = (name) => new Uint8Array(readFileSync(fixtureUrl(name)));

/** qpdf is only needed by the password test; skip it honestly when absent. */
const HAVE_QPDF = spawnSync('qpdf', ['--version'], { stdio: 'ignore' }).status === 0;

describe('pdfText — fixture extraction (happy paths)', () => {
  it('extracts both pages of the 2-page article: header line first, DOI URL line, finite coordinates', async () => {
    const result = await extractPdfText(fixtureBytes('synthetic-article-2p.pdf'));

    expect(result.attempted).toBe(true);
    expect(result.coordinatesSupported).toBe(true);
    expect(result.truncated).toBe(false); // 2 pages < schema budget (120)
    expect(result.pages).toHaveLength(2);
    expect(result.pages.map((p) => p.index)).toEqual([1, 2]);
    expect(result.pages.every((p) => p.order === p.index)).toBe(true);
    expect(result.pages.every((p) => p.lines.length > 0 && p.charCount > 0)).toBe(true);

    // The FICTIONAL / GUIDED DEMO header must be the first extracted line.
    expect(result.pages[0].lines[0].text).toContain('FICTIONAL / GUIDED DEMO');

    // A line carries the DOI in `doi.org` URL form (fixture page 1 and 2).
    const doiLines = result.pages
      .flatMap((p) => p.lines)
      .filter((l) => l.text.includes('https://doi.org/10.5555/aft-fixture-003'));
    expect(doiLines.length).toBeGreaterThan(0);

    // Every line of every page: finite, positive-sane geometry and 1-based order.
    for (const page of result.pages) {
      page.lines.forEach((line, i) => {
        expect(line.order).toBe(i + 1);
        expect(typeof line.text).toBe('string');
        expect(line.text.length).toBeGreaterThan(0);
        for (const key of ['x', 'y', 'width', 'height']) {
          expect(Number.isFinite(line[key])).toBe(true);
        }
        expect(line.width).toBeGreaterThan(0); // right edge minus line origin
      });
      expect(page.charCount).toBe(page.lines.reduce((n, l) => n + l.text.length, 0));
    }

    // textLength is the sum of the page charCounts.
    expect(result.textLength).toBe(
      result.pages.reduce((n, p) => n + p.charCount, 0),
    );
    expect(result.textLength).toBeGreaterThan(0);
    expect(Array.isArray(result.notes)).toBe(true);
    expect(result.notes.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
  });

  it('applies the page budget: maxPages 1 extracts one page and discloses the truncation', async () => {
    const result = await extractPdfText(fixtureBytes('synthetic-article-2p.pdf'), {
      maxPages: 1,
    });
    expect(result.attempted).toBe(true);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].index).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.notes).toContain(BUDGET_NOTE_2P);
  });

  it('extracts the 1-page article with one page and positive textLength', async () => {
    const result = await extractPdfText(fixtureBytes('synthetic-article-1p.pdf'));
    expect(result.attempted).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].index).toBe(1);
    expect(result.pages[0].lines.length).toBeGreaterThan(0);
    expect(result.textLength).toBeGreaterThan(0);
  });

  it('discloses the scanned image-only PDF: attempted, zero text, no OCR, both notes', async () => {
    const result = await extractPdfText(fixtureBytes('synthetic-scanned-image-only.pdf'));
    expect(result.attempted).toBe(true); // the extractor genuinely ran
    expect(result.coordinatesSupported).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.textLength).toBe(0);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].lines).toEqual([]);
    expect(result.pages[0].charCount).toBe(0);
    // Exactly the two honest disclosures — nothing fabricated, nothing extra.
    expect(result.notes).toEqual([NO_TEXT_PAGE_NOTE, NO_TEXT_DOC_NOTE]);
  });

  it('carries observed-only provenance, the text-layer rationale, parse-1, and null createdAt on every line', async () => {
    const result = await extractPdfText(fixtureBytes('synthetic-article-2p.pdf'));
    let lineCount = 0;
    for (const page of result.pages) {
      for (const line of page.lines) {
        lineCount += 1;
        expect(line.provenanceKind).toBe('observed');
        expect(line.provenanceKind).toBe(DETECTION_PROVENANCE_KIND);
        expect(line.provenanceKind).not.toBe('source_verified');
        expect(line.provenanceKind).not.toBe('human_confirmed');
        expect(line.rationale).toBe(LINE_RATIONALE);
        expect(line.rationale).not.toBe(
          'Regex/pattern match on locally extracted text (offline); no external lookup performed.',
        );
        expect(line.analysisVersion).toBe('parse-1');
        expect(line.analysisVersion).toBe(PARSE_ANALYSIS_VERSION);
        expect(line.createdAt).toBeNull();
      }
    }
    expect(lineCount).toBeGreaterThan(0); // the loop above actually ran
  });

  it('leaves the caller\'s byte array untouched (pdf.js receives a copy, not the buffer)', async () => {
    const bytes = fixtureBytes('synthetic-article-1p.pdf');
    const before = bytes.slice();
    const result = await extractPdfText(bytes);
    expect(result.attempted).toBe(true);
    expect(bytes).toEqual(before); // no detach, no mutation
  });

  it('discloses the MVP line-grouping heuristic in the notes of a text-bearing document', async () => {
    const result = await extractPdfText(fixtureBytes('synthetic-article-1p.pdf'));
    expect(result.notes).toContain(GROUPING_NOTE);
  });
});

describe('pdfText — honest failure states (never throws)', () => {
  it('returns an honest reason for an empty document', async () => {
    const result = await extractPdfText(new Uint8Array(0));
    expect(result).toEqual({
      attempted: false,
      reason: 'Empty document; nothing was parsed.',
    });
  });

  it('returns an honest reason for absent or non-bytes input', async () => {
    for (const input of [undefined, null, 'not bytes', 42]) {
      const result = await extractPdfText(/** @type {any} */ (input));
      expect(result).toEqual({
        attempted: false,
        reason: 'No document bytes were provided; nothing was parsed.',
      });
    }
  });

  it('maps invalid PDF bytes to a generic parse-failed reason without leaking content', async () => {
    const invalid = new TextEncoder().encode('not a pdf');
    // Must resolve (not throw) even though pdf.js rejects internally.
    const result = await extractPdfText(invalid);
    expect(result.attempted).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason).toMatch(/^PDF parsing failed \(.+\); nothing was parsed\.$/);
    expect(result.reason).not.toContain('not a pdf'); // content redaction
    expect(result.reason).not.toContain('at '); // no stack fragments
    expect(Object.keys(result)).toEqual(['attempted', 'reason']); // no pages leaked
  });

  it.skipIf(!HAVE_QPDF)('maps a password-protected PDF to the password reason (qpdf-generated)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftershock-pdftext-'));
    const locked = join(dir, 'locked.pdf');
    try {
      execFileSync('qpdf', [
        '--encrypt', 'testpw', 'ownerpw', '256', '--',
        fileURLToPath(fixtureUrl('synthetic-article-1p.pdf')),
        locked,
      ]);
      const result = await extractPdfText(new Uint8Array(readFileSync(locked)));
      expect(result).toEqual({
        attempted: false,
        reason: 'The PDF is password-protected; nothing was parsed.',
      });
      expect(result.reason).not.toContain('testpw'); // never leak error details
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to the schema page budget when maxPages is not a positive integer', async () => {
    for (const maxPages of [0, -3, 2.5, 'x', null]) {
      const result = await extractPdfText(fixtureBytes('synthetic-article-2p.pdf'), {
        maxPages: /** @type {any} */ (maxPages),
      });
      expect(result.attempted).toBe(true);
      expect(result.truncated).toBe(false); // fell back to MAX_PDF_PAGES_EXTRACTED = 120
      expect(result.pages).toHaveLength(2);
      expect(MAX_PDF_PAGES_EXTRACTED).toBe(120);
    }
  });
});
