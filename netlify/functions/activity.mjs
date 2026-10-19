/**
 * GET /.netlify/functions/activity — activity timeline (P2 + M7 Priority D
 * additive per-case filter).
 *
 * Returns a JSON array of chronological activity events assembled from real
 * graph records by `server/activity.mjs`. Read-only: zero writes, zero
 * fabricated events.
 *
 * M7 Priority D — optional `?caseId=` read-only filter: when present, the
 * response contains only review_decision events recorded against that case
 * (publication notices and analysis runs are not case-scoped records, so a
 * caseId query never returns them rather than implying a recorded linkage).
 * The value is validated against the shared review-domain charset rules and
 * reaches Cypher exclusively as a `$caseId` parameter — no inline literals.
 *
 * Honesty contract:
 * - Method guard: GET only, 405 + `Allow: GET` otherwise.
 * - `FALKORDB_GRAPH_NAME` not configured → 503 (via `withSession` →
 *   `errorBodyFor`), no fabricated data.
 * - Graph failure / read timeout → 503 via `errorBodyFor` — never an
 *   invented timeline. Empty/unseeded graph → 200 `[]` (honest empty).
 * - Malformed caseId → 400, nothing read.
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
import { assembleActivityEvents, parseActivityCaseId } from '../../server/activity.mjs';

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

    // Optional per-case filter (read-only). Validated BEFORE the rate budget
    // and any graph work; a malformed value reads nothing.
    const rawCaseId = new URL(request.url).searchParams.get('caseId');
    let caseId;
    if (rawCaseId !== null) {
      try {
        caseId = parseActivityCaseId(rawCaseId);
      } catch (err) {
        return jsonResponse(400, {
          error: 'invalid-request',
          message: err instanceof Error ? err.message : 'Invalid caseId filter.',
        });
      }
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
      const events = await withSession(
        layer,
        demoGraphName(env),
        (session) => assemble(session, { caseId }),
        { timeoutMs: READ_BUDGET_MS },
      );
      return jsonResponse(200, events);
    } catch (err) {
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createActivityHandler();
