/**
 * @aftershock/server — Netlify functions API support layer (M3 wiring)
 *
 * Small shared helpers used by the read/write HTTP handlers in
 * `netlify/functions/*`. Everything here is server-side only; the browser
 * bundle never imports this module and never sees any credential.
 *
 * Design rules honoring AGENTS.md / DATA_CONTRACTS.md / FALKORDB.md:
 * - The target graph ALWAYS comes from `demoGraphName(env)` =
 *   `FALKORDB_GRAPH_NAME`. There is no hardcoded graph name anywhere in the
 *   function layer; a missing variable is an explicit *not-configured* state
 *   (503 for reads, `graph:'not-configured'` for health).
 * - All graph access reuses `graphClient.connectFromEnv()` (its connect/query
 *   socket timeouts must not be bypassed with raw client calls).
 * - Every user-controlled value flows through `$param`s. The only inline query
 *   fragments are contract-enum-whitelisted values (node label from §1,
 *   `type(r)`, and the depth range built exclusively from the 1|2 enum).
 * - Errors disclose their class + status; they never echo environment values,
 *   secrets, or parameter payloads.
 * - Read endpoints are wrapped in a wall-clock deadline shorter than the
 *   client's 10 s abort so partial honesty ("backend did not answer") always
 *   beats a hanging request. The seed path is deliberately NOT deadline-capped
 *   by this helper (seed writes carry the library's own 60 s TIMEOUTs): a
 *   half-seeded graph without an advertised seedVersion is recoverable by the
 *   next seed attempt (seedGraph wipes only `seeded = true` content).
 *
 * Test seams: handlers are created via `create*Handler(deps)` factories that
 * accept a fake `layer` (open → session) plus scripted `ops` (seed runner /
 * readers) so unit tests never touch a real DB and never stub ESM imports.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import {
  connectFromEnv,
  ConnectionError,
  CredentialsError,
  GraphQueryError,
} from './graphClient.mjs';
import { FIXTURE_IDS } from './contract.mjs';
import { readSeedMeta } from './seed.mjs';

/* ------------------------------------------------------------------ *
 * Responses & request plumbing
 * ------------------------------------------------------------------ */

/**
 * JSON response with the demo headers: `no-store` (dynamic, truth-at-time-of-
 * request data) and charset-bound JSON. No CORS headers are ever emitted
 * here — the demo is same-origin only.
 */
export function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

/**
 * Read the request body as text (bounded by the platform's own function
 * request-size limit; Netlify enforces a cap before the handler runs).
 * Bodyless endpoints use this to reject *any* body content.
 * @param {Request} request
 */
export async function textBodyOf(request) {
  try {
    return await request.text();
  } catch {
    return 'unreadable';
  }
}

/**
 * Best-effort client key for per-IP throttling. Netlify injects
 * `x-nf-client-connection-ip`; standard proxies supply `x-forwarded-for`.
 * The value is never logged, never echoed into a response, and is only used
 * in-memory.
 */
export function clientIpOf(request) {
  const nf = request.headers.get('x-nf-client-connection-ip');
  if (nf) return nf;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

/**
 * Wrap a task in a wall-clock deadline. The loser of the race is abandoned
 * once `Promise.race` settles (rejections of abandoned work stay subscribed,
 * so they can never surface as unhandled rejections later).
 */
export class DeadlineError extends Error {
  /** @param {number} ms */
  constructor(ms) {
    super(`Operation exceeded the bounded deadline of ${ms} ms; no result is reported from it.`);
    this.name = 'DeadlineError';
  }
}

/**
 * @param {number} ms
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 * @template T
 */
export function withDeadline(ms, run) {
  let timer;
  const gate = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(ms)), ms);
  });
  return Promise.race([run(), gate]).finally(() => clearTimeout(timer));
}

/**
 * Open a session, run the task under a defensive finally-close, and bound the
 * whole task by `timeoutMs`. Closing is best-effort and itself bounded so a
 * wedged socket cannot hold a function response hostage.
 */
const CLOSE_BUDGET_MS = 1_500;

/**
 * @param {GraphLayer} layer
 * @param {string | null} graphName
 * @param {(session: import('./graphClient.mjs').GraphSession) => Promise<T>} task
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<T>}
 * @template T
 */
export async function withSession(layer, graphName, task, { timeoutMs = 8_000 } = {}) {
  if (!graphName) {
    throw new CredentialsError('FALKORDB_GRAPH_NAME is not set in the server environment.');
  }
  const session = await layer.open(graphName);
  try {
    return await withDeadline(timeoutMs, () => task(session));
  } finally {
    await Promise.race([session.close(), new Promise((resolve) => setTimeout(resolve, CLOSE_BUDGET_MS))]);
  }
}

/* ------------------------------------------------------------------ *
 * Error mapping — class + status, no secrets, no fabricated success
 * ------------------------------------------------------------------ */

/**
 * Map any thrown error to a truthful `{ status, body }` HTTP error pair.
 * Connection/query/deadline failures become 503 with `error` naming the
 * class. Never leaks values: `GraphQueryError` messages embed Cypher text
 * (parameterized ⇒ payload-free) but we still do not forward raw library
 * messages to clients.
 *
 * @param {unknown} err
 * @param {'graph' | 'seed'} [kind] `seed` renames the 503 code when the failure
 *        happened while writing (seedGraph), to keep the API class explicit.
 */
export function errorBodyFor(err, kind = 'graph') {
  if (err instanceof CredentialsError) {
    return {
      status: 503,
      body: {
        error: 'graph-backend-not-configured',
        message: 'Graph backend credentials are not configured server-side. Nothing was read, written, or claimed.',
      },
    };
  }
  const unavailable = kind === 'seed'
    ? {
        error: 'seed-failed',
        message: 'Seeding did not complete: the graph backend could not be reached or a write failed. No seedVersion was advertised — a later seed attempt will heal partial state.',
      }
    : {
        error: 'graph-backend-unavailable',
        message: 'The graph backend could not be reached (or timed out). Nothing was read or written; this response contains no fabricated data.',
      };
  if (
    err instanceof ConnectionError
    || err instanceof GraphQueryError
    || err instanceof DeadlineError
  ) {
    return { status: 503, body: unavailable };
  }
  return {
    status: 500,
    body: {
      error: 'internal-error',
      message: 'Unexpected server-side error. Nothing was claimed or fabricated; see the function logs for the class of failure.',
    },
  };
}

/* ------------------------------------------------------------------ *
 * Rate limiting (demo-scope, in-memory)
 * ------------------------------------------------------------------ */

/**
 * In-memory sliding-window + cooldown limiter.
 *
 * HONEST LIMITATION: Netlify Functions run in isolated instances; this state
 * is per-isolate and resets on cold start. It is deliberately demo-scope
 * protection against double-clicking the guided-demo button — real-rate
 * limiting enforces at the platform edge (service policy / CDN rules), which
 * is out of M3 scope and documented as such in the M4/M5 handoff.
 *
 * @param {{cooldownMs?: number, windowMs?: number, maxPerWindow?: number}} [options]
 */
export function createRateLimiter({ cooldownMs = 30_000, windowMs = 600_000, maxPerWindow = 5 } = {}) {
  /** @type {Map<string, number[]>} */
  const hits = new Map();
  return {
    cooldownMs,
    windowMs,
    maxPerWindow,
    /**
     * Record-or-refuse one run for `key`. Refused runs are NOT recorded
     * (cooldown re-checks operate on the recorded successful runs only).
     * @param {string} key
     * @param {number} [now] injectable clock (tests)
     */
    check(key, now = Date.now()) {
      const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      const last = list[list.length - 1];
      if (last !== undefined && now - last < cooldownMs) {
        return { allowed: false, retryAfterMs: cooldownMs - (now - last) };
      }
      if (list.length >= maxPerWindow) {
        return { allowed: false, retryAfterMs: Math.max(1, windowMs - (now - list[0])) };
      }
      list.push(now);
      hits.set(key, list);
      return { allowed: true, retryAfterMs: 0 };
    },
    /** Tests only: forget all recorded runs. */
    reset() {
      hits.clear();
    },
  };
}

/**
 * Serialize tasks through a single per-isolate queue. A caller that arrives
 * while another seed run is in flight WAITS (briefly) instead of racing it —
 * after the earlier run finishes, the queued caller runs `seedGraph` itself
 * and the library's idempotency check turns it into the honest
 * `alreadySeeded` response.
 */
export function createSerialQueue() {
  let tail = Promise.resolve();
  return function enqueue(/** @type {() => Promise<T>} */ task) {
    const run = tail.then(() => task());
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return /** @type {Promise<T>} */ (run);
  };
}

/* ------------------------------------------------------------------ *
 * Secret handling (managed /seed route; constant-time, no leakage)
 * ------------------------------------------------------------------ */

/**
 * Constant-time comparison of a provided secret against the expected one.
 * Both sides are hashed to a fixed length first, so (a) `timingSafeEqual`
 * never throws on length mismatch and (b) input length differences do not
 * influence the comparison. Callers must never log or echo either argument.
 * @param {string} provided
 * @param {string | undefined} expected
 */
export function safeSecretEqual(provided, expected) {
  if (!expected || typeof provided !== 'string') return false;
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ *
 * Graph identity + default layer (thin wrapper kept for test stubbing)
 * ------------------------------------------------------------------ */

/**
 * Resolve the managed demo graph from the environment ONLY.
 * No fallback graph is hardcoded: a missing `FALKORDB_GRAPH_NAME` yields
 * `null`, which handlers surface as truthy `not-configured` states instead
 * of probing some guessed graph.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function demoGraphName(env = process.env) {
  const raw = env.FALKORDB_GRAPH_NAME;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/** @typedef {{open(graphName: string): Promise<import('./graphClient.mjs').GraphSession>}} GraphLayer */

/**
 * The real layer over `connectFromEnv`. Kept as a small injectable object so
 * unit tests can pass a scripted `layer` without mocking ESM modules.
 *
 * Budgets: per-query server-side TIMEOUT 15 s (≤ library default), socket
 * connect 8 s. Handlers wrap reads in shorter wall-clock deadlines on top.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{connectTimeoutMs?: number, queryTimeoutMs?: number}} [budgets]
 * @returns {GraphLayer}
 */
export function createGraphLayer(env = process.env, budgets = {}) {
  return {
    async open(graphName) {
      return connectFromEnv({
        graphName,
        env,
        clientName: 'aftershock-netlify-functions',
        connectTimeoutMs: budgets.connectTimeoutMs ?? 8_000,
        queryTimeoutMs: budgets.queryTimeoutMs ?? 15_000,
      });
    },
  };
}

/* ------------------------------------------------------------------ *
 * Read helpers (probe / overview / documents) — roQuery only
 * ------------------------------------------------------------------ */

/**
 * Minimal seeded-state probe used by graph-probe and health. Three cheap
 * legs: `GRAPH.LIST` (existence, convention-first) then parallel SeedMeta +
 * seeded-node count. No histogram queries — health must answer fast.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<{exists: boolean, seedVersion: string | null, nodeCount: number | null}>}
 */
export async function probeSeedState(session) {
  const exists = await session.graphExists();
  if (!exists) {
    return { exists: false, seedVersion: null, nodeCount: null };
  }
  const [meta, nodeRes] = await Promise.all([
    readSeedMeta(session),
    session.roQuery('MATCH (n) WHERE n.seeded = $seeded RETURN count(n) AS c', { seeded: true }),
  ]);
  return {
    exists: true,
    seedVersion: meta.seedVersion,
    nodeCount: Number(nodeRes.data?.[0]?.c ?? 0),
  };
}

/**
 * Umbrella-freshness: `meta-seed-version` version decided by the seed plan
 * (`FIXTURE_IDS.seedMeta` node). Kept here as the ONE helper both the probe
 * and the demo-seed idempotency responses read from.
 *
 * NOTE: `seedGraph` itself (server/seed.mjs) is the idempotency authority —
 * demo-seed calls it and lets `action` decide the wire flags, so this module
 * deliberately does NOT re-implement version/count comparison logic.
 */

/**
 * Flat property rows of all seeded nodes (Property values arrive via
 * `properties(n)`, verified working against the live FalkorDB instance).
 * No ORDER / LIMIT in Cypher: the supervised demo fixture is tiny; caps are
 * applied in JS where they can be documented honestly.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string[]} [ids] restrict to these node ids (scoped neighborhood)
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function seededNodeRows(session, ids) {
  const res = ids
    ? await session.roQuery(
        'MATCH (n) WHERE n.seeded = $seeded AND n.id IN $ids RETURN properties(n) AS row',
        { seeded: true, ids },
      )
    : await session.roQuery('MATCH (n) WHERE n.seeded = $seeded RETURN properties(n) AS row', { seeded: true });
  return /** @type {Array<Record<string, unknown>>} */ (res.data ?? []).map((r) => r.row);
}

/**
 * Flat provenance rows of all seeded edges. `fromId`/`toId`/`type` are
 * always emitted (the deployed client silently drops edges missing any of
 * them); every material property stored by the seed (per contract §2) is
 * carried verbatim by `properties(r)`.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string[]} [ids] restrict to edges between these node ids
 */
async function seededEdgeRows(session, ids) {
  const res = ids
    ? await session.roQuery(
        'MATCH (a)-[r]->(b) WHERE r.seeded = $seeded AND a.id IN $ids AND b.id IN $ids RETURN properties(r) AS props, type(r) AS type, a.id AS fromId, b.id AS toId',
        { seeded: true, ids },
      )
    : await session.roQuery(
        'MATCH (a)-[r]->(b) WHERE r.seeded = $seeded RETURN properties(r) AS props, type(r) AS type, a.id AS fromId, b.id AS toId',
        { seeded: true },
      );
  return /** @type {Array<Record<string, unknown>>} */ (res.data ?? []).map((r) => ({
    props: r.props ?? {},
    type: r.type,
    fromId: r.fromId,
    toId: r.toId,
  }));
}

/** Server-internal flags that must never surface in wire payloads. */
const INTERNAL_NODE_KEYS = /** @type {const} */ (['seeded', 'primaryLabel']);

/**
 * Node wire shape (mirrors the deployed client's `parseNode` expectations):
 * `{ id, kind, provenanceKind?, isSynthetic?, syntheticLabel?, author?, …all
 * display fields }`. `kind` comes from the stored fixture `kind` property;
 * `primaryLabel` is the fallback. Everything else stays exactly as seeded.
 *
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
export function toWireNode(row) {
  const out = { ...row };
  let primary;
  for (const key of INTERNAL_NODE_KEYS) {
    if (key === 'primaryLabel') primary = out[key];
    delete out[key];
  }
  if (typeof out.kind !== 'string' || out.kind === '') {
    out.kind = typeof primary === 'string' ? primary : 'Unknown';
  }
  return out;
}

const NAMED_EDGE_FIELDS = /** @type {const} */ (['id', 'provenanceKind', 'rationale', 'sourcePointer', 'reviewState']);

/**
 * Edge wire shape (mirrors the deployed client's `parseEdge`): `type`,
 * `fromId`, `toId` are ALWAYS emitted — the client silently drops edges
 * missing any of them, so honesty requires never omitting them. Contract §2
 * provenance fields (provenanceKind, rationale, sourcePointer, reviewState)
 * are promoted to named fields when stored; everything else lands in
 * `properties`.
 *
 * @param {Record<string, unknown>} row seed-edge record (flat props object)
 * @returns {Record<string, unknown>}
 */
export function toWireEdge(row) {
  const props = { ...(row.props ?? {}) };
  delete props.seeded;
  const edge = /** @type {Record<string, unknown>} */ ({
    type: row.type,
    fromId: row.fromId,
    toId: row.toId,
  });
  const edgeId = props.id;
  if (typeof edgeId === 'string' && edgeId !== '') edge.id = edgeId;
  delete props.id;
  for (const key of NAMED_EDGE_FIELDS) {
    const value = props[key];
    if (typeof value === 'string' && value !== '') edge[key] = value;
    delete props[key];
  }
  edge.properties = props;
  return edge;
}

/**
 * Neighborhood node ids for a scoped graph-edges query.
 * `depth` MUST already be the whitelist value 1 or 2 — it is interpolated as
 * a Cypher range literal exclusively through that enum (RedisGraph does not
 * parameterize variable-length ranges). Duplicates from cycle blowup are
 * deduped in JS (verified live: `MATCH (n)-[*1..2]-(m)` returns repeated ids);
 * LIMIT 500 is a defensive bound for pathological graphs.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{nodeId: string, depth: number}} options
 * @returns {Promise<string[]>} includes the start node id
 */
export async function neighborhoodIds(session, { nodeId, depth }) {
  if (depth !== 1 && depth !== 2) {
    throw new Error('neighborhoodIds requires depth in {1, 2} (contract enum); refusing any other value.');
  }
  const res = await session.roQuery(
    `MATCH (n)-[*1..${depth}]-(m) WHERE n.id = $nodeId AND n.seeded = $seeded AND m.seeded = $seeded RETURN m.id AS id LIMIT 500`,
    { nodeId, seeded: true },
  );
  /** @type {Set<string>} */
  const ids = new Set([nodeId]);
  for (const row of /** @type {Array<Record<string, unknown>>} */ (res.data ?? [])) {
    if (typeof row.id === 'string' && row.id !== '') ids.add(row.id);
  }
  return [...ids];
}

/** Node cap for any single overview response (fixture is 16; bound is defensive). */
const NODE_CAP = 200;

/**
 * Graph-records read for `GET /graph/edges`.
 * Unseeded → `{ seedVersion: null, nodes: [], edges: [] }` (an honest empty
 * overview, never a fabricated one).
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{limit: number, nodeId?: string | null, depth?: 1 | 2}} options
 * @returns {Promise<{graphName: string, seedVersion: string | null, nodes: Record<string, unknown>[], edges: Record<string, unknown>[], truncated: boolean}>}
 */
export async function readGraphRecords(session, { limit, nodeId = null, depth = 1 }) {
  const graphName = session.graphName;
  if (!(await session.graphExists())) {
    return { graphName, seedVersion: null, nodes: [], edges: [], truncated: false };
  }
  const meta = await readSeedMeta(session);

  const scoped = Boolean(nodeId);
  const ids = nodeId && scoped ? await neighborhoodIds(session, { nodeId, depth }) : null;
  const [nodeProps, edgeProps] = await Promise.all([
    seededNodeRows(session, scoped ? ids : undefined),
    seededEdgeRows(session, scoped ? ids : undefined),
  ]);

  const nodes = nodeProps.map(toWireNode).slice(0, NODE_CAP);
  const allowedIds = new Set(nodes.map((n) => /** @type {string} */ (n.id)));
  const edges = edgeProps
    .map(toWireEdge)
    .filter((e) => !scoped || (allowedIds.has(/** @type {string} */ (e.fromId)) && allowedIds.has(/** @type {string} */ (e.toId))))
    .slice(0, limit);

  return {
    graphName,
    // A graph with no SeedMeta advertises exactly that: no seedVersion.
    seedVersion: meta.seedVersion,
    nodes,
    edges,
    truncated: edgeProps.length > edges.length || nodeProps.length > nodes.length,
  };
}

/**
 * Document list for `GET /documents`: REAL Document nodes read from the
 * graph, including their isSynthetic flag (the synthetic manuscript vs. real
 * verified Mehra records — nothing is synthesized at response time).
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<{documents: Record<string, unknown>[], seedVersion: string | null}>}
 */
export async function readDocuments(session) {
  if (!(await session.graphExists())) {
    return { documents: [], seedVersion: null };
  }
  const meta = await readSeedMeta(session);
  const res = await session.roQuery(
    'MATCH (n:ResearchDocument) WHERE n.seeded = $seeded\n     RETURN properties(n) AS row',
    { seeded: true },
  );
  const documents = /** @type {Array<Record<string, unknown>>} */ (res.data ?? [])
    .map((r) => toWireNode(r.row))
    .filter((node) => typeof node.id === 'string');
  return { documents, seedVersion: meta.seedVersion };
}

/* ------------------------------------------------------------------ *
 * Public constants shared with handlers/tests
 * ------------------------------------------------------------------ */

/** Wire limits: `limit` query param bounds for /graph/edges (client-visible). */
export const EDGES_LIMIT = Object.freeze({ min: 1, max: 200, default: 40 });

/** Depth enum for scoped neighborhood queries — the ONLY values ever allowed. */
export const NODE_DEPTH_ENUM = Object.freeze([1, 2]);

/** Doctor-visible seed identity for integration tests: fixture SeedMeta id. */
export const SEED_META_ID = FIXTURE_IDS.seedMeta;
