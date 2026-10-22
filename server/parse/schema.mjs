/**
 * @aftershock/server — canonical offline document-extraction record (M9).
 *
 * This module defines the NON-GRAPH, session-scoped record produced by the
 * local parse tier. Nothing here is persisted, uploaded, or written to
 * FalkorDB: the record lives in memory for the duration of a request (and in
 * the JSON body of an export, when the caller explicitly asks for it). Per
 * `docs/DATA_CONTRACTS.md` §2, no new node label, edge type, or property is
 * introduced by extraction results.
 *
 * SCIENTIFIC-INTEGRITY RULE (AGENTS.md): every DOI hit, reference entry,
 * section hit, or citation occurrence produced by future parse modules is a
 * PATTERN MATCH on locally extracted text. It is `observed` provenance only —
 * never `source_verified`, never `human_confirmed`. Presence in a document
 * proves nothing about citation validity, claim support, or publication
 * status. No external lookup is performed anywhere in this tier.
 *
 * Parsing is offline and bounded: TXT decoding is capped at
 * {@link MAX_DECODE_BYTES}, PDF page extraction at
 * {@link MAX_PDF_PAGES_EXTRACTED}. Exceeding either cap must be disclosed in
 * the record (`extraction.truncated`, `extraction.pagesExtracted`), never
 * silently ignored.
 *
 * Example record (attempted, one page, one line, TXT — no coordinates):
 *
 * ```js
 * {
 *   schema: 'documentExtract-1',
 *   analysisVersion: 'parse-1',
 *   generatedAt: '2026-10-22T12:00:00.000Z',
 *   source: {
 *     format: 'txt',
 *     fileName: 'notes.txt',
 *     sizeBytes: 128,
 *     sha256: '<64 hex chars>',
 *   },
 *   extraction: {
 *     attempted: true,
 *     format: 'txt',
 *     coordinatesSupported: false,
 *     truncated: false,
 *     pages: [{ index: 1, lines: [{ text: 'first line', x: 0, y: 0, width: 10, height: 12 }] }],
 *     pagesExtracted: 1,
 *     pagesAvailable: 1,
 *   },
 *   honesty: { caveats: [PATTERN_CAVEAT] },
 * }
 * ```
 *
 * @typedef {Object} ExtractionRecord
 * @property {string} schema Wire-format discriminator; always
 *   {@link EXTRACTION_SCHEMA_VERSION}. Consumers must reject unknown values.
 * @property {string} analysisVersion Version of the parsing logic that produced
 *   the record; always {@link PARSE_ANALYSIS_VERSION} for this module's output.
 *   It is repeated on every detection entry so mixed-version records remain
 *   auditable.
 * @property {string} generatedAt ISO-8601 timestamp (`YYYY-MM-DD…`) of record
 *   creation. Never a locale-formatted date.
 * @property {ExtractionSource} source What was read: format, original file
 *   name, byte size, and content hash. Hashes are of the received bytes, not a
 *   post-decode string.
 * @property {ExtractionBlock} extraction What the parser actually did, and why
 *   it stopped (reason) or truncated (flags). Honest absence beats invented
 *   content: when nothing was scanned, `attempted` is `false` and `pages` must
 *   be absent.
 * @property {ExtractionHonesty} honesty Human-facing disclosure strings the UI
 *   must show verbatim (see {@link PATTERN_CAVEAT}).
 * @property {DetectionRecord[]} [detections] Additive collection used by future
 *   M9–M10 parse modules. Every entry MUST extend {@link DetectionProvenance}.
 *
 * @typedef {Object} ExtractionSource
 * @property {string} format One of {@link SUPPORTED_FORMATS} or
 *   {@link DEFERRED_FORMATS}; any other value is treated as unknown.
 * @property {string} fileName Original file name as reported by the client.
 * @property {number} sizeBytes Received byte length (>= 0).
 * @property {string} sha256 SHA-256 hex digest of the received bytes.
 *
 * @typedef {Object} ExtractionBlock
 * @property {boolean} attempted `true` only when the local tier actually ran an
 *   extractor over the bytes/PDF. `false` means nothing was scanned.
 * @property {string} [reason] Required when `attempted` is `false`: a
 *   non-empty, user-readable explanation (e.g. a deferred or unknown format).
 *   Must be absent (or at least unused) when extraction ran.
 * @property {string} [format] Format the extractor ran against, when it ran.
 * @property {ExtractionPage[]} [pages] Required when `attempted` is `true`;
 *   must be absent when `attempted` is `false`.
 * @property {boolean} [coordinatesSupported] Required when `attempted` is
 *   `true`. `false` for TXT (line coordinates are placeholders, not geometry);
 *   `true` only for formats whose extractor yields real coordinates.
 * @property {boolean} [truncated] `true` when a budget/page cap clipped the
 *   extraction. Truncation must also be reflected in `honesty.caveats`.
 * @property {number} [pagesAvailable] Pages present in the source, when known.
 * @property {number} [pagesExtracted] Pages actually extracted (<= the cap).
 * @property {number} [scannedBytes] Bytes actually decoded/scanned.
 *
 * @typedef {Object} ExtractionPage
 * @property {number} index 1-based page index.
 * @property {ExtractionLine[]} [lines] Lines observed on the page. May be an
 *   empty array (or absent) when the page yielded no text.
 *
 * @typedef {Object} ExtractionLine
 * @property {string} text Non-empty line text, newline/tab collapsed for UI.
 * @property {number} x Line origin x (finite number; placeholder when
 *   `coordinatesSupported` is `false`).
 * @property {number} y Line origin y (finite number; placeholder when
 *   `coordinatesSupported` is `false`).
 * @property {number} width Line width (finite number; placeholder when
 *   `coordinatesSupported` is `false`).
 * @property {number} height Line height (finite number; placeholder when
 *   `coordinatesSupported` is `false`).
 *
 * @typedef {Object} ExtractionHonesty
 * @property {string[]} caveats Disclosure strings; always includes
 *   {@link PATTERN_CAVEAT}, plus format/truncation/deferral notes when they
 *   apply. Never empty for an attempted extraction.
 *
 * @typedef {Object} DetectionProvenance
 * @property {string} provenanceKind Always
 *   {@link DETECTION_PROVENANCE_KIND} (`observed`) in this tier — the pattern
 *   was observed at a location in the file. Never `source_verified` or
 *   `human_confirmed`.
 * @property {string} rationale Always {@link DETECTION_RATIONALE}: what was
 *   matched, by which pattern, with no external lookup.
 * @property {string} analysisVersion Always {@link PARSE_ANALYSIS_VERSION}.
 * @property {string} createdAt ISO-8601 timestamp of the detection.
 *
 * @typedef {Object} DetectionRecord
 * @property {string} kind What was detected (e.g. `doi`, `section`,
 *   `citation`); future modules define their own values.
 * @property {string} text Matched text, verbatim from the extracted content.
 * @property {string} provenanceKind Always
 *   {@link DETECTION_PROVENANCE_KIND} (`observed`). Never `source_verified`
 *   or `human_confirmed`.
 * @property {string} rationale Always {@link DETECTION_RATIONALE}.
 * @property {string} analysisVersion Always {@link PARSE_ANALYSIS_VERSION}.
 * @property {string} createdAt ISO-8601 timestamp of the detection.
 * @property {number} [pageIndex] 1-based page where the match was observed.
 * @property {number} [lineIndex] 0-based line index within the page.
 * @property {number} [charStart] 0-based start offset within the line/page.
 * @property {number} [charEnd] 0-based end offset (exclusive).
 * @property {string} [snippet] Bounded context, <= {@link MAX_SNIPPET_LENGTH}.
 *
 * Every future detection entry (DOI hit, reference entry, section hit,
 * citation occurrence) carries the full {@link DetectionProvenance} envelope:
 * `provenanceKind`, `rationale`, `analysisVersion`, and `createdAt` are
 * mandatory on every member, not just on the enclosing record. The
 * `DetectionProvenance` typedef above names those four fields; `DetectionRecord`
 * repeats them so each concrete detection type is self-documenting.
 */

/**
 * Wire-format discriminator for the canonical extraction record.
 * Part of the contract — do not change without a version bump.
 */
export const EXTRACTION_SCHEMA_VERSION = 'documentExtract-1';

/** Version of the offline parsing logic (not the schema). */
export const PARSE_ANALYSIS_VERSION = 'parse-1';

/**
 * Standing honesty caveat for every pattern-derived detection. Shown verbatim
 * in the UI; presence in a document is not evidence of validity or support.
 */
export const PATTERN_CAVEAT =
  'Detected by pattern matching on locally extracted text; unverified — presence in a document proves nothing about citation validity, claim support, or publication status.';

/**
 * Label for synthetic/guided-demo content. Mirrors `SYNTHETIC_LABEL` in
 * `server/reportExport.mjs`; duplicated here to keep this tier dependency-free.
 */
export const FICTIONAL_LABEL = 'FICTIONAL / GUIDED DEMO';

/**
 * TXT decode/scan budget in bytes. Mirrors `MAX_SCAN_BYTES` in
 * `server/metaExtract.mjs`; larger files are truncated with disclosure.
 */
export const MAX_DECODE_BYTES = 524288;

/** Hard cap on extracted PDF pages; exceeding it sets `extraction.truncated`. */
export const MAX_PDF_PAGES_EXTRACTED = 120;

/** Cap on unique DOIs returned per document. Mirrors `MAX_UNIQUE_DOIS`. */
export const MAX_UNIQUE_DOIS = 50;

/** Cap on reference-section entries; exceeding it is disclosed, never silent. */
export const MAX_REFERENCE_ENTRIES = 200;

/** Cap on detection snippet length in characters. Mirrors `MAX_SNIPPET_LENGTH`. */
export const MAX_SNIPPET_LENGTH = 120;

/** Text formats the local parse tier genuinely supports in M9. */
export const SUPPORTED_FORMATS = Object.freeze(['txt', 'pdf']);

/** Formats the tier recognizes but honestly cannot extract (yet). */
export const DEFERRED_FORMATS = Object.freeze(['docx']);

/** Disclosure used when a DOCX upload is recognized but not extracted. */
export const DOCX_DEFERRED_REASON =
  'DOCX text extraction is not implemented in the local parse tier; nothing was scanned.';

/** Disclosure used when the format is not recognized by the local tier. */
export const UNKNOWN_FORMAT_REASON =
  'Format not recognized by the local parse tier; nothing was scanned.';

/**
 * Provenance kind for every pattern-derived detection. `observed` is the
 * honest claim: the pattern was seen at a location in the file. Never
 * `source_verified` or `human_confirmed` in this tier.
 */
export const DETECTION_PROVENANCE_KIND = 'observed';

/** Rationale attached to every pattern-derived detection. */
export const DETECTION_RATIONALE =
  'Regex/pattern match on locally extracted text (offline); no external lookup performed.';

/**
 * True for non-null, non-array objects with a plain prototype
 * (`Object.prototype` or `null`).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * `typeof NaN === 'number'` but NaN/Infinity are not usable coordinates or
 * sizes, so accept only finite numbers.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {unknown} page
 * @param {string} path
 * @param {string[]} errors
 */
function validatePage(page, path, errors) {
  if (!isPlainObject(page)) {
    errors.push(`${path} must be a plain object`);
    return;
  }
  if (!isFiniteNumber(page.index) || page.index < 1) {
    errors.push(`${path}.index must be a finite number >= 1`);
  }
  if (!Object.prototype.hasOwnProperty.call(page, 'lines')) return;
  if (!Array.isArray(page.lines)) {
    errors.push(`${path}.lines must be an array when present`);
    return;
  }
  page.lines.forEach((line, lineIndex) => {
    const linePath = `${path}.lines[${lineIndex}]`;
    if (!isPlainObject(line)) {
      errors.push(`${linePath} must be a plain object`);
      return;
    }
    if (!isNonEmptyString(line.text)) {
      errors.push(`${linePath}.text must be a non-empty string`);
    }
    for (const coordinate of ['x', 'y', 'width', 'height']) {
      if (!isFiniteNumber(line[coordinate])) {
        errors.push(`${linePath}.${coordinate} must be a finite number`);
      }
    }
  });
}

/**
 * Validate the canonical extraction record. Pure and non-throwing: it returns
 * human-readable error strings (empty array when valid) and never coerces,
 * fills defaults, or invents members. Optional/additive fields (e.g.
 * `references`, `detections`) are not required and are not rejected.
 *
 * @param {unknown} record
 * @returns {string[]} error messages; `[]` when the record is valid
 */
export function validateExtractionRecord(record) {
  if (!isPlainObject(record)) return ['record must be a plain object'];

  /** @type {string[]} */
  const errors = [];

  if (record.schema !== EXTRACTION_SCHEMA_VERSION) {
    errors.push(`record.schema must equal "${EXTRACTION_SCHEMA_VERSION}"`);
  }
  if (record.analysisVersion !== PARSE_ANALYSIS_VERSION) {
    errors.push(`record.analysisVersion must equal "${PARSE_ANALYSIS_VERSION}"`);
  }

  if (!isPlainObject(record.source)) {
    errors.push('record.source must be a plain object');
  } else {
    if (typeof record.source.format !== 'string') {
      errors.push('record.source.format must be a string');
    }
    if (typeof record.source.fileName !== 'string') {
      errors.push('record.source.fileName must be a string');
    }
    if (!isFiniteNumber(record.source.sizeBytes) || record.source.sizeBytes < 0) {
      errors.push('record.source.sizeBytes must be a finite number >= 0');
    }
    if (typeof record.source.sha256 !== 'string') {
      errors.push('record.source.sha256 must be a string');
    }
  }

  if (typeof record.generatedAt !== 'string' || !/^\d{4}-/.test(record.generatedAt)) {
    errors.push('record.generatedAt must be an ISO-like string starting with YYYY-');
  }

  if (!isPlainObject(record.extraction)) {
    errors.push('record.extraction must be a plain object');
  } else {
    const extraction = record.extraction;
    if (typeof extraction.attempted !== 'boolean') {
      errors.push('record.extraction.attempted must be a boolean');
    } else if (extraction.attempted === false) {
      if (!isNonEmptyString(extraction.reason)) {
        errors.push('record.extraction.reason must be a non-empty string when attempted is false');
      }
      if (Object.prototype.hasOwnProperty.call(extraction, 'pages')) {
        errors.push('record.extraction.pages must be absent when attempted is false');
      }
    } else {
      if (!Array.isArray(extraction.pages)) {
        errors.push('record.extraction.pages must be an array when attempted is true');
      } else {
        extraction.pages.forEach((page, pageIndex) => {
          validatePage(page, `record.extraction.pages[${pageIndex}]`, errors);
        });
      }
      if (typeof extraction.coordinatesSupported !== 'boolean') {
        errors.push('record.extraction.coordinatesSupported must be a boolean when attempted is true');
      }
    }
  }

  if (!isPlainObject(record.honesty)) {
    errors.push('record.honesty must be a plain object');
  } else if (!Array.isArray(record.honesty.caveats)) {
    errors.push('record.honesty.caveats must be an array of strings');
  } else {
    record.honesty.caveats.forEach((caveat, caveatIndex) => {
      if (typeof caveat !== 'string') {
        errors.push(`record.honesty.caveats[${caveatIndex}] must be a string`);
      }
    });
  }

  return errors;
}
