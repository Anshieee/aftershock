import { describe, expect, it } from 'vitest';
import { locatePhrase, normalizeForSearch, transformMatrix } from '../src/lib/anchors';
import type { PdfTextItemLike } from '../src/lib/anchors';

/**
 * A PDF.js-like viewport transform: identity scale, y flipped, origin at
 * the top-left of the page (595.28 × 841.89 points).
 */
const VIEWPORT = [1, 0, 0, -1, 0, 841.89];

function item(str: string, x: number, baseline: number, width: number): PdfTextItemLike {
  return {
    str,
    transform: [10.2, 0, 0, 10.2, x, 841.89 - baseline],
    width,
    height: 10.2,
  };
}

/**
 * Two lines of justified text, drawn word by word — the same shape the
 * generator produces. There is no explicit space glyph between words, so
 * the resolver has to measure the gap.
 */
const ITEMS: PdfTextItemLike[] = [
  item('Registry', 68, 120, 42),
  item('cohorts', 112, 120, 40),
  item('in', 154, 120, 11),
  item('comparable', 167, 120, 58),
  item('settings', 227, 120, 40),
  item('have', 269, 120, 24),
  item('reported', 295, 120, 42),
  item('a', 339, 120, 5),
  item('marked', 346, 120, 36),
  item('reduction', 384, 120, 46),
  // --- second line ---
  item('in', 68, 134.4, 11),
  item('time-to-antibiotics', 81, 134.4, 84),
  item('when', 167, 134.4, 26),
  item('marker', 195, 134.4, 33),
  item('panels', 230, 134.4, 33),
];

describe('transformMatrix', () => {
  it('matches the PDF.js composition order', () => {
    const viewport = [2, 0, 0, -2, 0, 841.89];
    const itemMatrix = [10.2, 0, 0, 10.2, 100, 700];
    const [a, b, c, d, e, f] = transformMatrix(viewport, itemMatrix);
    expect(a).toBeCloseTo(20.4);
    expect(b).toBeCloseTo(0);
    expect(c).toBeCloseTo(0);
    expect(d).toBeCloseTo(-20.4);
    expect(e).toBeCloseTo(200);
    expect(f).toBeCloseTo(841.89 - 1400);
  });
});

describe('normalizeForSearch', () => {
  it('collapses whitespace runs', () => {
    expect(normalizeForSearch('  a \n  b\t c ')).toBe('a b c');
  });
});

describe('locatePhrase', () => {
  it('finds a phrase that runs across a line break', () => {
    const match = locatePhrase(ITEMS, 'marked reduction in time-to-antibiotics', {
      pageIndex: 2,
      viewportTransform: VIEWPORT,
    });
    expect(match).not.toBeNull();
    expect(match?.pageIndex).toBe(2);
    // The phrase spans two lines, so more than one rectangle is needed.
    expect(match?.rects.length).toBeGreaterThan(1);
  });

  it('returns rectangles that sit over the actual glyphs', () => {
    const match = locatePhrase(ITEMS, 'cohorts in', {
      pageIndex: 0,
      viewportTransform: VIEWPORT,
    });
    expect(match).not.toBeNull();
    const first = match!.rects[0]!;
    expect(first.x).toBeCloseTo(112, 0);
    expect(first.width).toBeGreaterThan(30);
    // The rectangle sits above the baseline of the line it belongs to.
    expect(first.y).toBeLessThan(120);
    expect(first.y + first.height).toBeGreaterThan(120);
  });

  it('never fabricates a highlight for a phrase that is not present', () => {
    const match = locatePhrase(ITEMS, 'a phrase that does not exist', {
      pageIndex: 0,
      viewportTransform: VIEWPORT,
    });
    expect(match).toBeNull();
  });

  it('returns null for an empty page', () => {
    const match = locatePhrase([], 'anything', {
      pageIndex: 0,
      viewportTransform: VIEWPORT,
    });
    expect(match).toBeNull();
  });

  it('ignores a phrase that differs only in whitespace', () => {
    const match = locatePhrase(ITEMS, 'registry   cohorts\n in', {
      pageIndex: 0,
      viewportTransform: VIEWPORT,
    });
    expect(match).not.toBeNull();
  });
});
