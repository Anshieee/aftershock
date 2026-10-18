/**
 * GET /.netlify/functions/document-detail?id= — M4 single-document detail.
 * Netlify Functions v2 handler; canonical dash path = filename.
 *
 * Behavior (M4 sprint decision):
 * - GET only (405 otherwise), per-IP window-bounded rate limit (60 / min).
 * - `id` query parameter required (400 when missing/oversized).
 * - REAL ResearchDocument lookup by id INCLUDING its DocumentVersion rows:
 *   200 `{ document, versions }` (internal `seeded`/`primaryLabel` flags are
 *   stripped via `toWireNode` — they never surface on the wire). Unknown id →
 *   honest 404. Matches WITHOUT the `seeded` filter so user-imported
 *   (metadata-only) documents resolve here too.
 * - 503 on graph-backend failure.
 */

import {
  clientIpOf,
  createGraphLayer,
  createRateLimiter,
  demoGraphName,
  errorBodyFor,
  jsonResponse,
  toWireNode,
  withSession,
} from '../../server/demoApi.mjs';
import { HonestApiError, readDocumentDetail } from '../../server/importAnalyze.mjs';

const RATE_LIMIT_WINDOW_MS = 60_000; // 1-minute window
const RATE_LIMIT_MAX_PER_WINDOW = 60; // at most 60 reads per window per IP
const MAX_DOCUMENT_ID_LENGTH = 200;
const READ_BUDGET_MS = 8_000;

export function createDocumentDetailHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter({
    cooldownMs: 0,
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxPerWindow: RATE_LIMIT_MAX_PER_WINDOW,
  });
  const detailOp = deps.detailOp ?? readDocumentDetail;
  const timeoutMs = deps.timeoutMs ?? READ_BUDGET_MS;

  return async function handler(request /*, context */) {
    if (request.method !== 'GET') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: 'GET' });
    }

    const id = (new URL(request.url).searchParams.get('id') ?? '').trim();
    if (id === '') {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: 'The id query parameter is required.',
      });
    }
    if (id.length > MAX_DOCUMENT_ID_LENGTH) {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: `The id query parameter must be at most ${MAX_DOCUMENT_ID_LENGTH} characters.`,
      });
    }

    // Per-IP gate; the IP key is never logged or echoed.
    const gate = limiter.check(clientIpOf(request));
    if (!gate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        {
          error: 'rate-limited',
          message: 'Document detail is limited to 60 requests per minute per client.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    try {
      const result = await withSession(layer, demoGraphName(env), (session) => detailOp(session, id), {
        timeoutMs,
      });
      if (!result) {
        throw new HonestApiError(404, {
          error: 'document-not-found',
          message: 'No ResearchDocument with that id exists in the graph.',
        });
      }
      return jsonResponse(200, {
        document: toWireNode(result.document),
        versions: result.versions.map((version) => toWireNode(version)),
      });
    } catch (err) {
      if (err instanceof HonestApiError) return jsonResponse(err.status, err.body);
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createDocumentDetailHandler();
