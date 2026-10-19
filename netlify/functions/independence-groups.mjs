/**
 * GET /.netlify/functions/independence-groups — Wave 4 read-only
 * "independence groups" (shared supporting publications).
 *
 * Returns the groups + honest summary assembled from real graph records by
 * `server/independence.mjs`. Read-only: zero writes, zero fabricated rows.
 * Two claims sharing a supporting publication record are not independent
 * evidence for each other; this endpoint surfaces that fact only — it never
 * asserts independence/dependence beyond it and never changes review state.
 *
 * Honesty contract (mirrors netlify/functions/activity.mjs exactly):
 * - Method guard: GET only, 405 + `Allow: GET` otherwise.
 * - `FALKORDB_GRAPH_NAME` not configured → 503 (via `withSession` →
 *   `errorBodyFor`), no fabricated data. Graph failure / read timeout → 503
 *   via `errorBodyFor` — never invented groups. Unseeded/empty graph → 200
 *   with all-zero summary + empty groups (honest empties).
 * - Per-IP rate limit via `createRateLimiter` with ONE deliberate deviation
 *   from the bare `activity.mjs` default (5/10 min + 30 s cooldown): this
 *   route serves a review-queue panel that fetches on EVERY page load, so
 *   the bare default would 429 a normal reviewer navigating between pages.
 *   Budget here stays per-IP bounded but calibrated for a page-attached
 *   read: 1 s anti-hammer minimum gap, 30 per 10-min window as the real
 *   abuse bound, honest 429 beyond (the same typed `rate-limited` shape).
 * - `READ_BUDGET_MS = 8000` wall-clock deadline, below the client's 10 s
 *   abort.
 *
 * Handler seam: `createIndependenceGroupsHandler(deps)` accepts an injectable
 * `layer`, scripted `compute` op and `limiter` so unit tests never touch a
 * real DB and never stub ESM modules (see server/demoApi.mjs).
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
  INDEPENDENCE_READ_BUDGET_MS,
  independenceGroups,
} from '../../server/independence.mjs';

const READ_BUDGET_MS = INDEPENDENCE_READ_BUDGET_MS;
const ALLOW = 'GET';

export function createIndependenceGroupsHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter =
    deps.limiter ??
    createRateLimiter({ cooldownMs: 1_000, windowMs: 600_000, maxPerWindow: 30 });
  const compute = deps.compute ?? independenceGroups;

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
          message: 'Too many independence-group requests from this IP. Wait and try again; no graph data was read by this request.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    try {
      const body = await withSession(layer, demoGraphName(env), (session) => compute(session), {
        timeoutMs: READ_BUDGET_MS,
      });
      return jsonResponse(200, body);
    } catch (err) {
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createIndependenceGroupsHandler();
