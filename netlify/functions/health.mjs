/**
 * GET /.netlify/functions/health — Netlify Functions v2 handler.
 *
 * UPGRADED in M3: still a liveness indicator (ok is about THIS function, not
 * the database), and now with a truthful, bounded server-side graph probe:
 *
 * - `{ok:true, service:'aftershock-demo', version}` — M1 contract kept verbatim.
 * - `graph` stays a STRING (status-UI logic depends on strings only):
 *     `not-configured` — env cannot support a probe (FALKORDB_GRAPH_NAME or
 *       FalkorDB credentials missing server-side).
 *     `"<FALKORDB_GRAPH_NAME>"` — connected; plus `graphReachable:true`,
 *       `seedState:'seeded'|'unseeded'` and, when known, `seedVersion` /
 *       `nodeCount` of the seeded subgraph.
 *     `unreachable` — probe could not complete in the bounded window
 *       (~3 s; the cloud ingress RTT makes this real); plus
 *       `graphReachable:false`. Liveness stays honest: ok is still true
 *       because the FUNCTION is alive — the response never claims a working
 *       database and no field is fabricated from a failed probe.
 * - No secrets, no credential-shaped fields in the response (test-asserted).
 */

import { resolveCredentials } from '../../server/graphClient.mjs';
import {
  createGraphLayer,
  demoGraphName,
  jsonResponse,
  probeSeedState,
  withSession,
} from '../../server/demoApi.mjs';

let version = '0.1.0';
try {
  // Single source of truth is package.json; fall back silently if unavailable.
  const pkg = await import('../../package.json', { with: { type: 'json' } });
  version = (pkg.default ?? pkg).version ?? version;
} catch {
  /* keep fallback */
}

/**
 * The health probe gets the SHORTEST budget of all endpoints: it runs on
 * every UI mount. ~3 s covers connect (cloud ingress RTT) + existence list
 * + parallel SeedMeta/counts. On timeout the response reports `unreachable`
 * — truthful, never a guessed state.
 */
const HEALTH_BUDGET_MS = 3_000;

export function createHealthHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const resolveGraphState = deps.probe ?? probeSeedState;

  return async function handler() {
    /** @type {Record<string, unknown>} */
    const body = { ok: true, service: 'aftershock-demo', graph: 'not-configured', version };

    if (!isProbeConfigurable(env)) {
      // Nothing can be truthfully probed: keep the M1 body exactly, no extras.
      return jsonResponse(200, body);
    }
    const graphName = /** @type {string} */ (demoGraphName(env));
    body.graph = graphName;
    try {
      const probe = await withSession(layer, graphName, (session) => resolveGraphState(session), {
        timeoutMs: HEALTH_BUDGET_MS,
      });
      body.graphReachable = true;
      body.nodeCount = probe.nodeCount ?? 0;
      body.seedState =
        probe.seedVersion !== null && probe.seedVersion !== undefined && probe.nodeCount
          ? 'seeded'
          : 'unseeded';
      if (probe.seedVersion !== null && probe.seedVersion !== undefined && probe.seedVersion !== '') {
        body.seedVersion = probe.seedVersion;
      }
      return jsonResponse(200, body);
    } catch {
      // Any probe failure (ConnectionError, deadline, query error) is
      // reported as exactly what it is: an unreachable backend. Never
      // rewritten into a state the probe did not establish. The graph
      // string degrades to `unreachable` (doc comment above) — the probe
      // never confirmed a working connection, so the connected name must
      // not be advertised as if it had.
      body.graph = 'unreachable';
      body.graphReachable = false;
      body.graphNote = 'probe failed within the bounded window';
      return jsonResponse(200, body);
    }
  };
}

/**
 * Probe configurability: graph name AND credentials must both be
 * resolvable server-side. `resolveCredentials` throws (only) before any
 * network I/O — the check never leaks which variable is missing, matching
 * the error-class honesty of the other endpoints.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function isProbeConfigurable(env) {
  if (demoGraphName(env) === null) return false;
  try {
    resolveCredentials(env);
    return true;
  } catch {
    return false;
  }
}

export default createHealthHandler();
