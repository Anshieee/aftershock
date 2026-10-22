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
 * - Truncation by ANY budget — page count (`MAX_PDF_PAGES_EXTRACTED`,
 *   per call `deps.maxPages`), per-page text (`MAX_CHARS_PER_PAGE`,
 *   `deps.maxCharsPerPage`), or whole-document text
 *   (`MAX_TOTAL_TEXT_CHARS`, `deps.maxTotalChars`) — is disclosed in
 *   `notes`, never silent. The text budgets bound worst-case memory: a
 *   crafted multi-gigabyte text layer is CUT and disclosed, never buffered
 *   unbounded.
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
  MAX_CHARS_PER_PAGE,
  MAX_PDF_PAGES_EXTRACTED,
  MAX_TOTAL_TEXT_CHARS,
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
 * @typedef {Object} PdfLine One extracted line (see module docstring).
 * @property {number} order 1-based within page.
 * @property {string} text Verbatim-extracted text (possibly a budget-cut
 *   prefix — any cut is disclosed per page in `notes`).
 * @property {number} x First text item origin x (PDF user space, points).
 * @property {number} y First text item baseline y (PDF user space, points).
 * @property {number} width Right edge of the last text item minus `x`,
 *   clamped at 0 so geometry is never negative.
 * @property {number} height Max glyph box across the line's items.
 * @property {string} provenanceKind Always {@link DETECTION_PROVENANCE_KIND}.
 * @property {string} rationale Always {@link LINE_RATIONALE}.
 * @property {string} analysisVersion Always {@link PARSE_ANALYSIS_VERSION}.
 * @property {null} createdAt Stamped later by the caller (never invented here).
 */

/**
 * Group one page's `getTextContent()` items into located lines, bounded by a
 * per-page character budget (audit hardening: `getTextContent()` is
 * file-controlled and unbounded — a crafted text layer must be CUT and
 * disclosed, never buffered).
 *
 * Deterministic MVP rules (see module docstring): items are consumed in
 * natural order; an item with an empty string contributes no text (it is a
 * spacing/EOL marker) and only `hasEOL` matters on it — it closes the open
 * line; a non-empty item starts a new line when the open line exists and the
 * item's baseline differs from the line's FIRST baseline by more than
 * {@link BASELINE_JUMP}. `x`/`y` come from the line's first text item,
 * `width` from its last text item's right edge (clamped at 0), `height` is
 * the max glyph box across the line's items. Non-finite geometry degrades to
 * `0`, never `NaN` — every number this function emits is finite.
 *
 * Budget rule: once `maxChars` characters have been appended, the item loop
 * STOPS (`truncated: true`). The single item that crosses the budget is kept
 * as a PREFIX sliced to the remaining budget (never mid-surrogate), so a
 * page that HAS a text layer always yields at least one non-empty line —
 * dropping the crossing item instead would emit a zero-line page that the
 * caller would honestly (but WRONGLY) disclose as "no text layer — likely a
 * scanned image". Appended text is otherwise verbatim: no trimming, no
 * cleanup.
 *
 * @param {unknown} items `page.getTextContent().items` (untrusted shape)
 * @param {number} maxChars per-page character budget (positive integer)
 * @returns {{lines: PdfLine[], truncated: boolean}} `truncated` is true when
 *   the budget stopped further items on this page
 */
function groupPageLines(items, maxChars) {
  /** @type {PdfLine[]} */
  const lines = [];
  if (!Array.isArray(items)) return { lines, truncated: false };

  /** Characters appended on this page so far (budget accumulator). */
  let pageChars = 0;
  let cut = false;

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
      // Clamped at 0: real text is right of the line origin, but unusual
      // layouts (e.g. RTL runs) could compute a negative extent — a
      // negative width is finite-but-odd and would be dishonest geometry.
      width: Math.max(0, open.lastX + open.lastWidth - open.x),
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

    // Per-page text budget: stop the loop; keep the boundary item as a
    // prefix sliced to the remaining budget (see docstring). The caller
    // discloses the cut per page.
    const remaining = maxChars - pageChars;
    if (remaining <= 0) {
      cut = true;
      break;
    }
    let take = Math.min(str.length, remaining);
    if (take < str.length) {
      // Never split a surrogate pair at the cut boundary.
      const boundary = str.charCodeAt(take - 1);
      if (boundary >= 0xd800 && boundary <= 0xdbff) take -= 1;
    }
    if (take <= 0) {
      // Exactly one budget unit left and it is half a surrogate pair — take
      // nothing rather than emit an unpaired surrogate.
      cut = true;
      break;
    }
    const chunk = take < str.length ? str.slice(0, take) : str;

    if (open !== null && Math.abs(itemY - open.y) > BASELINE_JUMP) close();

    if (open === null) {
      open = { text: '', x: itemX, y: itemY, lastX: itemX, lastWidth: itemWidth, height: glyphBox };
    } else {
      open.lastX = itemX;
      open.lastWidth = itemWidth;
      open.height = Math.max(open.height, glyphBox);
    }
    open.text += chunk; // verbatim (or budget-cut prefix) — no trimming, no cleanup
    pageChars += chunk.length;

    if (chunk.length < str.length) {
      cut = true; // budget crossed mid-item; nothing further is extracted
      break;
    }

    if (item.hasEOL === true) close();
  }
  close(); // flush a trailing line with no explicit EOL marker
  return { lines, truncated: cut };
}

/**
 * Extract text from raw PDF bytes, offline and bounded by THREE budgets:
 * page count (`maxPages`, default {@link MAX_PDF_PAGES_EXTRACTED}), text
 * characters per page (`maxCharsPerPage`, default {@link MAX_CHARS_PER_PAGE}),
 * and whole-document text characters (`maxTotalChars`, default
 * {@link MAX_TOTAL_TEXT_CHARS}). `truncated` is `true` when ANY budget
 * clipped the result; every hit is disclosed verbatim in `notes` (the
 * page-count note, the per-page budget note, the whole-text budget note).
 * The realized total may exceed `maxTotalChars` by up to one page: the page
 * that crosses the budget stays as-is (never retro-trimmed) and later pages
 * are not processed.
 *
 * Never throws. Failure states (absent/empty bytes, password protection,
 * any pdf.js rejection) come back as `{ attempted: false, reason }`.
 * Success comes back as located lines in reading order with real PDF
 * user-space coordinates (points, origin bottom-left; line width clamped at
 * 0), plus honest notes for the budgets, MVP grouping, per-page no-text
 * pages, and the all-no-text case.
 *
 * @param {Uint8Array} bytes raw PDF bytes (copied before pdf.js sees them)
 * @param {{maxPages?: number, maxCharsPerPage?: number, maxTotalChars?: number}} [deps]
 *   budget seams for tests; each falls back to its schema default when not a
 *   positive integer (0/invalid → default, never a disabled cap)
 * @returns {Promise<
 *   | { attempted: false, reason: string }
 *   | { attempted: true, coordinatesSupported: true, truncated: boolean,
 *       pages: Array<{index: number, order: number, lines: PdfLine[], charCount: number}>,
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
    // Audit-hardening text budgets (see JSDoc): 0/invalid → schema default.
    const maxCharsPerPage = clampPositiveInt(options.maxCharsPerPage, MAX_CHARS_PER_PAGE);
    const maxTotalChars = clampPositiveInt(options.maxTotalChars, MAX_TOTAL_TEXT_CHARS);

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
    // `truncated` is true when ANY budget clipped the result: page count,
    // per-page text, or whole-document text (each disclosed separately).
    let truncated = numPages > maxPages;
    const pageCount = Math.min(numPages, maxPages);
    let wholeTextCut = false;

    /** @type {Array<{index: number, order: number, lines: PdfLine[], charCount: number}>} */
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

      const { lines, truncated: pageCut } = groupPageLines(content.items, maxCharsPerPage);
      const charCount = lines.reduce((sum, line) => sum + line.text.length, 0);
      if (lines.length === 0) notes.push(noTextPageNote(pageIndex));
      if (!viewportSane) {
        notes.push(
          `Page ${pageIndex} reported a non-finite page box; ` +
            'line coordinates were kept in raw PDF user space (unscaled).',
        );
      }
      if (pageCut) {
        // Per-page budget disclosure; M is the realized cap.
        truncated = true;
        notes.push(
          `Page ${pageIndex} hit the per-page text budget (${maxCharsPerPage} characters); ` +
            'remaining text on this page was not extracted.',
        );
      }
      pages.push({ index: pageIndex, order: pageIndex, lines, charCount });
      textLength += charCount;

      try {
        await page.cleanup(); // per-page memory hygiene; never fatal
      } catch {
        // ignore — doc.destroy() in finally reclaims everything anyway
      }

      // Whole-document text budget: the completed (possibly cut) page stays
      // as-is — never retro-trimmed — and later pages are not processed at
      // all. Only claim "later pages were not extracted" when a later page
      // actually existed and was skipped: a single-page overshoot extracts
      // its only page fully, so nothing is truncated by THIS budget.
      if (textLength > maxTotalChars && pageIndex < pageCount) {
        truncated = true;
        wholeTextCut = true;
        break;
      }
    }

    if (numPages > maxPages) {
      notes.unshift(
        `Document has ${numPages} pages; only the first ${pageCount} were extracted (page budget).`,
      );
    }
    if (wholeTextCut) {
      // Whole-text budget disclosure; M is the realized cap.
      notes.push(
        `Document hit the whole-text budget after ${maxTotalChars} characters; ` +
          'text from later pages was not extracted.',
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
