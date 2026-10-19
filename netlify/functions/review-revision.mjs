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
  clientIpOf,
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

/**
 * Demo-traffic tuning (hardening wave — POST_SUBMISSION_AUDIT item 3): same
 * split as review-decide — per-IP budget fits a live review session, per-case
 * budget stays tight so revision proposals cannot churn on one case.
 */
const IP_COOLDOWN_MS = 10_000;
const IP_WINDOW_MS = 600_000;
const IP_MAX_PER_WINDOW = 24;
const CASE_COOLDOWN_MS = 30_000;
const CASE_WINDOW_MS = 600_000;
const CASE_MAX_PER_WINDOW = 6;

export function createReviewRevisionHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const ipLimiter = deps.ipLimiter ?? deps.limiter ?? createRateLimiter({ cooldownMs: IP_COOLDOWN_MS, windowMs: IP_WINDOW_MS, maxPerWindow: IP_MAX_PER_WINDOW });
  const caseLimiter = deps.caseLimiter ?? deps.limiter ?? createRateLimiter({ cooldownMs: CASE_COOLDOWN_MS, windowMs: CASE_WINDOW_MS, maxPerWindow: CASE_MAX_PER_WINDOW });
  const propose = deps.propose ?? createRevisionProposal;

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
    const ipGate = ipLimiter.check(`ip:${ip}`);
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
    const gate = caseLimiter.check(caseId);
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
        return jsonResponse(err.status, {
          // Honest error classes (same mapping as review-decide): validation,
          // missing case, and conflict stay distinguishable for clients.
          error:
            err.name === 'ReviewConflictError'
              ? 'conflict'
              : err.name === 'ReviewNotFoundError'
                ? 'case-not-found'
                : 'invalid-request',
          message: err.message,
        });
      }
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createReviewRevisionHandler();
