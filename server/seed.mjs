/**
 * @aftershock/server — idempotent synthetic fixture seeding
 *
 * Seeds the guided-demo fixture (DATA_CONTRACTS §6) into a FalkorDB graph:
 *
 * - `seedVersion` lives on the `meta-seed-version` node. If it matches the
 *   fixture version and the seeded node/edge counts match the fixture, the
 *   seed is a no-op — nothing is written at all.
 * - Otherwise the seed wipes **only** the seeded subgraph (nodes/edges marked
 *   `seeded = true`) and recreates it. Foreign content in the same graph —
 *   as well as protected foreign graphs that exist elsewhere on the same
 *   shared cloud instance — is never touched.
 * - Every seeded node/edge carries `seeded: true` so wipe scope is explicit
 *   and independent of labels; every node also carries `primaryLabel` for
 *   cheap histogram queries.
 * - All reads use roQuery, all writes are parameterized (FALKORDB.md).
 * - No credentials are ever logged; warnings are returned, not printed.
 */

import {
  EDGE_TYPES,
  FIXTURE_IDS,
  NODE_LABELS,
  PROVENANCE_KINDS,
  REAL_RECORD,
  SEED_ANALYSIS_VERSION,
} from './contract.mjs';
import { getSeedStatus } from './impact.mjs';

// Bundler-safe static JSON import (M3): Netlify functions bundle this module
// with esbuild, which inlines the JSON at build time. The previous
// `readFileSync(new URL('./fixtures/…'))` loader did not survive bundling
// (import.meta.url points into the function scratch bundle, where the
// standalone JSON file does not exist). The `with { type: 'json' }` attribute
// is the same pattern already shipped and verified live by the deployed M1
// `health` function; vite/esbuild mediate the syntax for vitest/local runs.
import defaultFixtureData from './fixtures/demo-fixture.json' with { type: 'json' };

/** @type {Record<string, unknown> | null} */
let defaultFixtureInstance = null;

/**
 * The default guided-demo fixture (fixtures/demo-fixture.json).
 * Parsed once and cached (via the static import above); safe in
 * credential-free unit tests. Consumers must treat the fixture as read-only.
 * @returns {Record<string, unknown>} fixture — see docs/DATA_CONTRACTS.md §6 and fixtures/README.md
 */
export function defaultFixture() {
  if (!defaultFixtureInstance) {
    defaultFixtureInstance = /** @type {Record<string, unknown>} */ (defaultFixtureData);
  }
  return defaultFixtureInstance;
}

/**
 * @typedef {Object} SeedPlan
 * @property {Map<string, Array<Record<string, unknown>>>} nodesByLabel FalkorDB label → full property rows
 * @property {Map<string, Array<{fromId: string, toId: string, props: Record<string, unknown>}>>} edgesByType edge type → rows
 * @property {Record<string, unknown>} metaNode the `meta-seed-version` property row
 * @property {{nodes: number, edges: number, nodesByLabel: Record<string, number>, edgesByType: Record<string, number>}} expected
 */

/**
 * Validate a fixture against the contract and compile it into batched write
 * inputs. Pure function — unit tested, no I/O, no credentials, no printing.
 *
 * @param {Record<string, unknown>} fixture
 * @returns {SeedPlan}
 * @throws {Error} descriptive validation error on any contract violation
 */
export function buildSeedPlan(fixture, { now = new Date() } = {}) {
  assertObject(fixture, 'fixture');
  const fixtureVersion = resolveFixtureVersion(fixture);
  const fixtureLabelCsv = /** @type {string} */ (fixture.syntheticLabel);
  const nowIso = isoNow(now);

  const nodes = assertArray(fixture.nodes, 'fixture.nodes');
  const edges = assertArray(fixture.edges, 'fixture.edges');
  const ids = new Set();
  /** @type {Array<string>} */
  const warnings = [];

  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const nodesByLabel = new Map();
  for (const node of nodes) {
    assertObject(node, 'fixture.nodes[]');
    const kind = /** @type {string} */ (node.kind);
    if (!NODE_LABELS.includes(kind)) {
      throw new Error(`Fixture node ${str(node.id)}: unknown node kind ${str(kind)} (contract §1).`);
    }
    requireFields(node, ['id', 'createdAt', 'updatedAt', 'provenanceKind', 'analysisVersion'], `node ${str(node.id)} (${kind})`);
    if (typeof node.id !== 'string' || node.id === '') throw new Error('Every fixture node needs a non-empty id string.');
    if (ids.has(node.id)) throw new Error(`Duplicate fixture node id: ${str(node.id)}.`);
    ids.add(node.id);
    if (!PROVENANCE_KINDS.includes(/** @type {string} */ (node.provenanceKind))) {
      throw new Error(`Node ${str(node.id)}: provenanceKind ${str(node.provenanceKind)} is not a contract provenance kind (§3).`);
    }
    if (node.isSynthetic === true && node.syntheticLabel !== fixtureLabelCsv) {
      throw new Error(`Node ${str(node.id)}: synthetic content must carry syntheticLabel ${str(fixtureLabelCsv)} (synthetic content must be distinguishable everywhere).`);
    }
    collectRealRecordWarnings(node, warnings);
    nodesByLabel.set(kind, [...(nodesByLabel.get(kind) ?? []), enrichNode(node, kind)]);
  }

  /** @type {Map<string, Array<{fromId: string, toId: string, props: Record<string, unknown>}>>} */
  const edgesByType = new Map();
  for (const edge of edges) {
    assertObject(edge, 'fixture.edges[]');
    const type = /** @type {string} */ (edge.type);
    if (!EDGE_TYPES.includes(type)) {
      throw new Error(`Fixture edge ${str(edge.id)}: unknown edge type ${str(type)} (contract §2).`);
    }
    requireFields(edge, ['id', 'fromId', 'toId', 'createdAt', 'provenanceKind', 'rationale', 'sourcePointer', 'analysisVersion', 'reviewState'], `edge ${str(edge.id)} (${type})`);
    if (!ids.has(/** @type {string} */ (edge.fromId)) || !ids.has(/** @type {string} */ (edge.toId))) {
      throw new Error(`Edge ${str(edge.id)} (${str(type)}): fromId/toId must reference existing fixture node ids.`);
    }
    if (!PROVENANCE_KINDS.includes(/** @type {string} */ (edge.provenanceKind))) {
      throw new Error(`Edge ${str(edge.id)}: provenanceKind ${str(edge.provenanceKind)} is not a contract provenance kind (§3).`);
    }
    if (type === 'POSSIBLE_MATCH' && edge.provenanceKind !== 'unresolved') {
      throw new Error(`Edge ${str(edge.id)}: POSSIBLE_MATCH edges must be provenanceKind 'unresolved' (explicitly unverified, non-propagating).`);
    }
    if (type === 'POSSIBLE_MATCH' && typeof edge.matchConfidence === 'number' && edge.matchConfidence >= 0.7) {
      throw new Error(`Edge ${str(edge.id)}: POSSIBLE_MATCH edge must not signal high confidence.`);
    }
    edgesByType.set(type, [...(edgesByType.get(type) ?? []), { fromId: edge.fromId, toId: edge.toId, props: edgeProps(edge) }]);
  }

  const metaNode = {
    id: FIXTURE_IDS.seedMeta,
    seedVersion: fixtureVersion,
    fixtureId: str(fixture['@fixture'] ?? fixture.fixtureId ?? 'aftershock-demo-fixture'),
    createdAt: nowIso,
    updatedAt: nowIso,
    provenanceKind: 'human_confirmed',
    analysisVersion: fixtureVersion,
    note: 'Seed metadata node; seedVersion drives idempotent reseeding (contract §6).',
  };

  /** @type {Record<string, number>} */
  const expectedNodesByLabel = {};
  for (const [k, rows] of nodesByLabel) expectedNodesByLabel[k] = rows.length;
  /** @type {Record<string, number>} */
  const expectedEdgesByType = {};
  for (const [t, rows] of edgesByType) expectedEdgesByType[t] = rows.length;

  return {
    nodesByLabel,
    edgesByType,
    metaNode,
    expected: {
      nodes: nodes.length,
      edges: edges.length,
      nodesByLabel: expectedNodesByLabel,
      edgesByType: expectedEdgesByType,
    },
    warnings,
  };
}

/**
 * Warning-only sanity check for real bibliographic records: the Mehra-record
 * nodes must carry the DOIs the contract pins. Never throws — live-record
 * drift is an M3 verification finding, not a fixture compile error.
 * @param {Record<string, unknown>} node
 * @param {string[]} warnings
 */
function collectRealRecordWarnings(node, warnings) {
  if (node.id === 'pub-mehra-2020' && node.doi !== REAL_RECORD.publicationDoi) {
    warnings.push(`fixture real-record check: pub-mehra-2020 doi diverges from the contract pin (${REAL_RECORD.publicationDoi}); M3 must verify the live record.`);
  }
  if (node.id === 'pub-mehra-retraction-2020' && node.doi !== REAL_RECORD.retractionRecordDoi) {
    warnings.push(`fixture real-record check: retraction-record doi diverges from the contract pin (${REAL_RECORD.retractionRecordDoi}); M3 must verify the live record.`);
  }
}

/**
 * @param {Record<string, unknown>} node
 * @param {string} primaryLabel
 * @returns {Record<string, unknown>} enriched property row for the graph
 */
function enrichNode(node, primaryLabel) {
  return { ...normalizePropertyValues(node), seeded: true, primaryLabel };
}

/**
 * FalkorDB node/edge property values can only be primitives or arrays of
 * primitives (server error verbatim: "Property values can only be of
 * primitive types or arrays of primitive types"). Structural fixture fields
 * like `location` objects therefore serialize to lossless JSON strings under
 * the same key — deterministic across reseeds, readable, and documented here.
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
function normalizePropertyValues(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]));
}

/**
 * @param {unknown} value
 * @returns {ReturnType<typeof JSON.parse> | string | number | boolean | null | Array<unknown>}
 */
function normalizeValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map((v) => normalizeValue(v));
  return JSON.stringify(value);
}

/**
 * @param {Record<string, unknown>} edge
 * @returns {Record<string, unknown>} clean edge properties (structure keys removed)
 */
function edgeProps(edge) {
  const clean = /** @type {Record<string, unknown>} */ ({ ...edge });
  delete clean.type;
  delete clean.fromId;
  delete clean.toId;
  clean.seeded = true;
  return normalizePropertyValues(clean);
}

/**
 * @typedef {Object} SeedResult
 * @property {string} graphName
 * @property {'noop' | 'seeded' | 'reseeded'} action
 * @property {boolean} graphExistedBefore
 * @property {string} seedVersion
 * @property {{nodes: number, edges: number}} stats
 * @property {SeedStatus} status
 * @property {string[]} warnings
 */

/**
 * Seed (or no-op) the fixture into the graph the session is bound to.
 * Reads `db.list()` before any implicit graph creation (FALKORDB.md) and
 * returns a machine-readable outcome. Meant to be invoked by a
 * secret-guarded Netlify function (DATA_CONTRACTS §5 POST /seed). Concurrent
 * seeds of the same graph are not serialized by this function — the M2
 * calling convention serializes seed invocations.
 *
 * @param {import('./graphClient.mjs').GraphSession} session bound session (its graphName is the seed target)
 * @param {Record<string, unknown>} [fixture] defaults to the guided-demo fixture
 * @param {{now?: Date | string}} [options]
 * @returns {Promise<SeedResult>}
 */
export async function seedGraph(session, fixture = defaultFixture(), options = {}) {
  const plan = buildSeedPlan(fixture, { now: options.now ? new Date(options.now) : new Date() });
  const seededAt = isoNow(options.now);

  const graphsBefore = await session.listGraphs(); // convention: discover before creating
  const graphExistedBefore = graphsBefore.includes(session.graphName);

  if (graphExistedBefore) {
    const meta = await readSeedMeta(session);
    const matchesVersion = meta.seedVersion !== null && meta.seedVersion === plan.metaNode.seedVersion;
    if (matchesVersion && (await seededCountsMatch(session, plan.expected))) {
      const status = await getSeedStatus(session, fixture);
      return {
        graphName: session.graphName,
        action: 'noop',
        graphExistedBefore,
        seedVersion: /** @type {string} */ (plan.metaNode.seedVersion),
        stats: { nodes: status.nodeCount, edges: status.edgeCount },
        status,
        warnings: plan.warnings,
      };
    }
  }

  // Scoped wipe: only seeded:true content. Foreign nodes/edges survive.
  await session.writeQuery('MATCH (n) WHERE n.seeded = $seeded DETACH DELETE n', { seeded: true }, { timeoutMs: 60_000 });

  // Nodes: one UNWIND batch per label.
  for (const [labelName, rows] of plan.nodesByLabel) {
    await session.writeQuery(
      `UNWIND $rows AS row CREATE (n:${labelName}) SET n = row`,
      { rows },
      { timeoutMs: 60_000 },
    );
  }

  // Edges: one UNWIND batch per type; both endpoints must be seeded nodes.
  for (const [typeName, rows] of plan.edgesByType) {
    await session.writeQuery(
      `UNWIND $rows AS row MATCH (a) WHERE a.id = row.fromId AND a.seeded = $seeded MATCH (b) WHERE b.id = row.toId AND b.seeded = $seeded CREATE (a)-[r:${typeName}]->(b) SET r = row.props`,
      { rows, seeded: true },
      { timeoutMs: 60_000 },
    );
  }

  // Stale SeedMeta rows are removed separately in the finalize step (NOT in the
  // scrub pass above): the scrub pass must stay limited to `seeded = true` so the
  // fixture `expected.nodes` accounting remains valid, and the previous meta node
  // (written without the seeded flag) is exactly what a drift-reseed would
  // otherwise duplicate (PR #2 review: SeedMeta count grew 1→2 per reseed, and
  // readSeedMeta then picked an ambiguous data[0]).
  await session.writeQuery('MATCH (m:SeedMeta) DETACH DELETE m', {}, { timeoutMs: 60_000 });

  // Seed metadata written last: a failed reseed never advertises the fixture version.
  await session.writeQuery('CREATE (m:SeedMeta) SET m = $meta', { meta: { ...plan.metaNode, seededAt } }, { timeoutMs: 60_000 });

  const action = graphExistedBefore ? 'reseeded' : 'seeded';
  const status = await getSeedStatus(session, fixture);
  return {
    graphName: session.graphName,
    action,
    graphExistedBefore,
    seedVersion: /** @type {string} */ (plan.metaNode.seedVersion),
    stats: { nodes: status.nodeCount, edges: status.edgeCount },
    status,
    warnings: plan.warnings,
  };
}

/**
 * Read the current SeedMeta row (or an all-null view). Read-only.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<{seedVersion: string | null, seededAt: string | null, fixtureId: string | null}>}
 */
export async function readSeedMeta(session) {
  const res = await session.roQuery(
    'MATCH (m:SeedMeta) WHERE m.id = $id RETURN m.seedVersion AS seedVersion, m.seededAt AS seededAt, m.fixtureId AS fixtureId',
    { id: FIXTURE_IDS.seedMeta },
  );
  const row = res.data?.[0];
  return {
    seedVersion: /** @type {string | null} */ (row?.seedVersion ?? null),
    seededAt: /** @type {string | null} */ (row?.seededAt ?? null),
    fixtureId: /** @type {string | null} */ (row?.fixtureId ?? null),
  };
}

/**
 * Compare live seeded node/edge counts against the fixture expectation.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{nodes: number, edges: number}} expected
 */
async function seededCountsMatch(session, expected) {
  const nodeRes = await session.roQuery('MATCH (n) WHERE n.seeded = $seeded RETURN count(n) AS c', { seeded: true });
  const edgeRes = await session.roQuery('MATCH ()-[r]->() WHERE r.seeded = $seeded RETURN count(r) AS c', { seeded: true });
  const nodes = Number(nodeRes.data?.[0]?.c ?? 0);
  const edges = Number(edgeRes.data?.[0]?.c ?? 0);
  return nodes === expected.nodes && edges === expected.edges;
}

/**
 * The effective fixture version (`fixtureVersion`, or the `'seed-1'` contract
 * default when absent/empty) — one shared default so the seed plan, seed
 * status and idempotency checks never compare against different bases.
 * @param {Record<string, unknown>} fixture
 * @returns {string}
 */
export function resolveFixtureVersion(fixture) {
  return typeof fixture?.fixtureVersion === 'string' && fixture.fixtureVersion !== ''
    ? fixture.fixtureVersion
    : SEED_ANALYSIS_VERSION;
}

/**
 * Expected counts for a fixture — used by seed status checks, impact status
 * and tests. Pure function.
 * @param {Record<string, unknown>} fixture
 * @returns {SeedPlan['expected']}
 */
export function expectedCountsFor(fixture) {
  return buildSeedPlan(fixture).expected;
}

/**
 * @param {Date | string | undefined} [now]
 * @returns {string} ISO-8601 UTC timestamp
 */
function isoNow(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string') return new Date(now).toISOString();
  return new Date().toISOString();
}

/**
 * @param {unknown} value
 * @returns {string} short readable display form for error messages
 */
function str(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {Record<string, unknown>}
 */
function assertObject(value, what) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${what} must be an object`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {Array<Record<string, unknown>>}
 */
function assertArray(value, what) {
  if (!Array.isArray(value)) {
    throw new Error(`${what} must be an array`);
  }
  return /** @type {Array<Record<string, unknown>>} */ (value);
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string[]} fields
 * @param {string} what
 */
function requireFields(obj, fields, what) {
  const missing = fields.filter((f) => obj[f] === undefined);
  if (missing.length) {
    throw new Error(`${what} is missing required field(s): ${missing.join(', ')}`);
  }
}
