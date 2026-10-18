import { describe, expect, it } from 'vitest';
import { parseGraphOverview, type GraphEdge, type GraphNode, type GraphOverview } from './api';
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

describe('deriveDemoImpact — dedupe by node id (results list keys on id)', () => {
  /**
   * Minimal in-memory graph payload in the parsed overview shape (exactly
   * what the UI consumes from parseGraphOverview), mirroring the flat
   * wire-record style of the §6 fixture. Smallest chains that exercise the
   * multi-edge dedupe paths — no fixture constants, only returned records.
   */
  const record = (id: string, kind: string, properties: Record<string, unknown> = {}): GraphNode => ({
    id,
    kind,
    properties,
  });
  const link = (type: string, fromId: string, toId: string): GraphEdge => ({ type, fromId, toId });

  /** Verified notice → publication + two flagged claims (each via its own supporting citation use). */
  function twoFlaggedClaimsGraph(): GraphOverview {
    return {
      seedVersion: 'seed-dedup',
      nodes: [
        record('pub-x', 'Publication'),
        record('notice-x', 'SourceNotice', { verified: true, noticeType: 'retraction' }),
        record('claim-1', 'Claim', { text: 'First flagged claim.' }),
        record('claim-2', 'Claim', { text: 'Second flagged claim.' }),
        record('cu-1', 'CitationUse', { role: 'supporting' }),
        record('cu-2', 'CitationUse', { role: 'supporting' }),
        record('conclusion-D', 'Conclusion', { text: 'Depends on both flagged claims.' }),
        record('conclusion-E', 'Conclusion', { text: 'Depends on one flagged claim (duplicated edge).' }),
      ],
      edges: [
        link('PUBLICATION_HAS_NOTICE', 'pub-x', 'notice-x'),
        link('CITATION_USE_REFERENCES_PUBLICATION', 'cu-1', 'pub-x'),
        link('CITATION_USE_REFERENCES_PUBLICATION', 'cu-2', 'pub-x'),
        link('CITATION_USE_SUPPORTS_CLAIM', 'cu-1', 'claim-1'),
        link('CITATION_USE_SUPPORTS_CLAIM', 'cu-2', 'claim-2'),
        // Pre-review defect: a conclusion with TWO flagged-claim dependencies
        // used to appear twice (duplicate React keys in the results list).
        link('CONCLUSION_DEPENDS_ON_CLAIM', 'conclusion-D', 'claim-1'),
        link('CONCLUSION_DEPENDS_ON_CLAIM', 'conclusion-D', 'claim-2'),
        // And a conclusion with two dependency edges onto the SAME claim.
        link('CONCLUSION_DEPENDS_ON_CLAIM', 'conclusion-E', 'claim-1'),
        link('CONCLUSION_DEPENDS_ON_CLAIM', 'conclusion-E', 'claim-1'),
      ],
    };
  }

  it('a conclusion depending on two flagged claims surfaces exactly once', () => {
    const impact = deriveDemoImpact(twoFlaggedClaimsGraph());
    const ids = impact.affected.map((item) => item.id);
    expect(ids).toEqual(['claim-1', 'claim-2', 'conclusion-D', 'conclusion-E']);
    // No duplicate React keys in the results list (dedupe by node id).
    expect(new Set(ids).size).toBe(ids.length);
    const conclusionD = impact.affected.find((item) => item.id === 'conclusion-D');
    expect(conclusionD).toBeDefined();
    expect(conclusionD?.kind).toBe('conclusion');
    expect(conclusionD?.reviewKind).toBe('indirect_evidence_review');
    // First occurrence wins: the first flagged claim in edge order.
    expect(conclusionD?.viaClaimId).toBe('claim-1');
    expect(conclusionD?.viaPublicationId).toBe('pub-x');
    expect(conclusionD?.text).toBe('Depends on both flagged claims.');
  });

  it('duplicate dependency edges onto the same flagged claim still surface the conclusion once', () => {
    const impact = deriveDemoImpact(twoFlaggedClaimsGraph());
    const entriesE = impact.affected.filter((item) => item.id === 'conclusion-E');
    expect(entriesE).toHaveLength(1);
    expect(entriesE[0]?.viaClaimId).toBe('claim-1');
  });

  it('a claim historically mentioned via two citation uses surfaces once in the historical list', () => {
    const impact = deriveDemoImpact({
      seedVersion: 'seed-dedup',
      nodes: [
        record('pub-x', 'Publication'),
        record('notice-x', 'SourceNotice', { verified: true, noticeType: 'retraction' }),
        record('claim-H', 'Claim', { text: 'Historical discussion claim.' }),
        record('cu-h1', 'CitationUse', { role: 'historical' }),
        record('cu-h2', 'CitationUse', { role: 'historical' }),
      ],
      edges: [
        link('PUBLICATION_HAS_NOTICE', 'pub-x', 'notice-x'),
        link('CITATION_USE_REFERENCES_PUBLICATION', 'cu-h1', 'pub-x'),
        link('CITATION_USE_REFERENCES_PUBLICATION', 'cu-h2', 'pub-x'),
        link('MENTIONS_HISTORICALLY', 'cu-h1', 'claim-H'),
        link('MENTIONS_HISTORICALLY', 'cu-h2', 'claim-H'),
      ],
    });
    const ids = impact.historical.map((item) => item.id);
    expect(ids).toEqual(['claim-H']);
    expect(new Set(ids).size).toBe(ids.length);
    const historical = impact.historical[0];
    expect(historical?.viaCitationUseId).toBe('cu-h1'); // first occurrence, deterministic order
    expect(historical?.viaPublicationId).toBe('pub-x');
    // And the claim is still not flagged — dedupe must not contaminate the set.
    expect(impact.affected).toHaveLength(0);
  });

  it('a claim supported by two citation uses of the same publication still surfaces once', () => {
    const impact = deriveDemoImpact({
      seedVersion: 'seed-dedup',
      nodes: [
        record('pub-x', 'Publication'),
        record('notice-x', 'SourceNotice', { verified: true, noticeType: 'retraction' }),
        record('claim-A', 'Claim', { text: 'Directly flagged once.' }),
        record('cu-1', 'CitationUse', { role: 'supporting' }),
        record('cu-2', 'CitationUse', { role: 'supporting' }),
      ],
      edges: [
        link('PUBLICATION_HAS_NOTICE', 'pub-x', 'notice-x'),
        link('CITATION_USE_REFERENCES_PUBLICATION', 'cu-1', 'pub-x'),
        link('CITATION_USE_REFERENCES_PUBLICATION', 'cu-2', 'pub-x'),
        link('CITATION_USE_SUPPORTS_CLAIM', 'cu-1', 'claim-A'),
        link('CITATION_USE_SUPPORTS_CLAIM', 'cu-2', 'claim-A'),
      ],
    });
    const ids = impact.affected.map((item) => item.id);
    expect(ids).toEqual(['claim-A']); // affectedClaimIds guard, unchanged behavior
    expect(new Set(ids).size).toBe(ids.length);
  });
});
