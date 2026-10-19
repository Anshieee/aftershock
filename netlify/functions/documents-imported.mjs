/**
 * GET /.netlify/functions/documents-imported — read-only user-imported
 * document list (non-seeded documents).
 *
 * Returns REAL Document nodes with `seeded = false` — user-imported
 * manuscripts. Each item carries its `isSynthetic` flag so imported content
 * is displayed honestly (real user content is `isSynthetic: false`). Nothing
 * is synthesized at response time: an empty import cohort answers
 * `{ documents: [] }`.
 *
 * Honesty contract:
 * - Method guard: GET only, 405 + `Allow: GET` otherwise.
 * - `FALKORDB_GRAPH_NAME` not configured → 503 (via `withSession` →
 *   `errorBodyFor`), no fabricated data.
 * - Graph failure / read timeout → 503 via `errorBodyFor` — never an
 *   invented document list. Empty/unseeded graph → 200 `{ documents: [] }`.
 * - Per-IP rate limit via `createRateLimiter` (demo-scope, in-memory; the
 *   platform edge is the real control).
 * - `READ_BUDGET_MS = 8000` wall-clock deadline, below the client's 10 s
 *   abort.
 *
 * Handler seam: `createImportedDocumentsHandler(deps)` accepts an injectable
 * `layer`, scripted `readDocuments` op and `limiter` so unit tests never
 * touch a real DB and never stub ESM modules (see server/demoApi.mjs).
 */

import {
  clientIpOf,
  createGraphLayer,
  createRateLimiter,
  demoGraphName,
  errorBodyFor,
  jsonResponse,
  readDocuments,
  withSession,
} from '../../server/demoApi.mjs';

/** Wall-clock budget: must stay below the client's 10 s abort. */
const READ_BUDGET_MS = 8_000;
const ALLOW = 'GET';

export function createImportedDocumentsHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter();
  const readList = deps.readDocuments ?? readDocuments;

  return async function handler(request /*, context */) {
    if (request.method !== 'GET') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: ALLOW });
    }

    const ip = clientIpOf(request);
    const gate = limiter.check(`ip:${ip}`);
    if (!gate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        {
          error: 'rate-limited',
          message: 'Too many imported-document requests from this IP. Wait and try again; no document data was read by this request.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    try {
      const result = await withSession(
        layer,
        demoGraphName(env),
        (session) => readList(session, { seeded: false, bounded: true }),
        { timeoutMs: READ_BUDGET_MS },
      );
      return jsonResponse(200, {
        documents: result.documents,
        // Honest bounds: demo-traffic metadata accumulates over the graph's
        // lifetime; the response always discloses the real cohort size and
        // whether the list was cut (never pretends completeness).
        importedTotal: result.importedTotal ?? result.documents.length,
        truncated: result.truncated ?? false,
      });
    } catch (err) {
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createImportedDocumentsHandler();
