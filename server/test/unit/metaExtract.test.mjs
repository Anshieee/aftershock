/**
 * Unit tests for `server/metaExtract.mjs` — Wave 3 TXT DOI extraction.
 *
 * Honesty rules under test: detection (not verification) on a bounded
 * prefix; tolerant decode (garbage in → no throw, fewer/no hits); honest
 * caps; duplicates collapsed case-insensitively; trailing punctuation
 * trimmed; `doi.org` URL form counted once; byte-budget truncation
 * disclosed. Synthetic text fixtures only — no real manuscripts.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_SCAN_BYTES,
  MAX_SNIPPET_LENGTH,
  MAX_UNIQUE_DOIS,
  extractTextMeta,
} from '../../metaExtract.mjs';

const enc = new TextEncoder();
const scan = (text, deps) => extractTextMeta(enc.encode(text), deps);

describe('metaExtract — constants of record', () => {
  it('exposes the specified budgets', () => {
    expect(MAX_SCAN_BYTES).toBe(524_288);
    expect(MAX_UNIQUE_DOIS).toBe(50);
    expect(MAX_SNIPPET_LENGTH).toBe(120);
  });
});

describe('metaExtract — TXT DOI detection', () => {
  it('finds multiple unique DOIs in first-seen order with occurrence counts', () => {
    const result = scan([
      'Intro cites 10.1111/first-alpha early.',
      'Later it cites 10.2222/second-beta and again 10.1111/first-alpha in closing.',
    ].join('\n'));
    expect(result.truncated).toBe(false);
    expect(result.dois.map((d) => d.doi)).toEqual(['10.1111/first-alpha', '10.2222/second-beta']);
    expect(result.dois.map((d) => d.occurrences)).toEqual([2, 1]);
  });

  it('collapses duplicates case-insensitively onto one entry', () => {
    const result = scan('refs 10.8765/SuMmArY-x; then 10.8765/summary-X once more.');
    expect(result.dois).toHaveLength(1);
    expect(result.dois[0].doi).toBe('10.8765/SuMmArY-x'); // first-seen spelling
    expect(result.dois[0].occurrences).toBe(2);
  });

  it('detects the doi.org URL form and does not double-count the embedded raw form', () => {
    const result = scan('Full text at https://doi.org/10.3456/url-form-ok');
    expect(result.dois).toHaveLength(1);
    expect(result.dois[0].doi).toBe('10.3456/url-form-ok');
    expect(result.dois[0].occurrences).toBe(1);
  });

  it('trims trailing punctuation characters [.,;:)] from matches', () => {
    const result = scan('see 10.7777/trim-me.,; more text 10.8888/parenthetical)');
    expect(result.dois.map((d) => d.doi)).toEqual(['10.7777/trim-me', '10.8888/parenthetical']);
  });

  it('respects the unique-DOI cap without inventing entries (injectable budget)', () => {
    const text = Array.from({ length: 5 }, (_, i) => `ref 10.${1000 + i}/cap-${i}`).join(' ');
    const small = scan(text, { maxUniqueDois: 3 });
    expect(small.dois).toHaveLength(3);
    expect(small.dois.map((d) => d.doi)).toEqual(['10.1000/cap-0', '10.1001/cap-1', '10.1002/cap-2']);
  });

  it('caps snippets at MAX_SNIPPET_LENGTH characters', () => {
    const result = scan(`before ${'x'.repeat(400)} 10.1999/long-snippet ${'y'.repeat(400)}`);
    expect(result.dois).toHaveLength(1);
    expect(result.dois[0].snippet?.length).toBe(MAX_SNIPPET_LENGTH);
  });

  it('collapses newlines/tabs in snippets to single spaces (UI safety)', () => {
    const result = scan('line one\nline two\tsep 10.2111/fixup\r\nend');
    expect(result.dois).toHaveLength(1);
    expect(result.dois[0].snippet).toBe('line one line two sep 10.2111/fixup end');
  });

  it('adds a snippet scoped around the FIRST occurrence only', () => {
    const result = scan(`start 10.3333/snippy middle ${'-'.repeat(300)} late 10.3333/snippy tail ${'-'.repeat(300)}`);
    expect(result.dois[0].occurrences).toBe(2);
    expect(result.dois[0].snippet).toContain('10.3333/snippy');
    expect(result.dois[0].snippet).toContain('start');
    expect(result.dois[0].snippet).not.toContain('late');
  });
});

describe('metaExtract — bounds + tolerance', () => {
  it('sets the truncation flag and scans only the bounded prefix of large files', () => {
    const text = `${'a'.repeat(200)}10.4444/inside-budget ${'b'.repeat(200)}`;
    const result = scan(text, { maxScanBytes: 150 });
    expect(result.truncated).toBe(true);
    expect(result.scannedBytes).toBe(150);
    expect(result.dois).toEqual([]); // the DOI lies beyond the declared budget
  });

  it('does not flag truncation for files at or below the injected budget', () => {
    expect(scan('10.4444/a', { maxScanBytes: 12 }).truncated).toBe(false);
    expect(scan('10.4444/way-under', { maxScanBytes: 1000 }).truncated).toBe(false);
  });

  it('never throws on binary garbage; yields an honest no-hit result', () => {
    const garbage = new Uint8Array(1024);
    for (let i = 0; i < garbage.length; i += 1) garbage[i] = (i * 137 + 19) % 256;
    let result;
    expect(() => {
      result = extractTextMeta(garbage);
    }).not.toThrow();
    expect(result.dois).toEqual([]);
    expect(result.scannedBytes).toBe(1024);
  });

  it('handles the empty body honestly (empty scan, no truncation)', () => {
    expect(extractTextMeta(new Uint8Array(0))).toEqual({
      scannedBytes: 0,
      truncated: false,
      dois: [],
    });
  });

  it('tolerates no-DOI text with an empty candidate list', () => {
    const result = scan('a plain paragraph with no reference markers at all.\n\n10.5 percent is not a DOI prefix match (only one dot).');
    expect(result.dois).toEqual([]);
  });
});
