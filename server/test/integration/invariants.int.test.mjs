/**
 * Integration tests — DATA_CONTRACTS §7 invariants 1–3 against the REAL
 * FalkorDB cloud instance.
 *
 * Safety envelope (hard rules, verified by the tests themselves):
 *  - This suite may only create/seed/mutate the throwaway graph
 *   `aftershock:demo-smoke` and must delete it afterwards.
 *  - db.list() after the suite must equal db.list() before it (smoke graph
 *    removed again) — no collateral graph work.
 *  - `aftershock:demo` (and every unrelated graph, incl. `test_hosting`) is
 *    never written to by tests.
 *
 * Skips gracefully when credentials are absent; locally run with
 * `AFTERSHOCK_ENV=/path/to/main-checkout/.env npm --prefix server run test:integration`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectFromEnv, resolveCredentials } from '../../graphClient.mjs';
import { readSeedMeta, seedGraph } from '../../seed.mjs';
import {
  deferReferenceOccurrence,
  getSeedStatus,
  historicalSafetyCheck,
  impactPathFromSupportedClaims,
  unresolvedNonPropagationCheck,
  verifiedNotices,
} from '../../impact.mjs';
import { DEMO_GRAPH_NAME, FIXTURE_IDS } from '../../contract.mjs';

const SMOKE_GRAPH = 'aftershock:demo-smoke';
if (SMOKE_GRAPH === DEMO_GRAPH_NAME) {
  throw new Error('integration suite misconfiguration: smoke graph must never be the managed demo graph');
}

/** @param {Awaited<ReturnType<typeof connectFromEnv>>} s */
async function countSeedMeta(s) {
  const res = await s.roQuery('MATCH (m:SeedMeta) RETURN count(m) AS c');
  return Number(res.data?.[0]?.c ?? 0);
}

/** Credentials present? (integration tests skip without them) */
const configured = (() => {
  try {
    resolveCredentials(process.env);
    return true;
  } catch {
    return false;
  }
})();

const integration = configured ? describe : describe.skip;

let /** @type {Awaited<ReturnType<typeof connectFromEnv>> | null} */ session = null;
let /** @type {string[] | null} */ graphsBefore = null;

integration(`M2 integration invariants on ${SMOKE_GRAPH}`, () => {
  beforeAll(async () => {
    session = await connectFromEnv({
      graphName: SMOKE_GRAPH,
      clientName: 'aftershock-vitest-integration',
    });
    // The smoke graph must not pre-exist (it belongs to this suite alone): a
    // leftover from an interrupted previous run is deleted BEFORE the baseline
    // snapshot, so every assertion below starts from a clean slate and the
    // afterAll `graphsAfter ≡ graphsBefore` proof stays exact. (Healing a
    // leftover via seedGraph here used to make the first test observe
    // reseeded/noop instead of a fresh `seeded` and skewed the baseline.)
    const graphsOnConnect = await session.listGraphs();
    if (graphsOnConnect.includes(SMOKE_GRAPH)) {
      console.warn(`[m2-integration] leftover ${SMOKE_GRAPH} from an interrupted run — deleting before baseline`);
      await session.db.selectGraph(SMOKE_GRAPH).delete();
    }
    graphsBefore = (await session.listGraphs()).slice();
  });

  afterAll(async () => {
    if (!session) return;
    // Always delete the throwaway graph, then prove nothing else changed.
    try {
      const graph = session.db.selectGraph(SMOKE_GRAPH);
      await graph.delete();
    } catch {
      // deleting a missing graph is a no-op for our purposes
    }
    const graphsAfter = (await session.listGraphs()).slice();
    expect(graphsAfter).toEqual(graphsBefore);
    await session.close();
  });

  it('seeds the smoke graph end-to-end (fixture-versioned, counts exact)', async () => {
    const result = await seedGraph(session);
    expect(result.action).toBe('seeded');
    expect(result.seedVersion).toBe('seed-1');
    expect((await session.listGraphs())).toContain(SMOKE_GRAPH);
    // Exactly one metadata node — the initial seed must not leave stale meta.
    expect(await countSeedMeta(session)).toBe(1);

    const status = await getSeedStatus(session);
    expect(status.graphExists).toBe(true);
    expect(status.seeded).toBe(true);
    expect(status.upToDate).toBe(true);
    expect(status.nodeCount).toBe(status.expected.nodes);
    expect(status.edgeCount).toBe(status.expected.edges);
  });

  it('seed is idempotent: a second run is a no-op with byte-identical counts', async () => {
    const before = await getSeedStatus(session);
    const result = await seedGraph(session);
    expect(result.action).toBe('noop');
    const after = await getSeedStatus(session);
    expect(after.nodeCount).toBe(before.nodeCount);
    expect(after.edgeCount).toBe(before.edgeCount);
    expect(after.nodesByLabel).toEqual(before.nodesByLabel);
    expect(after.edgesByType).toEqual(before.edgesByType);
    expect(after.seedVersion).toBe(before.seedVersion);
    // A no-op run must not append another metadata node.
    expect(await countSeedMeta(session)).toBe(1);
  });

  it('invariant §7.1 — verified retraction → supporting citation → Claim A → Conclusion C flags review', async () => {
    const notices = await verifiedNotices(session);
    expect(notices).toHaveLength(1);
    expect(notices[0].publication.id).toBe(FIXTURE_IDS.publicationReal);
    expect(notices[0].publication.isSynthetic).toBe(false);
    expect(notices[0].notice.id).toBe(FIXTURE_IDS.notice);
    expect(notices[0].notice.noticeType).toBe('retraction');
    expect(notices[0].notice.verified).toBe(true);
    expect(notices[0].edge.provenanceKind).toBe('source_verified');

    const paths = await impactPathFromSupportedClaims(session);
    const claimARow = paths.find((r) => r.claim.id === FIXTURE_IDS.claimSupporting);
    expect(claimARow).toBeTruthy();
    expect(claimARow.publication.id).toBe(FIXTURE_IDS.publicationReal);
    expect(claimARow.notice.id).toBe(FIXTURE_IDS.notice);
    expect(claimARow.citationUse.id).toBe(FIXTURE_IDS.citationUseSupporting);
    expect(claimARow.citationUse.role).toBe('supporting');
    expect(claimARow.claim.reviewFlag.kind).toBe('direct_evidence_review');
    expect(claimARow.conclusion?.id).toBe(FIXTURE_IDS.conclusion);
    // The dependent conclusion separately carries the indirect flag.
    expect(claimARow.conclusion?.reviewFlag?.kind).toBe('indirect_evidence_review');
    expect(claimARow.dependencyEdge?.provenanceKind).toBe('human_confirmed');
    expect(claimARow.path).toEqual([
      FIXTURE_IDS.notice,
      FIXTURE_IDS.publicationReal,
      FIXTURE_IDS.citationUseSupporting,
      FIXTURE_IDS.claimSupporting,
      FIXTURE_IDS.conclusion,
    ]);
    // Claim B plays no role in the flagged support path.
    expect(paths.map((r) => r.claim.id)).not.toContain(FIXTURE_IDS.claimHistorical);
  });

  it('invariant §7.2 — historical-discussion citation of the same study does not flag Claim B', async () => {
    const check = await historicalSafetyCheck(session);
    expect(check.historicalUses.map((u) => u.citationUseId)).toContain(FIXTURE_IDS.citationUseHistorical);
    expect(check.historicalClaimIds).toContain(FIXTURE_IDS.claimHistorical);
    expect(check.flaggedClaimIds).toContain(FIXTURE_IDS.claimSupporting);
    expect(check.leakedClaimIds).toEqual([]);
    expect(check.safe).toBe(true);
    // role edges never contradict role classification (role=historical never SUPPORTS)
    expect(check.consistencyChecks.historicalRoleWithoutSupportEdge).toBe(true);
  });

  it('invariant §7.3 — ref-lee-2020 keeps POSSIBLE_MATCH only, non-propagating; Skip keeps it non-resolved', async () => {
    const before = await unresolvedNonPropagationCheck(session);
    expect(before.occurrence.resolutionState).toBe('unresolved');
    expect(before.occurrence.rawText).toBe('Lee et al., 2020');
    expect(before.candidates.map((c) => c.publicationId).sort()).toEqual([
      FIXTURE_IDS.candidatePublicationA,
      FIXTURE_IDS.candidatePublicationB,
    ]);
    for (const candidate of before.candidates) {
      expect(candidate.provenanceKind).toBe('unresolved');
    }
    expect(before.counts.confirmedMatchCount).toBe(0);
    expect(before.counts.propagationPathCount).toBe(0);
    expect(before.counts.candidateDerivativePathCount).toBe(0);
    expect(before.safe).toBe(true);

    // Human Skip → deferred (still non-resolved per contract §4), still non-propagating.
    const skip = await deferReferenceOccurrence(session, FIXTURE_IDS.referenceOccurrence, {
      reason: 'Vitest: simulated reviewer skip',
    });
    expect(skip.deferred).toBe(true);
    expect(skip.resolutionState).toBe('deferred');

    const after = await unresolvedNonPropagationCheck(session);
    expect(after.occurrence.resolutionState).toBe('deferred');
    expect(after.counts.confirmedMatchCount).toBe(0);
    expect(after.counts.propagationPathCount).toBe(0);
    expect(after.counts.candidateDerivativePathCount).toBe(0);
    expect(after.safe).toBe(true);
  });

  it('drift heals: deleting an edge triggers reseeding while foreign nodes survive', async () => {
    // Foreign, non-seeded node must survive the scoped wipe.
    await session.writeQuery(
      'CREATE (f) SET f.id = $id, f.seeded = $unseeded, f.note = $note',
      { id: 'foreign-manual-node', unseeded: false, note: 'tenant probe (not part of the fixture)' },
    );

    const changed = await getSeedStatus(session);
    expect(changed.upToDate).toBe(true); // seedVersion still matches, counts still match
    // Force drift: drop one seeded edge.
    await session.writeQuery('MATCH ()-[r:MENTIONS_HISTORICALLY]->() DELETE r');
    const drifted = await getSeedStatus(session);
    expect(drifted.edgeCount).toBe(drifted.expected.edges - 1);
    expect(drifted.upToDate).toBe(false);

    const reseeded = await seedGraph(session);
    expect(reseeded.action === 'reseeded').toBe(true);

    const healed = await getSeedStatus(session);
    expect(healed.upToDate).toBe(true);
    expect(healed.nodeCount).toBe(healed.expected.nodes);
    expect(healed.edgeCount).toBe(healed.expected.edges);

    // The drift-reseed must NOT duplicate the metadata node (review fix: it
    // previously grew 1→2 per reseed, leaving readSeedMeta ambiguous).
    expect(await countSeedMeta(session)).toBe(1);
    // Two successive meta reads return identical data — deterministic state.
    const metaReadA = await readSeedMeta(session);
    const metaReadB = await readSeedMeta(session);
    expect(metaReadB).toEqual(metaReadA);
    expect(metaReadA.seedVersion).toBe('seed-1');

    const keptForeign = await session.roQuery(
      'MATCH (n) WHERE n.id = $id RETURN count(n) AS c',
      { id: 'foreign-manual-node' },
    );
    expect(Number(keptForeign.data?.[0]?.c ?? 0)).toBe(1);

    // Scoped wipe also declared state back to the fixture (skip was reset).
    const propagation = await unresolvedNonPropagationCheck(session);
    expect(propagation.occurrence.resolutionState).toBe('unresolved');
    expect(propagation.safe).toBe(true);
  });
});
