/**
 * Unit tests for `server/parse/doiDetect.mjs` — M9/M10 DOI candidate
 * detection over already-decoded text lines.
 *
 * Honesty rules under test: pattern DETECTION only (`observed` provenance +
 * schema rationale + `parse-1` — never verification); dedupe keys are
 * case-insensitive while the stored DOI keeps the first-seen casing; trailing
 * punctuation `.,;:)` is stripped before storage/keys; a raw match nested
 * inside a same-key `doi.org/…` match counts ONCE while the same key at
 * different offsets counts separately; uniques beyond the cap are dropped,
 * never fabricated; `truncated` stays `false` (decode budgets belong to the
 * text-decode tier). Semantics mirror deployed `server/metaExtract.mjs`
 * without importing it. Synthetic fixtures only — no real manuscripts.
 */

import { describe, expect, it } from 'vitest';
import { collectDoiOccurrences, scanDoiOccurrences } from '../../../parse/doiDetect.mjs';
import {
  DETECTION_PROVENANCE_KIND,
  DETECTION_RATIONALE,
  MAX_UNIQUE_DOIS,
  PARSE_ANALYSIS_VERSION,
} from '../../../parse/schema.mjs';

describe('doiDetect — scanDoiOccurrences: raw form', () => {
  it('returns doi, form "raw", and offsets that slice back to the exact substring', () => {
    const text = 'cites 10.5555/aft-fixture-001 in passing';
    const hits = scanDoiOccurrences(text);
    expect(hits).toHaveLength(1);
    expect(hits[0].doi).toBe('10.5555/aft-fixture-001');
    expect(hits[0].form).toBe('raw');
    expect(hits[0].start).toBe(6);
    expect(hits[0].end).toBe(29); // 6 + len('10.5555/aft-fixture-001')
    expect(hits[0].rawMatch).toBe('10.5555/aft-fixture-001');
    expect(text.slice(hits[0].start, hits[0].end)).toBe(hits[0].rawMatch);
  });
});

describe('doiDetect — scanDoiOccurrences: doi.org URL form', () => {
  it('strips the URL wrapper to the bare DOI and reports form "url"', () => {
    const text = 'Full text at https://doi.org/10.5555/aft-fixture-002';
    const hits = scanDoiOccurrences(text);
    expect(hits).toHaveLength(1); // embedded raw match is overlap-suppressed
    expect(hits[0].doi).toBe('10.5555/aft-fixture-002');
    expect(hits[0].form).toBe('url');
    const start = text.indexOf('doi.org/');
    expect(hits[0].rawMatch).toBe('doi.org/10.5555/aft-fixture-002');
    expect(hits[0].start).toBe(start);
    expect(hits[0].end).toBe(start + hits[0].rawMatch.length);
    expect(text.slice(hits[0].start, hits[0].end)).toBe(hits[0].rawMatch);
  });

  it('strips trailing punctuation [.,;:)] from both forms before storage', () => {
    // NOTE (defensive skip): a strip that left an EMPTY string means the hit
    // is skipped — unreachable with these patterns, because the mandatory
    // `10.<digits>/` core never matches the strip class `[.,;:)]`, so the
    // stripped value can never be emptied. Pinned here as a comment only.
    const urlText = 'https://doi.org/10.5555/aft-fixture-001.';
    const urlHits = scanDoiOccurrences(urlText);
    expect(urlHits).toHaveLength(1);
    expect(urlHits[0].doi).toBe('10.5555/aft-fixture-001'); // trailing `.` gone
    expect(urlHits[0].form).toBe('url');
    expect(urlHits[0].rawMatch).toBe('doi.org/10.5555/aft-fixture-001.'); // verbatim, incl. `.`
    expect(urlText.slice(urlHits[0].start, urlHits[0].end)).toBe(urlHits[0].rawMatch);

    const rawHits = scanDoiOccurrences('see 10.5555/aft-fixture-005.');
    expect(rawHits).toHaveLength(1);
    expect(rawHits[0].doi).toBe('10.5555/aft-fixture-005');
    expect(rawHits[0].form).toBe('raw');
    expect(rawHits[0].rawMatch).toBe('10.5555/aft-fixture-005.');
  });
});

describe('doiDetect — overlap suppression and separate occurrences', () => {
  it('counts a raw match nested inside a same-key doi.org match exactly once', () => {
    const text = 'https://doi.org/10.5555/aft-fixture-003';
    const hits = scanDoiOccurrences(text); // nested raw form must NOT double-count
    expect(hits).toHaveLength(1);
    expect(hits[0].form).toBe('url');
    expect(hits[0].doi).toBe('10.5555/aft-fixture-003');

    const result = collectDoiOccurrences([{ text, page: 1, index: 1 }]);
    expect(result.dois).toHaveLength(1);
    expect(result.dois[0].occurrences).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('counts the same key at DIFFERENT offsets (prose vs URL) as separate occurrences', () => {
    const text = 'cites 10.5555/aft-fixture-004 and https://doi.org/10.5555/aft-fixture-004';
    const hits = scanDoiOccurrences(text);
    expect(hits.map((h) => h.form)).toEqual(['raw', 'url']); // nested raw suppressed
    expect(hits.every((h) => h.doi === '10.5555/aft-fixture-004')).toBe(true);

    const result = collectDoiOccurrences([{ text, page: 1, index: 1 }]);
    expect(result.dois).toHaveLength(1);
    expect(result.dois[0].occurrences).toBe(2);
  });
});

describe('doiDetect — scanDoiOccurrences: anchors and provenance', () => {
  const text = '10.5555/aft-fixture-001 and 10.6666/anchor-two';

  it('defaults the anchor to page 1 / lineIndex null and stamps provided anchors', () => {
    expect(scanDoiOccurrences(text)).toHaveLength(2);
    expect(scanDoiOccurrences(text).map((h) => [h.page, h.lineIndex])).toEqual([
      [1, null],
      [1, null],
    ]);
    expect(scanDoiOccurrences(text, { page: 3, lineIndex: 7 }).map((h) => [h.page, h.lineIndex])).toEqual([
      [3, 7],
      [3, 7],
    ]);
    // lineIndex 0 is a real value, not "absent" — must not fall back to null.
    expect(scanDoiOccurrences(text, { page: 2, lineIndex: 0 })[0].lineIndex).toBe(0);
    expect(scanDoiOccurrences(text, { page: 2 })[0].lineIndex).toBeNull();
  });

  it('stamps observed-only provenance on every hit (never verification)', () => {
    const hits = scanDoiOccurrences('x 10.5555/prov-one y https://doi.org/10.6666/prov-two');
    expect(hits).toHaveLength(2);
    for (const hit of hits) {
      expect(hit.provenanceKind).toBe('observed');
      expect(hit.provenanceKind).toBe(DETECTION_PROVENANCE_KIND);
      expect(hit.provenanceKind).not.toBe('source_verified');
      expect(hit.provenanceKind).not.toBe('human_confirmed');
      expect(hit.rationale).toBe(DETECTION_RATIONALE);
      expect(hit.analysisVersion).toBe('parse-1');
      expect(hit.analysisVersion).toBe(PARSE_ANALYSIS_VERSION);
      expect(hit.createdAt).toBeNull(); // caller stamps a real ISO timestamp later
    }
  });

  it('returns [] for empty, no-marker, and non-string input', () => {
    expect(scanDoiOccurrences('')).toEqual([]);
    expect(scanDoiOccurrences('plain prose without any marker')).toEqual([]);
    expect(scanDoiOccurrences(42)).toEqual([]); // defensive: never throws
    expect(scanDoiOccurrences(null)).toEqual([]);
  });
});

describe('doiDetect — collectDoiOccurrences: aggregation', () => {
  it('returns an honest empty result for an empty document', () => {
    expect(collectDoiOccurrences([])).toEqual({ dois: [], truncated: false });
    expect(collectDoiOccurrences()).toEqual({ dois: [], truncated: false }); // defensive
  });

  it('merges two lines with the same DOI in different forms and records first-seen location', () => {
    const result = collectDoiOccurrences([
      { text: 'see https://doi.org/10.5555/aft-fixture-001', page: 4, index: 12 },
      { text: 'again 10.5555/aft-fixture-001 later', page: 5, index: 3 },
    ]);
    expect(result.dois).toHaveLength(1);
    expect(result.dois[0].doi).toBe('10.5555/aft-fixture-001');
    expect(result.dois[0].occurrences).toBe(2); // form-conflated: url + raw
    expect(result.dois[0].firstPage).toBe(4); // location of the occurrence that CREATED the key
    expect(result.dois[0].firstLineIndex).toBe(12);
    expect(result.truncated).toBe(false);
  });

  it('merges case-insensitively while storing first-seen ORIGINAL casing', () => {
    const result = collectDoiOccurrences([
      { text: 'refs 10.5555/AFT-FIXTURE-001.', page: 1, index: 1 },
      { text: 'again 10.5555/aft-fixture-001 here', page: 1, index: 9 },
    ]);
    expect(result.dois).toHaveLength(1);
    expect(result.dois[0].doi).toBe('10.5555/AFT-FIXTURE-001'); // casing kept, `.` stripped
    expect(result.dois[0].occurrences).toBe(2); // key lowercased
  });

  it('drops out-of-budget uniques entirely but keeps counting the kept key', () => {
    const lines = [
      { text: 'first ref 10.1111/first-alpha', page: 1, index: 1 },
      { text: 'second ref 10.2222/second-beta', page: 1, index: 2 },
      { text: 'first again 10.1111/first-alpha', page: 1, index: 3 },
    ];
    const result = collectDoiOccurrences(lines, { maxUniqueDois: 1 });
    expect(result.dois).toHaveLength(1);
    expect(result.dois[0].doi).toBe('10.1111/first-alpha');
    expect(result.dois[0].occurrences).toBe(2); // repeats still count past the cap
    expect(result.dois.map((d) => d.doi)).not.toContain('10.2222/second-beta'); // dropped, never fabricated
    expect(result.truncated).toBe(false); // cap never flips the decode-tier flag
  });

  it('falls back to the schema MAX_UNIQUE_DOIS budget when no override is given', () => {
    const lines = Array.from({ length: MAX_UNIQUE_DOIS + 2 }, (_, i) => ({
      text: `ref 10.${1000 + i}/cap-${i}`,
      page: 1,
      index: i + 1,
    }));
    const result = collectDoiOccurrences(lines);
    expect(result.dois).toHaveLength(MAX_UNIQUE_DOIS);
    expect(result.dois).toHaveLength(50);
    expect(result.dois[0].doi).toBe('10.1000/cap-0'); // first-seen order
    expect(result.dois[MAX_UNIQUE_DOIS - 1].doi).toBe('10.1049/cap-49');
    expect(result.truncated).toBe(false);
  });

  it('skips garbage and text-less lines safely, keeping the valid ones', () => {
    const result = collectDoiOccurrences([
      null,
      undefined,
      'not-a-line',
      {}, // missing text
      { text: 42, page: 1, index: 1 }, // non-string text
      { text: '', page: 1, index: 2 }, // empty text
      { text: 'keeper 10.9999/safe-skip', page: 7, index: 11 },
    ]);
    expect(result.dois).toHaveLength(1);
    expect(result.dois[0].doi).toBe('10.9999/safe-skip');
    expect(result.dois[0].firstPage).toBe(7);
    expect(result.dois[0].firstLineIndex).toBe(11);
    expect(result.truncated).toBe(false);
  });

  it('carries the full observed-provenance envelope on every collected entry', () => {
    const result = collectDoiOccurrences([{ text: 'ref 10.1111/first-alpha', page: 2, index: 5 }]);
    expect(result.dois[0]).toEqual({
      doi: '10.1111/first-alpha',
      occurrences: 1,
      firstPage: 2,
      firstLineIndex: 5,
      provenanceKind: 'observed',
      rationale: DETECTION_RATIONALE,
      analysisVersion: 'parse-1',
      createdAt: null,
    });
    expect(result.dois[0].provenanceKind).toBe(DETECTION_PROVENANCE_KIND);
    expect(result.dois[0].analysisVersion).toBe(PARSE_ANALYSIS_VERSION);
    expect(result.dois[0].createdAt).toBeNull();
  });
});
