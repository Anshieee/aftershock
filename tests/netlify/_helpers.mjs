/**
 * Shared test fakes for the M3 Netlify-function unit tests.
 *
 * These exercise the `create*Handler(deps)` seams declared in
 * `server/demoApi.mjs`: a fake graph `layer` (open → session) plus scripted
 * reader ops, so no test ever touches a real FalkorDB instance or stubs an
 * ESM module.
 */

import { createRateLimiter } from '../../server/demoApi.mjs';

/**
 * A scripted GraphSession stand-in. `roQuery` dispatches on the Cypher text
 * exactly the way the real read helpers address the session (SeedMeta lookup,
 * seeded-node counts, `properties(n)`/`properties(r)` row reads, neighborhood
 * expansion). Anything unexpected throws so tests fail loudly.
 *
 * @param {{
 *   graphName?: string,
 *   exists?: boolean,
 *   seedVersion?: string | null,
 *   nodeRows?: Array<Record<string, unknown>>,
 *   edgeRows?: Array<{ type: string, fromId: string, toId: string, props?: Record<string, unknown> }>,
 *   neighborhood?: string[],
 * }} [options]
 */
export function scriptedSession({
  graphName = 'aftershock:demo-smoke',
  exists = true,
  seedVersion = 'seed-1',
  nodeRows = [],
  edgeRows = [],
  neighborhood = [],
} = {}) {
  /** @type {string[]} */
  const seenQueries = [];
  return {
    graphName,
    seenQueries,
    async graphExists() {
      return exists;
    },
    async close() {
      /* withSession's defensive finally closes the session (bounded) — no-op here */
    },
    async roQuery(cypher, params = {}) {
      seenQueries.push(cypher);
      if (cypher.includes('SeedMeta')) {
        return {
          data:
            seedVersion === null
              ? []
              : [{ seedVersion, seededAt: null, fixtureId: null }],
        };
      }
      if (cypher.includes('count(n)')) return { data: [{ c: nodeRows.length }] };
      if (cypher.includes('-[*1..')) {
        // neighborhoodIds consumes the expansion result (start id is added by the helper itself).
        return { data: neighborhood.filter((id) => id !== params.nodeId).map((id) => ({ id })) };
      }
      if (cypher.includes('properties(n) AS row')) {
        const rows = params.ids ? nodeRows.filter((r) => params.ids.includes(r.id)) : nodeRows;
        return { data: rows.map((row) => ({ row })) };
      }
      if (cypher.includes('MATCH (a)-[r]->(b)')) {
        const rows = params.ids
          ? edgeRows.filter((e) => params.ids.includes(e.fromId) && params.ids.includes(e.toId))
          : edgeRows;
        return {
          data: rows.map((e) => ({ props: e.props ?? {}, type: e.type, fromId: e.fromId, toId: e.toId })),
        };
      }
      throw new Error(`scriptedSession received an unexpected query: ${cypher}`);
    },
  };
}

/**
 * A fake GraphLayer that always hands out the given (or per-graph) session.
 * Records every `open()` call so tests can assert the target graph name came
 * exclusively from the env seam (`FALKORDB_GRAPH_NAME`).
 *
 * @param {Record<string, unknown> | (() => Record<string, unknown>)} sessionOrFactory
 */
export function fakeLayer(sessionOrFactory) {
  /** @type {string[]} */
  const openedGraphs = [];
  return {
    openedGraphs,
    async open(graphName) {
      openedGraphs.push(graphName);
      return typeof sessionOrFactory === 'function' ? sessionOrFactory() : sessionOrFactory;
    },
  };
}

/** @param {Response} res */
export async function readJson(res) {
  return /** @type {any} */ (await res.json());
}

/**
 * Env that passes `isProbeConfigurable` / `resolveCredentials` without
 * touching real credential values (unit tests never connect anywhere).
 */
export function fakeConfiguredEnv(extra = {}) {
  return {
    FALKORDB_GRAPH_NAME: 'aftershock:demo-smoke',
    FALKORDB_HOST: 'unit-test.invalid',
    FALKORDB_PORT: '6379',
    FALKORDB_USER: 'unit-test',
    FALKORDB_PASSWORD: 'unit-test-not-a-real-secret',
    ...extra,
  };
}

/** A fresh permissive limiter for tests that must not trip rate limits. */
export function permissiveLimiter() {
  return createRateLimiter({ cooldownMs: 0, windowMs: 3_600_000, maxPerWindow: 1_000 });
}
