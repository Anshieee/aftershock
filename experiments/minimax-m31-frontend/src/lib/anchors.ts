/**
 * PDF phrase anchoring.
 *
 * Annotations in this prototype are never guessed: a finding's passage is
 * located inside the *actual* text layer of the rendered PDF, using the
 * geometry PDF.js reports for each text run. That is what keeps a highlight
 * on the right words across zoom levels, column layouts and page changes.
 *
 * If a phrase cannot be found in the PDF text, the resolver returns `null`
 * and the UI shows the finding in the summary without an inline highlight —
 * a fabricated highlight is never drawn.
 */

export interface PdfTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnchorMatch {
  /** Zero-based page index. */
  pageIndex: number;
  /** One rectangle per text run the phrase covers. */
  rects: AnchorRect[];
  /** The matched text, normalised. */
  matchedText: string;
}

/** Fraction of the font height above the baseline used for the highlight. */
const ASCENT_RATIO = 0.82;
/** Slight extra leading below the baseline so descenders are not clipped. */
const DESCENT_RATIO = 0.24;

/**
 * 2D affine matrix multiplication, matching the semantics of PDF.js's
 * `Util.transform` (m1 applied to m2).
 */
export function transformMatrix(
  m1: readonly number[],
  m2: readonly number[],
): [number, number, number, number, number, number] {
  return [
    m1[0]! * m2[0]! + m1[2]! * m2[1]!,
    m1[1]! * m2[0]! + m1[3]! * m2[1]!,
    m1[0]! * m2[2]! + m1[2]! * m2[3]!,
    m1[1]! * m2[2]! + m1[3]! * m2[3]!,
    m1[0]! * m2[4]! + m1[2]! * m2[5]! + m1[4]!,
    m1[1]! * m2[4]! + m1[3]! * m2[5]! + m1[5]!,
  ];
}

/** Collapses every whitespace run to a single space and trims. */
export function normalizeForSearch(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

interface NormalisedPage {
  text: string;
  /** For every character in `text`, the index of the item it came from. */
  owner: number[];
  /** For every item, the [start, end) range it occupies in `text`. */
  ranges: Array<[number, number]>;
}

/**
 * Rebuilds the reading text of a page from the PDF's own text runs.
 *
 * PDF.js does not always emit an explicit space glyph between runs, so the
 * gap between consecutive runs is measured and a space is inserted when the
 * runs are visually separated — and when a run starts on a new line. This is
 * the same reasoning PDF.js's own search uses, and it is what lets a phrase
 * be found across a line break or a column break.
 */
function normaliseItems(
  items: readonly PdfTextItemLike[],
  viewportTransform: readonly number[],
): NormalisedPage {
  const metrics = items.map((item) => {
    const tx = transformMatrix(viewportTransform, item.transform);
    const fontHeight = item.height || Math.hypot(tx[2]!, tx[3]!) || 10;
    return { left: tx[4]!, baseline: tx[5]!, fontHeight, width: item.width || 0 };
  });

  let text = '';
  const owner: number[] = [];
  const ranges: Array<[number, number]> = [];

  items.forEach((item, index) => {
    const metric = metrics[index]!;
    if (index > 0) {
      const previous = metrics[index - 1]!;
      const newLine = Math.abs(metric.baseline - previous.baseline) > metric.fontHeight * 0.4;
      const gap = metric.left - (previous.left + previous.width);
      const separated = gap > Math.max(0.9, metric.fontHeight * 0.12);
      if ((newLine || separated) && !text.endsWith(' ') && text.length > 0) {
        text += ' ';
        owner.push(index - 1);
      }
    }

    const start = text.length;
    const squashed = (item.str ?? '').replace(/\s+/g, ' ');
    for (const char of squashed) {
      if (char === ' ' && (text.length === 0 || text.endsWith(' '))) continue;
      text += char;
      owner.push(index);
    }
    ranges.push([start, text.length]);
  });

  return { text, owner, ranges };
}

/**
 * Locates `phrase` inside one page's text items.
 *
 * `viewportTransform` is the six-element matrix of the page viewport, so the
 * returned rectangles are expressed in the same coordinate space the page
 * canvas is painted in.
 */
export function locatePhrase(
  items: readonly PdfTextItemLike[],
  phrase: string,
  options: { pageIndex: number; viewportTransform: readonly number[] },
): AnchorMatch | null {
  const needle = normalizeForSearch(phrase);
  if (needle.length === 0) return null;

  const page = normaliseItems(items, options.viewportTransform);
  if (page.text.length === 0) return null;

  const at = page.text.indexOf(needle);
  if (at === -1) return null;
  const end = at + needle.length;

  const rects: AnchorRect[] = [];
  const touched = new Set<number>();

  for (let cursor = at; cursor < end; cursor += 1) {
    const itemIndex = page.owner[cursor];
    if (itemIndex === undefined || touched.has(itemIndex)) continue;
    touched.add(itemIndex);

    const item = items[itemIndex];
    if (!item) continue;

    const tx = transformMatrix(options.viewportTransform, item.transform);
    const fontHeight = item.height || Math.hypot(tx[2]!, tx[3]!) || 10;
    const left = tx[4]!;
    const baseline = tx[5]!;

    // Horizontal clipping when the phrase starts or ends inside a run.
    const range = page.ranges[itemIndex] ?? [0, 0];
    const runLength = Math.max(1, range[1] - range[0]);
    const localStart = Math.max(0, cursor - range[0]);
    const localEnd = Math.min(runLength, end - range[0]);
    const width = item.width || 0;
    const xOffset = (localStart / runLength) * width;
    const clippedWidth = ((localEnd - localStart) / runLength) * width;

    const top = baseline - fontHeight * ASCENT_RATIO;
    const height = fontHeight * (ASCENT_RATIO + DESCENT_RATIO);

    rects.push({
      x: left + xOffset,
      y: top,
      width: Math.max(2, clippedWidth),
      height,
    });
  }

  if (rects.length === 0) return null;

  // Reading order: top-to-bottom, then left-to-right.
  rects.sort((a, b) => (Math.abs(a.y - b.y) > 1 ? a.y - b.y : a.x - b.x));

  return {
    pageIndex: options.pageIndex,
    rects,
    matchedText: page.text.slice(at, end),
  };
}
