/**
 * Generates the prototype's fictional sample manuscript PDF.
 *
 *   node scripts/make-sample-manuscript.ts
 *
 * Writes:
 *   public/sample-manuscript.pdf      — the rendered manuscript
 *   src/fixtures/anchors.generated.json — per-page text-line geometry used
 *                                         to verify annotation alignment
 *
 * The manuscript content itself lives in src/fixtures/manuscriptContent.ts
 * so the PDF and the reflowed reading mode can never drift apart.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { manuscript, type ManuscriptBlock, type ManuscriptSection } from '../src/fixtures/manuscriptContent.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/* ------------------------------------------------------------------ *
 * Page geometry (A4, points)
 * ------------------------------------------------------------------ */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 68;
const MARGIN_TOP = 74;
const MARGIN_BOTTOM = 66;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const GUTTER = 26;
const CONTENT_BOTTOM = PAGE_H - MARGIN_BOTTOM;

const BODY_FONT = 'Times-Roman';
const BOLD_FONT = 'Times-Bold';
const ITALIC_FONT = 'Times-Italic';
const SANS_FONT = 'Helvetica';
const SANS_BOLD_FONT = 'Helvetica-Bold';

const BODY_SIZE = 10.2;
const BODY_LEAD = 14.4;

/* ------------------------------------------------------------------ *
 * Geometry records
 * ------------------------------------------------------------------ */
interface LineRecord {
  page: number;
  text: string;
  /** Baseline x in PDF points (origin top-left, y grows downward). */
  x: number;
  /** Baseline y in PDF points (origin top-left, y grows downward). */
  y: number;
  width: number;
  fontSize: number;
  font: string;
}

const lines: LineRecord[] = [];

/** Shared vertical cursor for the page flow. */
let flowY = MARGIN_TOP;

/** 1-based page counter tracked alongside the PDF document. */
let currentPage = 1;

function addPage(doc: PDFKit.PDFDocument): void {
  doc.addPage();
  currentPage += 1;
  flowY = MARGIN_TOP;
}

function measure(doc: PDFKit.PDFDocument, text: string, font: string, size: number): number {
  return doc.font(font).fontSize(size).widthOfString(text);
}

function wrapText(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  font: string,
  size: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(doc, candidate, font, size) <= width || current === '') {
      current = candidate;
    } else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Draws a wrapped paragraph and records each line's baseline geometry.
 * `y` is the TOP of the paragraph box (not the baseline).
 */
function drawParagraph(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: {
    font?: string;
    size?: number;
    leading?: number;
    align?: 'left' | 'justify';
    color?: string;
  } = {},
): number {
  const font = opts.font ?? BODY_FONT;
  doc.fillColor(opts.color ?? '#1b1b1b');
  const size = opts.size ?? BODY_SIZE;
  const leading = opts.leading ?? BODY_LEAD;
  const wrapped = wrapText(doc, text, width, font, size);
  const totalHeight = wrapped.length * leading;
  // Baseline of the first line: the paragraph box top plus the leading gap.
  const ascent = 0.891;
  let cursor = y + (leading - size * ascent) / 2 + size * ascent;
  for (const line of wrapped) {
    const lineWidth = measure(doc, line, font, size);
    let drawX = x;
    if (opts.align === 'justify' && line !== wrapped[wrapped.length - 1] && wrapped.length > 1) {
      const words = line.split(' ');
      const gaps = words.length - 1;
      const spaceWidth = measure(doc, ' ', font, size);
      const extra = (width - lineWidth) / Math.max(1, gaps);
      let cx = x;
      words.forEach((word, index) => {
        doc.font(font).fontSize(size).text(word, cx, cursor, { lineBreak: false, baseline: 'alphabetic' });
        cx += measure(doc, word, font, size) + (index < words.length - 1 ? spaceWidth + extra : 0);
      });
    } else {
      doc.font(font).fontSize(size).text(line, drawX, cursor, { lineBreak: false, baseline: 'alphabetic' });
      void drawX;
    }
    lines.push({
      page: currentPage,
      text: line,
      x: drawX,
      y: cursor,
      width: lineWidth,
      fontSize: size,
      font,
    });
    cursor += leading;
  }
  return y + totalHeight;
}

function drawHeading(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  level: 1 | 2 | 3,
): number {
  if (level === 1) {
    const h = drawParagraph(doc, text, x, y, width, { font: BOLD_FONT, size: 13.2, leading: 18 });
    return h + 6;
  }
  if (level === 2) {
    const h = drawParagraph(doc, text, x, y, width, { font: BOLD_FONT, size: 11, leading: 15 });
    return h + 3;
  }
  const h = drawParagraph(doc, text, x, y, width, { font: ITALIC_FONT, size: 10.4, leading: 14.4 });
  return h + 2;
}

function drawCaption(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
): number {
  const h = drawParagraph(doc, text, x, y, width, {
    font: SANS_FONT,
    size: 7.8,
    leading: 10.6,
    color: '#4a4a4a',
  });
  return h;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  block: Extract<ManuscriptBlock, { kind: 'table' }>,
  x: number,
  y: number,
  width: number,
): number {
  const captionHeight = drawCaption(doc, block.caption, x, y, width) + 8;
  let cursor = y + captionHeight;
  const cols = block.columns.length;
  const colWidth = width / cols;
  const rowHeight = 15.2;

  doc.save();
  doc.lineWidth(0.6);
  doc.strokeColor('#3a3a3a');
  // Header rule
  doc.moveTo(x, cursor).lineTo(x + width, cursor).stroke();
  cursor += 3.4;

  const drawRow = (cells: string[], bold: boolean) => {
    const font = bold ? SANS_BOLD_FONT : SANS_FONT;
    const size = 8.1;
    cells.forEach((cell, index) => {
      const cx = x + index * colWidth;
      const alignRight = index > 0;
      const textWidth = measure(doc, cell, font, size);
      const tx = alignRight ? cx + colWidth - 10 - textWidth : cx + 2;
      doc.font(font).fontSize(size).text(cell, tx, cursor + 4.6, { lineBreak: false, baseline: 'alphabetic' });
      lines.push({
        page: currentPage,
        text: cell,
        x: tx,
        y: cursor + 4.6,
        width: textWidth,
        fontSize: size,
        font,
      });
    });
    cursor += rowHeight;
    doc.moveTo(x, cursor - 3.6).lineTo(x + width, cursor - 3.6).stroke();
  };

  drawRow(block.columns, true);
  for (const row of block.rows) drawRow(row, false);

  doc.restore();
  return cursor + 14;
}

function drawFigure(
  doc: PDFKit.PDFDocument,
  block: Extract<ManuscriptBlock, { kind: 'figure' }>,
  x: number,
  y: number,
  width: number,
): number {
  const captionHeight = drawCaption(doc, block.caption, x, y, width) + 8;
  const top = y + captionHeight;
  const height = Math.min(180, width * 0.52);
  const left = x + 42;
  const right = x + width - 8;

  doc.save();
  doc.lineWidth(0.7);
  doc.strokeColor('#2f2f2f');
  doc.fillColor('#2f2f2f');

  // Axes
  doc.moveTo(left, top).lineTo(left, top + height).stroke();
  doc.moveTo(left, top + height).lineTo(right, top + height).stroke();

  // Horizontal gridlines + labels
  doc.font(SANS_FONT).fontSize(6.6);
  for (let i = 0; i <= 4; i += 1) {
    const gy = top + (height * i) / 4;
    doc.save();
    doc.strokeColor('#d4d4d4');
    doc.lineWidth(0.4);
    doc.moveTo(left, gy).lineTo(right, gy).stroke();
    doc.restore();
    doc.fillColor('#5a5a5a');
    doc.text(String(180 - i * 45), left - 24, gy + 2.2, { lineBreak: false, baseline: 'alphabetic' });
  }
  doc.fillColor('#5a5a5a');
  doc.text('minutes', left - 30, top - 9, { lineBreak: false, baseline: 'alphabetic' });

  // Axis label
  doc.text('month of presentation', right - 108, top + height + 12, {
    lineBreak: false,
    baseline: 'alphabetic',
  });

  const seriesColors = ['#3d4a8a', '#8a5a3d'];
  block.series.forEach((series, index) => {
    const color = seriesColors[index] ?? '#3d4a8a';
    const points = series.map((value, i) => {
      const px = left + ((right - left) * i) / (series.length - 1);
      const py = top + (height * (180 - value)) / 180;
      return [px, py] as const;
    });
    // Band
    doc.save();
    doc.fillColor(color);
    doc.fillOpacity(0.11);
    points.forEach(([px, py], i) => (i === 0 ? doc.moveTo(px, py) : doc.lineTo(px, py)));
    for (let i = points.length - 1; i >= 0; i -= 1) {
      const [px, py] = points[i]!;
      doc.lineTo(px, py + 13);
    }
    doc.closePath();
    doc.fill();
    doc.restore();

    // Line
    doc.save();
    doc.strokeColor(color);
    doc.lineWidth(1.25);
    points.forEach(([px, py], i) => (i === 0 ? doc.moveTo(px, py) : doc.lineTo(px, py)));
    doc.stroke();
    doc.restore();

    // Legend
    const legendY = top + 6 + index * 12;
    doc.save();
    doc.strokeColor(color);
    doc.lineWidth(1.6);
    doc.moveTo(right - 96, legendY).lineTo(right - 74, legendY).stroke();
    doc.fillColor('#3a3a3a');
    doc.font(SANS_FONT).fontSize(7);
    doc.text(index === 0 ? 'gated' : 'ungated', right - 70, legendY + 2.4, {
      lineBreak: false,
      baseline: 'alphabetic',
    });
    doc.restore();
  });

  doc.restore();
  return top + height + 22;
}

/* ------------------------------------------------------------------ *
 * Section flow
 * ------------------------------------------------------------------ */
function sectionBlocksHeight(
  doc: PDFKit.PDFDocument,
  section: ManuscriptSection,
  columnWidth: number,
): number {
  // Cheap estimate used only for column/page breaks.
  let height = 0;
  for (const block of section.blocks) {
    if (block.kind === 'p') {
      height += wrapText(doc, block.text, columnWidth, BODY_FONT, BODY_SIZE).length * BODY_LEAD;
    } else if (block.kind === 'h2') {
      height += 18;
    } else if (block.kind === 'h3') {
      height += 16;
    } else if (block.kind === 'figure') {
      height += 40 + Math.min(180, columnWidth * 0.52);
    } else if (block.kind === 'table') {
      height += 30 + block.rows.length * 15.2 + 16;
    } else if (block.kind === 'references') {
      height += block.items.length * 14 + 6;
    }
  }
  return height;
}

function renderSection(doc: PDFKit.PDFDocument, section: ManuscriptSection): void {
  const columns = section.columns ?? 1;
  if (columns === 1) {
    if (flowY >= CONTENT_BOTTOM) addPage(doc);
    if (section.heading) flowY = drawHeading(doc, section.heading, MARGIN_X, flowY, CONTENT_W, 1);
    for (const block of section.blocks) {
      const needed = sectionBlocksHeight(doc, { ...section, blocks: [block] }, CONTENT_W);
      if (flowY + needed > CONTENT_BOTTOM && flowY > MARGIN_TOP) {
        addPage(doc);
      }
      flowY = renderBlock(doc, block, MARGIN_X, flowY, CONTENT_W);
    }
    return;
  }

  // Two-column flow. Always begins on a fresh page so the section reads as
  // a distinct two-column spread.
  if (flowY > MARGIN_TOP) addPage(doc);
  const columnWidth = (CONTENT_W - GUTTER) / 2;
  let column = 0;
  let columnTop = MARGIN_TOP;
  let y = MARGIN_TOP;
  const columnX = (index: number) => MARGIN_X + index * (columnWidth + GUTTER);

  const advance = () => {
    column += 1;
    if (column > 1) {
      addPage(doc);
      column = 0;
      columnTop = MARGIN_TOP;
    }
    y = columnTop;
  };

  if (section.heading) {
    const headingBottom = drawHeading(doc, section.heading, MARGIN_X, y, CONTENT_W, 1);
    columnTop = headingBottom + 4;
    y = columnTop;
    // Rule under the section heading, spanning both columns.
    doc.save();
    doc.strokeColor('#bdb5a5');
    doc.lineWidth(0.6);
    doc.moveTo(MARGIN_X, columnTop - 3).lineTo(MARGIN_X + CONTENT_W, columnTop - 3).stroke();
    doc.restore();
  }

  for (const block of section.blocks) {
    const needed = sectionBlocksHeight(doc, { ...section, blocks: [block] }, columnWidth);
    if (y + needed > CONTENT_BOTTOM && y > columnTop) advance();
    y = renderBlock(doc, block, columnX(column), y, columnWidth);
  }
  // A two-column section always ends the page.
  flowY = CONTENT_BOTTOM + 1;
}

function renderBlock(
  doc: PDFKit.PDFDocument,
  block: ManuscriptBlock,
  x: number,
  y: number,
  width: number,
): number {
  process.stderr.write(`[render] ${block.kind} y=${y.toFixed(1)} page=${currentPage}\n`);
  switch (block.kind) {
    case 'h2':
      return drawHeading(doc, block.text, x, y, width, 2);
    case 'h3':
      return drawHeading(doc, block.text, x, y, width, 3);
    case 'p':
      return drawParagraph(doc, block.text, x, y, width, { align: 'justify' }) + 6;
    case 'figure':
      return drawFigure(doc, block, x, y, width);
    case 'table':
      return drawTable(doc, block, x, y, width);
    case 'references': {
      let cursor = y;
      for (const item of block.items) {
        const h = drawParagraph(doc, `${item.label} ${item.text}`, x, cursor, width, {
          size: 8.8,
          leading: 12.2,
        });
        cursor = h + 2.4;
      }
      return cursor;
    }
    default:
      return y;
  }
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */
function build(): void {
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_X, right: MARGIN_X },
    bufferPages: true,
    info: {
      Title: manuscript.title,
      Author: 'Fictional sample manuscript for the Aftershock prototype',
      Subject: 'SAMPLE MANUSCRIPT — FICTIONAL',
      Keywords: 'aftershock, prototype, fictional sample manuscript',
      Creator: 'aftershock-minimax-m31 prototype',
    },
  });

  const out = fs.createWriteStream(path.join(ROOT, 'public', 'sample-manuscript.pdf'));
  doc.pipe(out);

  /* ---- Title page ------------------------------------------------- */
  doc.font(SANS_BOLD_FONT).fontSize(7.2).fillColor('#8a3a34');
  doc.text(manuscript.banner, MARGIN_X, MARGIN_TOP, {
    width: CONTENT_W,
    lineBreak: false,
    baseline: 'alphabetic',
    align: 'center',
  });

  doc.fillColor('#1b1b1b');
  let y = MARGIN_TOP + 26;
  const titleHeight = drawParagraph(doc, manuscript.title, MARGIN_X, y, CONTENT_W, {
    font: BOLD_FONT,
    size: 17.5,
    leading: 22.5,
    align: 'center',
  });
  y = titleHeight + 12;

  y = drawParagraph(doc, manuscript.authors, MARGIN_X, y, CONTENT_W, {
    font: ITALIC_FONT,
    size: 10.4,
    leading: 14.4,
    align: 'center',
  });
  y += 4;
  y = drawParagraph(doc, manuscript.affiliation, MARGIN_X, y, CONTENT_W, {
    font: SANS_FONT,
    size: 8.6,
    leading: 11.6,
    align: 'center',
  });
  y += 4;
  y = drawParagraph(doc, manuscript.journalLine, MARGIN_X, y, CONTENT_W, {
    font: SANS_FONT,
    size: 8.2,
    leading: 11.2,
    align: 'center',
  });

  y += 14;
  doc.save();
  doc.strokeColor('#c9c2b4');
  doc.lineWidth(0.6);
  doc.moveTo(MARGIN_X, y).lineTo(MARGIN_X + CONTENT_W, y).stroke();
  doc.restore();
  y += 16;

  // Abstract
  y = drawHeading(doc, manuscript.abstractLabel, MARGIN_X, y, CONTENT_W, 2);
  const abstractSection = manuscript.sections.find((s) => s.id === 'abstract');
  for (const block of abstractSection?.blocks ?? []) {
    y = renderBlock(doc, block, MARGIN_X, y, CONTENT_W);
  }
  y += 4;
  doc.font(ITALIC_FONT).fontSize(8.6);
  doc.fillColor('#333333');
  const kwLines = wrapText(doc, manuscript.keywords, CONTENT_W, ITALIC_FONT, 8.6);
  doc.text(kwLines[0] ?? '', MARGIN_X, y + 3, { lineBreak: false, baseline: 'alphabetic' });

  /* ---- Remaining sections ----------------------------------------- */
  flowY = y + 14;
  for (const section of manuscript.sections) {
    if (section.id === 'abstract') continue;
    if (section.pageBreakBefore) {
      addPage(doc);
    }
    renderSection(doc, section);
  }

  // Page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font(SANS_FONT).fontSize(7.4).fillColor('#6a6a6a');
    const text = String(i - range.start + 1);
    const w = measure(doc, text, SANS_FONT, 7.4);
    doc.text(text, PAGE_W / 2 - w / 2, PAGE_H - MARGIN_BOTTOM + 22, {
      lineBreak: false,
      baseline: 'alphabetic',
    });
  }

  doc.end();
  out.on('finish', () => {
    fs.writeFileSync(
      path.join(ROOT, 'src', 'fixtures', 'layout.generated.json'),
      `${JSON.stringify({ pageWidth: PAGE_W, pageHeight: PAGE_H, lines }, null, 2)}\n`,
    );
    process.stdout.write(`wrote sample-manuscript.pdf (${lines.length} text lines)\n`);
  });
}

build();
