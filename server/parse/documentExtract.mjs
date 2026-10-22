/**
 * @aftershock/server — canonical per-format extraction dispatcher (M9).
 *
 * Composes the parse-tier pieces into ONE `documentExtract-1` record:
 * TXT decoding, reference-section detection, reference-entry segmentation, and
 * DOI collection. PDF extraction is delegated to an INJECTED operation
 * (`deps.pdfExtractOp`) or the lazy default seam below; the PDF implementation
 * lives in a parallel task's module and is deliberately not imported statically
 * here. DOCX and unknown formats are honestly stubbed: nothing is scanned and
 * the reason is stated.
 *
 * SCIENTIFIC-INTEGRITY RULE (AGENTS.md): everything this module emits is a
 * PATTERN MATCH on locally extracted text — `observed` provenance only. It is
 * never `source_verified` or `human_confirmed`, and no network lookup,
 * resolution, or verification occurs. Detection never proves a citation is
 * genuine or that it supports any claim. Every record is checked against
 * `validateExtractionRecord` before it is returned: an invalid record is a bug
 * and throws loudly rather than leaking a half-honest payload downstream.
 *
 * @module parse/documentExtract
 */

import { createHash } from 'node:crypto';
import {
  DOCX_DEFERRED_REASON,
  EXTRACTION_SCHEMA_VERSION,
  PARSE_ANALYSIS_VERSION,
  PATTERN_CAVEAT,
  UNKNOWN_FORMAT_REASON,
  validateExtractionRecord,
} from './schema.mjs';
import {
  decodeTxtLines,
  findReferencesSection,
  segmentReferenceEntries,
} from './txtDocument.mjs';
import { collectDoiOccurrences, scanDoiOccurrences } from './doiDetect.mjs';

/** Standing caveat for attempted extractions. */
const LOCAL_OFFLINE_CAVEAT =
  'Local, offline analysis: no network, no identifier resolution, no verification of detected references was performed. Detection never proves a citation is genuine or that it supports any claim.';

/** Standing caveat for the search-lead nature of detected references/DOIs. */
const SEARCH_LEAD_CAVEAT =
  'Unverified reference entries and DOI detections are search leads, not conclusions; human review decides their relevance.';

/** Extra disclosure when a decode/extraction budget clipped the content. */
const TRUNCATION_CAVEAT =
  'Extraction was truncated by a size/page budget; later content was not scanned.';

/** Reason used when TXT bytes were not provided at all. */
const NO_BYTES_REASON = 'No document bytes were provided; nothing was parsed.';

/** Reason used when the TXT decoder itself failed on valid bytes. */
const TXT_DECODE_FAILED_REASON = 'Text decoding failed; nothing was scanned.';

/** Reason used when a PDF op is present but reports failure. */
const PDF_FAILED_REASON = 'PDF text extraction reported no result; nothing was scanned.';

/** Reason used when the op throws; the error text is never surfaced verbatim. */
const PDF_THREW_REASON = 'PDF text extraction failed unexpectedly; nothing was scanned.';

/** Reason used when no PDF extractor can be loaded at all. */
const PDF_UNAVAILABLE_REASON =
  'PDF text extraction could not be loaded in this environment; nothing was scanned.';

/** Reference-detection skip reason for unavailable PDF text. */
const PDF_REFERENCES_SKIP_REASON = 'PDF text unavailable; reference detection not attempted.';

/** Reference-detection skip reason for failed TXT decoding. */
const TXT_REFERENCES_SKIP_REASON = 'Text decoding failed; reference detection not attempted.';

/** Reference-detection skip reason for DOCX. */
const DOCX_REFERENCES_SKIP_REASON =
  'DOCX text extraction is not implemented in the local parse tier; reference detection not attempted.';

/** Reference-detection skip reason for unrecognized formats. */
const UNKNOWN_REFERENCES_SKIP_REASON =
  'Unknown format; reference detection not attempted.';

/** TXT pseudo-page note: plain text has no pagination or geometry. */
const TXT_PSEUDO_PAGE_NOTE =
  'Plain-text file: no page/coordinate structure exists; a single pseudo-page (index 1) is used.';

/**
 * TXT lines omit geometry entirely (plain text carries none; the schema
 * treats coordinates as optional member-wise).
 */
const TXT_NO_COORDS_NOTE =
  'Plain-text lines carry no page geometry; coordinate members are omitted rather than filled with placeholders.';

/**
 * Default PDF op: lazy dynamic import seam.
 *
 * ONLY this function may reference the PDF module path. It is dynamic so this
 * module loads (and its unit tests run) even when the parallel PDF task's
 * module is not present in the checkout. The import is integration-tested by
 * the CLI/orchestrator, not by this module's unit tests, to keep the two tasks
 * decoupled.
 *
 * @returns {Promise<null | ((bytes: Uint8Array) => Promise<object>)>}
 */
async function loadDefaultPdfExtractOp() {
  try {
    const mod = await import('./pdfText.mjs');
    return typeof mod.extractPdfText === 'function' ? mod.extractPdfText.bind(mod) : null;
  } catch {
    return null;
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} lowercase hex SHA-256 of the ORIGINAL bytes
 */
function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Copy an array of caveats, adding the truncation caveat at most once.
 *
 * @param {string[]} caveats
 * @param {boolean} truncated
 * @returns {string[]}
 */
function finishCaveats(caveats, truncated) {
  const list = [...caveats];
  if (truncated && !list.includes(TRUNCATION_CAVEAT)) list.push(TRUNCATION_CAVEAT);
  return list;
}

/**
 * Build the record preamble (schema/version/timestamp/source).
 *
 * @param {unknown} bytes
 * @param {{ fileName: string, format: string, now: string }} meta
 * @returns {{
 *   schema: string,
 *   analysisVersion: string,
 *   generatedAt: string,
 *   source: { fileName: string, format: string, sizeBytes: number, sha256: string },
 * }}
 */
function buildPreamble(bytes, meta) {
  const hasBytes = bytes instanceof Uint8Array;
  return {
    schema: EXTRACTION_SCHEMA_VERSION,
    analysisVersion: PARSE_ANALYSIS_VERSION,
    generatedAt: meta.now,
    source: {
      fileName: meta.fileName,
      format: meta.format,
      sizeBytes: hasBytes ? bytes.byteLength : 0,
      // The schema requires a string even when no bytes were received; an
      // empty digest is the honest "nothing was hashed" value.
      sha256: hasBytes ? sha256Hex(bytes) : '',
    },
  };
}

/**
 * An honest "nothing was scanned" references block.
 *
 * @param {string} reason
 * @returns {{ attempted: false, reason: string }}
 */
function referencesNotAttempted(reason) {
  return { attempted: false, reason };
}

/**
 * Detect the references section and segment entries over a GLOBAL line list.
 *
 * The same global lines are used for DOI collection, so `startLineIndex` /
 * `firstLineIndex` values are global document line numbers (1-based).
 *
 * @param {Array<{ text: string, page: number, index: number }>} lines
 * @param {(globalLineIndex: number) => { page: number, pageLineIndex: number }} locate
 * @returns {{
 *   references: object,
 *   dois: Array<object>,
 * }}
 */
function buildDetections(lines, locate) {
  const refs = findReferencesSection(lines);
  const entries = segmentReferenceEntries(lines, refs.startIndex);

  // When no heading exists, report the heading-detection note (the section
  // segmentation note would only repeat "no heading"). Otherwise the
  // segmentation note carries marker/cap disclosures.
  const notes = [];
  if (refs.found) {
    if (entries.note) notes.push(entries.note);
  } else {
    notes.push(refs.note);
  }

  const detected = entries.entries.map((entry) => {
    const location = locate(entry.startLineIndex);
    const hits = scanDoiOccurrences(entry.rawText, {
      page: location.page,
      lineIndex: location.pageLineIndex,
    });
    const distinctKeys = new Set(hits.map((hit) => hit.doi.toLowerCase()));
    if (distinctKeys.size > 1) {
      notes.push(
        `Reference line ${entry.startLineIndex} contains multiple distinct identifiers; only the first was attached to the entry.`,
      );
    }
    return {
      rawText: entry.rawText,
      doi: hits.length > 0 ? hits[0].doi : null,
      firstLineIndex: entry.startLineIndex,
      pageIndex: location.page,
      pageLineIndex: location.pageLineIndex,
      provenanceKind: entry.provenanceKind,
      rationale: entry.rationale,
      analysisVersion: entry.analysisVersion,
      createdAt: entry.createdAt,
    };
  });

  const doiAgg = collectDoiOccurrences(lines);

  return {
    references: {
      attempted: true,
      truncated: entries.truncated,
      detected,
      sections: {
        found: refs.found,
        startIndex: refs.startIndex,
        headingText: refs.headingText,
        segmentation: entries.segmented,
        note: notes.join(' '),
      },
    },
    // Keep every producer member verbatim, including `createdAt: null`.
    dois: doiAgg.dois.map((doi) => ({ ...doi })),
  };
}

/**
 * Emit schema-valid page lines for TXT: blank/whitespace-only source lines are
 * not valid `text` values and are omitted here (they remain in the global line
 * list used for detection so indexes stay faithful to the source). Plain text
 * carries no geometry, so coordinate members are OMITTED entirely (the schema
 * treats coordinates as optional member-wise; emitting zeros would be
 * indistinguishable from real page geometry at the origin).
 *
 * @param {Array<{ index: number, text: string }>} lines
 * @returns {Array<{ order: number, text: string }>}
 */
function txtPageLines(lines) {
  return lines
    .filter((line) => typeof line.text === 'string' && line.text.trim().length > 0)
    .map((line) => ({
      order: line.index,
      text: line.text,
    }));
}

/**
 * TXT branch.
 *
 * @param {unknown} bytes
 * @param {{ fileName: string, now: string }} meta
 * @returns {object}
 */
function buildTxtRecord(bytes, meta) {
  const preamble = buildPreamble(bytes, { ...meta, format: 'txt' });

  if (!(bytes instanceof Uint8Array)) {
    return {
      ...preamble,
      extraction: { attempted: false, reason: NO_BYTES_REASON },
      references: referencesNotAttempted(TXT_REFERENCES_SKIP_REASON),
      dois: [],
      honesty: { caveats: [PATTERN_CAVEAT] },
    };
  }

  const decode = decodeTxtLines(bytes);
  if (decode.decodeFailed) {
    return {
      ...preamble,
      extraction: {
        attempted: false,
        reason: TXT_DECODE_FAILED_REASON,
        notes: [...decode.notes],
      },
      references: referencesNotAttempted(TXT_REFERENCES_SKIP_REASON),
      dois: [],
      honesty: { caveats: [PATTERN_CAVEAT] },
    };
  }

  // Global line list: TXT lines are already 1-based and all on page 1.
  const lines = decode.lines.map((line) => ({
    text: line.text,
    page: 1,
    index: line.index,
  }));

  const { references, dois } = buildDetections(lines, (globalLineIndex) => ({
    page: 1,
    pageLineIndex: globalLineIndex,
  }));

  return {
    ...preamble,
    extraction: {
      attempted: true,
      coordinatesSupported: false,
      truncated: decode.truncated === true,
      pages: [{ index: 1, lines: txtPageLines(decode.lines) }],
      textLength: decode.textLength,
      notes: [...decode.notes, TXT_PSEUDO_PAGE_NOTE, TXT_NO_COORDS_NOTE],
    },
    references,
    dois,
    honesty: {
      caveats: finishCaveats(
        [PATTERN_CAVEAT, LOCAL_OFFLINE_CAVEAT, SEARCH_LEAD_CAVEAT],
        decode.truncated === true,
      ),
    },
  };
}

/**
 * Enumerate global, 1-based document lines across PDF pages and build a
 * global→(page, page-local) locator.
 *
 * @param {object[]} pages passthrough schema page objects
 * @returns {{
 *   lines: Array<{ text: string, page: number, index: number }>,
 *   locate: (globalLineIndex: number) => { page: number, pageLineIndex: number },
 * }}
 */
function enumeratePdfLines(pages) {
  const lines = [];
  const locations = new Map();
  let globalIndex = 0;

  pages.forEach((page, pagePosition) => {
    const pageIndex =
      Number.isFinite(page?.index) && page.index >= 1 ? page.index : pagePosition + 1;
    const pageLines = Array.isArray(page?.lines) ? page.lines : [];
    pageLines.forEach((line, linePosition) => {
      globalIndex += 1;
      // The page record's own `order` is retained untouched; it is only used
      // as the page-local line anchor for entry DOI attribution.
      const pageLineIndex =
        Number.isFinite(line?.order) && line.order >= 1 ? line.order : linePosition + 1;
      lines.push({
        text: typeof line?.text === 'string' ? line.text : '',
        page: pageIndex,
        index: globalIndex,
      });
      locations.set(globalIndex, { page: pageIndex, pageLineIndex });
    });
  });

  return {
    lines,
    locate: (globalLineIndex) =>
      locations.get(globalLineIndex) ?? { page: 1, pageLineIndex: null },
  };
}

/**
 * PDF branch. The extraction op is injected (or lazily defaulted) and never
 * imported statically.
 *
 * @param {unknown} bytes
 * @param {{ fileName: string, now: string }} meta
 * @param {{ pdfExtractOp?: Function }} deps
 * @returns {Promise<object>}
 */
async function buildPdfRecord(bytes, meta, deps) {
  const preamble = buildPreamble(bytes, { ...meta, format: 'pdf' });

  let op = deps.pdfExtractOp;
  if (typeof op !== 'function') op = await loadDefaultPdfExtractOp();

  if (typeof op !== 'function') {
    return {
      ...preamble,
      extraction: { attempted: false, reason: PDF_UNAVAILABLE_REASON },
      references: referencesNotAttempted(PDF_REFERENCES_SKIP_REASON),
      dois: [],
      honesty: { caveats: [PATTERN_CAVEAT] },
    };
  }

  let pdf;
  try {
    pdf = await op(bytes);
  } catch {
    return {
      ...preamble,
      extraction: { attempted: false, reason: PDF_THREW_REASON },
      references: referencesNotAttempted(PDF_REFERENCES_SKIP_REASON),
      dois: [],
      honesty: { caveats: [PATTERN_CAVEAT] },
    };
  }

  if (!pdf || pdf.attempted !== true) {
    const reason =
      pdf && typeof pdf.reason === 'string' && pdf.reason.trim().length > 0
        ? pdf.reason
        : PDF_FAILED_REASON;
    return {
      ...preamble,
      extraction: { attempted: false, reason },
      references: referencesNotAttempted(PDF_REFERENCES_SKIP_REASON),
      dois: [],
      honesty: { caveats: [PATTERN_CAVEAT] },
    };
  }

  const pages = Array.isArray(pdf.pages) ? pdf.pages.map((page) => ({ ...page })) : [];
  const { lines, locate } = enumeratePdfLines(pages);
  const { references, dois } = buildDetections(lines, locate);

  /** @type {object} */
  const extraction = {
    attempted: true,
    coordinatesSupported: pdf.coordinatesSupported === true,
    truncated: pdf.truncated === true,
    pages,
    notes: Array.isArray(pdf.notes) ? [...pdf.notes] : [],
  };
  if (typeof pdf.textLength === 'number' && Number.isFinite(pdf.textLength)) {
    extraction.textLength = pdf.textLength;
  }

  return {
    ...preamble,
    extraction,
    references,
    dois,
    honesty: {
      caveats: finishCaveats(
        [PATTERN_CAVEAT, LOCAL_OFFLINE_CAVEAT, SEARCH_LEAD_CAVEAT],
        pdf.truncated === true,
      ),
    },
  };
}

/**
 * Extract one document into the canonical `documentExtract-1` record.
 *
 * Format is caller-declared (case-insensitive, trimmed). TXT is decoded and
 * scanned locally; PDF is delegated to `deps.pdfExtractOp` (or the lazy
 * default seam); DOCX and unknown formats return honest, non-attempted records.
 * The record is schema-validated before return; an invalid record throws.
 *
 * @param {unknown} bytes received document bytes (`Uint8Array`)
 * @param {{
 *   fileName?: string,
 *   format?: string,
 *   now?: string,
 *   pdfExtractOp?: (bytes: Uint8Array) => Promise<object>,
 * }} [deps]
 * @returns {Promise<object>} schema-valid `documentExtract-1` record
 */
export async function extractDocument(bytes, deps = {}) {
  const options = deps ?? {};
  const format = String(options.format ?? '').trim().toLowerCase();
  const now =
    typeof options.now === 'string' && options.now.length > 0
      ? options.now
      : new Date().toISOString();
  const fileName = typeof options.fileName === 'string' ? options.fileName : '';

  /** @type {object} */
  let record;
  if (format === 'txt') {
    record = buildTxtRecord(bytes, { fileName, now });
  } else if (format === 'pdf') {
    record = await buildPdfRecord(bytes, { fileName, now }, options);
  } else if (format === 'docx') {
    record = {
      ...buildPreamble(bytes, { fileName, now, format: 'docx' }),
      extraction: { attempted: false, reason: DOCX_DEFERRED_REASON },
      references: referencesNotAttempted(DOCX_REFERENCES_SKIP_REASON),
      dois: [],
      honesty: { caveats: [PATTERN_CAVEAT] },
    };
  } else {
    record = {
      ...buildPreamble(bytes, { fileName, now, format: format || 'unknown' }),
      extraction: { attempted: false, reason: UNKNOWN_FORMAT_REASON },
      references: referencesNotAttempted(UNKNOWN_REFERENCES_SKIP_REASON),
      dois: [],
      honesty: { caveats: [PATTERN_CAVEAT] },
    };
  }

  const errs = validateExtractionRecord(record);
  if (errs.length > 0) {
    throw new Error(`internal: extraction record failed schema validation: ${errs.join('; ')}`);
  }
  return record;
}
