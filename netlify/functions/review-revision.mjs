/**
 * POST /.netlify/functions/review-revision?caseId=<id> — M5
 *
 * Creates a human RevisionProposal for a review case. The original claim /
 * conclusion text is copied immutably from the case node; this endpoint never
 * modifies it (DATA_CONTRACTS §4/§5).
 *
 * Body: { proposedText: string (required, non-empty), rationale?: string }
 * Success 200: { proposalId, caseId, originalText, proposedText, rationale?, status: 'draft', createdAt }
 * 400 missing/invalid input; 503 graph unavailable; 405 wrong method.
 *
 * Honesty contract:
 * - caseId travels as a query param; never interpolated into Cypher.
 * - Graph failure → 503 with no fabricated data; never invents a proposal.
 * - Copying a draft is NOT applying it: the proposal is status 'draft' and the
 *   case node's `text` is left untouched.
 *
 * Handler seam: `createReviewRevisionHandler(deps)` accepts an injectable
 * `layer` and scripted `propose` op so unit tests never touch a real DB and
 * never stub ESM modules (see server/demoApi.mjs test-seam comment).
 */

import {
  createGraphLayer,
  createRateLimiter,
  demoGraphName,
  errorBodyFor,
  jsonResponse,
  textBodyOf,
  withSession,
} from '../../server/demoApi.mjs';
import { createRevisionProposal } from '../../server/reviewState.mjs';

/** Wall-clock budget: must stay below the client's 10 s abort. */
const WRITE_BUDGET_MS = 8_000;
const ALLOW = 'POST';

export function createReviewRevisionHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter();
  const propose = deps.propose ?? createRevisionProposal;

  return async function handler(request /*, context */) {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: ALLOW });
    }

    const graphName = demoGraphName(env);
    const url = new URL(request.url);
    const caseId = url.searchParams.get('caseId') ?? '';

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
          message: 'Revision proposals are rate limited for this case. Wait and try again; nothing was recorded by this request.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    try {
      const result = await withSession(layer, graphName, (session) => propose(session, input), {
        timeoutMs: WRITE_BUDGET_MS,
      });
      return jsonResponse(200, result);
    } catch (err) {
      // Domain errors carry an explicit HTTP status; graph/backend failures use
      // errorBodyFor (503 for connectivity/query/deadline, never fabricated data).
      if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
        return jsonResponse(err.status, { error: 'invalid-request', message: err.message });
      }
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createReviewRevisionHandler();
