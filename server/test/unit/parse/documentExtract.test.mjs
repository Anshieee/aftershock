/**
 * Unit tests for `server/parse/documentExtract.mjs` — the canonical per-format
 * dispatcher that composes TXT decoding + reference segmentation + DOI
 * collection into ONE schema-valid `documentExtract-1` record.
 *
 * PDF is exercised ONLY through an injected fake op. The default lazy PDF
 * import seam is deliberately not exercised here: the real import is
 * integration-tested by the CLI/orchestrator so this module's tests stay
 * decoupled from the parallel PDF task (and pass whether or not that file
 * exists in the checkout). Synthetic text only — no real manuscripts.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DOCX_DEFERRED_REASON,
  EXTRACTION_SCHEMA_VERSION,
  PARSE_ANALYSIS_VERSION,
  PATTERN_CAVEAT,
  UNKNOWN_FORMAT_REASON,
  validateExtractionRecord,
} from '../../../parse/schema.mjs';
import { extractDocument } from '../../../parse/documentExtract.mjs';

const enc = new TextEncoder();
const bytesOf = (text) => enc.encode(text);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const TXT_DOC = [
  'Title line mentioning 10.5555/aft-x-001 and 10.5555/aft-x-002 in prose.',
  '',
  'References',
  '[1] Demo, A. (2020). A local fixture study. https://doi.org/10.5555/aft-x-001',
  '[2] Sample, B. (2021). Second fixture 10.5555/aft-x-002.',
].join('\n');

/** A schema-valid fake PDF page line. */
const pdfLine = (order, text) => ({
  order,
  text,
  x: 0,
  y: 0,
  width: 100,
  height: 12,
});

const FAKE_PDF_SHAPE = {
  attempted: true,
  coordinatesSupported: true,
  truncated: false,
  textLength: 260,
  notes: [],
  pages: [
    {
      index: 1,
      lines: [
        pdfLine(1, 'Page one body cites 10.5555/aft-pdf-001 in passing.'),
        pdfLine(2, 'Unrelated page-one sentence.'),
      ],
    },
    {
      index: 2,
      lines: [
        pdfLine(1, 'References'),
        pdfLine(2, '[1] Demo, A. (2020). A fixture. https://doi.org/10.5555/aft-pdf-001'),
        pdfLine(3, '[2] Other, B. (2021). No identifier here.'),
      ],
    },
  ],
};

describe('parse/documentExtract — TXT', () => {
  it('builds one schema-valid record with entries, entry DOIs and aggregated occurrences', async () => {
    const bytes = bytesOf(TXT_DOC);
    const record = await extractDocument(bytes, {
      format: 'txt',
      fileName: 'notes.txt',
      now: '2026-01-01T00:00:00Z',
      pdfExtractOp: async () => {
        throw new Error('should not be called');
      },
    });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.schema).toBe(EXTRACTION_SCHEMA_VERSION);
    expect(record.analysisVersion).toBe(PARSE_ANALYSIS_VERSION);
    expect(record.generatedAt).toBe('2026-01-01T00:00:00Z');
    expect(record.source.format).toBe('txt');
    expect(record.source.fileName).toBe('notes.txt');
    expect(record.source.sizeBytes).toBe(bytes.byteLength);
    expect(record.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.source.sha256).toBe(sha256(bytes));

    expect(record.extraction.attempted).toBe(true);
    expect(record.extraction.coordinatesSupported).toBe(false);
    expect(record.extraction.truncated).toBe(false);
    expect(record.extraction.textLength).toBe(TXT_DOC.length);
    expect(record.extraction.pages).toHaveLength(1);
    expect(record.extraction.pages[0].index).toBe(1);

    // Blank source line 2 is not a valid schema line and is omitted; the
    // remaining lines keep their original 1-based `order`.
    expect(record.extraction.pages[0].lines.map((line) => line.order)).toEqual([1, 3, 4, 5]);
    expect(
      record.extraction.pages[0].lines.every((line) => line.text.trim().length > 0),
    ).toBe(true);

    expect(record.references.attempted).toBe(true);
    expect(record.references.sections.found).toBe(true);
    expect(record.references.sections.startIndex).toBe(3);
    expect(record.references.sections.headingText).toBe('References');
    expect(record.references.sections.segmentation).toBe('numbered');
    expect(record.references.detected).toHaveLength(2);
    expect(record.references.detected[0].doi).toBe('10.5555/aft-x-001');
    expect(record.references.detected[0].firstLineIndex).toBe(4);
    expect(record.references.detected[0].pageIndex).toBe(1);
    expect(record.references.detected[1].doi).toBe('10.5555/aft-x-002');
    expect(record.references.detected[1].createdAt).toBeNull();
    expect(record.references.detected[0].provenanceKind).toBe('observed');

    const first = record.dois.find((doi) => doi.doi === '10.5555/aft-x-001');
    expect(first).toBeDefined();
    expect(first.occurrences).toBe(2); // once in body, once in the reference entry
    expect(first.firstPage).toBe(1);
    expect(first.firstLineIndex).toBe(1);
    expect(first.provenanceKind).toBe('observed');
    expect(first.createdAt).toBeNull();
    const second = record.dois.find((doi) => doi.doi === '10.5555/aft-x-002');
    expect(second.occurrences).toBe(2);

    expect(record.honesty.caveats[0]).toBe(PATTERN_CAVEAT);
    expect(record.honesty.caveats).toContain(PATTERN_CAVEAT);
    expect(record.honesty.caveats).toHaveLength(3);
  });

  it('still extracts body DOIs when no references heading exists', async () => {
    const body = 'Intro cites 10.5555/aft-body-001 only.\nNo heading follows.';
    const record = await extractDocument(bytesOf(body), { format: 'txt' });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.references.sections.found).toBe(false);
    expect(record.references.sections.startIndex).toBeNull();
    expect(record.references.sections.headingText).toBeNull();
    expect(record.references.sections.note).toContain('No standalone reference heading');
    expect(record.references.detected).toEqual([]);
    expect(record.dois.map((doi) => doi.doi)).toEqual(['10.5555/aft-body-001']);
  });

  it('reports absent/non-Uint8Array bytes honestly and still validates', async () => {
    const record = await extractDocument(null, {
      format: 'txt',
      fileName: 'missing.txt',
    });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.source.format).toBe('txt');
    expect(record.source.sizeBytes).toBe(0);
    expect(record.source.sha256).toBe('');
    expect(record.extraction.attempted).toBe(false);
    expect(record.extraction.reason).toContain('No document bytes were provided');
    expect(record.extraction.pages).toBeUndefined();
    expect(record.references.attempted).toBe(false);
    expect(record.references.reason).toContain('reference detection not attempted');
    expect(record.dois).toEqual([]);
  });

  it('handles empty bytes as a successful, empty pseudo-page extraction', async () => {
    const record = await extractDocument(new Uint8Array(0), { format: 'txt' });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.source.sizeBytes).toBe(0);
    expect(record.source.sha256).toBe(sha256(new Uint8Array(0)));
    expect(record.extraction.attempted).toBe(true);
    expect(record.extraction.textLength).toBe(0);
    expect(record.extraction.pages).toEqual([{ index: 1, lines: [] }]);
    expect(record.dois).toEqual([]);
  });

  it('notes multiple distinct identifiers inside one entry and attaches only the first', async () => {
    const doc = [
      'References',
      '[1] One 10.5555/aft-a-001 and two 10.5555/aft-b-002.',
      '[2] Three 10.5555/aft-c-003.',
    ].join('\n');
    const record = await extractDocument(bytesOf(doc), { format: 'txt' });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.references.detected[0].doi).toBe('10.5555/aft-a-001');
    expect(record.references.sections.note).toContain(
      'contains multiple distinct identifiers',
    );
    expect(record.references.detected).toHaveLength(2);
  });

  it('keeps entries without identifiers as null DOI search leads', async () => {
    const doc = ['References', '[1] No identifier.', '[2] Also none.'].join('\n');
    const record = await extractDocument(bytesOf(doc), { format: 'txt' });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.references.sections.segmentation).toBe('numbered');
    expect(record.references.detected).toHaveLength(2);
    expect(record.references.detected.map((entry) => entry.doi)).toEqual([null, null]);
    expect(record.dois).toEqual([]);
  });

  it('discloses skipped segmentation when fewer than two markers exist', async () => {
    const doc = ['References', '[1] Only one marker.'].join('\n');
    const record = await extractDocument(bytesOf(doc), { format: 'txt' });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.references.sections.found).toBe(true);
    expect(record.references.sections.segmentation).toBe('unsegmented');
    expect(record.references.sections.note).toContain('Fewer than two numbered reference markers');
    expect(record.references.detected).toEqual([]);
  });
});

describe('parse/documentExtract — deferred and unknown formats', () => {
  it('honestly defers DOCX without invoking the PDF op', async () => {
    let pdfCalls = 0;
    const record = await extractDocument(bytesOf('irrelevant bytes'), {
      format: 'DOCX',
      fileName: 'manuscript.docx',
      pdfExtractOp: async () => {
        pdfCalls += 1;
        throw new Error('should not be called');
      },
    });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(pdfCalls).toBe(0);
    expect(record.source.format).toBe('docx');
    expect(record.extraction.attempted).toBe(false);
    expect(record.extraction.reason).toBe(DOCX_DEFERRED_REASON);
    expect(record.extraction.pages).toBeUndefined();
    expect(record.references.attempted).toBe(false);
    expect(record.references.reason).toContain('DOCX text extraction is not implemented');
    expect(record.dois).toEqual([]);
  });

  it('honestly reports an unrecognized declared format', async () => {
    const record = await extractDocument(bytesOf('plain'), {
      format: ' RTF ',
      fileName: 'paper.rtf',
    });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.source.format).toBe('rtf');
    expect(record.extraction.attempted).toBe(false);
    expect(record.extraction.reason).toBe(UNKNOWN_FORMAT_REASON);
    expect(record.references.attempted).toBe(false);
    expect(record.references.reason).toBe('Unknown format; reference detection not attempted.');
    expect(record.dois).toEqual([]);
  });

  it('treats an absent format as unknown', async () => {
    const record = await extractDocument(bytesOf('plain'), {});
    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.source.format).toBe('unknown');
    expect(record.extraction.reason).toBe(UNKNOWN_FORMAT_REASON);
  });
});

describe('parse/documentExtract — PDF via injected op', () => {
  it('extracts pages, global line indexes and entry-to-page mappings', async () => {
    const bytes = bytesOf('%PDF-fake');
    let calls = 0;
    const record = await extractDocument(bytes, {
      format: '  PDF ',
      fileName: 'paper.pdf',
      now: '2026-02-02T00:00:00Z',
      pdfExtractOp: async (received) => {
        calls += 1;
        expect(received).toBe(bytes);
        return FAKE_PDF_SHAPE;
      },
    });

    expect(calls).toBe(1);
    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.source.format).toBe('pdf');
    expect(record.extraction.attempted).toBe(true);
    expect(record.extraction.coordinatesSupported).toBe(true);
    expect(record.extraction.pages).toEqual(FAKE_PDF_SHAPE.pages);

    // Global line numbers run across pages: page 1 lines are 1-2, page 2 lines
    // are 3-5. The heading is global line 3; entries start at 4 and 5.
    expect(record.references.sections.found).toBe(true);
    expect(record.references.sections.startIndex).toBe(3);
    expect(record.references.detected).toHaveLength(2);
    expect(record.references.detected[0].doi).toBe('10.5555/aft-pdf-001');
    expect(record.references.detected[0].firstLineIndex).toBe(4);
    expect(record.references.detected[0].pageIndex).toBe(2);
    expect(record.references.detected[0].pageLineIndex).toBe(2);

    const doi = record.dois.find((entry) => entry.doi === '10.5555/aft-pdf-001');
    expect(doi).toBeDefined();
    expect(doi.occurrences).toBe(2);
    expect(doi.firstPage).toBe(1); // body occurrence on page 1
    expect(doi.firstLineIndex).toBe(1);
  });

  it('appends the standing truncation caveat when the PDF op reports truncation', async () => {
    const record = await extractDocument(bytesOf('%PDF-truncated'), {
      format: 'pdf',
      fileName: 'paper.pdf',
      now: '2026-02-02T00:00:00Z',
      pdfExtractOp: async () => ({
        ...FAKE_PDF_SHAPE,
        // Only page 1 was kept (e.g. page budget); the dispatcher must add
        // the standing truncation caveat to the human-facing honesty block.
        truncated: true,
        pages: FAKE_PDF_SHAPE.pages.slice(0, 1),
        textLength: 120,
        notes: ['Document has 9 pages; only the first 1 were extracted (page budget).'],
      }),
    });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.extraction.truncated).toBe(true);
    // Keep in sync with documentExtract.mjs TRUNCATION_CAVEAT (module-internal).
    expect(record.honesty.caveats).toContain(
      'Extraction was truncated by a size/page budget; later content was not scanned.',
    );
  });

  it('propagates an honest attempted:false PDF result', async () => {
    const record = await extractDocument(bytesOf('%PDF'), {
      format: 'pdf',
      pdfExtractOp: async () => ({
        attempted: false,
        reason: 'This synthetic PDF yielded no readable text.',
      }),
    });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.extraction.attempted).toBe(false);
    expect(record.extraction.reason).toBe('This synthetic PDF yielded no readable text.');
    expect(record.extraction.pages).toBeUndefined();
    expect(record.references.attempted).toBe(false);
    expect(record.references.reason).toBe('PDF text unavailable; reference detection not attempted.');
    expect(record.dois).toEqual([]);
  });

  it('accepts an attempted PDF with no pages as an empty, valid extraction', async () => {
    const record = await extractDocument(bytesOf('%PDF'), {
      format: 'pdf',
      pdfExtractOp: async () => ({
        attempted: true,
        coordinatesSupported: false,
        truncated: false,
        pages: [],
        textLength: 0,
        notes: [],
      }),
    });

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.extraction.attempted).toBe(true);
    expect(record.extraction.pages).toEqual([]);
    expect(record.references.attempted).toBe(true);
    expect(record.references.sections.found).toBe(false);
    expect(record.dois).toEqual([]);
  });

  it('does not throw when the injected op throws, and reports honestly', async () => {
    let record;
    await expect(
      (async () => {
        record = await extractDocument(bytesOf('%PDF'), {
          format: 'pdf',
          pdfExtractOp: async () => {
            throw new Error('boom: secret-ish internal detail');
          },
        });
      })(),
    ).resolves.toBeUndefined();

    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record.extraction.attempted).toBe(false);
    expect(record.extraction.reason).toContain('failed unexpectedly');
    expect(record.extraction.reason).not.toContain('boom');
    expect(record.dois).toEqual([]);
  });
});

describe('parse/documentExtract — record contract', () => {
  it('emits top-level members in the documented order', async () => {
    const record = await extractDocument(bytesOf('hello'), { format: 'txt' });
    expect(Object.keys(record)).toEqual([
      'schema',
      'analysisVersion',
      'generatedAt',
      'source',
      'extraction',
      'references',
      'dois',
      'honesty',
    ]);
  });

  it('defaults generatedAt to an ISO timestamp and fileName to an empty string', async () => {
    const record = await extractDocument(bytesOf('hello'), { format: 'txt' });
    expect(record.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.source.fileName).toBe('');
  });
});
