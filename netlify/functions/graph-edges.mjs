/**
 * GET /.netlify/functions/graph/edges — read-only graph records overview.
 * Netlify Functions v2 handler; `/graph/edges` → `graph-edges.mjs` via
 * netlify.toml rewrite (dots are not allowed in function filenames).
 *
 * Query parameters:
 * - `limit`  default 40, bounded [1..200]); anything else → 400.
 * - `nodeId` optional; with it, `depth` (1|2) scopes the neighborhood. The
 *   range in the Cypher variable-length pattern is interpolated ONLY from
 *   the {1,2} enum after explicit validation — never from user text.
 *
 * Wire shape mirrors the deployed client (`src/lib/api.ts` parseNode /
 * parseEdge / parseGraphOverview — read-only reference, never edited here):
 * `{ graphName?, seedVersion?, nodes: […], edges: […] }` with flat node
 * property objects (kind + all display fields top-level) and edges that
 * ALWAYS carry type/fromId/toId (the client silently drops edges missing
 * any of them).
 *
 * Honesty: unseeded → 200 `{ graphName, seedVersion: null, nodes: [], edges: [] }`;
 * unreachable → 503 `{ error }` (never fabricated data). GET only.
 */

import {
  createGraphLayer,
  demoGraphName,
  EDGES_LIMIT,
  errorBodyFor,
  jsonResponse,
  NODE_DEPTH_ENUM,
  readGraphRecords,
  withSession,
} from '../../server/demoApi.mjs';

const READ_BUDGET_MS = 8_000;

/**
 * Parse & validate the `limit` query param exactly once per request.
 * @param {string | null} raw
 * @returns {{limit: number} | {error: string}}
 */
function validateLimit(raw) {
  if (raw === null || raw === '') return { limit: EDGES_LIMIT.default };
  if (!/^[0-9]{1,4}$/.test(raw)) {
    return { error: `limit must be an integer between ${EDGES_LIMIT.min} and ${EDGES_LIMIT.max}` };
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < EDGES_LIMIT.min || limit > EDGES_LIMIT.max) {
    return { error: `limit must be an integer between ${EDGES_LIMIT.min} and ${EDGES_LIMIT.max}` };
  }
  return { limit };
}

/**
 * @param {string | null} raw nodeId query param
 * @returns {{nodeId: string | null} | {error: string}}
 */
function validateNodeId(raw) {
  if (raw === null || raw === '') return { nodeId: null };
  const nodeId = raw.trim();
  // Parameterized at query time ($nodeId); this bound is hygiene, not injection defense.
  if (nodeId.length < 1 || nodeId.length > 128) {
    return { error: 'nodeId must be 1–128 characters' };
  }
  return { nodeId };
}

/**
 * @param {string | null} raw depth query param
 * @returns {{depth: 1 | 2} | {error: string}}
 */
function validateDepth(raw) {
  if (raw === null || raw === '') return { depth: 1 };
  if (!/^[12]$/.test(raw)) {
    return { error: `depth must be one of ${NODE_DEPTH_ENUM.join(' | ')}` };
  }
  return { depth: /** @type {1 | 2} */ (Number(raw)) };
}

export function createGraphEdgesHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const readRecords = deps.readRecords ?? readGraphRecords;

  return async function handler(request /*, context */) {
    if (request.method !== 'GET') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: 'GET' });
    }

    let url;
    try {
      url = new URL(request.url);
    } catch {
      url = new URL(request.url, 'http://localhost');
    }
    const limit = validateLimit(url.searchParams.get('limit'));
    if ('error' in limit) return jsonResponse(400, { error: 'invalid-param', message: limit.error });
    const nodeId = validateNodeId(url.searchParams.get('nodeId'));
    if ('error' in nodeId) return jsonResponse(400, { error: 'invalid-param', message: nodeId.error });
    const depth = validateDepth(url.searchParams.get('depth'));
    if ('error' in depth) return jsonResponse(400, { error: 'invalid-param', message: depth.error });

    try {
      const records = await withSession(
        layer,
        demoGraphName(env),
        (session) => readRecords(session, {
          limit: limit.limit,
          nodeId: nodeId.nodeId,
          depth: depth.depth,
        }),
        { timeoutMs: READ_BUDGET_MS },
      );
      const body = {
        graphName: records.graphName,
        seedVersion: records.seedVersion,
        nodes: records.nodes,
        edges: records.edges,
      };
      if (records.truncated) body.truncated = true;
      return jsonResponse(200, body);
    } catch (err) {
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createGraphEdgesHandler();
