/**
 * @aftershock/server — bounded TXT decode + conservative reference-section
 * segmentation for the local parse tier (M9).
 *
 * Everything here is a PATTERN MATCH on locally decoded text. The output is
 * `observed` provenance only (see `server/parse/schema.mjs`): a heading or a
 * numbered entry says "this text looked like a reference list in this file",
 * never "this citation is valid", "this work exists", or "this claim is
 * supported". No external lookup, no network, no I/O, no clock read.
 *
 * Honesty rules enforced below:
 * - Decoding is bounded by {@link MAX_DECODE_BYTES}; exceeding it sets
 *   `truncated: true`, never a silent whole-file scan.
 * - A tolerant decoder is used (`fatal: false`) exactly like
 *   `server/metaExtract.mjs`: binary garbage becomes replacement characters
 *   instead of an exception. When bytes are absent/not a `Uint8Array`, the
 *   result says `decodeFailed: true` and produces no lines.
 * - A reference heading must be a *standalone short line*; prose that merely
 *   mentions "references" is not a heading.
 * - Entry segmentation is skipped entirely (with a note) unless at least two
 *   numbered markers are present. Entries are never invented from prose.
 * - Beyond {@link MAX_REFERENCE_ENTRIES}, extra entries are dropped and
 *   `truncated: true` is reported.
 *
 * All functions are pure, never throw, and never mutate their inputs.
 */

import {
  DETECTION_PROVENANCE_KIND,
  DETECTION_RATIONALE,
  MAX_DECODE_BYTES,
  MAX_REFERENCE_ENTRIES,
  PARSE_ANALYSIS_VERSION,
} from './schema.mjs';

/** Longest trimmed line still eligible to be a reference heading. */
const MAX_HEADING_LENGTH = 24;

/** Standalone heading forms accepted (whole trimmed line, short only). */
const REFERENCES_HEADING = /^(references|bibliography|works cited)\s*:?.*$/i;

/** `[1] text` — bracketed numeric marker. */
const BRACKETED_MARKER = /^\s*\[\s*(\d{1,3})\s*\]\s+/;

/** `1. text`, `1) text`, `1] text` — bare numeric marker. */
const BARE_MARKER = /^\s*(\d{1,3})[.)\]]\s+/;

/** Disclosure when bytes are absent or of the wrong type. */
const NOT_BYTES_NOTE =
  'No Uint8Array bytes were provided; nothing was decoded and no lines were produced.';

/** Disclosure when the tolerant decoder itself threw. */
const DECODE_FAILED_NOTE =
  'UTF-8 decoding failed; no text was recovered from the provided bytes.';

/** Disclosure when no standalone heading was observed. */
const NO_HEADING_NOTE =
  'No standalone reference heading (references/bibliography/works cited) found; section detection skipped.';

/** Disclosure when the heading exists but the tail is not marker-delimited. */
const FEW_MARKERS_NOTE =
  'Fewer than two numbered reference markers found; entry segmentation skipped.';

/** Disclosure when `segmentReferenceEntries` was called without a heading. */
const NO_SECTION_NOTE = 'No reference heading detected; entries not segmented.';

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function clampPositiveInt(value, fallback) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  return fallback;
}

/**
 * Normalize a candidate line list without trusting its shape.
 *
 * @param {unknown} lines
 * @returns {Array<{ index: number, page: 1, text: string }>}
 */
function usableLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.filter(
    (line) =>
      line !== null &&
      typeof line === 'object' &&
      typeof line.index === 'number' &&
      Number.isFinite(line.index) &&
      typeof line.text === 'string',
  );
}

/**
 * Match a numbered reference marker at the start of a line.
 *
 * @param {string} text
 * @returns {{ number: number, consumed: number } | null}
 */
function matchMarker(text) {
  const bracketed = BRACKETED_MARKER.exec(text);
  if (bracketed) return { number: Number(bracketed[1]), consumed: bracketed[0].length };
  const bare = BARE_MARKER.exec(text);
  if (bare) return { number: Number(bare[1]), consumed: bare[0].length };
  return null;
}

/**
 * Decode bounded bytes into located lines.
 *
 * Lines are 1-based and all report `page: 1` (plain text has no pagination).
 * Splitting is on `/\r?\n/`; blank lines are preserved (including a trailing
 * blank produced by a final newline) so line indexes stay faithful to the
 * source. A leading BOM (U+FEFF) is stripped.
 *
 * Never throws. Absent/non-`Uint8Array` bytes, or a decoder exception with no
 * recovered text, yield `decodeFailed: true`, `lines: []`, and an honest note.
 *
 * @param {Uint8Array} bytes
 * @param {{ maxDecodeBytes?: number }} [deps] budget seam for tests
 * @returns {{
 *   attempted: true,
 *   truncated: boolean,
 *   decodeFailed: boolean,
 *   textLength: number,
 *   lines: Array<{ index: number, page: 1, text: string }>,
 *   notes: string[],
 * }}
 */
export function decodeTxtLines(bytes, deps = {}) {
  if (!(bytes instanceof Uint8Array)) {
    return {
      attempted: true,
      truncated: false,
      decodeFailed: true,
      textLength: 0,
      lines: [],
      notes: [NOT_BYTES_NOTE],
    };
  }

  const maxDecodeBytes = clampPositiveInt(deps.maxDecodeBytes, MAX_DECODE_BYTES);
  const slice = bytes.byteLength > maxDecodeBytes ? bytes.subarray(0, maxDecodeBytes) : bytes;
  const truncated = bytes.byteLength > slice.byteLength;

  let text = '';
  let decodeFailed = false;
  if (slice.byteLength > 0) {
    try {
      // Tolerant decode: binary garbage produces replacement characters, not
      // an exception, and therefore fewer (or no) recognizable headings.
      text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    } catch {
      text = '';
      decodeFailed = true;
    }
  }

  // Defensive: `ignoreBOM: false` already strips it, but never emit it.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const textLength = text.length;
  const lines =
    text.length === 0
      ? []
      : text.split(/\r?\n/).map((lineText, offset) => ({
          index: offset + 1,
          page: 1,
          text: lineText,
        }));

  return {
    attempted: true,
    truncated,
    decodeFailed,
    textLength,
    lines,
    notes: decodeFailed ? [DECODE_FAILED_NOTE] : [],
  };
}

/**
 * Find a standalone reference-section heading line.
 *
 * Conservative by design: the trimmed line must start with
 * `references` / `bibliography` / `works cited` AND be at most
 * {@link MAX_HEADING_LENGTH} characters, so prose such as
 * "in the references of the paper" never qualifies.
 *
 * @param {Array<{ index: number, page: number, text: string }>} lines
 * @returns {{ found: boolean, startIndex: number | null, headingText: string | null, note: string }}
 */
export function findReferencesSection(lines) {
  for (const line of usableLines(lines)) {
    const trimmed = line.text.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_HEADING_LENGTH) continue;
    if (REFERENCES_HEADING.test(trimmed)) {
      return { found: true, startIndex: line.index, headingText: trimmed, note: '' };
    }
  }
  return { found: false, startIndex: null, headingText: null, note: NO_HEADING_NOTE };
}

/**
 * Segment numbered reference entries starting AFTER a detected heading.
 *
 * A new entry begins at a marker line (`[1] …`, `1. …`, `1) …`, `1] …`);
 * following non-marker lines are continuations. Segmentation is skipped with
 * an honest note unless at least two marker lines are present in the scanned
 * tail. Markers beyond `maxEntries` are dropped (never invented) and reported
 * as `truncated: true`.
 *
 * @param {Array<{ index: number, page: number, text: string }>} lines
 * @param {number | null} startIndex index of the heading line from
 *   {@link findReferencesSection}; `null` means no section was detected.
 * @param {{ maxEntries?: number }} [deps]
 * @returns {{
 *   entries: Array<{
 *     rawText: string,
 *     number: number | null,
 *     startLineIndex: number,
 *     endLineIndex: number,
 *     provenanceKind: 'observed',
 *     rationale: string,
 *     analysisVersion: string,
 *     createdAt: null,
 *   }>,
 *   segmented: 'numbered' | 'unsegmented',
 *   truncated: boolean,
 *   note: string,
 * }}
 */
export function segmentReferenceEntries(lines, startIndex, deps = {}) {
  if (typeof startIndex !== 'number' || !Number.isFinite(startIndex)) {
    return { entries: [], segmented: 'unsegmented', truncated: false, note: NO_SECTION_NOTE };
  }

  const list = usableLines(lines);
  const headingPosition = list.findIndex((line) => line.index === startIndex);
  const tail =
    headingPosition >= 0
      ? list.slice(headingPosition + 1)
      : list.filter((line) => line.index > startIndex);

  const markerCount = tail.reduce((count, line) => (matchMarker(line.text) ? count + 1 : count), 0);
  if (markerCount < 2) {
    return { entries: [], segmented: 'unsegmented', truncated: false, note: FEW_MARKERS_NOTE };
  }

  /** @type {Array<{ parts: string[], number: number, startLineIndex: number, endLineIndex: number }>} */
  const grouped = [];
  /** @type {null | { parts: string[], number: number, startLineIndex: number, endLineIndex: number }} */
  let current = null;

  for (const line of tail) {
    const marker = matchMarker(line.text);
    if (marker) {
      if (current) grouped.push(current);
      current = {
        parts: [line.text.slice(marker.consumed).trim()],
        number: marker.number,
        startLineIndex: line.index,
        endLineIndex: line.index,
      };
      continue;
    }
    if (!current) continue; // prose before the first marker is not an entry
    const continuation = line.text.trim();
    if (continuation.length > 0) {
      current.parts.push(continuation);
      current.endLineIndex = line.index;
    }
  }
  if (current) grouped.push(current);

  const maxEntries = clampPositiveInt(deps.maxEntries, MAX_REFERENCE_ENTRIES);
  const dropped = Math.max(0, grouped.length - maxEntries);
  const kept = dropped > 0 ? grouped.slice(0, maxEntries) : grouped;

  const entries = kept.map((entry) => ({
    rawText: entry.parts.join(' ').trim(),
    number: entry.number,
    startLineIndex: entry.startLineIndex,
    endLineIndex: entry.endLineIndex,
    provenanceKind: DETECTION_PROVENANCE_KIND,
    rationale: DETECTION_RATIONALE,
    analysisVersion: PARSE_ANALYSIS_VERSION,
    createdAt: null,
  }));

  return {
    entries,
    segmented: 'numbered',
    truncated: dropped > 0,
    note:
      dropped > 0
        ? `Reference entry cap (${maxEntries}) reached; ${dropped} additional entries were dropped.`
        : '',
  };
}
