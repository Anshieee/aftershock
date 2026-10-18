/**
 * Unit tests: the guided-demo fixture must satisfy DATA_CONTRACTS §1–§6
 * (identifiers, enums, provenance coverage, real-vs-synthetic marking).
 * No database, no credentials.
 */

import { describe, expect, it } from 'vitest';
import {
  CITATION_ROLES,
  EDGE_TYPES,
  FIXTURE_IDS,
  NOTICE_TYPES,
  NODE_LABELS,
  PROVENANCE_KINDS,
  PROTECTED_FOREIGN_GRAPHS,
  REAL_RECORD,
  RESOLUTION_STATES,
} from '../../contract.mjs';
import { defaultFixture, buildSeedPlan } from '../../seed.mjs';

const fixture = defaultFixture();

/** @param {string} id */
function node(id) {
  const n = fixture.nodes.find((n) => n.id === id);
  if (!n) throw new Error(`fixture node missing: ${id}`);
  return n;
}

/** @param {string} id */
function edge(id) {
  const e = fixture.edges.find((e) => e.id === id);
  if (!e) throw new Error(`fixture edge missing: ${id}`);
  return e;
}

/** @param {string} id */
function edgesFrom(id) {
  return fixture.edges.filter((e) => e.fromId === id);
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe('fixture ↔ DATA_CONTRACTS §6 — identity of every fixture ID', () => {
  it('carries the exact §6 identifiers in the right node collections', () => {
    expect(node(FIXTURE_IDS.document).kind).toBe('ResearchDocument');
    expect(node(FIXTURE_IDS.documentVersion).kind).toBe('DocumentVersion');
    expect(node(FIXTURE_IDS.publicationReal).kind).toBe('Publication');
    expect(node(FIXTURE_IDS.publicationRetractionRecord).kind).toBe('Publication');
    expect(node(FIXTURE_IDS.notice).kind).toBe('SourceNotice');
    expect(node(FIXTURE_IDS.claimSupporting).kind).toBe('Claim');
    expect(node(FIXTURE_IDS.claimHistorical).kind).toBe('Claim');
    expect(node(FIXTURE_IDS.conclusion).kind).toBe('Conclusion');
    expect(node(FIXTURE_IDS.citationUseSupporting).kind).toBe('CitationUse');
    expect(node(FIXTURE_IDS.citationUseHistorical).kind).toBe('CitationUse');
    expect(node(FIXTURE_IDS.referenceOccurrence).kind).toBe('ReferenceOccurrence');
    expect(node(FIXTURE_IDS.candidatePublicationA).kind).toBe('Publication');
    expect(node(FIXTURE_IDS.candidatePublicationB).kind).toBe('Publication');
    expect(node(FIXTURE_IDS.study).kind).toBe('Study');
    expect(node(FIXTURE_IDS.evidenceFamily).kind).toBe('EvidenceFamily');
    expect(node(FIXTURE_IDS.dataset).kind).toBe('Dataset');
  });

  it('pins the verified real record set (Crossref/PubMed/PMC-verified, 2026-10-18)', () => {
    const pub = node(FIXTURE_IDS.publicationReal);
    expect(pub.isSynthetic).toBe(false);
    expect(pub.doi).toBe(REAL_RECORD.publicationDoi);
    expect(pub.journal).toBe('The Lancet');
    expect(pub.year).toBe(2020);
    expect(pub.url).toBe(`https://doi.org/${REAL_RECORD.publicationDoi}`);
    expect(pub.publishedDate).toBe(REAL_RECORD.publicationPublishedDate);
    expect(pub.pmId).toBe(REAL_RECORD.publicationPmId);
    expect(pub.retracted).toBe(true);
    expect(Array.isArray(pub.authors)).toBe(true);
    // The NEJM paper is a different work — its title must never leak into this record.
    expect(pub.title).not.toContain('Cardiovascular disease');
  });

  it('pins the real retraction record and the §6 notice facts with both dates kept distinct', () => {
    const ret = node(FIXTURE_IDS.publicationRetractionRecord);
    expect(ret.isSynthetic).toBe(false);
    expect(ret.doi).toBe(REAL_RECORD.retractionRecordDoi);
    expect(ret.url).toBe(REAL_RECORD.noticeSourceUrl);
    expect(ret.pmId).toBe(REAL_RECORD.retractionPmId);
    expect(ret.volume).toBe(395);
    expect(ret.page).toBe('1820');

    const notice = node(FIXTURE_IDS.notice);
    expect(notice.noticeType).toBe('retraction');
    expect(notice.publishedDate).toBe(REAL_RECORD.noticePublishedDate);
    expect(notice.noticeAnnouncementDate).toBe(REAL_RECORD.noticePublishedDate);
    expect(notice.noticeRecordedDate).toBe(REAL_RECORD.noticeRecordedDate);
    expect(notice.noticeRecordedDate).not.toBe(notice.noticeAnnouncementDate);
    expect(notice.sourceUrl).toBe(REAL_RECORD.noticeSourceUrl);
    expect(notice.pmcMirrorUrl).toBe(REAL_RECORD.noticePmcMirrorUrl);
    expect(notice.verified).toBe(true);
    expect(notice.detectedAt).toMatch(ISO_RE);
    expect(notice.lastVerifiedAt).toMatch(ISO_RE);
    // The announcement-vs-recorded date distinction must stay machine-readable, not merged.
    expect(fixture.dateDistinctions.length).toBeGreaterThan(0);
    expect(fixture.dateDistinctions[0].id).toBe('retraction-announcement-vs-record-date');
    // Related notices (Expression of Concern) are declared but never seeded as nodes/edges.
    expect(fixture.nodes.find((n) => n.doi === '10.1016/S0140-6736(20)31290-3')).toBeUndefined();
  });

  it('wires claim-A (supporting) and claim-B (historical) onto the demo manuscript version', () => {
    const version = node(FIXTURE_IDS.documentVersion);
    expect(version.documentId).toBe(FIXTURE_IDS.document);
    expect(version.label).toBe('Draft A');

    for (const claimId of [FIXTURE_IDS.claimSupporting, FIXTURE_IDS.claimHistorical]) {
      expect(node(claimId).documentVersionId).toBe(FIXTURE_IDS.documentVersion);
    }
  });

  it('classifies the citation uses and ties claim roles to the contract edge types', () => {
    const cuA = node(FIXTURE_IDS.citationUseSupporting);
    expect(cuA.role).toBe('supporting');
    expect(cuA.publicationId).toBe(FIXTURE_IDS.publicationReal);

    const cuB = node(FIXTURE_IDS.citationUseHistorical);
    expect(cuB.role).toBe('historical');
    expect(cuB.publicationId).toBe(FIXTURE_IDS.publicationReal);

    const supports = edge('edge-cuA-supports-claimA');
    expect(supports.type).toBe('CITATION_USE_SUPPORTS_CLAIM');
    expect(supports.toId).toBe(FIXTURE_IDS.claimSupporting);

    const mentions = edge('edge-cuB-mentions-claimB');
    expect(mentions.type).toBe('MENTIONS_HISTORICALLY');
    expect(mentions.toId).toBe(FIXTURE_IDS.claimHistorical);

    const depends = edge('edge-conclusionC-depends-claimA');
    expect(depends.type).toBe('CONCLUSION_DEPENDS_ON_CLAIM');
    expect(depends.fromId).toBe(FIXTURE_IDS.conclusion);
    expect(depends.toId).toBe(FIXTURE_IDS.claimSupporting);
    expect(depends.scope).toBe('full');
  });

  it('keeps ref-lee-2020 unresolved with only POSSIBLE_MATCH candidates (no confirmed match)', () => {
    const ref = node(FIXTURE_IDS.referenceOccurrence);
    expect(ref.resolutionState).toBe('unresolved');
    expect(ref.candidatePublicationIds).toEqual([
      FIXTURE_IDS.candidatePublicationA,
      FIXTURE_IDS.candidatePublicationB,
    ]);

    const matchEdges = edgesFrom(FIXTURE_IDS.referenceOccurrence);
    expect(matchEdges.length).toBe(2);
    for (const e of matchEdges) {
      expect(e.type).toBe('POSSIBLE_MATCH');
      expect(e.provenanceKind).toBe('unresolved');
    }
    // No confirmed edge may exist in the fixture at all.
    expect(fixture.edges.filter((e) => e.type === 'OCCURRENCE_MATCHES_PUBLICATION')).toHaveLength(0);

    for (const candId of [FIXTURE_IDS.candidatePublicationA, FIXTURE_IDS.candidatePublicationB]) {
      expect(node(candId).isSynthetic).toBe(true);
    }
  });

  it('includes the optional evidence family, disconnected from real publications', () => {
    const familyIds = new Set([FIXTURE_IDS.study, FIXTURE_IDS.evidenceFamily, FIXTURE_IDS.dataset]);
    const realIds = new Set([FIXTURE_IDS.publicationReal, FIXTURE_IDS.publicationRetractionRecord, FIXTURE_IDS.notice]);
    const familyEdges = fixture.edges.filter((e) => familyIds.has(e.fromId) || familyIds.has(e.toId));
    expect(familyEdges.map((e) => e.type).sort()).toEqual(['REVIEW_SYNTHESIZES_STUDY', 'STUDY_USES_DATASET']);
    for (const e of familyEdges) {
      expect(e.provenanceKind).toBe('human_confirmed');
      expect(e.reviewState).toBe('unreviewed');
    }
    // The fictional evidence family may never share an edge with a real record
    // (no conflation of synthetic demo content with real publications).
    for (const e of fixture.edges) {
      const mixes = (familyIds.has(e.fromId) && realIds.has(e.toId)) || (realIds.has(e.fromId) && familyIds.has(e.toId));
      expect(mixes).toBe(false);
    }
  });
});

describe('fixture ↔ contract enums and provenance coverage', () => {
  it('only uses contract node kinds (§1)', () => {
    for (const n of fixture.nodes) expect(NODE_LABELS).toContain(n.kind);
  });

  it('only uses contract edge types (§2)', () => {
    for (const e of fixture.edges) expect(EDGE_TYPES).toContain(e.type);
  });

  it('every node carries id/base contract fields + isSynthetic distinguishability', () => {
    for (const n of fixture.nodes) {
      expect(typeof n.id).toBe('string');
      expect(n.createdAt).toMatch(ISO_RE);
      expect(n.updatedAt).toMatch(ISO_RE);
      expect(PROVENANCE_KINDS).toContain(n.provenanceKind);
      expect(n.analysisVersion).toBe(FIXTURE_IDS.seedVersion);
      expect(typeof n.isSynthetic).toBe('boolean');
      if (n.isSynthetic) {
        expect(n.syntheticLabel).toBe('FICTIONAL / GUIDED DEMO');
      }
    }
  });

  it('every edge carries the full provenance bundle (§2 material edges)', () => {
    for (const e of fixture.edges) {
      expect(typeof e.id).toBe('string');
      expect(e.createdAt).toMatch(ISO_RE);
      expect(PROVENANCE_KINDS).toContain(e.provenanceKind);
      expect(typeof e.rationale === 'string' && e.rationale.length >= 20).toBe(true);
      expect(typeof e.sourcePointer === 'string' && e.sourcePointer.length >= 10).toBe(true);
      expect(e.analysisVersion).toBe(FIXTURE_IDS.seedVersion);
      expect(typeof e.reviewState).toBe('string');
    }
  });

  it('uses only contract enum values for role/resolution/notice fields', () => {
    const cuNodes = fixture.nodes.filter((n) => n.kind === 'CitationUse');
    for (const cu of cuNodes) expect(CITATION_ROLES).toContain(cu.role);

    const refs = fixture.nodes.filter((n) => n.kind === 'ReferenceOccurrence');
    for (const r of refs) expect(RESOLUTION_STATES).toContain(r.resolutionState);

    const notices = fixture.nodes.filter((n) => n.kind === 'SourceNotice');
    for (const n of notices) expect(NOTICE_TYPES).toContain(n.noticeType);
  });

  it('synthetic text stays clearly fictional (labeled, no invented real-study specifics)', () => {
    const syntheticTextNodes = fixture.nodes.filter((n) =>
      ['Claim', 'Conclusion', 'CitationUse'].includes(n.kind),
    );
    expect(syntheticTextNodes.length).toBeGreaterThan(0);
    for (const n of syntheticTextNodes) {
      const text = String(n.text ?? n.excerpt ?? '');
      expect(text.length).toBeGreaterThan(10);
      expect(n.isSynthetic).toBe(true);
      expect(n.syntheticLabel).toBe('FICTIONAL / GUIDED DEMO');
    }
  });

  it('never references protected foreign graphs (e.g. test_hosting)', () => {
    const containsForbidden = (value) =>
      PROTECTED_FOREIGN_GRAPHS.some((bad) => JSON.stringify(value).includes(bad));
    expect(containsForbidden(fixture)).toBe(false);
  });
});

describe('buildSeedPlan validation contracts', () => {
  it('compiles the default fixture and reports consistent expectations', () => {
    const plan = buildSeedPlan(fixture);
    expect(plan.expected.nodes).toBe(fixture.nodes.length);
    expect(plan.expected.edges).toBe(fixture.edges.length);
    for (const kind of Object.keys(plan.expected.nodesByLabel)) {
      expect(NODE_LABELS).toContain(kind);
      expect(plan.expected.nodesByLabel[kind]).toBe(fixture.nodes.filter((n) => n.kind === kind).length);
    }
    for (const [t, rows] of plan.edgesByType) {
      expect(plan.expected.edgesByType[t]).toBe(rows.length);
    }
    expect(plan.metaNode.id).toBe(FIXTURE_IDS.seedMeta);
    expect(plan.metaNode.seedVersion).toBe(FIXTURE_IDS.seedVersion);
  });

  it('rejects unknown node kinds, unknown edge types, dangling endpoints, bad provenance', () => {
    const clone = () => JSON.parse(JSON.stringify(fixture));

    const badKind = clone();
    badKind.nodes[0].kind = 'NotAContractLabel';
    expect(() => buildSeedPlan(badKind)).toThrow(/unknown node kind/);

    const badEdgeType = clone();
    badEdgeType.edges[0].type = 'NOT_A_CONTRACT_RELATION';
    expect(() => buildSeedPlan(badEdgeType)).toThrow(/unknown edge type/);

    const dangling = clone();
    dangling.edges[0].toId = 'no-such-node';
    expect(() => buildSeedPlan(dangling)).toThrow(/existing fixture node ids/);

    const badProv = clone();
    badProv.edges[0].provenanceKind = 'assumed';
    expect(() => buildSeedPlan(badProv)).toThrow(/provenance kind \(§3\)/);

    const dup = clone();
    dup.nodes[1].id = dup.nodes[0].id;
    expect(() => buildSeedPlan(dup)).toThrow(/Duplicate fixture node id/);

    const syntheticUnlabeled = clone();
    /** @type {any} */
    const target = syntheticUnlabeled.nodes.find((n) => n.isSynthetic === true);
    delete target.syntheticLabel;
    expect(() => buildSeedPlan(syntheticUnlabeled)).toThrow(/syntheticLabel/);

    const confirmedPossibleMatch = clone();
    /** @type {any} */
    const pm = confirmedPossibleMatch.edges.find((e) => e.type === 'POSSIBLE_MATCH');
    pm.provenanceKind = 'source_verified';
    expect(() => buildSeedPlan(confirmedPossibleMatch)).toThrow(/POSSIBLE_MATCH\W/);

    const overlyConfident = clone();
    /** @type {any} */
    const pm2 = overlyConfident.edges.find((e) => e.type === 'POSSIBLE_MATCH');
    pm2.matchConfidence = 0.95;
    expect(() => buildSeedPlan(overlyConfident)).toThrow(/high confidence/);

    const missingProvenance = clone();
    /** @type {any} */
    const e3 = missingProvenance.edges.find((e) => e.type === 'DOCUMENT_HAS_VERSION');
    delete e3.rationale;
    expect(() => buildSeedPlan(missingProvenance)).toThrow(/missing required field/);
  });
});
