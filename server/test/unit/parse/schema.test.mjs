/**
 * Contract tests for `server/parse/schema.mjs` — M9 offline extraction record.
 *
 * These tests freeze the wire contract (every constant is pinned verbatim) and
 * pin the validator's honesty rules: it returns human-readable errors, never
 * throws, never coerces, and never demands optional/additive fields.
 * Synthetic values only — no real manuscripts.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFERRED_FORMATS,
  DETECTION_PROVENANCE_KIND,
  DETECTION_RATIONALE,
  DOCX_DEFERRED_REASON,
  EXTRACTION_SCHEMA_VERSION,
  FICTIONAL_LABEL,
  MAX_DECODE_BYTES,
  MAX_PDF_PAGES_EXTRACTED,
  MAX_REFERENCE_ENTRIES,
  MAX_SNIPPET_LENGTH,
  MAX_UNIQUE_DOIS,
  PARSE_ANALYSIS_VERSION,
  PATTERN_CAVEAT,
  SUPPORTED_FORMATS,
  UNKNOWN_FORMAT_REASON,
  isPlainObject,
  validateExtractionRecord,
} from '../../../parse/schema.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

/** A valid record where nothing was scanned (deferred format). */
const validNotAttempted = () => ({
  schema: EXTRACTION_SCHEMA_VERSION,
  analysisVersion: PARSE_ANALYSIS_VERSION,
  generatedAt: '2026-10-22T12:00:00.000Z',
  source: {
    format: 'docx',
    fileName: 'manuscript.docx',
    sizeBytes: 4096,
    sha256: 'a'.repeat(64),
  },
  extraction: {
    attempted: false,
    reason: DOCX_DEFERRED_REASON,
  },
  honesty: { caveats: [PATTERN_CAVEAT] },
});

/** A valid minimal extraction: TXT, one page, one line, no real coordinates. */
const validAttempted = () => ({
  schema: EXTRACTION_SCHEMA_VERSION,
  analysisVersion: PARSE_ANALYSIS_VERSION,
  generatedAt: '2026-10-22T12:00:00.000Z',
  source: {
    format: 'txt',
    fileName: 'notes.txt',
    sizeBytes: 128,
    sha256: 'b'.repeat(64),
  },
  extraction: {
    attempted: true,
    format: 'txt',
    coordinatesSupported: false,
    truncated: false,
    pages: [
      {
        index: 1,
        lines: [{ text: 'first synthetic line', x: 0, y: 0, width: 10, height: 12 }],
      },
    ],
  },
  honesty: { caveats: [PATTERN_CAVEAT] },
});

/**
 * Asserts the validator returned at least one non-empty string error and did
 * not throw. Returns the errors for further assertions.
 */
const expectErrors = (record) => {
  let errors;
  expect(() => {
    errors = validateExtractionRecord(record);
  }).not.toThrow();
  expect(Array.isArray(errors)).toBe(true);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every((error) => typeof error === 'string' && error.length > 0)).toBe(true);
  return errors;
};

describe('parse/schema — constants of record', () => {
  it('pins the version identifiers verbatim', () => {
    expect(EXTRACTION_SCHEMA_VERSION).toBe('documentExtract-1');
    expect(PARSE_ANALYSIS_VERSION).toBe('parse-1');
  });

  it('pins the honesty strings verbatim', () => {
    expect(PATTERN_CAVEAT).toBe(
      'Detected by pattern matching on locally extracted text; unverified — presence in a document proves nothing about citation validity, claim support, or publication status.',
    );
    expect(FICTIONAL_LABEL).toBe('FICTIONAL / GUIDED DEMO');
    expect(DOCX_DEFERRED_REASON).toBe(
      'DOCX text extraction is not implemented in the local parse tier; nothing was scanned.',
    );
    expect(UNKNOWN_FORMAT_REASON).toBe(
      'Format not recognized by the local parse tier; nothing was scanned.',
    );
  });

  it('pins detection provenance to pattern-observed only', () => {
    expect(DETECTION_PROVENANCE_KIND).toBe('observed');
    expect(DETECTION_RATIONALE).toBe(
      'Regex/pattern match on locally extracted text (offline); no external lookup performed.',
    );
    // A pattern match must never masquerade as verification.
    expect(DETECTION_PROVENANCE_KIND).not.toBe('source_verified');
    expect(DETECTION_PROVENANCE_KIND).not.toBe('human_confirmed');
  });

  it('pins the budgets verbatim', () => {
    expect(MAX_DECODE_BYTES).toBe(524_288);
    expect(MAX_PDF_PAGES_EXTRACTED).toBe(120);
    expect(MAX_UNIQUE_DOIS).toBe(50);
    expect(MAX_REFERENCE_ENTRIES).toBe(200);
    expect(MAX_SNIPPET_LENGTH).toBe(120);
  });

  it('pins the supported and deferred format lists and freezes them', () => {
    expect(SUPPORTED_FORMATS).toEqual(['txt', 'pdf']);
    expect(DEFERRED_FORMATS).toEqual(['docx']);
    expect(Object.isFrozen(SUPPORTED_FORMATS)).toBe(true);
    expect(Object.isFrozen(DEFERRED_FORMATS)).toBe(true);
  });
});

describe('parse/schema — isPlainObject', () => {
  it('accepts object literals and null-prototype objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it('rejects null, arrays, primitives, functions, and class instances', () => {
    for (const value of [null, undefined, [], ['a'], 'x', 42, 0, true, () => {}, new Date(), new Map()]) {
      expect(isPlainObject(value)).toBe(false);
    }
  });
});

describe('parse/schema — validateExtractionRecord accepts valid records', () => {
  it('returns [] for a minimal attempted:false (deferred) record', () => {
    expect(validateExtractionRecord(validNotAttempted())).toEqual([]);
  });

  it('returns [] for a minimal attempted:true record with one page and one line', () => {
    expect(validateExtractionRecord(validAttempted())).toEqual([]);
  });

  it('does not mutate the record it validates', () => {
    const record = validAttempted();
    const before = clone(record);
    expect(validateExtractionRecord(record)).toEqual([]);
    expect(record).toEqual(before);
  });

  it('accepts an attempted page with an empty lines array and pages without lines', () => {
    const empty = validAttempted();
    empty.extraction.pages = [{ index: 1, lines: [] }, { index: 2 }];
    expect(validateExtractionRecord(empty)).toEqual([]);
  });

  it('ignores additive optional fields such as references and detections', () => {
    const record = validAttempted();
    record.references = [{ kind: 'reference-entry', text: '1. Synthetic entry.' }];
    record.detections = [{ kind: 'doi', text: '10.1234/example', provenanceKind: DETECTION_PROVENANCE_KIND }];
    expect(validateExtractionRecord(record)).toEqual([]);
  });
});

describe('parse/schema — validateExtractionRecord rejects malformed records', () => {
  it('rejects a wrong schema version', () => {
    const record = validAttempted();
    record.schema = 'documentExtract-2';
    expectErrors(record);
  });

  it('rejects a wrong analysisVersion', () => {
    const record = validAttempted();
    record.analysisVersion = 'parse-0';
    expectErrors(record);
  });

  it('rejects attempted:false records that carry pages', () => {
    const record = validNotAttempted();
    record.extraction.pages = [];
    expectErrors(record);
  });

  it('rejects attempted:false records without a non-empty reason', () => {
    const record = validNotAttempted();
    record.extraction.reason = '   ';
    expectErrors(record);
  });

  it('rejects attempted:true records without a pages array', () => {
    const record = validAttempted();
    delete record.extraction.pages;
    expectErrors(record);
  });

  it('rejects attempted:true records with a non-boolean coordinatesSupported', () => {
    const record = validAttempted();
    record.extraction.coordinatesSupported = 'no';
    expectErrors(record);
  });

  it('rejects a page with a non-numeric line coordinate', () => {
    const record = validAttempted();
    record.extraction.pages[0].lines[0].x = 'left';
    expectErrors(record);
  });

  it('rejects a page with a NaN line coordinate', () => {
    const record = validAttempted();
    record.extraction.pages[0].lines[0].height = Number.NaN;
    expectErrors(record);
  });

  it('rejects a line with only some coordinate members (partial geometry)', () => {
    const record = validAttempted();
    delete record.extraction.pages[0].lines[0].y;
    expectErrors(record);
  });

  it('accepts a coordinateless line (placement-less source, e.g. plain text)', () => {
    const record = validAttempted();
    delete record.extraction.pages[0].lines[0].x;
    delete record.extraction.pages[0].lines[0].y;
    delete record.extraction.pages[0].lines[0].width;
    delete record.extraction.pages[0].lines[0].height;
    expect(validateExtractionRecord(record)).toEqual([]);
  });

  it('rejects a page with a zero or non-numeric index', () => {
    const zeroIndex = validAttempted();
    zeroIndex.extraction.pages[0].index = 0;
    expectErrors(zeroIndex);

    const stringIndex = validAttempted();
    stringIndex.extraction.pages[0].index = '1';
    expectErrors(stringIndex);
  });

  it('rejects a page line without text or with non-string text', () => {
    const missingText = validAttempted();
    delete missingText.extraction.pages[0].lines[0].text;
    expectErrors(missingText);

    const nonStringText = validAttempted();
    nonStringText.extraction.pages[0].lines[0].text = 42;
    expectErrors(nonStringText);
  });

  it('rejects a record missing source.sha256', () => {
    const record = validAttempted();
    delete record.source.sha256;
    expectErrors(record);
  });

  it('rejects a non-numeric or negative sizeBytes', () => {
    const stringSize = validAttempted();
    stringSize.source.sizeBytes = '128';
    expectErrors(stringSize);

    const negativeSize = validAttempted();
    negativeSize.source.sizeBytes = -1;
    expectErrors(negativeSize);
  });

  it("rejects generatedAt 'not-a-date'", () => {
    const record = validAttempted();
    record.generatedAt = 'not-a-date';
    expectErrors(record);
  });

  it('rejects caveats containing a non-string', () => {
    const record = validAttempted();
    record.honesty.caveats = [PATTERN_CAVEAT, 42];
    expectErrors(record);
  });

  it('rejects missing honesty or a non-array caveats field', () => {
    const missingHonesty = validAttempted();
    delete missingHonesty.honesty;
    expectErrors(missingHonesty);

    const nonArray = validAttempted();
    nonArray.honesty.caveats = PATTERN_CAVEAT;
    expectErrors(nonArray);
  });

  it('rejects non-object records without throwing', () => {
    for (const value of [null, undefined, 'record', 42, [], true]) {
      expectErrors(value);
    }
  });
});
