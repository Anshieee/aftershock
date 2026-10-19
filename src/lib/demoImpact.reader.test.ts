import { describe, expect, it } from 'vitest';
import {
  orderRecordedEntries,
  parseRecordedLocation,
} from './demoImpact';

/**
 * M7 Priority A — reader ordering + location-tolerance helpers (new
 * file; the existing `demoImpact.test.ts` untouched). Every case asserts
 * the honesty rules: nothing is invented for records without usable
 * recorded location metadata.
 */
describe('parseRecordedLocation — tolerant string-vs-object recording reader', () => {
  it('reads a structured object with page/section/offset', () => {
    expect(parseRecordedLocation({ page: 3, section: '2.1', offset: 12 })).toEqual({
      page: 3,
      section: '2.1',
      offset: 12,
    });
  });

  it('reads the SAME object shape when it arrives as the seed-time JSON string', () => {
    expect(parseRecordedLocation('{"page": 4, "section": "3.2", "offset": null}')).toEqual({
      page: 4,
      section: '3.2',
      offset: undefined,
    });
  });

  it('falls back to `excerptOffset` when `offset` is absent (CitationUse shape)', () => {
    expect(
      parseRecordedLocation({ page: 3, section: '2.1', excerptOffset: 5 }),
    ).toMatchObject({ page: 3, section: '2.1', offset: 5 });
  });

  it('keeps an unstructured recorded string verbatim and never invents coordinates', () => {
    expect(parseRecordedLocation('p.12')).toEqual({ raw: 'p.12' });
  });

  it('tolerates garbage, null, empty strings and malformed JSON without throwing', () => {
    expect(parseRecordedLocation(null)).toBeNull();
    expect(parseRecordedLocation(undefined)).toBeNull();
    expect(parseRecordedLocation('')).toBeNull();
    expect(parseRecordedLocation('{"page": "three"}')).toBeNull(); // non-numeric page
    expect(parseRecordedLocation('{not json')).toEqual({ raw: '{not json' });
    expect(parseRecordedLocation({ note: 'no locatable piece' })).toBeNull();
    expect(parseRecordedLocation(42)).toBeNull();
    expect(parseRecordedLocation([{ page: 1 }])).toBeNull();
    expect(parseRecordedLocation({ page: Number.NaN, section: '2.1' })).toEqual({ section: '2.1' });
  });
});

describe('orderRecordedEntries — recorded section → page → offset, unlocatable last', () => {
  const item = (id: string) => ({ id, text: `text-${id}` });

  it('orders deterministically by recorded section, then page, then offset, then id', () => {
    const ordered = orderRecordedEntries(
      [
        item('z-late'), // section 5.2, page 6 — sorts after section 2.1
        item('b-same-page-offset-tie'),
        item('a-same-page-offset-tie'),
        item('c-offset-later'),
        item('no-loc'), // unlocatable → last
      ],
      (entry) => entry.id,
      (entry) =>
        entry.id === 'z-late'
          ? { page: 6, section: '5.2' }
          : entry.id === 'a-same-page-offset-tie'
            ? { page: 3, section: '2.1', offset: 0 }
            : entry.id === 'b-same-page-offset-tie'
              ? { page: 3, section: '2.1', offset: 0 }
              : entry.id === 'c-offset-later'
                ? { page: 3, section: '2.1', excerptOffset: 8 }
                : undefined,
    );
    expect(ordered.map((entry) => entry.id)).toEqual([
      'a-same-page-offset-tie',
      'b-same-page-offset-tie',
      'c-offset-later',
      'z-late',
      'no-loc',
    ]);
    expect(ordered.find((entry) => entry.id === 'no-loc')?.located).toBe(false);
    expect(ordered.find((entry) => entry.id === 'z-late')?.located).toBe(true);
  });

  it('keeps the JSON-string and object forms of the same recording equal in order', () => {
    const ordered = orderRecordedEntries(
      [item('as-string'), item('as-object'), item('as-same-eventual')],
      (entry) => entry.id,
      (entry) =>
        entry.id === 'as-string'
          ? '{"page": 3, "section": "2.1", "offset": 0}'
          : entry.id === 'as-object'
            ? { page: 3, section: '2.1', offset: 0 }
            : { page: 3, section: '2.1', offset: 1 },
    );
    // Id tie-break keeps the two identical recordings (offset 0) in a
    // stable id order, and the later recorded offset sorts after them.
    expect(ordered.map((entry) => entry.id)).toEqual([
      'as-object',
      'as-string',
      'as-same-eventual',
    ]);
  });

  it('groups section-less but page-located records after all sectioned ones, still before unlocatable', () => {
    const ordered = orderRecordedEntries(
      [item('orphan-page'), item('unlocated'), item('sectioned')],
      (entry) => entry.id,
      (entry) =>
        entry.id === 'orphan-page'
          ? { page: 9 }
          : entry.id === 'unlocated'
            ? null
            : { page: 1, section: '1' },
    );
    expect(ordered.map((entry) => entry.id)).toEqual(['sectioned', 'orphan-page', 'unlocated']);
  });

  it('does not mutate the input array and is idempotent', () => {
    const items = [item('b'), item('a')];
    const locations: Record<string, { page: number; section: string }> = {
      b: { page: 2, section: '1' },
      a: { page: 1, section: '1' },
    };
    const first = orderRecordedEntries(items, (entry) => entry.id, (entry) => locations[entry.id]);
    const second = orderRecordedEntries(items, (entry) => entry.id, (entry) => locations[entry.id]);
    expect(first.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(second.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(items.map((entry) => entry.id)).toEqual(['b', 'a']); // input untouched
  });
});
