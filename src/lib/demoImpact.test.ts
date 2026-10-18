import { describe, expect, it } from 'vitest';
import { parseGraphOverview } from './api';
import { deriveDemoImpact } from './demoImpact';
import { buildDemoOverviewRecord } from '../test/graphFixtures';

/** Parsed-form overview of the seeded demo graph (as the UI consumes it). */
function seededOverview() {
  return parseGraphOverview(buildDemoOverviewRecord());
}

describe('deriveDemoImpact — real §7 invariants from graph data', () => {
  it('counts exactly what the server returned (never appends its own numbers)', () => {
    const impact = deriveDemoImpact(seededOverview());
    expect(impact.nodeCount).toBe(17); // 16 fixture records + seed meta marker
    expect(impact.edgeCount).toBe(14);
    expect(impact.seedVersion).toBe('seed-1');
  });

  it('finds the one verified retraction notice with distinct timestamps', () => {
    const impact = deriveDemoImpact(seededOverview());
    expect(impact.verifiedNotices).toHaveLength(1);
    const notice = impact.verifiedNotices[0];
    expect(notice).toBeDefined();
    expect(notice?.noticeId).toBe('notice-mehra-retraction-2020-06-04');
    expect(notice?.noticeType).toBe('retraction');
    expect(notice?.verified).toBe(true);
    expect(notice?.publishedDate).toBe('2020-06-04');
    // Announcement vs record dates stay distinct — contract §6, never merged.
    expect(notice?.noticeAnnouncementDate).toBe('2020-06-04');
    expect(notice?.noticeRecordedDate).toBe('2020-06-05');
    expect(notice?.publicationId).toBe('pub-mehra-2020');
  });

  it('flags Claim A as a DIRECT review via the supporting citation chain (invariant 1)', () => {
    const impact = deriveDemoImpact(seededOverview());
    const claimA = impact.affected.find((item) => item.id === 'claim-A');
    expect(claimA).toBeDefined();
    expect(claimA?.reviewKind).toBe('direct_evidence_review');
    expect(claimA?.viaPublicationId).toBe('pub-mehra-2020');
    expect(claimA?.viaCitationUseId).toBe('cu-A-supporting');
    expect(claimA?.text).toContain('registry analysis');
  });

  it('flags dependent Conclusion C as INDIRECT via Claim A (invariant 1)', () => {
    const impact = deriveDemoImpact(seededOverview());
    const conclusion = impact.affected.find((item) => item.id === 'conclusion-C');
    expect(conclusion).toBeDefined();
    expect(conclusion?.kind).toBe('conclusion');
    expect(conclusion?.reviewKind).toBe('indirect_evidence_review');
    expect(conclusion?.viaClaimId).toBe('claim-A');
  });

  it('does NOT flag the historical Claim B — citing the retraction as history is safe (invariant 2)', () => {
    const impact = deriveDemoImpact(seededOverview());
    expect(impact.affected.map((item) => item.id)).not.toContain('claim-B');
    const historical = impact.historical.find((item) => item.id === 'claim-B');
    expect(historical).toBeDefined();
    expect(historical?.viaPublicationId).toBe('pub-mehra-2020');
    expect(historical?.viaCitationUseId).toBe('cu-B-historical');
  });

  it('keeps the Lee et al. reference unresolved with POSSIBLE_MATCH candidates only (invariant 3)', () => {
    const impact = deriveDemoImpact(seededOverview());
    expect(impact.unresolved).toHaveLength(1);
    const unresolved = impact.unresolved[0];
    expect(unresolved?.id).toBe('ref-lee-2020');
    expect(unresolved?.resolutionState).toBe('unresolved');
    expect(unresolved?.candidateIds).toEqual([
      'pub-lee-2020-candidate-a',
      'pub-lee-2020-candidate-b',
    ]);
    expect(unresolved?.onlyPossibleMatches).toBe(true);
    // And no member of the flagged set came from the unresolved reference.
    expect(impact.affected.map((item) => item.viaPublicationId)).not.toContain(
      'pub-lee-2020-candidate-a',
    );
  });

  it('attributes synthetic vs real records explicitly', () => {
    const impact = deriveDemoImpact(seededOverview());
    // 13 synthetic (doc, version, ref, 2 claims, conclusion, 2 citation uses,
    // 2 candidates, study, family, dataset), 3 real (2 publications + notice).
    expect(impact.syntheticEntityCount).toBe(13);
    expect(impact.realEntityCount).toBe(3);
  });

  it('flags nothing when the notice is not verified — no shortcut to drama', () => {
    const overview = seededOverview();
    // Notice exists but verified=false: support chains must not flag.
    const notice = overview.nodes.find(
      (node) => node.id === 'notice-mehra-retraction-2020-06-04',
    );
    expect(notice).toBeDefined();
    notice!.properties = { ...notice!.properties, verified: false };
    const impact = deriveDemoImpact(overview);
    expect(impact.affected).toHaveLength(0);
    expect(impact.verifiedNotices).toHaveLength(0);
    // Historical mention also stays out: the notice is not verified, so
    // there is nothing to "safely mention" from verified-notice data.
    expect(impact.historical).toHaveLength(0);
  });

  it('shows nothing affected when the graph is silent (empty payload, no invented numbers)', () => {
    const impact = deriveDemoImpact({ nodes: [], edges: [] });
    expect(impact.nodeCount).toBe(0);
    expect(impact.edgeCount).toBe(0);
    expect(impact.affected).toHaveLength(0);
    expect(impact.verifiedNotices).toHaveLength(0);
    expect(impact.historical).toHaveLength(0);
    expect(impact.unresolved).toHaveLength(0);
  });

  it('never treats POSSIBLE_MATCH candidates as confirmed publications for impact (invariant 3)', () => {
    const impact = deriveDemoImpact(seededOverview());
    const affectedPublications = impact.affected.map((item) => item.viaPublicationId);
    expect(affectedPublications).toEqual(['pub-mehra-2020', 'pub-mehra-2020']);
    expect(affectedPublications).not.toContain('pub-lee-2020-candidate-b');
  });
});
