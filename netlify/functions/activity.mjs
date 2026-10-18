/**
 * GET /.netlify/functions/activity — activity timeline (P2).
 *
 * Returns a JSON array of chronological activity events assembled from real
 * graph records by `server/activity.mjs`. Read-only: zero writes, zero
 * fabricated events.
 *
 * Honesty contract:
 * - Method guard: GET only, 405 + `Allow: GET` otherwise.
 * - `FALKORDB_GRAPH_NAME` not configured → 503 (via `withSession` →
 *   `errorBodyFor`), no fabricated data.
 * - Graph failure / read timeout → 503 via `errorBodyFor` — never an
 *   invented timeline. Empty/unseeded graph → 200 `[]` (honest empty).
 * - Per-IP rate limit via `createRateLimiter` (demo-scope, in-memory; the
 *   platform edge is the real control).
 * - `READ_BUDGET_MS = 8000` wall-clock deadline, below the client's 10 s
 *   abort.
 *
 * Handler seam: `createActivityHandler(deps)` accepts an injectable
 * `layer`, scripted `assemble` op and `limiter` so unit tests never touch
 * a real DB and never stub ESM modules (see server/demoApi.mjs).
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
import { assembleActivityEvents } from '../../server/activity.mjs';

/** Wall-clock budget: must stay below the client's 10 s abort. */
const READ_BUDGET_MS = 8_000;
const ALLOW = 'GET';

export function createActivityHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter();
  const assemble = deps.assemble ?? assembleActivityEvents;

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
          message: 'Too many activity requests from this IP. Wait and try again; no timeline data was read by this request.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    try {
      const events = await withSession(layer, demoGraphName(env), (session) => assemble(session), {
        timeoutMs: READ_BUDGET_MS,
      });
      return jsonResponse(200, events);
    } catch (err) {
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createActivityHandler();
