/**
 * LIVE integration test for the M3 Netlify-function wiring against the REAL
 * FalkorDB cloud instance — runs the actual handlers (factory seams, real
 * server/seed.mjs + server/demoApi.mjs graph layer) end to end.
 *
 * Safety envelope (mirrors server/test/integration/invariants.int.test.mjs):
 *  - The ONLY graph this suite may create/mutate/delete is the throwaway
 *    `aftershock:demo-smoke`. The handlers' env is explicitly overridden to
 *    that graph name, so even a hostile ambient env cannot retarget the suite.
 *  - `test_hosting` and the managed `aftershock:demo` graph are never touched.
 *  - afterAll deletes the smoke graph and proves db.list() ≡ baseline.
 *
 * Skips gracefully when credentials are absent (CI). Locally run with:
 *   AFTERSHOCK_ENV=/path/to/main-checkout/.env npx vitest run tests/netlify/functions.live.int.test.mjs
 */

import { config as dotenvConfig } from 'dotenv';

// Load credentials without clobbering the ambient environment and without
// printing anything (same resolution order as server/test/_env.mjs):
// AFTERSHOCK_ENV first, then the checkout-root .env.
dotenvConfig({
  path: process.env.AFTERSHOCK_ENV || new URL('../../.env', import.meta.url).pathname,
  override: false,
  quiet: true,
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManagedSeedHandler } from '../../netlify/functions/seed.mjs';
import { createDemoSeedHandler } from '../../netlify/functions/demo-seed.mjs';
import { createGraphProbeHandler } from '../../netlify/functions/graph-probe.mjs';
import { createGraphEdgesHandler } from '../../netlify/functions/graph-edges.mjs';
import { createDocumentsHandler } from '../../netlify/functions/documents.mjs';
import { createRateLimiter } from '../../server/demoApi.mjs';
import { connectFromEnv, resolveCredentials } from '../../server/graphClient.mjs';
import { DEMO_GRAPH_NAME, FIXTURE_IDS, PROTECTED_FOREIGN_GRAPHS } from '../../server/contract.mjs';
import { defaultFixture } from '../../server/seed.mjs';

const SMOKE_GRAPH = 'aftershock:demo-smoke';
if (SMOKE_GRAPH === DEMO_GRAPH_NAME || PROTECTED_FOREIGN_GRAPHS.includes(SMOKE_GRAPH)) {
  throw new Error('live suite misconfiguration: smoke graph must be distinct from all protected graphs');
}

/** Credentials present? (live tests skip without them) */
const configured = (() => {
  try {
    resolveCredentials(process.env);
    return true;
  } catch {
    return false;
  }
})();

const live = configured ? describe : describe.skip;

// Hard override: every handler in this suite targets the smoke graph, never
// the ambient FALKORDB_GRAPH_NAME. SEED_SECRET is a suite-local test value.
const LIVE_ENV = Object.freeze({
  ...process.env,
  FALKORDB_GRAPH_NAME: SMOKE_GRAPH,
  SEED_SECRET: 'm3-live-integration-managed-seed-secret',
});
const MANAGED_SECRET = LIVE_ENV.SEED_SECRET;
const fixture = defaultFixture();

/** Fresh handlers with permissive limiters (rate limiting is unit-tested). */
function liveHandlers() {
  const permissive = () => createRateLimiter({ cooldownMs: 0, windowMs: 3_600_000, maxPerWindow: 1_000 });
  return {
    seed: createManagedSeedHandler({ env: LIVE_ENV, limiter: permissive() }),
    demoSeed: createDemoSeedHandler({ env: LIVE_ENV, limiter: permissive() }),
    probe: createGraphProbeHandler({ env: LIVE_ENV }),
    edges: createGraphEdgesHandler({ env: LIVE_ENV }),
    documents: createDocumentsHandler({ env: LIVE_ENV }),
  };
}

const base = 'http://localhost/.netlify/functions';
const get = (path) => new Request(`${base}${path}`);
const bodylessPost = (path, headers = {}) => new Request(`${base}${path}`, { method: 'POST', headers });

let /** @type {Awaited<ReturnType<typeof connectFromEnv>> | null} */ session = null;
let /** @type {string[]} */ graphsBefore = [];

live(`M3 live function wiring on ${SMOKE_GRAPH}`, () => {
  const handlers = liveHandlers();

  beforeAll(async () => {
    session = await connectFromEnv({
      graphName: SMOKE_GRAPH,
      clientName: 'aftershock-m3-live-integration',
    });
    const graphsOnConnect = await session.listGraphs();
    if (graphsOnConnect.includes(SMOKE_GRAPH)) {
      console.warn(`[m3-live] leftover ${SMOKE_GRAPH} from an interrupted run — deleting before baseline`);
      await session.db.selectGraph(SMOKE_GRAPH).delete();
    }
    graphsBefore = (await session.listGraphs()).slice();
  }, 240_000);

  afterAll(async () => {
    if (!session) return;
    try {
      await session.db.selectGraph(SMOKE_GRAPH).delete();
    } catch {
      // deleting a missing graph is a no-op for our purposes
    }
    const graphsAfter = (await session.listGraphs()).slice();
    expect(graphsAfter).toEqual(graphsBefore);
    await session.close();
  }, 240_000);

  it(
    'POST /seed (secret-guarded) seeds the smoke graph from the versioned fixture',
    async () => {
      const res = await handlers.seed(bodylessPost('/seed', { 'x-seed-secret': MANAGED_SECRET }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.seeded).toBe(true);
      expect(body.alreadySeeded).toBe(false);
      expect(body.action).toBe('seeded');
      expect(body.seedVersion).toBe(fixture.fixtureVersion);
    },
    240_000,
  );

  it(
    'GET /graph/probe reports the seeded graph truthfully',
    async () => {
      const res = await handlers.probe(get('/graph/probe'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.exists).toBe(true);
      expect(body.seedVersion).toBe(fixture.fixtureVersion);
      expect(body.nodeCount).toBe(fixture.nodes.length); // SeedMeta itself is not marked seeded
    },
    240_000,
  );

  it(
    'GET /graph/edges returns wire-shaped records: every edge carries type/fromId/toId',
    async () => {
      const res = await handlers.edges(get('/graph/edges?limit=200'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.graphName).toBe(SMOKE_GRAPH);
      expect(body.seedVersion).toBe(fixture.fixtureVersion);
      expect(body.nodes.length).toBe(fixture.nodes.length);
      expect(body.edges.length).toBe(fixture.edges.length);
      for (const edge of body.edges) {
        expect(typeof edge.type).toBe('string');
        expect(typeof edge.fromId).toBe('string');
        expect(typeof edge.toId).toBe('string');
      }
      // Synthetic content is distinguishable on the wire (AGENTS.md hard rule).
      const synthetic = body.nodes.filter((n) => n.isSynthetic === true);
      expect(synthetic.length).toBeGreaterThan(0);
      for (const node of synthetic) expect(node.syntheticLabel).toBe(fixture.syntheticLabel);
      // A real record survives as such (never relabeled synthetic).
      const real = body.nodes.find((n) => n.id === FIXTURE_IDS.publicationReal);
      expect(real.isSynthetic).toBe(false);
    },
    240_000,
  );

  it(
    'GET /documents lists the REAL Document rows incl. the labeled synthetic manuscript',
    async () => {
      const res = await handlers.documents(get('/documents'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.documents)).toBe(true);
      const manuscript = body.documents.find((d) => d.id === FIXTURE_IDS.document);
      expect(manuscript).toBeDefined();
      expect(manuscript.isSynthetic).toBe(true);
      expect(manuscript.syntheticLabel).toBe(fixture.syntheticLabel);
    },
    240_000,
  );

  it(
    'POST /demo/seed (public, bodyless) is idempotent: honest alreadySeeded, nothing rewritten',
    async () => {
      const res = await handlers.demoSeed(bodylessPost('/demo/seed'));
      expect(res.status).toBe(200);
      const body = await res.json();
      // The client requires seeded===true OR alreadySeeded===true — both honest paths work.
      expect(body.seeded).toBe(false);
      expect(body.alreadySeeded).toBe(true);
      expect(body.seedVersion).toBe(fixture.fixtureVersion);
    },
    240_000,
  );

  it(
    'POST /seed again (managed reseed) reports action "noop" — no fake reseed claim',
    async () => {
      const res = await handlers.seed(bodylessPost('/seed', { 'x-seed-secret': MANAGED_SECRET }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.action).toBe('noop');
      expect(body.seeded).toBe(false);
      expect(body.alreadySeeded).toBe(true);
    },
    240_000,
  );

  it(
    'rejects a managed /seed call without the secret (401) over the live wiring',
    async () => {
      const res = await handlers.seed(bodylessPost('/seed'));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('unauthorized');
    },
    240_000,
  );
});
