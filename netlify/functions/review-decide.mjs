/**
 * POST /.netlify/functions/review-decide?caseId=<id> — M5
 *
 * Records a human ReviewDecision for a review case (Claim or Conclusion) and
 * transitions the case's orthogonal review state (DATA_CONTRACTS §4/§5).
 *
 * Body: { outcome: 'revision_needed'|'more_evidence_needed'|'not_affected'|'evidence_updated',
 *         explanation: string (required, non-empty), reviewer?: string }
 * Success 200: { decisionId, caseId, outcome, explanation, reviewer?, decidedAt, beforeState, afterState }
 * 400 missing/invalid input; 409 invalid state transition; 503 graph unavailable;
 * 405 wrong method.
 *
 * Honesty contract:
 * - caseId travels as a query param (Netlify function filenames cannot carry
 *   path segments), never interpolated into Cypher.
 * - Graph failure → 503 with no fabricated data; never invents a decision.
 * - Original claim/conclusion text is never modified by this endpoint.
 *
 * Handler seam: `createReviewDecideHandler(deps)` accepts an injectable `layer`
 * and scripted `decide` op so unit tests never touch a real DB and never stub
 * ESM modules (see server/demoApi.mjs test-seam comment).
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
import { recordReviewDecision } from '../../server/reviewState.mjs';

/** Wall-clock budget: must stay below the client's 10 s abort. */
const WRITE_BUDGET_MS = 8_000;
const ALLOW = 'POST';

export function createReviewDecideHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter();
  const decide = deps.decide ?? recordReviewDecision;

  return async function handler(request /*, context */) {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: ALLOW });
    }

    const graphName = demoGraphName(env);
    const url = new URL(request.url);
    const caseId = url.searchParams.get('caseId') ?? '';
    const ip = clientIpOf(request);

    // Per-IP rate limit (demo-scope, in-memory; the platform edge is the real
    // control). Checked before consuming the request body so IP flooding is
    // stopped before any parsing or graph work.
    const ipGate = limiter.check(`ip:${ip}`);
    if (!ipGate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(ipGate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        {
          error: 'rate-limited',
          message: 'Too many review requests from this IP. Wait and try again; nothing was recorded by this request.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    // Parse the JSON body; unreadable/malformed → 400 before consuming the rate budget.
    let input = {};
    try {
      const text = await textBodyOf(request);
      input = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      return jsonResponse(400, { error: 'invalid-request', message: 'Request body must be a JSON object.' });
    }
    input.caseId = caseId;

    // Per-case rate limit (demo-scope, in-memory; the platform edge is the real control).
    const gate = limiter.check(caseId);
    if (!gate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        {
          error: 'rate-limited',
          message: 'Review decisions are rate limited for this case. Wait and try again; nothing was recorded by this request.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    try {
      const result = await withSession(layer, graphName, (session) => decide(session, input), {
        timeoutMs: WRITE_BUDGET_MS,
      });
      return jsonResponse(200, result);
    } catch (err) {
      // Domain errors carry an explicit HTTP status; graph/backend failures use
      // errorBodyFor (503 for connectivity/query/deadline, never fabricated data).
      if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
        return jsonResponse(err.status, {
          error: err.name === 'ReviewConflictError' ? 'conflict' : 'invalid-request',
          message: err.message,
        });
      }
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createReviewDecideHandler();
