/**
 * Integration tests — Wave 4 read-only independence groups against the REAL
 * FalkorDB cloud instance (DATA_CONTRACTS §6 fixture, reads ONLY).
 *
 * Safety envelope (modeled on evidence-find.int.test.mjs):
 *  - Preferred target: the MANAGED demo graph `aftershock:demo`, used
 *    strictly read-only (roQuery only; `independenceGroups` performs no
 *    writes). Nothing is seeded into it and nothing is deleted from it.
 *  - Fallback (only when the managed graph is missing or seeded at an
 *    unexpected fixture version): the throwaway graph
 *    `aftershock:demo-independence-smoke` is seeded with the same
 *    guided-demo fixture, then deleted again; afterAll proves db.list() is
 *    unchanged.
 *  - The managed demo graph is NEVER written to by this suite.
 *  - No live external calls at all — this suite stays fully local to the
 *    graph, so it needs no RUN_EVIDENCE_LIVE-style opt-in beyond having
 *    credentials.
 *
 * Skips gracefully when credentials are absent (CI). Locally run from
 * `server/` (credentials come from the main checkout `.env` via the
 * `test/_env.mjs` setup file / AFTERSHOCK_ENV):
 *   npx vitest --config vitest.integration.config.js run test/integration/independence-groups.int.test.mjs
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectFromEnv, resolveCredentials } from '../../graphClient.mjs';
import { readSeedMeta, seedGraph, defaultFixture, resolveFixtureVersion } from '../../seed.mjs';
import { independenceGroups, INDEPENDENCE_CAVEAT, INDEPENDENCE_LIMITATIONS } from '../../independence.mjs';
import { DEMO_GRAPH_NAME, FIXTURE_IDS } from '../../contract.mjs';
import { createIndependenceGroupsHandler } from '../../../netlify/functions/independence-groups.mjs';

const SMOKE_GRAPH = 'aftershock:demo-independence-smoke';
if (SMOKE_GRAPH === DEMO_GRAPH_NAME) {
  throw new Error('integration suite misconfiguration: smoke graph must never be the managed demo graph');
}

const configured = (() => {
  try {
    resolveCredentials(process.env);
    return true;
  } catch {
    return false;
  }
})();

const integration = configured ? describe : describe.skip;
const fixtureVersion = resolveFixtureVersion(defaultFixture());

let /** @type {Awaited<ReturnType<typeof connectFromEnv>> | null} */ session = null;
let /** @type {string[] | null} */ graphsBefore = null;
let usedSmokeGraph = false;

integration('Wave 4 independence-groups integration (read-only)', () => {
  beforeAll(async () => {
    session = await connectFromEnv({
      graphName: DEMO_GRAPH_NAME,
      clientName: 'aftershock-vitest-independence',
    });
    graphsBefore = (await session.listGraphs()).slice();
    const exists = graphsBefore.includes(DEMO_GRAPH_NAME);
    const meta = exists ? await readSeedMeta(session) : { seedVersion: null };
    if (exists && meta.seedVersion === fixtureVersion) {
      return; // managed demo graph is seeded at the expected fixture version — read from it.
    }
    // Honest fallback: a stale/missing managed graph must not fail the suite on
    // drift it did not cause; verify the same fixture on a disposable copy.
    usedSmokeGraph = true;
    await session.close();
    session = await connectFromEnv({ graphName: SMOKE_GRAPH, clientName: 'aftershock-vitest-independence' });
    await seedGraph(session, defaultFixture());
  });

  afterAll(async () => {
    if (!session) return;
    try {
      if (usedSmokeGraph) {
        await session.db.selectGraph(SMOKE_GRAPH).delete();
        const graphsAfter = (await session.listGraphs()).slice();
        expect(graphsAfter).toEqual(graphsBefore);
      }
    } finally {
      try {
        await session.close();
      } catch {
        // The handler-seam test below hands the SAME session to withSession,
        // whose finally already closed it; double-close is expected there.
      }
    }
  });

  it('reports honest seed metadata + real support-link counts from the demo graph', async () => {
    const body = await independenceGroups(session);
    expect(body.graphName).toBe(session.graphName);
    expect(body.seeded).toBe(true);
    expect(body.seedVersion).toBe(fixtureVersion);

    // Cross-check the summary against an INDEPENDENT read-only count of the
    // same contract (support edge + role), so the aggregate cannot drift from
    // the links the graph actually stores.
    const linkRes = await session.roQuery(
      `MATCH (cu:CitationUse)-[:CITATION_USE_SUPPORTS_CLAIM]->(claim:Claim)
       WHERE cu.role = $supporting
       RETURN cu.id AS citationUseId, claim.id AS claimId`,
      { supporting: 'supporting' },
    );
    const expectedLinks = new Set(
      (linkRes.data ?? []).map((r) => String(r.citationUseId) + '\n' + String(r.claimId)),
    );
    expect(body.summary.supportingCitationUses).toBe(expectedLinks.size);

    const pubIds = await distinctSupportingPublicationIds(session);
    expect(body.summary.publicationsSupportingClaims).toBe(new Set(pubIds).size);
  });

  it('the historical citation use (cu-B-historical) NEVER feeds a group', async () => {
    const body = await independenceGroups(session);
    // cu-B-historical carries role=historical + MENTIONS_HISTORICALLY to
    // pub-mehra-2020; the guided demo gives every publication at most ONE
    // supporting claim, so the honest grouped result is ZERO shared groups —
    // a real zero, not an invented guarantee of independence.
    expect(body.groups).toEqual([]);
    expect(body.summary.sharedGroups).toBe(0);
    expect(body.summary.supportingCitationUses).toBeGreaterThan(0);
    expect(body.caveat).toBe(INDEPENDENCE_CAVEAT);
    for (const limitation of INDEPENDENCE_LIMITATIONS) {
      expect(body.limitations).toContain(limitation);
    }
  });

  it('any group the fixture ever grows still shows claim-id chips + distinct citation uses only', async () => {
    const body = await independenceGroups(session);
    for (const group of body.groups) {
      // Relation-type discipline is structural: groups can only exist for
      // claimCount > 1, and claim ids are real stored ids.
      expect(group.claimCount).toBe(group.claims.length);
      expect(group.claimCount).toBeGreaterThan(1);
      expect(new Set(group.claims.map((c) => c.id)).size).toBe(group.claimCount);
      expect(group.citationUseIds.length).toBeGreaterThan(0);
      for (const cuId of group.citationUseIds) {
        expect(cuId.startsWith('cu-')).toBe(true);
      }
      for (const claim of group.claims) {
        expect(claim.text === null || typeof claim.text === 'string').toBe(true);
        expect(claim.status === null || typeof claim.status === 'string').toBe(true);
      }
      expect(typeof group.publication.id).toBe('string');
      expect(group.publication.doi === null || typeof group.publication.doi === 'string').toBe(true);
      expect(group.publication.isSynthetic === null || typeof group.publication.isSynthetic === 'boolean').toBe(true);
    }
  });

  it('stays read-only end to end through the HTTP handler seam (200 honest body)', async () => {
    const handler = createIndependenceGroupsHandler({
      env: { ...process.env, FALKORDB_GRAPH_NAME: session.graphName },
      layer: { open: async () => session }, // the real session; only roQuery is exercised
    });
    const res = await handler(new Request('https://f.test/.netlify/functions/independence-groups'));
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text());
    expect(body.caveat).toBe(INDEPENDENCE_CAVEAT);
    expect(body.summary).toEqual(expect.objectContaining({
      supportingCitationUses: expect.any(Number),
      publicationsSupportingClaims: expect.any(Number),
      sharedGroups: expect.any(Number),
    }));
    expect(FIXTURE_IDS.publicationReal).toBe('pub-mehra-2020'); // guard: fixture import stays wired
  });
});

/**
 * Independent read-only count of publications reached through supporting
 * citation uses (for cross-checking the summary aggregate).
 * @param {NonNullable<typeof session>} s
 */
async function distinctSupportingPublicationIds(s) {
  const res = await s.roQuery(
    `MATCH (cu:CitationUse)-[:CITATION_USE_SUPPORTS_CLAIM]->(:Claim)
     WHERE cu.role = $supporting
     MATCH (cu)-[:CITATION_USE_REFERENCES_PUBLICATION]->(pub:Publication)
     RETURN DISTINCT pub.id AS id`,
    { supporting: 'supporting' },
  );
  return (res.data ?? []).map((r) => String(r.id));
}
