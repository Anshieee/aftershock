/**
 * Unit tests: M6 export data assembly + export handlers.
 *
 * Test seam (per server/demoApi.mjs): handlers are built with
 * `create*Handler(deps)` accepting an injectable fake `layer` plus scripted
 * ops. Ops accept an injected `GraphSession`. No real database, no
 * credentials, no ESM stubbing.
 *
 * Run: `npx vitest --config server/vitest.unit.config.js run` from the repo root.
 */

import { describe, expect, it } from 'vitest';
import {
  assertParameterized,
  ConnectionError,
  GraphQueryError,
} from '../../graphClient.mjs';
import {
  createExportReportHandler,
  buildReportPdfPlan,
} from '../../../netlify/functions/export-report.mjs';
import {
  createExportRevisionPackHandler,
  buildRevisionPackDocxPlan,
} from '../../../netlify/functions/export-revision-pack.mjs';
import {
  createExportAnnotatedManuscriptHandler,
} from '../../../netlify/functions/export-annotated-manuscript.mjs';
import {
  assembleExportReport,
  assembleRevisionPack,
  assembleAnnotatedManuscript,
  validateExportCaseId,
  ExportValidationError,
  ExportNotFoundError,
  SYNTHETIC_LABEL,
  EXPORT_ANALYSIS_VERSION,
  REVISION_PACK_LABELS,
  exportStatusDisplay,
  acceptanceStatusDisplay,
} from '../../reportExport.mjs';

const GRAPH_NAME = 'test-graph';
const CASE_ID = 'claim-A';
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/* ------------------------------------------------------------------ *
 * Test doubles: a stateful fake session mirroring the demo fixture.
 * ------------------------------------------------------------------ */

/**
 * Builds a fake GraphSession that returns scripted graph data mirroring the
 * guided-demo fixture (claim-A directly supported by Mehra retraction,
 * claim-B historical mention, conclusion-C depends on claim-A,
 * ref-lee-2020 unresolved). Records every read for assertion.
 * @param {{fail?: boolean, caseNode?: Record<string, unknown>}} [options]
 */
function buildFakeSession({ fail = false, caseNode } = {}) {
  const reads = [];
  const graphNodes = [
    { id: 'doc-demo-manuscript', kind: 'ResearchDocument', title: 'Guided Demo Manuscript (FICTIONAL / GUIDED DEMO)', isSynthetic: true, seeded: true, primaryLabel: 'ResearchDocument' },
    { id: 'pub-mehra-2020', kind: 'Publication', title: 'Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis', doi: '10.1016/S0140-6736(20)31180-6', isSynthetic: false, seeded: true, primaryLabel: 'Publication' },
    { id: 'pub-mehra-retraction-2020', kind: 'Publication', title: 'Retraction—Hydroxychloroquine or chloroquine...', doi: '10.1016/S0140-6736(20)31324-6', isSynthetic: false, seeded: true, primaryLabel: 'Publication' },
    { id: 'notice-mehra-retraction-2020-06-04', kind: 'SourceNotice', noticeType: 'retraction', verified: true, publishedDate: '2020-06-04', sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31324-6', seeded: true, primaryLabel: 'SourceNotice' },
    { id: 'claim-A', kind: 'Claim', text: 'Passage A supporting Mehra findings (FICTIONAL)', location: 'p.12', seeded: true, primaryLabel: 'Claim' },
    { id: 'claim-B', kind: 'Claim', text: 'Passage B historical mention of Mehra retraction (FICTIONAL)', location: 'p.18', seeded: true, primaryLabel: 'Claim' },
    { id: 'conclusion-C', kind: 'Conclusion', text: 'Conclusion C depends on Claim A (FICTIONAL)', location: 'p.24', seeded: true, primaryLabel: 'Conclusion' },
    { id: 'cu-A-supporting', kind: 'CitationUse', role: 'supporting', excerpt: 'supports Mehra', seeded: true, primaryLabel: 'CitationUse' },
    { id: 'cu-B-historical', kind: 'CitationUse', role: 'historical', excerpt: 'mentions Mehra', seeded: true, primaryLabel: 'CitationUse' },
    { id: 'ref-lee-2020', kind: 'ReferenceOccurrence', rawText: 'Lee et al., 2020', resolutionState: 'unresolved', candidatePublicationIds: ['pub-lee-2020-candidate-a', 'pub-lee-2020-candidate-b'], seeded: true, primaryLabel: 'ReferenceOccurrence' },
    { id: 'meta-seed-version', kind: 'SeedMeta', seedVersion: 'seed-1', seeded: true, primaryLabel: 'SeedMeta' },
  ];
  const graphEdges = [
    { type: 'PUBLICATION_HAS_NOTICE', fromId: 'pub-mehra-2020', toId: 'notice-mehra-retraction-2020-06-04', props: { provenanceKind: 'source_verified', seeded: true } },
    { type: 'CITATION_USE_REFERENCES_PUBLICATION', fromId: 'cu-A-supporting', toId: 'pub-mehra-2020', props: { provenanceKind: 'observed', seeded: true } },
    { type: 'CITATION_USE_SUPPORTS_CLAIM', fromId: 'cu-A-supporting', toId: 'claim-A', props: { provenanceKind: 'observed', seeded: true } },
    { type: 'CITATION_USE_REFERENCES_PUBLICATION', fromId: 'cu-B-historical', toId: 'pub-mehra-2020', props: { provenanceKind: 'observed', seeded: true } },
    { type: 'MENTIONS_HISTORICALLY', fromId: 'cu-B-historical', toId: 'claim-B', props: { provenanceKind: 'observed', seeded: true } },
    { type: 'CONCLUSION_DEPENDS_ON_CLAIM', fromId: 'conclusion-C', toId: 'claim-A', props: { provenanceKind: 'observed', scoped: 'direct', seeded: true } },
    { type: 'POSSIBLE_MATCH', fromId: 'ref-lee-2020', toId: 'pub-lee-2020-candidate-a', props: { provenanceKind: 'unresolved', seeded: true } },
    { type: 'POSSIBLE_MATCH', fromId: 'ref-lee-2020', toId: 'pub-lee-2020-candidate-b', props: { provenanceKind: 'unresolved', seeded: true } },
  ];

  const decisions = [];
  const proposals = [];

  // Case node state. Explicit `caseNode: null` means "no such node".
  // Omitting caseNode (or passing undefined) defaults to claim-A.
  let state;
  if (caseNode === null) {
    state = null;
  } else if (caseNode) {
    state = {
      id: caseNode.id,
      text: caseNode.text,
      kind: caseNode.kind ?? 'Claim',
      reviewState: caseNode.reviewState ?? 'awaiting_review',
      reviewFlags: caseNode.reviewFlags ?? [],
    };
  } else {
    state = {
      id: CASE_ID,
      text: 'Passage A supporting Mehra findings (FICTIONAL)',
      kind: 'Claim',
      reviewState: 'awaiting_review',
      reviewFlags: [],
    };
  }

  const session = {
    graphName: GRAPH_NAME,
    async roQuery(cypher, params) {
      reads.push({ cypher, params });
      if (fail) throw new ConnectionError('graph is down');

      // SeedMeta lookup
      if (cypher.includes('SeedMeta') && cypher.includes('WHERE m.id = $id')) {
        return { data: [{ seedVersion: 'seed-1' }] };
      }
      // Node count
      if (cypher.includes('count(n)') && cypher.includes('n.seeded')) {
        return { data: [{ c: graphNodes.length }] };
      }
      // Edge count
      if (cypher.includes('count(r)') && cypher.includes('r.seeded')) {
        return { data: [{ c: graphEdges.length }] };
      }
      // Manuscript title
      if (cypher.includes('ResearchDocument') && cypher.includes('d.title')) {
        return { data: [{ title: 'Guided Demo Manuscript (FICTIONAL / GUIDED DEMO)' }] };
      }
      // Verified notices (requires edgeProvenanceKind which only this query selects).
      if (cypher.includes('PUBLICATION_HAS_NOTICE') && cypher.includes('n.verified') && cypher.includes('edgeProvenanceKind')) {
        return {
          data: [{
            publicationId: 'pub-mehra-2020',
            publicationDoi: '10.1016/S0140-6736(20)31180-6',
            publicationTitle: 'Hydroxychloroquine ... (FICTIONAL?)',
            isSynthetic: false,
            noticeId: 'notice-mehra-retraction-2020-06-04',
            noticeType: 'retraction',
            publishedDate: '2020-06-04',
            sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31324-6',
            lastVerifiedAt: '2026-10-18T00:00:00.000Z',
            edgeProvenanceKind: 'source_verified',
            edgeRationale: 'Authoritative record linkage.',
            edgeSourcePointer: 'function://seed',
            edgeAnalysisVersion: 'seed-1',
          }],
        };
      }
      // Direct affected claims (supporting)
      if (cypher.includes('CITATION_USE_SUPPORTS_CLAIM') && cypher.includes('cu.role = $supporting')) {
        return {
          data: [{
            publicationId: 'pub-mehra-2020',
            publicationDoi: '10.1016/S0140-6736(20)31180-6',
            isSynthetic: false,
            noticeId: 'notice-mehra-retraction-2020-06-04',
            noticeType: 'retraction',
            citationUseId: 'cu-A-supporting',
            citationUseRole: 'supporting',
            citationUseExcerpt: 'supports Mehra',
            claimId: 'claim-A',
            claimStatus: null,
            claimText: 'Passage A supporting Mehra findings (FICTIONAL)',
            claimLocation: 'p.12',
          }],
        };
      }
      // Dependent conclusions
      if (cypher.includes('CONCLUSION_DEPENDS_ON_CLAIM') && cypher.includes('flaggedClaimIds')) {
        return {
          data: [{
            conclusionId: 'conclusion-C',
            conclusionText: 'Conclusion C depends on Claim A (FICTIONAL)',
            claimId: 'claim-A',
            claimText: 'Passage A supporting Mehra findings (FICTIONAL)',
            dependencyId: 'dep-1',
            dependencyProvenanceKind: 'observed',
            dependencyRationale: 'Conclusion depends on claim.',
            dependencyAnalysisVersion: 'seed-1',
            dependencyScope: 'direct',
            dependencyConfidence: null,
          }],
        };
      }
      // Historical claims
      if (cypher.includes('MENTIONS_HISTORICALLY') && cypher.includes('cu.role = $historical')) {
        return {
          data: [{
            citationUseId: 'cu-B-historical',
            citationUseRole: 'historical',
            citationUseExcerpt: 'mentions Mehra',
            claimId: 'claim-B',
            claimText: 'Passage B historical mention of Mehra retraction (FICTIONAL)',
            claimLocation: 'p.18',
            publicationId: 'pub-mehra-2020',
          }],
        };
      }
      // Unresolved references
      if (cypher.includes('ReferenceOccurrence') && cypher.includes('resolutionState IN $unresolvedStates')) {
        return {
          data: [{
            occurrenceId: 'ref-lee-2020',
            rawText: 'Lee et al., 2020',
            resolutionState: 'unresolved',
            candidatePublicationIds: ['pub-lee-2020-candidate-a', 'pub-lee-2020-candidate-b'],
          }],
        };
      }
      // Case node state (readCaseState)
      if (cypher.includes('WHERE n.id = $caseId')) {
        return { data: state ? [{ id: state.id, text: state.text, kind: state.kind, reviewState: state.reviewState, reviewFlags: state.reviewFlags }] : [] };
      }
      // Review decisions (getReviewDecisionsForCase). The real Cypher orders
      // by d.decidedAt ASC; the fake mirrors that contract here.
      if (cypher.includes('ReviewDecision') && cypher.includes('WHERE d.caseId')) {
        return {
          data: decisions
            .filter((d) => d.caseId === params.caseId)
            .slice()
            .sort((a, b) => String(a.decidedAt).localeCompare(String(b.decidedAt)))
            .map((d) => ({ ...d, beforeState: JSON.stringify(d.beforeState), afterState: JSON.stringify(d.afterState) })),
        };
      }
      // Revision proposals. Graph rows are aliased proposalId; the fake
      // mirrors that alias from the stored id.
      if (cypher.includes('RevisionProposal') && cypher.includes('WHERE p.caseId = $caseId')) {
        return { data: proposals.map((p) => ({ ...p, proposalId: p.id })) };
      }
      return { data: [] };
    },
    async writeQuery() {
      if (fail) throw new GraphQueryError(GRAPH_NAME, 'write', new Error('write failed'));
      return { data: [] };
    },
    async close() {},
  };

  return { session, reads, decisions, proposals, getState: () => state, graphNodes, graphEdges };
}

function buildFakeLayer(session) {
  return { open: async () => session };
}

function envWithGraph() {
  return { FALKORDB_GRAPH_NAME: GRAPH_NAME };
}

function requestFor(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function bufferOf(res) {
  return Buffer.from(await res.arrayBuffer());
}

/** Builds a ReviewDecision-shaped row for the fake session's decisions array. */
function decisionRow({ decidedAt, caseId = CASE_ID, outcome = 'revision_needed', explanation = 'Human explanation for this decision.' }) {
  return {
    id: `dec-${decidedAt}`,
    caseId,
    outcome,
    explanation,
    reviewer: 'reviewer-1',
    decidedAt,
    beforeState: { reviewState: 'awaiting_review', flags: [] },
    afterState: { reviewState: 'review_recorded', flags: ['revision_pending'] },
    provenanceKind: 'human_confirmed',
    analysisVersion: 'seed-1',
    createdAt: decidedAt,
    updatedAt: decidedAt,
  };
}

/** Default revision-pack fixture: case node + one draft proposal + two decisions. */
async function richRevisionPackData() {
  const fake = buildFakeSession({ caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' } });
  fake.proposals.push({
    id: 'prop-1', caseId: CASE_ID, originalText: 'Original claim text.',
    proposedText: 'Revised claim text.', rationale: 'More precise.',
    status: 'draft', createdAt: '2026-10-03T08:00:00.000Z', updatedAt: '2026-10-03T08:00:00.000Z',
    provenanceKind: 'human_confirmed', analysisVersion: 'seed-1',
  });
  fake.decisions.push(decisionRow({ decidedAt: '2026-10-02T10:00:00.000Z', outcome: 'more_evidence_needed' }));
  fake.decisions.push(decisionRow({ decidedAt: '2026-10-01T10:00:00.000Z', outcome: 'revision_needed' }));
  const data = await assembleRevisionPack(fake.session, { caseId: CASE_ID });
  return { fake, data };
}

/** Default export-report fixture (flagged claim, decision trail, unresolved refs). */
async function richExportReportData() {
  const fake = buildFakeSession();
  fake.decisions.push(decisionRow({ decidedAt: '2026-10-02T10:00:00.000Z', outcome: 'revision_needed' }));
  const data = await assembleExportReport(fake.session, { caseId: CASE_ID, format: 'pdf' });
  return { fake, data };
}

/**
 * Verdict vocabulary the e2e suites ban (review-queue.spec VERDICT_LANGUAGE,
 * plus the claim-statement variants from the export honesty rules). The
 * verbatim limitation strings quote these words in a negated policy sentence,
 * so verbatim limitations are exempt from this scan.
 */
const BANNED_VERDICT_LANGUAGE = /\b(disproven|debunked|proven false|claim is false|claims? (?:is|are) false|verified false|invalidated|certified|unsupported)\b/i;

/** Collects every user-visible string from a PDF render plan. */
function planStrings(plan, limitations = []) {
  /** @type {string[]} */
  const strings = [];
  for (const section of plan) {
    strings.push(section.heading);
    for (const item of section.items) {
      if (item.type === 'kv') strings.push(item.k, item.v);
      else if (item.type === 'entry') strings.push(item.title, ...item.lines);
      else strings.push(item.text);
    }
  }
  return strings.filter((s) => !limitations.includes(s));
}

/** Collects every user-visible string from a DOCX render plan. */
function docxPlanStrings(blocks, limitations = []) {
  /** @type {string[]} */
  const strings = [];
  for (const block of blocks) {
    if (block.kind === 'table') {
      for (const [k, v] of block.rows) strings.push(k, v);
      continue;
    }
    if (block.k !== undefined) strings.push(block.k);
    if (block.v !== undefined) strings.push(block.v);
    if (block.text !== undefined) strings.push(block.text);
  }
  return strings.filter((s) => !limitations.includes(s));
}

/* ------------------------------------------------------------------ *
 * validateExportCaseId
 * ------------------------------------------------------------------ */

describe('validateExportCaseId', () => {
  it('normalizes a valid caseId', () => {
    expect(validateExportCaseId({ caseId: ' claim-A ' })).toEqual({ caseId: 'claim-A' });
  });

  it('rejects a missing caseId', () => {
    expect(() => validateExportCaseId({ caseId: '' })).toThrow(ExportValidationError);
    expect(() => validateExportCaseId({})).toThrow(ExportValidationError);
  });

  it('rejects an unsafe caseId', () => {
    expect(() => validateExportCaseId({ caseId: '../../etc' })).toThrow(ExportValidationError);
    expect(() => validateExportCaseId({ caseId: 'case id' })).toThrow(ExportValidationError);
  });

  it('rejects a non-object body', () => {
    expect(() => validateExportCaseId(null)).toThrow(ExportValidationError);
    expect(() => validateExportCaseId([1, 2])).toThrow(ExportValidationError);
  });
});

/* ------------------------------------------------------------------ *
 * assembleExportReport (op-level)
 * ------------------------------------------------------------------ */

describe('assembleExportReport — op', () => {
  it('returns a complete export structure with snapshot + integrity + affected/historical/unresolved', async () => {
    const { session } = buildFakeSession();
    const data = await assembleExportReport(session, { caseId: CASE_ID, format: 'pdf' });

    // Snapshot block
    expect(data.snapshot).toMatchObject({
      caseId: CASE_ID,
      format: 'pdf',
      analysisVersion: EXPORT_ANALYSIS_VERSION,
      status: expect.stringMatching(/^(complete|incomplete)$/),
    });
    expect(data.snapshot.generatedAt).toMatch(ISO_RE);
    expect(data.snapshot.snapshotTakenAt).toMatch(ISO_RE);
    expect(typeof data.snapshot.version).toBe('string');

    // Integrity block
    expect(data.integrity.label).toBe(SYNTHETIC_LABEL);
    expect(data.integrity.fabricatedContent).toBe(false);
    expect(data.integrity.verdictPolicy).toContain('never-validation-or-disproof');
    expect(data.integrity.relationTypePolicy).toContain('supporting ≠ historical');
    // A review flag's message must carry the "needs human review" wording.
    expect(data.affected.claims[0].claim.reviewFlag.message).toContain('needs human review');

    // Graph overview
    expect(data.graph.seedVersion).toBe('seed-1');
    expect(typeof data.graph.nodeCount).toBe('number');
    expect(typeof data.graph.edgeCount).toBe('number');

    // Verified notices present
    expect(data.verifiedNotices).toHaveLength(1);
    expect(data.verifiedNotices[0].notice.noticeType).toBe('retraction');
    expect(data.verifiedNotices[0].notice.verified).toBe(true);
    expect(data.verifiedNotices[0].publication.isSynthetic).toBe(false);

    // Affected claims: claim-A flagged (direct)
    expect(data.affected.claims).toHaveLength(1);
    expect(data.affected.claims[0].claim.id).toBe('claim-A');
    expect(data.affected.claims[0].claim.reviewKind).toBe('direct_evidence_review');
    expect(data.affected.claims[0].claim.reviewFlag.message).toContain('needs human review');

    // Affected conclusions: conclusion-C flagged (indirect)
    expect(data.affected.conclusions).toHaveLength(1);
    expect(data.affected.conclusions[0].conclusion.id).toBe('conclusion-C');
    expect(data.affected.conclusions[0].conclusion.reviewKind).toBe('indirect_evidence_review');
    expect(data.affected.conclusions[0].conclusion.viaClaimId).toBe('claim-A');

    // Historical: claim-B excluded from flagged set, disclosed separately
    expect(data.historical).toHaveLength(1);
    expect(data.historical[0].claim.id).toBe('claim-B');
    expect(data.historical[0].claim.reviewKind).toBe('historical_discussion');
    // Integrity guard: historical claim must not also be in affected claims
    expect(data.affected.claims.find((c) => c.claim.id === 'claim-B')).toBeUndefined();

    // Unresolved: ref-lee-2020 disclosed
    expect(data.unresolved).toHaveLength(1);
    expect(data.unresolved[0].occurrence.id).toBe('ref-lee-2020');
    expect(data.unresolved[0].occurrence.resolutionState).toBe('unresolved');
    expect(data.unresolved[0].onlyPossibleMatches).toBe(true);

    // Limitations disclose incompleteness
    expect(Array.isArray(data.limitations)).toBe(true);
    expect(data.limitations.length).toBeGreaterThan(0);
    expect(data.limitations.some((l) => l.toLowerCase().includes('snapshot'))).toBe(true);
  });

  it('marks status incomplete when open tasks remain', async () => {
    const { session } = buildFakeSession();
    const data = await assembleExportReport(session, { caseId: CASE_ID });
    // flagged claim + dependent conclusion + unresolved ref => incomplete
    expect(data.status).toBe('incomplete');
  });

  it('assertParameterizes every Cypher string it sends', async () => {
    const { session, reads } = buildFakeSession();
    await assembleExportReport(session, { caseId: CASE_ID });
    for (const { cypher, params } of reads) {
      expect(cypher).not.toMatch(/['"]/);
      expect(() => assertParameterized(cypher, params ?? {})).not.toThrow();
    }
  });

  it('propagates graph failure as 503-equivalent error with no fabricated data', async () => {
    const { session } = buildFakeSession({ fail: true });
    await expect(assembleExportReport(session, { caseId: CASE_ID })).rejects.toThrow(ConnectionError);
  });
});

/* ------------------------------------------------------------------ *
 * assembleRevisionPack (op-level)
 * ------------------------------------------------------------------ */

describe('assembleRevisionPack — op', () => {
  it('returns original + proposed text, acceptance status, evidence concern', async () => {
    const { session, proposals } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' },
    });
    // Simulate a proposal having been recorded.
    proposals.push({
      id: 'prop-1', caseId: CASE_ID, originalText: 'Original claim text.',
      proposedText: 'Revised claim text.', rationale: 'More precise.',
      status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      provenanceKind: 'human_confirmed', analysisVersion: 'seed-1',
    });

    const data = await assembleRevisionPack(session, { caseId: CASE_ID });

    expect(data.snapshot.caseId).toBe(CASE_ID);
    expect(data.snapshot.format).toBe('docx');
    expect(data.originalText).toBe('Original claim text.');
    expect(data.proposedText).toBe('Revised claim text.');
    expect(data.rationale).toBe('More precise.');
    expect(data.acceptanceStatus).toBe('draft');
    expect(data.case.text).toBe('Original claim text.'); // immutable
    expect(data.evidenceConcern.disclosure).toContain('no evidence concern is implied');
    expect(data.integrity.label).toBe(SYNTHETIC_LABEL);
    expect(data.integrity.fabricatedContent).toBe(false);
  });

  it('returns acceptanceStatus none when no proposal exists', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    const data = await assembleRevisionPack(session, { caseId: CASE_ID });
    expect(data.acceptanceStatus).toBe('none');
    expect(data.proposedText).toBeNull();
  });

  it('throws ExportNotFoundError (400) when no case node exists', async () => {
    const { session } = buildFakeSession({ caseNode: null });
    await expect(assembleRevisionPack(session, { caseId: 'no-such-case' })).rejects.toThrow(ExportNotFoundError);
  });

  it('pairs a labeled immutable original with a labeled draft proposed text', async () => {
    const { session, proposals } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' },
    });
    proposals.push({
      id: 'prop-1', caseId: CASE_ID, originalText: 'Original claim text.',
      proposedText: 'Revised claim text.', rationale: 'More precise.',
      status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      provenanceKind: 'human_confirmed', analysisVersion: 'seed-1',
    });

    const data = await assembleRevisionPack(session, { caseId: CASE_ID });

    expect(data.textPair.original).toEqual({
      label: 'Original passage (recorded; immutable)',
      text: 'Original claim text.',
      immutable: true,
      note: expect.any(String),
    });
    expect(data.textPair.proposed).toEqual({
      label: 'Proposed revision (draft)',
      text: 'Revised claim text.',
      proposalId: 'prop-1',
      status: 'draft',
      immutable: false,
      note: expect.any(String),
    });
    // The original pair text is the recorded case text — verbatim, unmodified.
    expect(data.textPair.original.text).toBe(data.case.text);
    expect(data.textPair.original.note).toContain('immutable');
  });

  it('renders the absent-proposal pair honestly instead of inventing a draft', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    const data = await assembleRevisionPack(session, { caseId: CASE_ID });
    expect(data.textPair.proposed).toBeNull();
    expect(data.textPair.noProposalNote).toBe('No proposed revision (draft) is recorded for this case; none is invented here.');
  });

  it('frames acceptance status so a draft proposal never reads as applied', async () => {
    const { session, proposals } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 't', kind: 'Claim' },
    });
    proposals.push({
      id: 'prop-1', caseId: CASE_ID, originalText: 't',
      proposedText: 'Revised.', rationale: undefined,
      status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      provenanceKind: 'human_confirmed', analysisVersion: 'seed-1',
    });

    const withDraft = await assembleRevisionPack(session, { caseId: CASE_ID });
    expect(withDraft.acceptanceDisplay.applied).toBe(false);
    expect(withDraft.acceptanceDisplay.label).toBe('DRAFT — not applied (awaiting human acceptance)');
    expect(withDraft.acceptanceDisplay.note).toContain('must never be read as applied');

    const withoutDraft = await assembleRevisionPack(buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } }).session, { caseId: CASE_ID });
    expect(withoutDraft.acceptanceDisplay.applied).toBe(false);
    expect(withoutDraft.acceptanceDisplay.label).toBe('NONE — no draft revision recorded');
  });

  it('surfaces the FULL review decision trail (not latest-only), ordered by decidedAt', async () => {
    const { session, decisions } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 't', kind: 'Claim' },
    });
    // Inserted out of order — the fake mirrors the query's ORDER BY.
    decisions.push(decisionRow({ decidedAt: '2026-10-02T10:00:00.000Z', outcome: 'more_evidence_needed' }));
    decisions.push(decisionRow({ decidedAt: '2026-10-01T10:00:00.000Z', outcome: 'revision_needed' }));

    const data = await assembleRevisionPack(session, { caseId: CASE_ID });

    expect(data.reviewDecisions).toHaveLength(2);
    expect(data.reviewDecisions.map((d) => d.decidedAt)).toEqual([
      '2026-10-01T10:00:00.000Z',
      '2026-10-02T10:00:00.000Z',
    ]);
    // Latest decision stays consistent with the trail's last entry.
    expect(data.evidenceConcern.latestReviewDecision.id).toBe(data.reviewDecisions[1].id);
  });

  it('discloses graph-wide unresolved reference occurrences with count + list', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    const data = await assembleRevisionPack(session, { caseId: CASE_ID });
    expect(data.unresolvedReferences.count).toBe(1);
    expect(data.unresolvedReferences.items).toHaveLength(1);
    expect(data.unresolvedReferences.items[0].occurrence.id).toBe('ref-lee-2020');
    expect(data.unresolvedReferences.items[0].onlyPossibleMatches).toBe(true);
    expect(data.unresolvedReferences.scopeNote).toContain('disclosure, never propagation');
  });

  it('carries the snapshot/version block from assembled values', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    const data = await assembleRevisionPack(session, { caseId: CASE_ID });
    expect(data.snapshot.analysisVersion).toBe(EXPORT_ANALYSIS_VERSION);
    expect(data.snapshot.format).toBe('docx');
    expect(data.snapshot.seedVersion).toBe('seed-1'); // fixture value, echoed as assembled
    expect(data.snapshot.generatedAt).toMatch(ISO_RE);
    expect(data.snapshot.generatedAt).toBe(data.snapshot.snapshotTakenAt);
  });

  it('keeps the explicit limitations strings verbatim in the payload', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    const data = await assembleRevisionPack(session, { caseId: CASE_ID });
    expect(data.limitations).toContain('Original claim/conclusion text is immutable; this pack never modifies it.');
    expect(data.limitations).toContain('A revision proposal is status "draft" until a human accepts it; copying is not applying.');
    expect(data.limitations).toContain('A review flag means "needs human review" — never "disproven/proven".');
    expect(data.limitations).toContain('This pack is a snapshot at generation time; it is not re-verified after generation.');
    expect(data.limitations.some((l) => l.includes('graph-wide at snapshot time'))).toBe(true);
  });

  it('assertParameterizes every Cypher string it sends', async () => {
    const { session, reads } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    await assembleRevisionPack(session, { caseId: CASE_ID });
    for (const { cypher, params } of reads) {
      expect(() => assertParameterized(cypher, params ?? {})).not.toThrow();
    }
  });
});

/* ------------------------------------------------------------------ *
 * assembleAnnotatedManuscript (op-level)
 * ------------------------------------------------------------------ */

describe('assembleAnnotatedManuscript — op', () => {
  it('returns passages with annotations and review statuses', async () => {
    const { session } = buildFakeSession();
    const data = await assembleAnnotatedManuscript(session, { caseId: CASE_ID });

    expect(data.snapshot.caseId).toBe(CASE_ID);
    expect(data.manuscriptTitle).toBe('Guided Demo Manuscript (FICTIONAL / GUIDED DEMO)');
    expect(Array.isArray(data.passages)).toBe(true);
    expect(data.passages.length).toBeGreaterThan(0);

    // claim-A passage flagged direct
    const claimAPassage = data.passages.find((p) => p.id === 'claim-A');
    expect(claimAPassage).toBeDefined();
    expect(claimAPassage.annotations.some((a) => a.reviewKind === 'direct_evidence_review')).toBe(true);
    expect(claimAPassage.annotations.some((a) => a.reviewStatus === 'flagged_for_review')).toBe(true);

    // conclusion-C passage flagged indirect
    const conclusionPassage = data.passages.find((p) => p.id === 'conclusion-C');
    expect(conclusionPassage).toBeDefined();
    expect(conclusionPassage.annotations.some((a) => a.reviewKind === 'indirect_evidence_review')).toBe(true);

    // claim-B passage historical (not flagged compromised)
    const claimBPassage = data.passages.find((p) => p.id === 'claim-B');
    expect(claimBPassage).toBeDefined();
    expect(claimBPassage.annotations.some((a) => a.reviewKind === 'historical_discussion')).toBe(true);
    expect(claimBPassage.annotations.some((a) => a.reviewStatus === 'not_flagged_historical')).toBe(true);

    // ref-lee-2020 unresolved disclosed
    const refPassage = data.passages.find((p) => p.id === 'ref-lee-2020');
    expect(refPassage).toBeDefined();
    expect(refPassage.annotations.some((a) => a.reviewStatus === 'unresolved')).toBe(true);

    expect(data.integrity.label).toBe(SYNTHETIC_LABEL);
    expect(data.integrity.fabricatedContent).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Honest status/acceptance display helpers (shared by both renderers)
 * ------------------------------------------------------------------ */

describe('export status + acceptance display helpers', () => {
  it('never lets "complete" read as a scientific validation', () => {
    expect(exportStatusDisplay('complete')).toBe('COMPLETE — review-workflow snapshot only; not a scientific validation or verdict');
    expect(exportStatusDisplay('incomplete')).toBe('INCOMPLETE — open review items remain at snapshot time');
    expect(exportStatusDisplay('weird')).toContain('not a scientific verdict');
  });

  it('keeps every acceptance status "not applied"', () => {
    for (const status of ['draft', 'none', 'something_else']) {
      const display = acceptanceStatusDisplay(status);
      expect(display.applied).toBe(false);
      expect(display.label === 'NONE — no draft revision recorded' || display.label.includes('not applied')).toBe(true);
      expect(display.note.length).toBeGreaterThan(0);
    }
    expect(acceptanceStatusDisplay('draft').label).toBe('DRAFT — not applied (awaiting human acceptance)');
    expect(acceptanceStatusDisplay('none').label).toBe('NONE — no draft revision recorded');
  });
});

/* ------------------------------------------------------------------ *
 * buildReportPdfPlan — pure renderer structure (deterministic, no binary)
 * ------------------------------------------------------------------ */

describe('buildReportPdfPlan — render structure', () => {
  it('keeps a fixed section order covering every data section', async () => {
    const { data } = await richExportReportData();
    const plan = buildReportPdfPlan(data);
    expect(plan.map((s) => s.heading)).toEqual([
      'Export snapshot',
      'Scientific integrity (export disclosure)',
      'Graph overview (at snapshot time)',
      'Verified source notices',
      'Affected claims — direct evidence review',
      'Affected conclusions — indirect evidence review',
      'Historical-discussion claims (explicitly excluded from flagged set)',
      'Unresolved reference occurrences (disclosure, never propagation)',
      'Review decisions for this case',
      'Revision proposals for this case',
      'Limitations & coverage',
    ]);
  });

  it('renders snapshot/version details from the assembled data, not literals', async () => {
    const { data } = await richExportReportData();
    const plan = buildReportPdfPlan(data);
    const snapshotSection = plan[0];
    const kv = Object.fromEntries(snapshotSection.items.map((item) => [item.k, item.v]));
    expect(kv['Analysis version']).toBe(data.snapshot.analysisVersion);
    expect(kv['Export version']).toBe(data.snapshot.version);
    expect(kv['Export status']).toBe(exportStatusDisplay(data.snapshot.status));
    expect(kv['Seed version']).toBe(data.snapshot.seedVersion);
    expect(kv['Generated at']).toBe(data.snapshot.generatedAt);
    expect(kv['Snapshot taken at']).toBe(data.snapshot.snapshotTakenAt);
  });

  it('renders limitations verbatim as bullets', async () => {
    const { data } = await richExportReportData();
    const plan = buildReportPdfPlan(data);
    const limitationsSection = plan[plan.length - 1];
    expect(limitationsSection.heading).toBe('Limitations & coverage');
    expect(limitationsSection.items.map((i) => i.text)).toEqual(data.limitations);
  });

  it('renders the review decision trail and all review-flag messages', async () => {
    const { data } = await richExportReportData();
    const plan = buildReportPdfPlan(data);
    const decisionsSection = plan.find((s) => s.heading === 'Review decisions for this case');
    expect(decisionsSection.items).toHaveLength(1);
    expect(decisionsSection.items[0].title).toContain(data.reviewDecisions[0].id);
    const planText = planStrings(plan, data.limitations).join('\n');
    expect(planText).toContain('needs human review');
  });

  it('uses needs-review vocabulary only — no verdict language outside verbatim limitations', async () => {
    const { data } = await richExportReportData();
    const scanned = planStrings(buildReportPdfPlan(data), data.limitations);
    for (const s of scanned) {
      expect(s).not.toMatch(BANNED_VERDICT_LANGUAGE);
    }
  });
});

/* ------------------------------------------------------------------ *
 * buildRevisionPackDocxPlan — pure renderer structure (deterministic)
 * ------------------------------------------------------------------ */

describe('buildRevisionPackDocxPlan — render structure', () => {
  it('keeps a fixed heading hierarchy covering every data section', async () => {
    const { data } = await richRevisionPackData();
    const blocks = buildRevisionPackDocxPlan(data);
    expect(blocks.filter((b) => b.kind === 'h1').map((b) => b.text)).toEqual([
      'Export snapshot',
      'Scientific integrity (export disclosure)',
      'Case under review',
      'Original passage vs proposed revision',
      'Evidence concern',
      REVISION_PACK_LABELS.reviewTrailHeading,
      'Publication & source notice',
      REVISION_PACK_LABELS.unresolvedHeading,
      'Limitations & coverage',
    ]);
    expect(blocks.filter((b) => b.kind === 'h2').map((b) => b.text)).toEqual([
      REVISION_PACK_LABELS.originalHeading,
      REVISION_PACK_LABELS.proposedHeading,
      REVISION_PACK_LABELS.acceptanceHeading,
      REVISION_PACK_LABELS.rationaleHeading,
    ]);
  });

  it('renders the labeled original/proposed pair with verbatim recorded text', async () => {
    const { data } = await richRevisionPackData();
    const blocks = buildRevisionPackDocxPlan(data);
    const originalIdx = blocks.findIndex((b) => b.kind === 'h2' && b.text === REVISION_PACK_LABELS.originalHeading);
    const proposedIdx = blocks.findIndex((b) => b.kind === 'h2' && b.text === REVISION_PACK_LABELS.proposedHeading);
    expect(originalIdx).toBeGreaterThan(-1);
    expect(proposedIdx).toBeGreaterThan(originalIdx);
    // Original passage is quoted verbatim (never modified), proposed is quoted as draft.
    expect(blocks[originalIdx + 1]).toMatchObject({ kind: 'quote', text: data.textPair.original.text });
    expect(blocks[proposedIdx + 1]).toMatchObject({ kind: 'quote', text: data.textPair.proposed.text, tone: 'amber' });
  });

  it('renders the absent-proposal case honestly — no draft invented', async () => {
    const fake = buildFakeSession({ caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' } });
    const data = await assembleRevisionPack(fake.session, { caseId: CASE_ID });
    const blocks = buildRevisionPackDocxPlan(data);
    expect(blocks.some((b) => b.kind === 'h2' && b.text === REVISION_PACK_LABELS.proposedHeading)).toBe(false);
    expect(blocks.some((b) => b.kind === 'note' && b.text === REVISION_PACK_LABELS.noProposalNote)).toBe(true);
    // Acceptance status still displayed, still never applied.
    const acceptanceField = blocks.find((b) => b.kind === 'field' && b.k === 'Acceptance status');
    expect(acceptanceField.v).toBe('NONE — no draft revision recorded');
  });

  it('renders snapshot/version details in the table from assembled data, not literals', async () => {
    const { data } = await richRevisionPackData();
    const blocks = buildRevisionPackDocxPlan(data);
    const table = blocks.find((b) => b.kind === 'table');
    const kv = Object.fromEntries(table.rows);
    expect(kv['Analysis version']).toBe(data.snapshot.analysisVersion);
    expect(kv['Export version']).toBe(data.snapshot.version);
    expect(kv['Export status']).toBe(exportStatusDisplay(data.snapshot.status));
    expect(kv['Seed version']).toBe(data.snapshot.seedVersion);
    expect(kv['Snapshot taken at']).toBe(data.snapshot.snapshotTakenAt);
  });

  it('renders the full decision trail ordered by decidedAt', async () => {
    const { data } = await richRevisionPackData();
    const blocks = buildRevisionPackDocxPlan(data);
    const trail = blocks.filter((b) => b.kind === 'field' && b.k.startsWith('Decision '));
    expect(trail).toHaveLength(2);
    // Fake session mirrors ORDER BY decidedAt ASC.
    expect(trail[0].v).toContain(data.reviewDecisions[0].outcome);
    expect(trail[1].v).toContain(data.reviewDecisions[1].outcome);
  });

  it('renders unresolved reference count + candidates and limitations verbatim', async () => {
    const { data } = await richRevisionPackData();
    const blocks = buildRevisionPackDocxPlan(data);
    const countField = blocks.find((b) => b.kind === 'field' && b.k === REVISION_PACK_LABELS.unresolvedCountLabel);
    expect(countField.v).toBe(String(data.unresolvedReferences.count));
    // Limitations bullets are the payload strings verbatim.
    const limitationsStart = blocks.findIndex((b) => b.kind === 'h1' && b.text === 'Limitations & coverage');
    const limitationBullets = blocks.slice(limitationsStart + 1).filter((b) => b.kind === 'bullet').map((b) => b.text);
    expect(limitationBullets).toEqual(data.limitations);
  });

  it('uses needs-review vocabulary only — no verdict language outside verbatim limitations', async () => {
    const { data } = await richRevisionPackData();
    const scanned = docxPlanStrings(buildRevisionPackDocxPlan(data), data.limitations);
    for (const s of scanned) {
      expect(s).not.toMatch(BANNED_VERDICT_LANGUAGE);
    }
    const planText = scanned.join('\n');
    expect(planText).toContain('must never be read as applied');
  });
});

/* ------------------------------------------------------------------ *
 * Handlers (HTTP layer, fake layer + scripted ops / assemble)
 * ------------------------------------------------------------------ */

describe('createExportReportHandler — HTTP', () => {
  const base = `http://localhost/${GRAPH_NAME}`;

  it('returns 200 with PDF binary and correct headers for a valid request', async () => {
    const { session } = buildFakeSession();
    const handler = createExportReportHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      assemble: assembleExportReport,
    });

    const res = await handler(requestFor(`${base}/export-report?caseId=${CASE_ID}`, { format: 'pdf' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain('evidence-impact-report.pdf');
    const body = await bufferOf(res);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    // PDF magic bytes
    expect(body.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('returns 405 for non-POST methods with an Allow header', async () => {
    const handler = createExportReportHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(new Request(`${base}/export-report?caseId=${CASE_ID}`, { method: 'GET' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('returns 400 for an invalid caseId', async () => {
    const handler = createExportReportHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/export-report?caseId=../../etc`, { format: 'pdf' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid-request');
  });

  it('returns 503 when the graph is unavailable and fabricates nothing', async () => {
    const { session } = buildFakeSession({ fail: true });
    const handler = createExportReportHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      assemble: assembleExportReport,
    });
    const res = await handler(requestFor(`${base}/export-report?caseId=${CASE_ID}`, { format: 'pdf' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('graph-backend-unavailable');
    expect(JSON.stringify(body)).toContain('no fabricated data');
  });

  it('returns 503 when the graph name is not configured', async () => {
    const handler = createExportReportHandler({ env: {}, layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/export-report?caseId=${CASE_ID}`, { format: 'pdf' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('graph-backend-not-configured');
  });
});

describe('createExportRevisionPackHandler — HTTP', () => {
  const base = `http://localhost/${GRAPH_NAME}`;

  it('returns 200 with DOCX binary and correct headers for a valid request', async () => {
    const { session, proposals } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' },
    });
    proposals.push({
      id: 'prop-1', caseId: CASE_ID, originalText: 'Original claim text.',
      proposedText: 'Revised claim text.', rationale: 'More precise.',
      status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      provenanceKind: 'human_confirmed', analysisVersion: 'seed-1',
    });
    const handler = createExportRevisionPackHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      assemble: assembleRevisionPack,
    });

    const res = await handler(requestFor(`${base}/export-revision-pack?caseId=${CASE_ID}`, {}));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain('revision-pack.docx');
    const body = await bufferOf(res);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    // DOCX is a zip (PK magic bytes)
    expect(body.slice(0, 2).toString()).toBe('PK');
  });

  it('returns 405 for non-POST methods', async () => {
    const handler = createExportRevisionPackHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(new Request(`${base}/export-revision-pack?caseId=${CASE_ID}`, { method: 'DELETE' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('returns 400 for an invalid caseId', async () => {
    const handler = createExportRevisionPackHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/export-revision-pack?caseId='bad'`, {}));
    expect(res.status).toBe(400);
  });

  it('returns 503 when the graph is unavailable', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' }, fail: true });
    const handler = createExportRevisionPackHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      assemble: assembleRevisionPack,
    });
    const res = await handler(requestFor(`${base}/export-revision-pack?caseId=${CASE_ID}`, {}));
    expect(res.status).toBe(503);
  });
});

describe('createExportAnnotatedManuscriptHandler — HTTP', () => {
  const base = `http://localhost/${GRAPH_NAME}`;

  it('returns 200 with HTML document and correct headers', async () => {
    const { session } = buildFakeSession();
    const handler = createExportAnnotatedManuscriptHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      assemble: assembleAnnotatedManuscript,
    });

    const res = await handler(requestFor(`${base}/export-annotated-manuscript?caseId=${CASE_ID}`, {}));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const body = await res.text();
    expect(body).toContain('<!DOCTYPE html>');
    expect(body).toContain('Aftershock');
    expect(body).toContain('claim-A');
    expect(body).toContain('FICTIONAL / GUIDED DEMO');
    expect(body).toContain('needs human review');
  });

  it('returns 405 for non-POST methods', async () => {
    const handler = createExportAnnotatedManuscriptHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(new Request(`${base}/export-annotated-manuscript?caseId=${CASE_ID}`, { method: 'PUT' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('returns 503 when the graph is unavailable', async () => {
    const { session } = buildFakeSession({ fail: true });
    const handler = createExportAnnotatedManuscriptHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      assemble: assembleAnnotatedManuscript,
    });
    const res = await handler(requestFor(`${base}/export-annotated-manuscript?caseId=${CASE_ID}`, {}));
    expect(res.status).toBe(503);
  });
});

/* ------------------------------------------------------------------ *
 * Rate limiting passthrough (handlers)
 * ------------------------------------------------------------------ */

describe('export handlers — rich fixture render smoke', () => {
  const base = `http://localhost/${GRAPH_NAME}`;

  it('renders a PDF through the real renderer with a rich decision trail', async () => {
    const fake = buildFakeSession();
    fake.decisions.push(decisionRow({ decidedAt: '2026-10-02T10:00:00.000Z', outcome: 'revision_needed' }));
    const handler = createExportReportHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(fake.session),
      assemble: assembleExportReport,
    });
    const res = await handler(requestFor(`${base}/export-report?caseId=${CASE_ID}`, { format: 'pdf' }));
    expect(res.status).toBe(200);
    const body = await bufferOf(res);
    expect(body.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('renders a DOCX through the real renderer with proposal + decision trail', async () => {
    const fake = buildFakeSession({
      caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' },
    });
    fake.proposals.push({
      id: 'prop-1', caseId: CASE_ID, originalText: 'Original claim text.',
      proposedText: 'Revised claim text.', rationale: 'More precise.',
      status: 'draft', createdAt: '2026-10-03T08:00:00.000Z', updatedAt: '2026-10-03T08:00:00.000Z',
      provenanceKind: 'human_confirmed', analysisVersion: 'seed-1',
    });
    fake.decisions.push(decisionRow({ decidedAt: '2026-10-02T10:00:00.000Z', outcome: 'revision_needed' }));
    const handler = createExportRevisionPackHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(fake.session),
      assemble: assembleRevisionPack,
    });
    const res = await handler(requestFor(`${base}/export-revision-pack?caseId=${CASE_ID}`, {}));
    expect(res.status).toBe(200);
    const body = await bufferOf(res);
    expect(body.slice(0, 2).toString()).toBe('PK');
  });
});

describe('export handlers — rate limiting', () => {
  const base = `http://localhost/${GRAPH_NAME}`;

  it('returns 429 + Retry-After when the per-IP bucket is exhausted', async () => {
    const fakeLimiter = {
      check(key) {
        if (key === 'ip:203.0.113.10') return { allowed: false, retryAfterMs: 15_000 };
        return { allowed: true, retryAfterMs: 0 };
      },
    };
    const handler = createExportReportHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(buildFakeSession().session),
      limiter: fakeLimiter,
    });
    const res = await handler(new Request(`${base}/export-report?caseId=${CASE_ID}`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.10', 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'pdf' }),
    }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe(String(Math.max(1, Math.ceil(15_000 / 1000))));
  });
});
