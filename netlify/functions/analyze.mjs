/**
 * POST /.netlify/functions/analyze — M4 analysis trigger.
 * Netlify Functions v2 handler; canonical dash path = filename.
 *
 * Behavior (M4 sprint decision):
 * - POST only (405 otherwise), JSON body `{ documentVersionId }` (400 when
 *   missing/malformed/not a string), per-IP rate limited (demo-seed limiter
 *   pattern: 1 / 30 s, 5 / 10 min).
 * - Validates the version exists → unknown id is an honest 404.
 * - Without stored content analysis CANNOT run → honest 422
 *   `{ error: 'content-not-stored', disclosure }` — EXCEPT the seeded demo
 *   manuscript version (`ver-demo-manuscript-v1`, content IS the fixture),
 *   for which the REAL fixture-derived analysis runs
 *   (`server/impact.mjs` traversals) and a completed AnalysisRun node is
 *   written with the true findings count. Returns 200 `{ runId }`.
 * - 503 on graph-backend failure; no fabricated run ids, ever.
 */

import {
  clientIpOf,
  createGraphLayer,
  createRateLimiter,
  demoGraphName,
  errorBodyFor,
  jsonResponse,
  textBodyOf,
  withSession,
} from '../../server/demoApi.mjs';
import { HonestApiError, runAnalysis } from '../../server/importAnalyze.mjs';

const RATE_LIMIT_COOLDOWN_MS = 30_000; // one analysis per IP per 30 s
const RATE_LIMIT_WINDOW_MS = 600_000; // 10-minute window
const RATE_LIMIT_MAX_PER_WINDOW = 5; // at most 5 runs per window per IP
const MAX_VERSION_ID_LENGTH = 200;
const RUN_BUDGET_MS = 20_000;

export function createAnalyzeHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter({
    cooldownMs: RATE_LIMIT_COOLDOWN_MS,
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxPerWindow: RATE_LIMIT_MAX_PER_WINDOW,
  });
  const analyzeOp = deps.analyzeOp ?? runAnalysis;
  const timeoutMs = deps.timeoutMs ?? RUN_BUDGET_MS;

  return async function handler(request /*, context */) {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: 'POST' });
    }

    const raw = await textBodyOf(request);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: 'The request body must be JSON of the shape { documentVersionId }.',
      });
    }
    const documentVersionId =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (/** @type {Record<string, unknown>} */ (parsed).documentVersionId)
        : undefined;
    if (typeof documentVersionId !== 'string' || documentVersionId.trim() === '') {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: 'The request body must be JSON of the shape { documentVersionId }.',
      });
    }
    if (documentVersionId.length > MAX_VERSION_ID_LENGTH) {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: `documentVersionId must be at most ${MAX_VERSION_ID_LENGTH} characters.`,
      });
    }

    // Per-IP gate (writes are budgeted like the demo seed). The IP key is
    // never logged and never echoed into a response.
    const gate = limiter.check(clientIpOf(request));
    if (!gate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        {
          error: 'rate-limited',
          message: 'Analysis is rate limited: at most once every 30 seconds and 5 times per 10 minutes per client. Please wait and try again. Nothing was analyzed.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    try {
      const result = await withSession(
        layer,
        demoGraphName(env),
        (session) => analyzeOp(session, { documentVersionId: documentVersionId.trim() }),
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

export default createAnalyzeHandler();
