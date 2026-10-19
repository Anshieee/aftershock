/**
 * @aftershock/server — Wave 3 in-memory import metadata extraction (TXT DOI scan).
 *
 * Pure, Node-runtime-only extraction used by `netlify/functions/import-document.mjs`
 * at the single-pass moment when the uploaded bytes are already in memory
 * (between hashing and scope exit). Nothing else imports this module; the bytes
 * are scanned, results are returned, and the caller discards the buffer —
 * nothing content-derived is logged, persisted, or written to the graph.
 *
 * SCIENTIFIC-INTEGRITY RULE (AGENTS.md): this is shallow pattern-match
 * DETECTION on a bounded excerpt ONLY. A detected DOI is an UNVERIFIED
 * candidate reference; presence in the file proves nothing about claim
 * support, citation integrity, or the reference's validity. Nothing here
 * "verifies" anything — no network calls, no resolution, no graph writes.
 *
 * Never throws: the buffer is decoded tolerantly (`fatal: false`), so binary
 * garbage cannot blow up the import flow; garbage simply yields fewer/no hits.
 */

/**
 * Scan budget: only the first 512 KiB of the file is scanned (bounded
 * prefix; larger files are decoded with the `truncated` flag set).
 */
export const MAX_SCAN_BYTES = 524_288;

/** Cap on unique DOIs returned (first-seen wins; nothing invented beyond it). */
export const MAX_UNIQUE_DOIS = 50;

/** Snippet budget: at most this many characters of context around the FIRST match. */
export const MAX_SNIPPET_LENGTH = 120;

/**
 * Standing honesty caveat that accompanies every attempted extraction (and
 * that the UI must show verbatim). Detection on a bounded excerpt — nothing
 * more: no claim support, no reference validity, no verification.
 */
export const DOI_SCAN_CAVEAT =
  'Detected by pattern matching on a bounded excerpt; unverified — presence in the file proves nothing about claim support or reference validity.';

/** DOI in raw form, e.g. `10.1234/some-suffix` (URL-form shared tail). */
const RAW_DOI_PATTERN = /\b10\.\d{4,9}\/[^\s"'<>]+/g;

/** DOI in URL form, e.g. inside `https://doi.org/10.1234/some-suffix`. */
const DOI_ORG_PATTERN = /doi\.org\/(10\.\d{4,9}\/[^\s"'<>]+)/gi;

/** Trailing punctuation to trim from a matched DOI (the URL-ish grab often takes it). */
const TRAILING_PUNCT_PATTERN = /[.,;:)]+$/;

/** Leading `doi:` label stripped when building the dedupe key. */
const DOI_LABEL_PATTERN = /^doi:/i;

/**
 * @param {string} matched matched DOI candidate
 * @returns {string} candidate with trailing `.,;:)` punctuation trimmed
 */
function trimTrailingPunctuation(matched) {
  return matched.replace(TRAILING_PUNCT_PATTERN, '');
}

/**
 * Normalized, case-insensitive dedupe key.
 *
 * @param {string} matched
 */
function normalizeDoiKey(matched) {
  return matched.replace(DOI_LABEL_PATTERN, '').toLowerCase();
}

/**
 * Bounded context around the FIRST occurrence of a DOI. Newlines, carriage
 * returns and tabs collapse to single spaces for UI safety.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} maxSnippetLength
 * @returns {string | undefined} trimmed ≤ maxSnippetLength-char context, or undefined when empty
 */
function buildSnippet(text, start, maxSnippetLength) {
  if (maxSnippetLength <= 0) return undefined;
  const windowStart = Math.max(0, start - Math.floor(maxSnippetLength / 2));
  const snippetWindow = text.slice(windowStart, windowStart + maxSnippetLength);
  // UI safety: newlines/returns/tabs collapse to single spaces.
  const snippet = snippetWindow.replace(/[\n\r\t]+/g, ' ').trim();
  return snippet.length > 0 ? snippet : undefined;
}

/**
 * Scan decoded text for DOI candidates (raw + `doi.org` URL forms).
 *
 * Overlap policy: a raw-form match fully inside a `doi.org/…` match describes
 * the SAME textual occurrence and must not double-count it.
 *
 * @param {{maxUniqueDois: number, maxSnippetLength: number, truncated: boolean, scannedBytes: number}} options
 */
function scanText(text, { maxUniqueDois, maxSnippetLength, truncated, scannedBytes }) {
  /**
   * @type {Array<{doi: string, start: number, end: number}>}
   */
  const occurrences = [];
  for (const m of text.matchAll(DOI_ORG_PATTERN)) {
    occurrences.push({
      doi: trimTrailingPunctuation(m[1]),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  for (const m of text.matchAll(RAW_DOI_PATTERN)) {
    occurrences.push({
      doi: trimTrailingPunctuation(m[0]),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  // Deterministic merge order: textual order; longest first so a containing
  // `doi.org/…` occurrence wins over its embedded raw occurrence.
  occurrences.sort((a, b) => a.start - b.start || b.end - a.end);

  /** @type {Map<string, {doi: string, occurrences: number, snippet?: string}>} */
  const byKey = new Map();
  /** @type {{doi: string, start: number, end: number} | null} */
  let lastAccepted = null;
  for (const occ of occurrences) {
    const key = normalizeDoiKey(occ.doi);
    if (key === '') continue;
    // Same textual occurrence seen twice (raw form embedded in a `doi.org/…`
    // match): counted once, not twice.
    if (
      lastAccepted !== null &&
      lastAccepted.start <= occ.start &&
      occ.end <= lastAccepted.end &&
      normalizeDoiKey(lastAccepted.doi) === key
    ) {
      continue;
    }
    lastAccepted = occ;
    const digest = byKey.get(key);
    if (digest !== undefined) {
      digest.occurrences += 1;
      continue;
    }
    // Honest cap: uniques beyond MAX_UNIQUE_DOIS are dropped, not fabricated.
    if (byKey.size >= maxUniqueDois) continue;
    const entry = { doi: occ.doi, occurrences: 1 };
    const snippet = buildSnippet(text, occ.start, maxSnippetLength);
    if (snippet !== undefined) entry.snippet = snippet;
    byKey.set(key, entry);
  }
  return { scannedBytes, truncated, dois: [...byKey.values()] };
}

/**
 * Extract shallow biblio metadata (DOI references) from a bounded prefix of
 * file bytes. Pure; never throws; imports nothing.
 *
 * Honesty contract (see module head): detected DOIs are unverified candidates
 * from a bounded excerpt — the caller MUST disclose that in the response.
 *
 * @param {Uint8Array} bytes raw upload bytes (heap droppable after this call)
 * @param {{maxScanBytes?: number, maxUniqueDois?: number, maxSnippetLength?: number}} [deps] budget seams for tests
 * @returns {{scannedBytes: number, truncated: boolean, dois: Array<{doi: string, occurrences: number, snippet?: string}>}}
 */
export function extractTextMeta(bytes, deps = {}) {
  const maxScanBytes = clampPositiveInt(deps.maxScanBytes, MAX_SCAN_BYTES);
  const maxUniqueDois = clampPositiveInt(deps.maxUniqueDois, MAX_UNIQUE_DOIS);
  const maxSnippetLength = clampPositiveInt(deps.maxSnippetLength, MAX_SNIPPET_LENGTH);

  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(0);
  const scanSlice = input.byteLength > maxScanBytes ? input.subarray(0, maxScanBytes) : input;
  const truncated = input.byteLength > scanSlice.byteLength;

  // Tolerant decode: binary garbage produces a replacement-char string whose
  // pattern matching simply yields fewer or no candidates.
  let text = '';
  if (scanSlice.byteLength > 0) {
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(scanSlice);
    } catch {
      text = ''; // remains honest: no hits claimed — buffer wasn't decodable text
    }
  }
  return scanText(text, {
    maxUniqueDois,
    maxSnippetLength,
    truncated,
    scannedBytes: scanSlice.byteLength,
  });
}

/**
 * @param {number | undefined} candidate
 * @param {number} fallback
 */
function clampPositiveInt(candidate, fallback) {
  if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
    return candidate;
  }
  return fallback;
}
