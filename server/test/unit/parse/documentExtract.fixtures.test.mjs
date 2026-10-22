/**
 * Local integration tests: `documentExtract` composed over the REAL fixtures
 * with the REAL default PDF seam (`pdfText.mjs`). Unlike the unit tests for
 * each module, these lock the end-to-end offline pipeline exactly as the CLI
 * exercises it — real bytes, real pdf.js, no injected ops, no network, no
 * graph, no credentials required (bare `npm test` must stay green).
 *
 * Run: `npm --prefix server run test` (covered by test/unit/**).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  DOCX_DEFERRED_REASON,
  FICTIONAL_LABEL,
  PATTERN_CAVEAT,
  PARSE_ANALYSIS_VERSION,
  EXTRACTION_SCHEMA_VERSION,
  validateExtractionRecord,
} from '../../../parse/schema.mjs';
import { extractDocument } from '../../../parse/documentExtract.mjs';

/** Fixture bytes via vitest-stable URL (../../parse/fixtures from test/unit/parse). */
const fixtureBytes = (name) => new Uint8Array(
  readFileSync(new URL('../../../parse/fixtures/' + name, import.meta.url)),
);

const NOW = '2026-01-01T00:00:00Z';

describe('documentExtract — real fixtures, real default seam (offline M9 integration)', () => {
  it('2-page article PDF: schemas-clean record, cross-page DOI dedupe, References entries, coordinates', async () => {
    const bytes = fixtureBytes('synthetic-article-2p.pdf');
    const record = await extractDocument(bytes, { fileName: 'synthetic-article-2p.pdf', format: 'pdf', now: NOW });

    expect(record.schema).toBe(EXTRACTION_SCHEMA_VERSION);
    expect(record.analysisVersion).toBe(PARSE_ANALYSIS_VERSION);
    expect(record.source.format).toBe('pdf');
    expect(record.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.extraction.attempted).toBe(true);
    expect(record.extraction.coordinatesSupported).toBe(true);
    expect(record.extraction.pages).toHaveLength(2);
    // First text line of the whole document is the fixture label — verbatim.
    expect(record.extraction.pages[0].lines[0].text.slice(0, FICTIONAL_LABEL.length)).toBe(FICTIONAL_LABEL);

    // The page-1 DOI (URL + raw forms) repeats in the page-2 reference list:
    // ONE key, 3 occurrences, first seen on page 1.
    const doi003 = record.dois.find((d) => d.doi === '10.5555/aft-fixture-003');
    expect(doi003).toBeDefined();
    expect(doi003.occurrences).toBe(3);
    expect(doi003.firstPage).toBe(1);
    expect(doi003.provenanceKind).toBe('observed');

    // References section detected with 4 entries; entry 1 carries the repeated DOI.
    expect(record.references.sections.found).toBe(true);
    expect(record.references.detected).toHaveLength(4);
    expect(record.references.detected[0].doi).toBe('10.5555/aft-fixture-003');
    expect(record.references.detected.every((e) => e.provenanceKind === 'observed')).toBe(true);

    // Trailing-punctuation DOI from entry 4 is stripped in the DOI list.
    expect(record.dois.map((d) => d.doi)).toContain('10.5555/aft-fixture-005');

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.honesty.caveats).toContain(PATTERN_CAVEAT);
  });

  it('1-page article PDF: body-prose DOI occurrence counted alongside the reference URL', async () => {
    const record = await extractDocument(fixtureBytes('synthetic-article-1p.pdf'), {
      fileName: 'synthetic-article-1p.pdf', format: 'pdf', now: NOW,
    });

    const doi001 = record.dois.find((d) => d.doi === '10.5555/aft-fixture-001');
    expect(doi001).toBeDefined();
    // Body prose occurrence + reference-list URL occurrence.
    expect(doi001.occurrences).toBe(2);
    expect(record.extraction.pages).toHaveLength(1);
    expect(validateExtractionRecord(record)).toEqual([]);
  });

  it('image-only PDF: attempted-but-honest state — no text layer, no invented detections', async () => {
    const record = await extractDocument(fixtureBytes('synthetic-scanned-image-only.pdf'), {
      fileName: 'synthetic-scanned-image-only.pdf', format: 'pdf', now: NOW,
    });

    expect(record.extraction.attempted).toBe(true);
    expect(record.extraction.textLength).toBe(0);
    expect(record.extraction.pages[0].lines).toHaveLength(0);
    expect(record.dois).toHaveLength(0);
    const noTextNotes = record.extraction.notes.filter((n) => n.includes('no extractable text'));
    expect(noTextNotes.length).toBeGreaterThanOrEqual(1);
    expect(record.extraction.notes.join(' ')).toContain('No text layer was recoverable');
    // Nothing text-based can be claimed — but the record itself stays valid.
    expect(validateExtractionRecord(record)).toEqual([]);
  });

  it('TXT notes fixture: single pseudo-page, coordinateless lines, References segmented', async () => {
    const record = await extractDocument(fixtureBytes('synthetic-notes.txt'), {
      fileName: 'synthetic-notes.txt', format: 'txt', now: NOW,
    });

    expect(record.source.format).toBe('txt');
    expect(record.extraction.coordinatesSupported).toBe(false);
    expect(record.extraction.pages).toHaveLength(1);
    // Coordinate members are OMITTED (never placeholder zeros).
    for (const line of record.extraction.pages[0].lines) {
      expect(Object.prototype.hasOwnProperty.call(line, 'x')).toBe(false);
    }
    expect(record.references.sections.found).toBe(true);
    expect(record.references.detected.length).toBeGreaterThanOrEqual(2);
    expect(record.dois.some((d) => d.doi === '10.5555/aft-fixture-001')).toBe(true);
    expect(validateExtractionRecord(record)).toEqual([]);
  });

  it('DOCX the honesty stub: deferred reason verbatim, nothing scanned, record stays valid', async () => {
    const record = await extractDocument(fixtureBytes('synthetic-notes.txt'), {
      fileName: 'fake.docx', format: 'docx', now: NOW,
    });

    expect(record.extraction.attempted).toBe(false);
    expect(record.extraction.reason).toBe(DOCX_DEFERRED_REASON);
    expect(record.extraction.pages).toBeUndefined();
    expect(record.dois).toHaveLength(0);
    expect(validateExtractionRecord(record)).toEqual([]);
  });

  it('unknown format: honest no-scan state, no guess, no fabrication', async () => {
    const record = await extractDocument(fixtureBytes('synthetic-notes.txt'), {
      fileName: 'mystery.bin', format: 'zzz', now: NOW,
    });

    expect(record.extraction.attempted).toBe(false);
    expect(record.dois).toHaveLength(0);
    expect(validateExtractionRecord(record)).toEqual([]);
  });
});
