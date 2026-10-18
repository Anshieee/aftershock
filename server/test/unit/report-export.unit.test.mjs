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
} from '../../../netlify/functions/export-report.mjs';
import {
  createExportRevisionPackHandler,
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
      // Review decisions (getReviewDecisionsForCase)
      if (cypher.includes('ReviewDecision') && cypher.includes('WHERE d.caseId')) {
        return {
          data: decisions.filter((d) => d.caseId === params.caseId).map((d) => ({ ...d, beforeState: JSON.stringify(d.beforeState), afterState: JSON.stringify(d.afterState) })),
        };
      }
      // Revision proposals
      if (cypher.includes('RevisionProposal') && cypher.includes('WHERE p.caseId = $caseId')) {
        return { data: proposals.map((p) => ({ ...p })) };
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
