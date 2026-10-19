/**
 * POST /.netlify/functions/import-document?fileName=&format= — M4 import.
 * Netlify Functions v2 handler; canonical dash path = filename.
 *
 * Behavior (M4 sprint decision, AGENTS.md data-safety rules):
 * - POST only (405 otherwise), per-IP rate limited (demo-seed limiter
 *   pattern: 1 / 30 s, 5 / 10 min).
 * - RAW body upload; `format` MUST be pdf|docx|txt (else 415), `fileName`
   * MUST be a bounded non-empty string (else 400).
 * - Empty body → 400; body larger than MAX_IMPORT_BYTES → 413 (declared
 *   Content-Length is refused before reading; the actual byte count is
 *   re-checked after the bounded read).
 * - METADATA-ONLY registration: the bytes are read once, hashed (sha256) and
 *   dropped — they NEVER enter the disposable no-TLS free-tier graph (private
 *   manuscripts must not). The graph receives fileName/size/format/hash/
 *   timestamps/ids plus a truthful `contentStored: false` flag and NO PII
 *   claims. fileName is user-controlled and stored as a plain parameterized
 *   property, bounded to 255 characters.
 * - 200 { documentId, versionId, contentStored: false, disclosure } — the
 *   client MUST display the disclosure verbatim.
 * - 503 on graph-backend failure (errorBodyFor); nothing partial is claimed.
 *
 * WAVE 3 IN-MEMORY EXTRACTION (immediately above the graph write, same
 * single-pass moment over the already-read bytes): for `txt` uploads the
 * handler runs a bounded (512 KiB prefix) shallow DOI pattern scan and
 * ATTACHES the candidate list to the 200 response as `extraction`. This is
 * DETECTION, not verification: detected DOIs are unverified candidates from a
 * bounded excerpt; presence in the file proves nothing about claim support or
 * reference validity (the response carries that caveat verbatim). The scan
 * result is response-only — it is NEVER persisted, never logged, and never
 * sent to the graph (`registerDocumentImport` and all its Cypher are
 * untouched: no new nodes/edges/properties). Extracting for `pdf` and `docx`
 * is not implemented in this demo tier, so they get
 * `extraction: { attempted: false, ..., reason }` instead of a lie. An
 * unexpected extraction failure is swallowed into an honest
 * `attempted: false` envelope; it can never fail the import.
 *
 * HONEST LIMITATION: this tier registers but does not store content, so
 * analysis of imported files is refused (422) by `/analyze` until persistent
 * content storage exists.
 */

import {
  clientIpOf,
  createGraphLayer,
  createRateLimiter,
  demoGraphName,
  errorBodyFor,
  jsonResponse,
  withSession,
} from '../../server/demoApi.mjs';
import {
  HonestApiError,
  MAX_IMPORT_BYTES,
  hashUploadBytes,
  registerDocumentImport,
} from '../../server/importAnalyze.mjs';
import {
  MAX_SCAN_BYTES,
  DOI_SCAN_CAVEAT,
  extractTextMeta,
} from '../../server/metaExtract.mjs';

const RATE_LIMIT_COOLDOWN_MS = 6_000; // one import per IP per 6 s
const RATE_LIMIT_WINDOW_MS = 60_000; // 1-minute window
const RATE_LIMIT_MAX_PER_WINDOW = 10; // at most 10 imports per window per IP
const MAX_FILE_NAME_LENGTH = 255;
const WRITE_BUDGET_MS = 20_000;

/** Honest reason for formats whose text extraction this tier does not do. */
const FORMAT_NOT_EXTRACTABLE_REASON =
  'Text extraction for this format is not implemented in the demo tier; no DOIs were scanned.';

/** Honest reason when the extraction machinery itself fails unexpectedly. */
const EXTRACTION_FAILED_REASON =
  'Extraction failed unexpectedly; import registered metadata-only.';

/**
 * Build the additive `extraction` member of the 200 response. Detection, not
 * verification: the caveat travels verbatim so clients can show it honest by
 * default. Pure envelope shaping — never throws in normal operation, but the
 * caller still guards it (an extraction failure must never fail an import).
 *
 * @param {Uint8Array} bytes the SAME buffer the hash came from (no second read)
 * @param {'pdf' | 'docx' | 'txt'} format normalized upload format
 * @param {(bytes: Uint8Array) => { scannedBytes: number, truncated: boolean, dois: Array<{ doi: string, occurrences: number, snippet?: string }> }} extractTextOp
 */
function buildExtraction(bytes, format, extractTextOp) {
  if (format !== 'txt') {
    // Never a lie like "no references found": this format is simply not scanned.
    return { attempted: false, format, reason: FORMAT_NOT_EXTRACTABLE_REASON };
  }
  const scan = extractTextOp(bytes);
  return {
    attempted: true,
    format,
    caveat: DOI_SCAN_CAVEAT,
    byteSelection: {
      scannedBytes: scan.scannedBytes,
      maxBytes: MAX_SCAN_BYTES,
      truncated: scan.truncated,
    },
    dois: scan.dois,
  };
}

export function createImportDocumentHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter({
    cooldownMs: RATE_LIMIT_COOLDOWN_MS,
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxPerWindow: RATE_LIMIT_MAX_PER_WINDOW,
  });
  const registerOp = deps.registerOp ?? registerDocumentImport;
  const timeoutMs = deps.timeoutMs ?? WRITE_BUDGET_MS;
  const extractTextOp = deps.extractTextOp ?? extractTextMeta;

  return async function handler(request /*, context */) {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: 'POST' });
    }

    // Query validation happens before any body read: a 415/400 request must
    // not transfer its bytes at all.
    const url = new URL(request.url);
    const fileName = (url.searchParams.get('fileName') ?? '').trim();
    const format = (url.searchParams.get('format') ?? '').trim().toLowerCase();
    if (fileName === '') {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: 'The fileName query parameter is required.',
      });
    }
    if (fileName.length > MAX_FILE_NAME_LENGTH) {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: `The fileName query parameter must be at most ${MAX_FILE_NAME_LENGTH} characters.`,
      });
    }
    if (format === '') {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: 'The format query parameter is required (pdf, docx, or txt).',
      });
    }
    if (format !== 'pdf' && format !== 'docx' && format !== 'txt') {
      return jsonResponse(415, {
        error: 'unsupported-media-type',
        message: 'Only pdf, docx, and txt imports are supported in this tier.',
      });
    }

    // Declared-oversize refusal BEFORE reading the body.
    const declaredLength = request.headers.get('content-length');
    if (declaredLength && Number(declaredLength) > MAX_IMPORT_BYTES) {
      return jsonResponse(413, {
        error: 'payload-too-large',
        message: 'Import uploads are limited to 10 MB. Nothing was stored.',
      });
    }

    let bytes;
    try {
      bytes = new Uint8Array(await request.arrayBuffer());
    } catch {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: 'The request body could not be read as raw file bytes.',
      });
    }
    if (bytes.byteLength === 0) {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: 'The uploaded file is empty; nothing was registered.',
      });
    }
    if (bytes.byteLength > MAX_IMPORT_BYTES) {
      return jsonResponse(413, {
        error: 'payload-too-large',
        message: 'Import uploads are limited to 10 MB. Nothing was stored.',
      });
    }

    // Per-IP gate. The IP key is used for in-memory throttling only; it is
    // never logged and never echoed into a response.
    const gate = limiter.check(clientIpOf(request));
    if (!gate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        {
          error: 'rate-limited',
          message: 'Import is rate limited: at most once every 6 seconds and 10 times per minute per client. Please wait and try again. Nothing was stored.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    try {
      const sourceHash = hashUploadBytes(bytes);
      // Wave 3: same single pass over the already-in-memory bytes, BEFORE the
      // graph write. Detection only — the scan result never reaches the graph
      // and an unexpected extraction failure must never fail the import.
      let extraction;
      try {
        extraction = buildExtraction(bytes, format, extractTextOp);
      } catch {
        extraction = { attempted: false, format, reason: EXTRACTION_FAILED_REASON };
      }
      const result = await withSession(
        layer,
        demoGraphName(env),
        (session) => registerOp(session, { fileName, format, sizeBytes: bytes.byteLength, sourceHash }),
        { timeoutMs },
      );
      return jsonResponse(200, { ...result, extraction });
    } catch (err) {
      if (err instanceof HonestApiError) return jsonResponse(err.status, err.body);
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createImportDocumentHandler();
