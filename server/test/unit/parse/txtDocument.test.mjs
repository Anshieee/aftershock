/**
 * Unit tests for `server/parse/txtDocument.mjs` — bounded TXT decoding,
 * conservative reference-heading detection, and numbered entry segmentation.
 *
 * Honesty rules under test: bounded decode with disclosed truncation; tolerant
 * decode that never throws; absent bytes reported as a decode failure; headings
 * must be standalone short lines (prose never matches); segmentation is skipped
 * (with a note) under two markers; entry caps drop rather than invent; every
 * entry carries `observed` provenance. Synthetic text only — no real
 * manuscripts.
 */

import { describe, expect, it } from 'vitest';
import {
  DETECTION_RATIONALE,
  PARSE_ANALYSIS_VERSION,
} from '../../../parse/schema.mjs';
import {
  decodeTxtLines,
  findReferencesSection,
  segmentReferenceEntries,
} from '../../../parse/txtDocument.mjs';

const enc = new TextEncoder();
const decode = (text, deps) => decodeTxtLines(enc.encode(text), deps);
const linesOf = (text) => decode(text).lines;

const FIXTURE_LIKE = [
  'FICTIONAL / GUIDED DEMO — synthetic parsing fixture',
  'References',
  '[1] Demo, A. (2020). A local fixture study.',
  '[2] Sample, B. (2021). Bounding extraction work',
  'offline in a synthetic fixture.',
  'Second continuation line here.',
  '[3] Third, C. (2022). Closing entry.',
].join('\n');

describe('parse/txtDocument — decodeTxtLines', () => {
  it('decodes basic text into 1-based located lines on page 1', () => {
    const result = decode('first line\nsecond line');
    expect(result.attempted).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.decodeFailed).toBe(false);
    expect(result.textLength).toBe('first line\nsecond line'.length);
    expect(result.notes).toEqual([]);
    expect(result.lines).toEqual([
      { index: 1, page: 1, text: 'first line' },
      { index: 2, page: 1, text: 'second line' },
    ]);
  });

  it('splits CRLF and preserves blank trailing lines as counted entries', () => {
    const result = decode('alpha\r\n\r\nbeta\r\n');
    expect(result.lines.map((line) => line.text)).toEqual(['alpha', '', 'beta', '']);
    expect(result.lines.map((line) => line.index)).toEqual([1, 2, 3, 4]);
    expect(result.lines.every((line) => line.page === 1)).toBe(true);
  });

  it('strips a leading BOM from the first line', () => {
    const result = decode('\uFEFFHeading text\nbody');
    expect(result.lines[0].text).toBe('Heading text');
    expect(result.textLength).toBe('Heading text\nbody'.length);
  });

  it('reports absent/non-Uint8Array bytes honestly without throwing', () => {
    for (const input of [null, undefined, 'not bytes', { length: 3 }, [1, 2, 3]]) {
      let result;
      expect(() => {
        result = decodeTxtLines(input);
      }).not.toThrow();
      expect(result.attempted).toBe(true);
      expect(result.decodeFailed).toBe(true);
      expect(result.truncated).toBe(false);
      expect(result.textLength).toBe(0);
      expect(result.lines).toEqual([]);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0]).toContain('nothing was decoded');
    }
  });

  it('truncates at an injected byte budget and discloses it', () => {
    const result = decode('line one\nline two\nline three', { maxDecodeBytes: 8 });
    expect(result.truncated).toBe(true);
    expect(result.textLength).toBe(8);
    expect(result.lines).toEqual([{ index: 1, page: 1, text: 'line one' }]);
  });

  it('does not flag truncation at or under the injected budget', () => {
    const text = 'short text';
    expect(decode(text, { maxDecodeBytes: text.length }).truncated).toBe(false);
    expect(decode(text, { maxDecodeBytes: 1000 }).truncated).toBe(false);
  });

  it('never throws on binary garbage and claims no decode failure', () => {
    const garbage = new Uint8Array(512);
    for (let i = 0; i < garbage.length; i += 1) garbage[i] = (i * 137 + 19) % 256;
    let result;
    expect(() => {
      result = decodeTxtLines(garbage);
    }).not.toThrow();
    expect(result.decodeFailed).toBe(false);
    expect(Array.isArray(result.lines)).toBe(true);
    expect(result.textLength).toBeGreaterThan(0);
  });
});

describe('parse/txtDocument — findReferencesSection', () => {
  it('finds a case-insensitive standalone "References" heading', () => {
    const lines = linesOf('Intro paragraph.\nREFERENCES\n[1] one\n[2] two');
    const result = findReferencesSection(lines);
    expect(result).toEqual({
      found: true,
      startIndex: 2,
      headingText: 'REFERENCES',
      note: '',
    });
  });

  it('accepts "bibliography:" and "Works Cited" headings', () => {
    const bibliography = findReferencesSection(linesOf('Text\nBibliography:\n1. entry'));
    expect(bibliography.found).toBe(true);
    expect(bibliography.startIndex).toBe(2);
    expect(bibliography.headingText).toBe('Bibliography:');

    const worksCited = findReferencesSection(linesOf('Text\nWorks Cited\n[1] entry'));
    expect(worksCited.found).toBe(true);
    expect(worksCited.startIndex).toBe(2);
    expect(worksCited.headingText).toBe('Works Cited');
  });

  it('does not match prose lines that merely mention references', () => {
    const prose = [
      'In the references of the paper, the authors mention many prior studies.',
      'References were suggested by an anonymous reviewer and added later.',
      'The bibliography section discusses extraction budgets in detail.',
    ].join('\n');
    const result = findReferencesSection(linesOf(prose));
    expect(result.found).toBe(false);
    expect(result.startIndex).toBeNull();
    expect(result.headingText).toBeNull();
    expect(result.note).toBe(
      'No standalone reference heading (references/bibliography/works cited) found; section detection skipped.',
    );
  });

  it('returns the documented skip note when no heading exists', () => {
    expect(findReferencesSection(linesOf('Only body text.\nNothing else.')).note).toBe(
      'No standalone reference heading (references/bibliography/works cited) found; section detection skipped.',
    );
  });
});

describe('parse/txtDocument — segmentReferenceEntries', () => {
  it('segments bracketed markers with continuation lines and correct ranges', () => {
    const lines = linesOf(FIXTURE_LIKE);
    const heading = findReferencesSection(lines);
    expect(heading.startIndex).toBe(2);

    const result = segmentReferenceEntries(lines, heading.startIndex);
    expect(result.segmented).toBe('numbered');
    expect(result.truncated).toBe(false);
    expect(result.note).toBe('');
    expect(result.entries.map((entry) => entry.number)).toEqual([1, 2, 3]);
    expect(result.entries.map((entry) => entry.rawText)).toEqual([
      'Demo, A. (2020). A local fixture study.',
      'Sample, B. (2021). Bounding extraction work offline in a synthetic fixture. Second continuation line here.',
      'Third, C. (2022). Closing entry.',
    ]);
    expect(result.entries.map((entry) => entry.startLineIndex)).toEqual([3, 4, 7]);
    expect(result.entries.map((entry) => entry.endLineIndex)).toEqual([3, 6, 7]);
  });

  it('accepts bare "1." and "2)" marker forms', () => {
    const lines = linesOf('References\n1. Alpha entry text.\n2) Beta entry text.');
    const result = segmentReferenceEntries(lines, 1);
    expect(result.entries.map((entry) => entry.number)).toEqual([1, 2]);
    expect(result.entries.map((entry) => entry.rawText)).toEqual([
      'Alpha entry text.',
      'Beta entry text.',
    ]);
  });

  it('skips segmentation honestly with fewer than two markers', () => {
    const lines = linesOf('References\n[1] Only one numbered line.\nPlain closing prose.');
    const result = segmentReferenceEntries(lines, 1);
    expect(result.entries).toEqual([]);
    expect(result.segmented).toBe('unsegmented');
    expect(result.truncated).toBe(false);
    expect(result.note).toBe(
      'Fewer than two numbered reference markers found; entry segmentation skipped.',
    );
  });

  it('skips segmentation when no heading index is supplied', () => {
    const lines = linesOf('References\n[1] one\n[2] two');
    const result = segmentReferenceEntries(lines, null);
    expect(result).toEqual({
      entries: [],
      segmented: 'unsegmented',
      truncated: false,
      note: 'No reference heading detected; entries not segmented.',
    });
  });

  it('caps entries without inventing extras and discloses truncation', () => {
    const lines = linesOf('References\n[1] one\n[2] two\n[3] three');
    const result = segmentReferenceEntries(lines, 1, { maxEntries: 1 });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].number).toBe(1);
    expect(result.segmented).toBe('numbered');
    expect(result.truncated).toBe(true);
    expect(result.note).toContain('2 additional entries were dropped');
  });

  it('stamps observed provenance on every entry', () => {
    const lines = linesOf(FIXTURE_LIKE);
    const result = segmentReferenceEntries(lines, 2);
    for (const entry of result.entries) {
      expect(entry.provenanceKind).toBe('observed');
      expect(entry.provenanceKind).not.toBe('source_verified');
      expect(entry.provenanceKind).not.toBe('human_confirmed');
      expect(entry.rationale).toBe(DETECTION_RATIONALE);
      expect(entry.analysisVersion).toBe(PARSE_ANALYSIS_VERSION);
      expect(entry.createdAt).toBeNull();
    }
  });
});
