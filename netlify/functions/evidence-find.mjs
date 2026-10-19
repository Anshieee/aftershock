/**
 * POST /.netlify/functions/evidence-find?claimId=<id> — P4 Find Evidence
 *
 * Two modes per the P4 design of record (docs route name: `POST /evidence/find`):
 * - prepare mode (empty body / `{}`): load the claim from the graph verbatim,
 *   build the suggested query, NO external fetch.
 * - search mode (body `{ "query": "..." }`): one bounded Crossref call,
 *   ≤8 deduped real candidates, honest providersStatus on timeout/error.
 *
 * Honesty contract:
 * - No graph writes anywhere: search is exploratory; citations, review states
 *   and the manuscript are never modified and candidates are not persisted.
 * - claimText comes ONLY from the graph (the client can never inject it and it
 *   is never logged or echoed into error messages).
 * - Provider failure/timeout ⇒ HTTP 200 with truthful providersStatus (a
 *   provider outage is NOT a server error, and empty results stay empty).
 * - Graph failure ⇒ 503 errorBodyFor semantics (no fabricated data).
 * - Errors: 405 wrong method; 400 invalid-request (claimId charset, bad query
 *   empty/>400/control chars, malformed JSON); 404 claim-not-found; 429
 *   rate-limited (lower per-IP budget than the write routes — this is an
 *   external-call route).
 *
 * Wall-clock budget < 8 s (client aborts at 10 s): the graph leg and the
 * provider leg share one deadline; the provider's per-attempt abort budget
 * shrinks to whatever is left after the graph leg.
 *
 * Handler seam: `createEvidenceFindHandler(deps)` accepts an injectable
 * `layer`, `findContext` op, `search` op and `fetchFn` so unit tests never
 * touch a real DB, a real provider, or ESM stubbing (per server/demoApi.mjs
 * test-seam comment).
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
import {
  buildSuggestedQuery,
  EVIDENCE_CAVEATS,
  EVIDENCE_PROVIDERS,
  loadEvidenceFindContext,
  searchCrossref,
  validateClaimId,
  validateSearchQuery,
} from '../../server/evidenceSearch.mjs';

/**
 * Overall wall-clock budget: below the 8 s withSession family budget and the
 * client's 10 s abort. The remaining budget drives the provider-search leg.
 */
const HANDLER_BUDGET_MS = 7_800;
/** Per-attempt Crossref abort budget (spec ~6 s) — seam-overridable for tests. */
const CROSSREF_ATTEMPT_MS = 6_000;
/** Whole provider-leg budget: whatever remains of the handler budget, at most. */
const ALLOW = 'POST';

/**
 * Rate limits LOWER than the write routes (writes: 30 s cooldown, 5/10 min):
 * cooldown 60 s, ≤10 per 10 min per IP — the search path spends external
 * provider quota, not just graph reads.
 */
const SEARCH_RATE_LIMITS = Object.freeze({ cooldownMs: 60_000, windowMs: 600_000, maxPerWindow: 10 });

export function createEvidenceFindHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter(SEARCH_RATE_LIMITS);
  const findContext = deps.findContext ?? loadEvidenceFindContext;
  const search = deps.search ?? searchCrossref;
  const crossrefTimeoutMs = deps.searchTimeoutMs ?? CROSSREF_ATTEMPT_MS;

  return async function handler(request /*, context */) {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: ALLOW });
    }

    const startedAt = Date.now();
    const remainingMs = () => Math.max(0, HANDLER_BUDGET_MS - (Date.now() - startedAt));

    const graphName = demoGraphName(env);
    const url = new URL(request.url);
    const ip = clientIpOf(request);

    // Per-IP rate limit FIRST (lower budget than the write routes; platform
    // edge is the real control). Checked before any parsing or graph/provider
    // work; refused runs are not recorded.
    const ipGate = limiter.check(`ip:${ip}`);
    if (!ipGate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(ipGate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        {
          error: 'rate-limited',
          message: 'Too many evidence-search requests from this IP. Wait and try again; nothing was searched by this request.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    let claimId;
    try {
      claimId = validateClaimId(url.searchParams.get('claimId') ?? '');
    } catch (err) {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: err instanceof Error ? err.message : 'claimId is required (non-empty string).',
      });
    }

    // Parse the JSON body: empty / {} → prepare mode; { query } → search mode.
    let input = {};
    try {
      const text = await textBodyOf(request);
      input = text.trim().length > 0 ? JSON.parse(text) : {};
    } catch {
      return jsonResponse(400, { error: 'invalid-request', message: 'Request body must be a JSON object.' });
    }
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return jsonResponse(400, { error: 'invalid-request', message: 'Request body must be a JSON object.' });
    }

    // Per-claim rate limit (demo-scope, in-memory; mirrors review-decide).
    const gate = limiter.check(claimId);
    if (!gate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        {
          error: 'rate-limited',
          message: 'Evidence search is rate limited for this claim. Wait and try again; nothing was searched by this request.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    const searchMode = Object.prototype.hasOwnProperty.call(input, 'query');
    let effectiveQuery = null;
    if (searchMode) {
      try {
        effectiveQuery = validateSearchQuery(input.query);
      } catch (err) {
        return jsonResponse(400, {
          error: 'invalid-request',
          message: err instanceof Error ? err.message : 'query must be a non-empty string of at most 400 printable characters.',
        });
      }
    }

    try {
      const result = await withSession(
        layer,
        graphName,
        async (session) => {
          const context = await findContext(session, claimId);
          if (!context) {
            return jsonResponse(404, {
              error: 'claim-not-found',
              message: `No Claim or Conclusion node with id ${claimId} exists in the graph.`,
            });
          }

          if (!searchMode) {
            return jsonResponse(200, {
              mode: 'prepare',
              claimId: context.claimId,
              claimText: context.claimText,
              label: context.label,
              ...(context.manuscriptId ? { manuscriptId: context.manuscriptId } : {}),
              concern: context.concern,
              suggestedQuery: buildSuggestedQuery(context.claimText),
              queryEditable: true,
              providers: EVIDENCE_PROVIDERS,
              caveats: EVIDENCE_CAVEATS,
            });
          }

          // Search mode: everything prepare returns, plus the provider leg.
          const legBudget = Math.max(1, remainingMs());
          const outcome = await search(effectiveQuery, {
            ...(deps.fetchFn !== undefined ? { fetch: deps.fetchFn } : {}),
            env,
            timeoutMs: Math.min(crossrefTimeoutMs, legBudget),
            budgetMs: legBudget,
          });

          return jsonResponse(200, {
            mode: 'search',
            claimId: context.claimId,
            claimText: context.claimText,
            label: context.label,
            ...(context.manuscriptId ? { manuscriptId: context.manuscriptId } : {}),
            concern: context.concern,
            query: effectiveQuery,
            candidates: outcome.candidates ?? [],
            providersStatus: [
              {
                id: 'crossref',
                status: outcome.status,
                ...(outcome.message ? { message: outcome.message } : {}),
                ...(outcome.retried ? { retried: true } : {}),
              },
            ],
            caveats: EVIDENCE_CAVEATS,
            searchedAt: new Date().toISOString(),
          });
        },
        { timeoutMs: Math.max(1, remainingMs()) },
      );
      return result;
    } catch (err) {
      // Domain errors carry an explicit HTTP status (400/404); graph/backend
      // failures use errorBodyFor (503 for connectivity/query/deadline — never
      // fabricated data).
      if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
        return jsonResponse(err.status, {
          error: err.name === 'EvidenceNotFoundError' ? 'claim-not-found' : 'invalid-request',
          message: err.message,
        });
      }
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createEvidenceFindHandler();
