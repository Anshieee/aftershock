/**
 * GET /.netlify/functions/graph/probe — Netlify Functions v2 handler.
 *
 * Read-only seeded-state probe for the managed demo graph:
 * `{ exists: boolean, seedVersion?: string, nodeCount?: number }`.
 *
 * Honesty contract:
 * - Unseeded / missing graph → 200 `{ exists: false }` (the truthful probe;
 *   the deployed client also tolerates a 404 as unseeded, but the server
 *   must not use 404 to mean "unreachable").
 * - Backend unreachable / not configured → 503 `{ error: … }`. NEVER a
 *   200-with-fabricated-`exists`.
 * - Method guard: GET only (405 otherwise, `allow` header present).
 * - Wall-clock bounded below the client's 10 s abort budget.
 *
 * Routing: the client calls `/.netlify/functions/graph/probe`; the function
 * file is `graph-probe.mjs` (dots are not allowed in function filenames), so
 * `netlify.toml` carries a status-200 rewrite above the SPA fallback.
 */

import {
  clientIpOf,
  createGraphLayer,
  demoGraphName,
  errorBodyFor,
  jsonResponse,
  probeSeedState,
  withSession,
} from '../../server/demoApi.mjs';

/** Wall-clock budget: must stay below the client's 10 s abort. */
const READ_BUDGET_MS = 8_000;

export function createGraphProbeHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const readProbe = deps.probe ?? probeSeedState;

  return async function handler(request /*, context */) {
    if (request.method !== 'GET') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: 'GET' });
    }
    const graphName = demoGraphName(env);
    try {
      const probe = await withSession(layer, graphName, (session) => readProbe(session), {
        timeoutMs: READ_BUDGET_MS,
      });
      if (!probe.exists) {
        return jsonResponse(200, { exists: false });
      }
      const body = { exists: true, nodeCount: probe.nodeCount };
      if (probe.seedVersion !== null && probe.seedVersion !== undefined && probe.seedVersion !== '') {
        body.seedVersion = probe.seedVersion;
      }
      return jsonResponse(200, body);
    } catch (err) {
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createGraphProbeHandler();
