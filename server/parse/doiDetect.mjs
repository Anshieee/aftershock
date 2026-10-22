/**
 * @aftershock/server — DOI candidate detection over decoded parse-tier text (M9/M10).
 *
 * Scans ALREADY-DECODED text (one string per call, or a whole document's
 * lines) for DOI-pattern occurrences and aggregates them into unique,
 * case-insensitively-deduped entries with honest occurrence counts.
 *
 * This module is a DELIBERATELY SELF-CONTAINED DUPLICATE of the DOI-pattern
 * semantics deployed in `server/metaExtract.mjs` (Wave 3): the same
 * raw/`doi.org` patterns, the same trailing-punctuation strip, the same
 * `doi:`-label-stripped lowercase dedupe key, and the same
 * `(start ASC, end DESC)` overlap rule. `server/metaExtract.mjs` is deployed
 * code and MUST NOT be modified — this module exists so the M9/M10 parse tier
 * can build schema-conformant detections without touching it. The canonical
 * constants (`DETECTION_PROVENANCE_KIND`, `DETECTION_RATIONALE`,
 * `PARSE_ANALYSIS_VERSION`, `MAX_UNIQUE_DOIS`) come from `./schema.mjs`, not
 * from `metaExtract.mjs`.
 *
 * SCIENTIFIC-INTEGRITY RULE (AGENTS.md): every hit is a pattern match on
 * locally extracted text — `observed` provenance only, never
 * `source_verified`, never `human_confirmed`. Presence in a document proves
 * nothing about citation validity, claim support, or publication status.
 * Nothing here verifies anything: no network calls, no resolution, no graph
 * writes, no I/O of any kind. Pure functions only.
 *
 * Honesty notes:
 * - Uniques beyond the cap (`maxUniqueDois`) are DROPPED, never fabricated;
 *   already-kept keys keep counting occurrences beyond the cap.
 * - `truncated` is always `false` here: decode/scan-byte truncation belongs
 *   to the text-decode tier, not to this module. The field exists on the
 *   return shape for interface stability only.
 * - `createdAt` is `null` on every entry this module returns: the caller
 *   stamps a real ISO-8601 timestamp when it builds a record, keeping this
 *   module pure and time-free.
 *
 * @module parse/doiDetect
 */

import {
  DETECTION_PROVENANCE_KIND,
  DETECTION_RATIONALE,
  MAX_UNIQUE_DOIS,
  PARSE_ANALYSIS_VERSION,
} from './schema.mjs';

/** DOI in raw form, e.g. `10.1234/some-suffix` (URL-form shared tail). */
const RAW_DOI_PATTERN = /\b10\.\d{4,9}\/[^\s"'<>]+/g;

/** DOI in URL form, e.g. inside `https://doi.org/10.1234/some-suffix`. */
const DOI_ORG_PATTERN = /doi\.org\/(10\.\d{4,9}\/[^\s"'<>]+)/gi;

/** Trailing punctuation to trim from a matched DOI (the URL-ish grab often takes it). */
const TRAILING_PUNCT_PATTERN = /[.,;:)]+$/;

/** Leading `doi:` label stripped when building the dedupe key. */
const DOI_LABEL_PATTERN = /^doi:/i;

/**
 * @typedef {Object} DoiHit One DOI-pattern occurrence inside one text string.
 * @property {string} doi Stripped DOI, KEEPING ORIGINAL CASING (the caller
 *   normalizes only the dedupe key, never the stored value).
 * @property {string} rawMatch Exact matched substring, verbatim — includes the
 *   `doi.org/…` prefix form when present (`text.slice(start, end) === rawMatch`).
 * @property {'url' | 'raw'} form `doi.org` URL form vs bare `10.…` form.
 * @property {number} start 0-based start offset within the text.
 * @property {number} end End offset within the text (exclusive).
 * @property {number} page Anchor page (defaults to 1).
 * @property {number | null} lineIndex Anchor line index (defaults to null).
 * @property {string} provenanceKind Always {@link DETECTION_PROVENANCE_KIND}.
 * @property {string} rationale Always {@link DETECTION_RATIONALE}.
 * @property {string} analysisVersion Always {@link PARSE_ANALYSIS_VERSION}.
 * @property {null} createdAt Stamped later by the caller (never invented here).
 */

/**
 * @typedef {Object} CollectedDoi One unique DOI across a whole document.
 * @property {string} doi First occurrence's stripped form (original casing).
 * @property {number} occurrences Total hits for the lowercase key across lines.
 * @property {number} firstPage Page of the occurrence that created the key.
 * @property {number | null} firstLineIndex Line index of the occurrence that
 *   created the key (null when the anchor carried none).
 * @property {string} provenanceKind Always {@link DETECTION_PROVENANCE_KIND}.
 * @property {string} rationale Always {@link DETECTION_RATIONALE}.
 * @property {string} analysisVersion Always {@link PARSE_ANALYSIS_VERSION}.
 * @property {null} createdAt Stamped later by the caller.
 */

/**
 * @param {string} matched matched DOI candidate
 * @returns {string} candidate with trailing `.,;:)` punctuation trimmed
 */
function trimTrailingPunctuation(matched) {
  return matched.replace(TRAILING_PUNCT_PATTERN, '');
}

/**
 * Normalized, case-insensitive dedupe key: leading `doi:` label removed,
 * lowercased. The stored `doi` value itself is never touched by this.
 *
 * @param {string} stripped
 * @returns {string}
 */
function normalizeDoiKey(stripped) {
  return stripped.replace(DOI_LABEL_PATTERN, '').toLowerCase();
}

/**
 * @param {number | undefined | null} candidate
 * @param {number} fallback
 * @returns {number}
 */
function clampPositiveInt(candidate, fallback) {
  if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
    return candidate;
  }
  return fallback;
}

/**
 * Scan ONE decoded text string for DOI-pattern occurrences.
 *
 * Overlap policy (mirrors `metaExtract.mjs`): candidates are collected
 * `doi.org`-first then raw, sorted `(start ASC, end DESC)` so a containing
 * `doi.org/…` occurrence wins over its embedded raw match, and a hit lying
 * fully INSIDE an already-accepted hit with the same dedupe key is skipped —
 * it describes the SAME textual occurrence and must not double-count. A raw
 * hit at the same key but DIFFERENT offsets (body prose vs the URL) is a
 * separate occurrence.
 *
 * @param {string} text decoded text (may contain `\n` — scanned across it)
 * @param {{page?: number, lineIndex?: number|null}} [anchor] location anchor
 *   stamped onto each hit (page defaults to 1; lineIndex defaults to null)
 * @returns {DoiHit[]} occurrences in deterministic `(start ASC, end DESC)`
 *   order; `[]` for empty or non-string input
 */
export function scanDoiOccurrences(text, anchor = {}) {
  if (typeof text !== 'string' || text.length === 0) return [];

  const page = anchor.page ?? 1;
  const lineIndex = anchor.lineIndex ?? null;

  /**
   * @type {Array<{doi: string, rawMatch: string, form: 'url'|'raw', start: number, end: number}>}
   */
  const candidates = [];
  for (const m of text.matchAll(DOI_ORG_PATTERN)) {
    candidates.push({
      doi: trimTrailingPunctuation(m[1]),
      rawMatch: m[0],
      form: 'url',
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  for (const m of text.matchAll(RAW_DOI_PATTERN)) {
    candidates.push({
      doi: trimTrailingPunctuation(m[0]),
      rawMatch: m[0],
      form: 'raw',
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  // Deterministic merge order: textual order; longest first so a containing
  // `doi.org/…` occurrence wins over its embedded raw occurrence.
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);

  /** @type {DoiHit[]} */
  const hits = [];
  /** @type {Array<{start: number, end: number, key: string}>} */
  const accepted = [];
  for (const candidate of candidates) {
    const key = normalizeDoiKey(candidate.doi);
    // Defensive: a strip that empties the match means "skip, never store an
    // empty DOI". Unreachable with the patterns above (the `10.<digits>/`
    // core never matches the strip class) — pinned only as a comment in
    // `test/unit/parse/doiDetect.test.mjs`.
    if (key === '') continue;
    const nested = accepted.some(
      (hit) => hit.key === key && hit.start <= candidate.start && candidate.end <= hit.end,
    );
    if (nested) continue; // same textual occurrence as an accepted hit
    accepted.push({ start: candidate.start, end: candidate.end, key });
    hits.push({
      doi: candidate.doi,
      rawMatch: candidate.rawMatch,
      form: candidate.form,
      start: candidate.start,
      end: candidate.end,
      page,
      lineIndex,
      provenanceKind: DETECTION_PROVENANCE_KIND,
      rationale: DETECTION_RATIONALE,
      analysisVersion: PARSE_ANALYSIS_VERSION,
      createdAt: null,
    });
  }
  return hits;
}

/**
 * Aggregate scanned hits across a whole document (lines in chronological
 * order). Dedupe key = lowercase(stripped DOI); the stored `doi` keeps the
 * FIRST occurrence's original casing; `occurrences` counts every hit for the
 * key across all lines (URL and raw forms of the same key count separately,
 * overlap-suppressed nested matches do not).
 *
 * The unique cap drops out-of-budget uniques entirely (never fabricated) and
 * does NOT flip `truncated` — truncation is a decode-budget concern and stays
 * `false` here.
 *
 * @param {Array<{text: string, page: number, index: number}>} lines index is
 *   the 1-based line number; lines with missing/non-string `text` (or
 *   non-object lines) are skipped safely
 * @param {{maxUniqueDois?: number}} [deps] override budget (falls back to
 *   schema {@link MAX_UNIQUE_DOIS})
 * @returns {{dois: CollectedDoi[], truncated: boolean}} always `truncated: false`
 */
export function collectDoiOccurrences(lines, deps = {}) {
  const maxUniqueDois = clampPositiveInt(deps.maxUniqueDois, MAX_UNIQUE_DOIS);

  /** @type {Map<string, CollectedDoi>} */
  const byKey = new Map();

  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (line === null || typeof line !== 'object') continue;
      if (typeof line.text !== 'string') continue;
      const hits = scanDoiOccurrences(line.text, { page: line.page, lineIndex: line.index });
      for (const hit of hits) {
        const key = normalizeDoiKey(hit.doi);
        if (key === '') continue; // defensive; cannot happen (see above)
        const existing = byKey.get(key);
        if (existing !== undefined) {
          existing.occurrences += 1; // repeats keep counting past the cap too
          continue;
        }
        // Honest cap: uniques beyond maxUniqueDois are dropped, not fabricated.
        if (byKey.size >= maxUniqueDois) continue;
        byKey.set(key, {
          doi: hit.doi, // first occurrence's stripped form, original casing
          occurrences: 1,
          firstPage: hit.page,
          firstLineIndex: hit.lineIndex,
          provenanceKind: DETECTION_PROVENANCE_KIND,
          rationale: DETECTION_RATIONALE,
          analysisVersion: PARSE_ANALYSIS_VERSION,
          createdAt: null,
        });
      }
    }
  }

  return { dois: [...byKey.values()], truncated: false };
}
