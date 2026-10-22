/**
 * @aftershock/server — offline PDF text extraction with per-line coordinates
 * for the local parse tier (M9).
 *
 * Runs the pinned `pdfjs-dist` legacy ESM build (Node >= 20 safe, no worker)
 * over raw PDF bytes and groups the page text layer into honest, located
 * lines. Nothing here is uploaded, persisted, or looked up over the network:
 * extraction is 100 % local and per-call (the pdf.js module is imported
 * lazily inside the function so import cost is per-use and any import
 * failure surfaces as an honest value, never a throw).
 *
 * SCIENTIFIC-INTEGRITY RULES (AGENTS.md):
 * - Every returned line is `observed` provenance with {@link LINE_RATIONALE}:
 *   text recovered from the document text layer by pdf.js. A line says
 *   "this string was present at this location in the file", nothing more.
 * - No OCR is performed. A page with no text layer (a scanned image) is
 *   DISCLOSED (`lines: []` plus an explicit note), never fabricated, never
 *   guessed at. `coordinatesSupported: true` reflects that the line
 *   coordinates are real geometry from the text layer — it does NOT imply
 *   the text itself is complete or meaningful.
 * - Truncation by the page budget (`MAX_PDF_PAGES_EXTRACTED`, overridable
 *   per call via `deps.maxPages`) is disclosed in `notes`, never silent.
 * - pdf.js failure reasons are mapped to fixed disclosure strings; raw error
 *   messages/stacks are NEVER included in the result (content-redaction
 *   rule: error text can leak document content).
 *
 * HONEST LIMITS (disclosed in `notes` on every successful extraction):
 * - Line grouping is a deterministic MVP heuristic, not layout
 *   reconstruction: a new line starts at a pdf.js end-of-line marker or when
 *   the next text item's baseline (`transform[5]`) jumps more than 2.0 units
 *   in PDF user space from the current line's first baseline. Multi-column
 *   layouts, headers/footers, and tables are NOT disentangled.
 * - Coordinates are raw PDF user space (points, origin bottom-left); the
 *   page viewport is only sanity-checked, never applied as a scale factor.
 * - The pdf.js `hasEOL` marker item is often an EMPTY string item positioned
 *   at the NEXT line's baseline. It carries no text, so it never opens a
 *   line of its own; it only terminates the current one. Appending its
 *   (empty) string or skipping it is textually identical either way.
 *
 * All functions are pure with respect to their inputs (the byte array is
 * copied before pdf.js sees it — pdf.js may detach/transfer buffers) and
 * `extractPdfText` NEVER throws: every failure surfaces as an honest
 * `{ attempted: false, reason }` value.
 *
 * @module parse/pdfText
 */

import {
  DETECTION_PROVENANCE_KIND,
  MAX_PDF_PAGES_EXTRACTED,
  PARSE_ANALYSIS_VERSION,
} from './schema.mjs';

/**
 * Rationale attached to every extracted line. Distinct from
 * `DETECTION_RATIONALE` (pattern match): lines are not matches but recovered
 * text-layer content — still `observed`, still never verified.
 */
const LINE_RATIONALE =
  'Recovered from the document text layer with reading-order grouping by pdf.js (offline).';

/** Disclosure when bytes are absent or of the wrong type. */
const NO_BYTES_REASON = 'No document bytes were provided; nothing was parsed.';

/** Disclosure when the byte array is empty. */
const EMPTY_REASON = 'Empty document; nothing was parsed.';

/** Disclosure for password-protected PDFs (never leaks the raw error). */
const PASSWORD_REASON = 'The PDF is password-protected; nothing was parsed.';

/** Baseline jump (PDF user-space units) that starts a new line. */
const BASELINE_JUMP = 2.0;

/** Last note when NO page yielded any text (all pages disclosed above it). */
const NO_TEXT_LAYER_NOTE =
  'No text layer was recoverable from this PDF; nothing text-based can be detected.';

/** Disclosure that line grouping is honest MVP heuristics, not layout analysis. */
const GROUPING_NOTE =
  'Line grouping is a deterministic MVP heuristic (end-of-line markers plus a 2.0-unit baseline jump); no full layout reconstruction was performed.';

/**
 * @param {number} pageNum 1-based page number
 * @returns {string} note for a page that produced no text at all
 */
function noTextPageNote(pageNum) {
  return (
    `Page ${pageNum} contains no extractable text ` +
    '(no text layer — likely a scanned image); no OCR was performed.'
  );
}

/**
 * Map a caught pdf.js failure to an honest, content-redacted reason. Only the
 * error CLASS name is ever included — never `err.message`, never a stack.
 *
 * @param {unknown} err
 * @returns {string}
 */
function parseFailedReason(err) {
  const name = err && /** @type {{name?: unknown}} */ (err).name;
  const label = name ? String(name) : 'unknown error';
  return `PDF parsing failed (${label}); nothing was parsed.`;
}

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
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number} the value when it is a finite number, else the fallback
 */
function finiteOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Group one page's `getTextContent()` items into located lines.
 *
 * Deterministic MVP rules (see module docstring): items are consumed in
 * natural order; an item with an empty string contributes no text (it is a
 * spacing/EOL marker) and only `hasEOL` matters on it — it closes the open
 * line; a non-empty item starts a new line when the open line exists and the
 * item's baseline differs from the line's FIRST baseline by more than
 * {@link BASELINE_JUMP}. `x`/`y` come from the line's first text item,
 * `width` from its last text item's right edge, `height` is the max glyph
 * box across the line's items. Non-finite geometry degrades to `0`, never
 * `NaN` — every number this function emits is finite.
 *
 * @param {unknown} items `page.getTextContent().items` (untrusted shape)
 * @returns {Array<{order: number, text: string, x: number, y: number,
 *   width: number, height: number, provenanceKind: string, rationale: string,
 *   analysisVersion: string, createdAt: null}>} 1-based `order` within page
 */
function groupPageLines(items) {
  /** @type {Array<{order: number, text: string, x: number, y: number, width: number, height: number, provenanceKind: string, rationale: string, analysisVersion: string, createdAt: null}>} */
  const lines = [];
  if (!Array.isArray(items)) return lines;

  /**
   * Open-line accumulator. `x`/`y` are the FIRST text item's origin;
   * `lastX`/`lastWidth` track the LAST text item for the width formula;
   * `height` is the running max glyph box.
   * @type {{text: string, x: number, y: number, lastX: number, lastWidth: number, height: number} | null}
   */
  let open = null;

  const close = () => {
    if (open === null) return;
    lines.push({
      order: lines.length + 1,
      text: open.text,
      x: open.x,
      y: open.y,
      width: open.lastX + open.lastWidth - open.x,
      height: open.height,
      provenanceKind: DETECTION_PROVENANCE_KIND,
      rationale: LINE_RATIONALE,
      analysisVersion: PARSE_ANALYSIS_VERSION,
      createdAt: null,
    });
    open = null;
  };

  for (const item of items) {
    if (item === null || typeof item !== 'object') continue;
    const str = typeof item.str === 'string' ? item.str : '';
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const itemX = finiteOr(transform[4], 0);
    const itemY = finiteOr(transform[5], 0);
    const itemWidth = finiteOr(/** @type {{width?: unknown}} */ (item).width, 0);
    const itemHeight = finiteOr(/** @type {{height?: unknown}} */ (item).height, 0);
    const glyphBox = Math.max(Math.abs(finiteOr(transform[3], 0)), itemHeight);

    if (str === '') {
      // Spacing/EOL marker: carries no text, so it must never open a line of
      // its own (pdf.js emits empty `hasEOL` items positioned at the NEXT
      // line's baseline for producers like pdfkit). An EOL marker closes the
      // open line; anything else is ignored for geometry.
      if (item.hasEOL === true) close();
      continue;
    }

    if (open !== null && Math.abs(itemY - open.y) > BASELINE_JUMP) close();

    if (open === null) {
      open = { text: '', x: itemX, y: itemY, lastX: itemX, lastWidth: itemWidth, height: glyphBox };
    } else {
      open.lastX = itemX;
      open.lastWidth = itemWidth;
      open.height = Math.max(open.height, glyphBox);
    }
    open.text += str; // appended verbatim — no trimming, no cleanup

    if (item.hasEOL === true) close();
  }
  close(); // flush a trailing line with no explicit EOL marker
  return lines;
}

/**
 * Extract text from raw PDF bytes, offline and bounded.
 *
 * Never throws. Failure states (absent/empty bytes, password protection,
 * any pdf.js rejection) come back as `{ attempted: false, reason }`.
 * Success comes back as located lines in reading order with real PDF
 * user-space coordinates (points, origin bottom-left), plus honest notes for
 * the page budget, MVP grouping, per-page no-text pages, and the all-no-text
 * case.
 *
 * @param {Uint8Array} bytes raw PDF bytes (copied before pdf.js sees them)
 * @param {{maxPages?: number}} [deps] budget seam for tests; falls back to
 *   schema {@link MAX_PDF_PAGES_EXTRACTED}
 * @returns {Promise<
 *   | { attempted: false, reason: string }
 *   | { attempted: true, coordinatesSupported: true, truncated: boolean,
 *       pages: Array<{index: number, order: number, lines: ReturnType<typeof groupPageLines>, charCount: number}>,
 *       textLength: number, notes: string[] }
 * >}
 */
export async function extractPdfText(bytes, deps = {}) {
  if (!(bytes instanceof Uint8Array)) return { attempted: false, reason: NO_BYTES_REASON };
  if (bytes.length === 0) return { attempted: false, reason: EMPTY_REASON };

  /** @type {import('pdfjs-dist/legacy/build/pdf.mjs').PDFDocumentLoadingTask | null} */
  let task = null;
  /** @type {import('pdfjs-dist/legacy/build/pdf.mjs').PDFDocumentProxy | null} */
  let doc = null;
  try {
    const options = deps !== null && typeof deps === 'object' ? deps : {};
    const maxPages = clampPositiveInt(options.maxPages, MAX_PDF_PAGES_EXTRACTED);

    // Lazy per-use import: any failure lands in the catch below and becomes an
    // honest value. The module file lives in server/parse/, so Node resolves
    // server/node_modules for every caller (test runner, server, CLI).
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    task = pdfjs.getDocument({
      // A COPY: pdf.js may detach/transfer the caller's buffer.
      data: new Uint8Array(bytes),
      // Pinned offline-safe options (no worker, no eval, no system fonts,
      // no font-face injection — verified against pdfjs-dist@4.10.38).
      // verbosity 0: suppress pdf.js's own non-fatal console warnings
      // (e.g. standardFontDataUrl hints) — failures still surface as
      // rejected promises and are mapped to honest values below.
      verbosity: 0,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
    });
    doc = await task.promise;

    const numPages = Number.isInteger(doc.numPages) && doc.numPages > 0 ? doc.numPages : 0;
    const truncated = numPages > maxPages;
    const pageCount = Math.min(numPages, maxPages);

    /** @type {ReturnType<typeof groupPageLines> extends infer L ? Array<{index: number, order: number, lines: L, charCount: number}> : never} */
    const pages = [];
    /** @type {string[]} */
    const notes = [];
    let textLength = 0;

    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      const page = await doc.getPage(pageIndex);
      const content = await page.getTextContent();

      // Viewport: sanity-check only. Coordinates stay in raw PDF user space.
      let viewportSane = false;
      try {
        const viewport = page.getViewport({ scale: 1 });
        viewportSane =
          Number.isFinite(viewport.width) &&
          Number.isFinite(viewport.height) &&
          viewport.width > 0 &&
          viewport.height > 0;
      } catch {
        viewportSane = false;
      }

      const lines = groupPageLines(content.items);
      const charCount = lines.reduce((sum, line) => sum + line.text.length, 0);
      if (lines.length === 0) notes.push(noTextPageNote(pageIndex));
      if (!viewportSane) {
        notes.push(
          `Page ${pageIndex} reported a non-finite page box; ` +
            'line coordinates were kept in raw PDF user space (unscaled).',
        );
      }
      pages.push({ index: pageIndex, order: pageIndex, lines, charCount });
      textLength += charCount;

      try {
        await page.cleanup(); // per-page memory hygiene; never fatal
      } catch {
        // ignore — doc.destroy() in finally reclaims everything anyway
      }
    }

    if (truncated) {
      notes.unshift(
        `Document has ${numPages} pages; only the first ${pageCount} were extracted (page budget).`,
      );
    }
    // Honest ends: an all-no-text document says so (page notes precede this
    // final note); a text-bearing one discloses the MVP grouping rules.
    if (textLength === 0) notes.push(NO_TEXT_LAYER_NOTE);
    else notes.push(GROUPING_NOTE);

    return {
      attempted: true,
      coordinatesSupported: true,
      truncated,
      pages,
      textLength,
      notes,
    };
  } catch (err) {
    if (err !== null && typeof err === 'object' && /** @type {{name?: unknown}} */ (err).name === 'PasswordException') {
      return { attempted: false, reason: PASSWORD_REASON };
    }
    return { attempted: false, reason: parseFailedReason(err) };
  } finally {
    if (doc !== null) {
      try {
        await doc.destroy();
      } catch {
        // never throw from cleanup
      }
    }
    // ALWAYS destroy the loading task (worker/stream teardown), swallowing
    // rejections so the caller's result (or return value) is never replaced.
    if (task !== null) {
      try {
        await task.destroy();
      } catch {
        // never throw from cleanup
      }
    }
  }
}
