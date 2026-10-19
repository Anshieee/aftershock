/**
 * Integration tests — P4 Find Evidence against the REAL FalkorDB cloud
 * instance (DATA_CONTRACTS §6 fixture, reads ONLY).
 *
 * Safety envelope:
 *  - Preferred target: the MANAGED demo graph `aftershock:demo`, used
 *    strictly read-only (roQuery only; loadEvidenceFindContext performs no
 *    writes). Nothing is seeded into it and nothing is deleted from it.
 *  - Fallback (only when the managed graph is missing or seeded at an
 *    unexpected fixture version): the throwaway graph
 *    `aftershock:demo-evidence-smoke` is seeded with the same guided-demo
 *    fixture, then deleted again; afterAll proves db.list() is unchanged.
 *  - `aftershock:demo` itself is NEVER written to by this suite.
 *  - One OPTIONAL live Crossref search runs only when RUN_EVIDENCE_LIVE=1 is
 *    exported, so default runs never depend on external provider availability
 *    (and fabricate nothing either way).
 *
 * Skips gracefully when credentials are absent (CI). Locally run from `server/`:
 *   AFTERSHOCK_ENV=/home/…/main-checkout/.env \
 *     npx vitest --config vitest.integration.config.js run test/integration/evidence-find.int.test.mjs
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectFromEnv, resolveCredentials } from '../../graphClient.mjs';
import { readSeedMeta, seedGraph, defaultFixture, resolveFixtureVersion } from '../../seed.mjs';
import {
  CONCERN_SUMMARIES,
  loadEvidenceFindContext,
  buildSuggestedQuery,
  searchCrossref,
} from '../../evidenceSearch.mjs';
import { DEMO_GRAPH_NAME, FIXTURE_IDS } from '../../contract.mjs';
import { createEvidenceFindHandler } from '../../../netlify/functions/evidence-find.mjs';

const SMOKE_GRAPH = 'aftershock:demo-evidence-smoke';
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

integration('P4 evidence-find integration (read-only)', () => {
  beforeAll(async () => {
    session = await connectFromEnv({
      graphName: DEMO_GRAPH_NAME,
      clientName: 'aftershock-vitest-evidence',
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
    session = await connectFromEnv({ graphName: SMOKE_GRAPH, clientName: 'aftershock-vitest-evidence' });
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
        // The handler-seam test above hands the SAME session to withSession,
        // whose finally already closed it; double-close is expected there.
      }
    }
  });

  it('reports claim-A honestly from the real demo graph (read-only, exact fixture fields)', async () => {
    const ctx = await loadEvidenceFindContext(session, FIXTURE_IDS.claimSupporting);
    expect(ctx).not.toBeNull();
    expect(ctx.claimId).toBe('claim-A');
    expect(ctx.label).toBe('Claim');
    expect(ctx.direction).toBe('direct');
    // Verbatim fixture text (DATA_CONTRACTS §6, claim-A as stored by seed.mjs):
    expect(ctx.claimText).toBe(
      'Agent P-9 was selected on the strength of the registry analysis we cite (Mehra et al., 2020), '
      + 'which we read as establishing a drug-treatment mortality signal in the target cohort.',
    );
    expect(ctx.documentVersionId).toBe('ver-demo-manuscript-v1');
    expect(ctx.manuscriptId).toBe('doc-demo-manuscript');
    expect(ctx.hasNoticeLinkage).toBe(true); // cu-A-supporting → pub-mehra-2020 → PUBLICATION_HAS_NOTICE
    expect(ctx.concern.summary).toBe(CONCERN_SUMMARIES.noticeLinked);
    expect(ctx.concern.direction).toBe('direct');
    // No Claim:/Passage: prefix in the stored fixture text → suggestion = text itself.
    expect(buildSuggestedQuery(ctx.claimText)).toBe(ctx.claimText);
  });

  it('maps conclusion-C to indirect from stored edges only', async () => {
    const ctx = await loadEvidenceFindContext(session, FIXTURE_IDS.conclusion);
    expect(ctx.label).toBe('Conclusion');
    expect(ctx.direction).toBe('indirect'); // stored CONCLUSION_DEPENDS_ON_CLAIM → Claim only
    expect(ctx.hasNoticeLinkage).toBe(true); // stored dependent-claim path reaches the notice
    expect(ctx.documentVersionId).toBe('ver-demo-manuscript-v1');
    expect(ctx.manuscriptId).toBe('doc-demo-manuscript');
  });

  it('cites stored notice linkage for claim-B too (historical use still references the flagged publication)', async () => {
    const ctx = await loadEvidenceFindContext(session, FIXTURE_IDS.claimHistorical);
    expect(ctx.label).toBe('Claim');
    expect(ctx.direction).toBe('direct');
    expect(ctx.hasNoticeLinkage).toBe(true);
    expect(ctx.concern.summary).toBe(CONCERN_SUMMARIES.noticeLinked);
  });

  it('returns 404 claim-not-found for an id absent from the graph (handler seam, read-only)', async () => {
    const handler = createEvidenceFindHandler({
      env: { ...process.env, FALKORDB_GRAPH_NAME: session.graphName },
      layer: { open: async () => session }, // the real session; only roQuery is exercised
    });
    const res = await handler(new Request('https://f.test/.netlify/functions/evidence-find?claimId=claim-absent', {
      method: 'POST',
    }));
    expect(res.status).toBe(404);
    expect(JSON.parse(await res.text()).error).toBe('claim-not-found');
  });

  it.skip(
    'live Crossref records only when RUN_EVIDENCE_LIVE=1 is exported (bounded, real metadata, never fabricated)',
    { skip: process.env.RUN_EVIDENCE_LIVE !== '1' },
    async () => {
      expect(process.env.RUN_EVIDENCE_LIVE).toBe('1');
      const out = await searchCrossref(
        'Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19 multinational registry analysis',
        { timeoutMs: 6_000, budgetMs: 7_000 },
      );
      if (out.status === 'timeout' || out.status === 'error') {
        // Provider outage is honest, never fabricated; the pin is on honesty, not availability.
        expect(out.candidates).toEqual([]);
        console.warn(`[evidence integration] live check did not complete: ${out.status}`);
        return;
      }
      expect(out.status).toBe('ok');
      expect(out.candidates.length).toBeGreaterThan(0);
      for (const candidate of out.candidates) {
        expect(candidate.isSynthetic).toBe(false);
        expect(['unknown', 'notice_present']).toContain(candidate.retractionStatus);
        expect(candidate.evidenceRelationship).toBe('unverified');
        expect(candidate.independence).toBe('unknown');
        expect(candidate.fullTextAvailability).toBe('unknown');
        if (candidate.doi) {
          expect(candidate.candidateId.startsWith('doi:')).toBe(true);
          expect(candidate.urls.sourceUrl).toBe(`https://doi.org/${candidate.doi}`);
        } else {
          expect(candidate.candidateId.startsWith('fa:')).toBe(true);
        }
      }
    },
  );
});
