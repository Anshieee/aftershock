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

const RATE_LIMIT_COOLDOWN_MS = 6_000; // one import per IP per 6 s
const RATE_LIMIT_WINDOW_MS = 60_000; // 1-minute window
const RATE_LIMIT_MAX_PER_WINDOW = 10; // at most 10 imports per window per IP
const MAX_FILE_NAME_LENGTH = 255;
const WRITE_BUDGET_MS = 20_000;

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
      const result = await withSession(
        layer,
        demoGraphName(env),
        (session) => registerOp(session, { fileName, format, sizeBytes: bytes.byteLength, sourceHash }),
        { timeoutMs },
      );
      return jsonResponse(200, result);
    } catch (err) {
      if (err instanceof HonestApiError) return jsonResponse(err.status, err.body);
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createImportDocumentHandler();
