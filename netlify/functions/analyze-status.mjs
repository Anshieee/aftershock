/**
 * GET /.netlify/functions/analyze-status?runId= — M4 analysis-run status.
 * Netlify Functions v2 handler; canonical dash path = filename.
 *
 * Behavior (M4 sprint decision):
 * - GET only (405 otherwise), per-IP window-bounded rate limit (60 / min —
 *   bounded but polling-friendly).
 * - `runId` query parameter required (400 when missing/oversized).
 * - REAL AnalysisRun lookup: 200 `{ runId, stage, findingsCount?, startedAt?,
 *   completedAt? }`; unknown runId → honest 404 (no fabricated stage).
 * - 503 on graph-backend failure.
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
import { HonestApiError, readAnalysisRun } from '../../server/importAnalyze.mjs';

const RATE_LIMIT_WINDOW_MS = 60_000; // 1-minute window
const RATE_LIMIT_MAX_PER_WINDOW = 60; // at most 60 polls per window per IP
const MAX_RUN_ID_LENGTH = 200;
const READ_BUDGET_MS = 8_000;

export function createAnalyzeStatusHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter({
    cooldownMs: 0,
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxPerWindow: RATE_LIMIT_MAX_PER_WINDOW,
  });
  const statusOp = deps.statusOp ?? readAnalysisRun;
  const timeoutMs = deps.timeoutMs ?? READ_BUDGET_MS;

  return async function handler(request /*, context */) {
    if (request.method !== 'GET') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: 'GET' });
    }

    const runId = (new URL(request.url).searchParams.get('runId') ?? '').trim();
    if (runId === '') {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: 'The runId query parameter is required.',
      });
    }
    if (runId.length > MAX_RUN_ID_LENGTH) {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: `The runId query parameter must be at most ${MAX_RUN_ID_LENGTH} characters.`,
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
          message: 'Status polling is limited to 60 requests per minute per client.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    try {
      const result = await withSession(layer, demoGraphName(env), (session) => statusOp(session, runId), {
        timeoutMs,
      });
      if (!result) {
        throw new HonestApiError(404, {
          error: 'run-not-found',
          message: 'No AnalysisRun with that id exists in the graph.',
        });
      }
      return jsonResponse(200, result);
    } catch (err) {
      if (err instanceof HonestApiError) return jsonResponse(err.status, err.body);
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createAnalyzeStatusHandler();
