/**
 * @aftershock/server — M6 export data assembly: Evidence Impact Report,
 * Revision Pack, Annotated Manuscript.
 *
 * Server-side-only read assembly over real FalkorDB records. All reads go
 * through `session.roQuery` with `$params`; `assertParameterized` guards
 * every Cypher string. No writes (exports are read-only).
 *
 * Scientific-integrity invariants (AGENTS.md / DATA_CONTRACTS §7 /
 * RESEARCH_INTEGRITY.md — NONNEGOTIABLE):
 * - A review flag means "needs human review" — never "disproven/proven".
 * - Never conflate relation types: supporting ≠ historical ≠ contrasts ≠
 *   method-reuse ≠ has-status-notice.
 * - Historical mentions (MENTIONS_HISTORICALLY) never join the flagged set.
 * - POSSIBLE_MATCH / unresolved candidates never propagate.
 * - Synthetic fixture content is labeled `FICTIONAL / GUIDED DEMO`; real
 *   bibliographic records carry `isSynthetic: false`.
 * - Every export discloses incomplete analysis and unresolved issues.
 * - Exports record snapshot/version + generation date; old exports are not
 *   silently mutated.
 *
 * Test seam: every exported function takes an injected `GraphSession` plus
 * plain arguments — no credentials, no real DB, no ESM stubbing. Handlers
 * pass `deps` (layer + ops) so unit tests never touch a real graph.
 */

import { assertParameterized } from './graphClient.mjs';
import { FIXTURE_IDS } from './contract.mjs';
import { getReviewDecisionsForCase } from './reviewState.mjs';

/** Audit-version label for export snapshots (contract §1 / provenance). */
export const EXPORT_ANALYSIS_VERSION = 'export-1';

/** Synthetic-content label applied to the guided-demo fixture (contract §6). */
export const SYNTHETIC_LABEL = 'FICTIONAL / GUIDED DEMO';

/** Wall-clock budget (ms) for export assembly — below the client's 10 s abort. */
export const EXPORT_READ_BUDGET_MS = 8_000;

/** Case-id safe charset, mirroring reviewState.mjs before any graph I/O. */
const CASE_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Max chars for a user-supplied caseId. */
const MAX_CASE_ID_LEN = 100;

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Validate + normalize a `caseId`. Throws `ExportValidationError` (400) on
 * any problem; returns the normalized id otherwise.
 * @param {unknown} input
 * @returns {{caseId: string}}
 */
export function validateExportCaseId(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ExportValidationError('Request body must be a JSON object.');
  }
  const { caseId } = input;
  if (typeof caseId !== 'string' || caseId.trim() === '') {
    throw new ExportValidationError('caseId is required (non-empty string).');
  }
  const normalizedCaseId = caseId.trim();
  if (!CASE_ID_RE.test(normalizedCaseId)) {
    throw new ExportValidationError('caseId may only contain letters, digits, underscores, and hyphens.');
  }
  if (normalizedCaseId.length > MAX_CASE_ID_LEN) {
    throw new ExportValidationError(`caseId must be ${MAX_CASE_ID_LEN} characters or fewer.`);
  }
  return { caseId: normalizedCaseId };
}

/** Export-domain error with an attached HTTP status. */
export class ExportValidationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ExportValidationError';
    this.status = 400;
  }
}

/** 400-equivalent surfaced as 400 — no such case node. */
export class ExportNotFoundError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ExportNotFoundError';
    this.status = 400;
  }
}

/* ------------------------------------------------------------------ *
 * Now + snapshot helpers
 * ------------------------------------------------------------------ */

/** @returns {string} current UTC ISO-8601 timestamp. */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Build the export snapshot block (contract: snapshot/version + generation
 * date + case identifier + analysis version + review state at generation
 * time + format).
 * @param {string} caseId
 * @param {string} format
 * @param {string | null} seedVersion
 * @param {string} status
 * @returns {{version: string, generatedAt: string, caseId: string, format: string, analysisVersion: string, seedVersion: string | null, status: string, snapshotTakenAt: string}}
 */
function buildSnapshot(caseId, format, seedVersion, status) {
  const generatedAt = nowIso();
  return {
    version: '1.0.0',
    generatedAt,
    snapshotTakenAt: generatedAt,
    caseId,
    format,
    analysisVersion: EXPORT_ANALYSIS_VERSION,
    seedVersion,
    status,
  };
}

/* ------------------------------------------------------------------ *
 * Cypher query helpers (roQuery only, all $params)
 * ------------------------------------------------------------------ */

/**
 * Graph overview: seed version, node/edge counts, manuscript title.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<{seedVersion: string | null, nodeCount: number, edgeCount: number, manuscriptTitle: string | undefined}>}
 */
async function readGraphOverview(session) {
  const seedMetaCypher = 'MATCH (m:SeedMeta) WHERE m.id = $id RETURN m.seedVersion AS seedVersion LIMIT 1';
  assertParameterized(seedMetaCypher, { id: FIXTURE_IDS.seedMeta });
  const seedRes = await session.roQuery(seedMetaCypher, { id: FIXTURE_IDS.seedMeta });
  const seedVersion = seedRes.data?.[0]?.seedVersion ?? null;

  const nodeCountCypher = 'MATCH (n) WHERE n.seeded = $seeded RETURN count(n) AS c';
  assertParameterized(nodeCountCypher, { seeded: true });
  const nodeRes = await session.roQuery(nodeCountCypher, { seeded: true });
  const nodeCount = Number(nodeRes.data?.[0]?.c ?? 0);

  const edgeCountCypher = 'MATCH ()-[r]->() WHERE r.seeded = $seeded RETURN count(r) AS c';
  assertParameterized(edgeCountCypher, { seeded: true });
  const edgeRes = await session.roQuery(edgeCountCypher, { seeded: true });
  const edgeCount = Number(edgeRes.data?.[0]?.c ?? 0);

  const manuscriptCypher = 'MATCH (d:ResearchDocument) WHERE d.seeded = $seeded RETURN d.title AS title LIMIT 1';
  assertParameterized(manuscriptCypher, { seeded: true });
  const manuscriptRes = await session.roQuery(manuscriptCypher, { seeded: true });
  const manuscriptTitle = manuscriptRes.data?.[0]?.title ?? undefined;

  return { seedVersion, nodeCount, edgeCount, manuscriptTitle };
}

/**
 * Verified notices: publications carrying a verified SourceNotice.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<Array<{publication: {...}, notice: {...}, edge: {...}, reviewFlag: {...}}>>}
 */
async function readVerifiedNotices(session) {
  const cypher = `MATCH (p:Publication)-[e:PUBLICATION_HAS_NOTICE]->(n:SourceNotice)
   WHERE p.seeded = $seeded AND n.seeded = $seeded AND n.verified = $verified
   RETURN p.id AS publicationId, p.doi AS publicationDoi, p.title AS publicationTitle, p.isSynthetic AS isSynthetic,
          n.id AS noticeId, n.noticeType AS noticeType, n.publishedDate AS publishedDate,
          n.sourceUrl AS sourceUrl, n.lastVerifiedAt AS lastVerifiedAt,
          e.provenanceKind AS edgeProvenanceKind, e.rationale AS edgeRationale,
          e.sourcePointer AS edgeSourcePointer, e.analysisVersion AS edgeAnalysisVersion
   ORDER BY p.id`;
  assertParameterized(cypher, { seeded: true, verified: true });
  const res = await session.roQuery(cypher, { seeded: true, verified: true });
  return (res.data ?? []).map((row) => ({
    publication: {
      id: row.publicationId,
      doi: row.publicationDoi ?? null,
      title: row.publicationTitle ?? null,
      isSynthetic: row.isSynthetic ?? null,
    },
    notice: {
      id: row.noticeId,
      noticeType: row.noticeType,
      verified: true,
      publishedDate: row.publishedDate ?? null,
      sourceUrl: row.sourceUrl ?? null,
      lastVerifiedAt: row.lastVerifiedAt ?? null,
    },
    edge: {
      provenanceKind: row.edgeProvenanceKind ?? null,
      rationale: row.edgeRationale ?? null,
      sourcePointer: row.edgeSourcePointer ?? null,
      analysisVersion: row.edgeAnalysisVersion ?? null,
    },
    reviewFlag: {
      kind: 'verified_notice_requiring_review',
      message: `Verified ${String(row.noticeType)} notice for publication ${String(row.publicationId)}; any directly supported passage may need evidence review. A review flag means "needs human review" — never a verdict of disproof or validation.`,
    },
  }));
}

/**
 * Direct evidence review: verified-notice publication → supporting citation
 * use → claim. Mirrors impact.mjs `impactPathFromSupportedClaims`.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<Array<{publication, notice, citationUse, claim, path}>>}
 */
async function readDirectAffectedClaims(session) {
  const cypher = `MATCH (p:Publication)-[:PUBLICATION_HAS_NOTICE]->(n:SourceNotice)
   WHERE p.seeded = $seeded AND n.seeded = $seeded AND n.verified = $verified AND p.isSynthetic = $recordIsReal
   MATCH (cu:CitationUse)-[:CITATION_USE_REFERENCES_PUBLICATION]->(p)
   WHERE cu.seeded = $seeded AND cu.role = $supporting
   MATCH (cu)-[:CITATION_USE_SUPPORTS_CLAIM]->(claim:Claim)
   WHERE claim.seeded = $seeded
   RETURN p.id AS publicationId, p.doi AS publicationDoi, p.isSynthetic AS isSynthetic,
          n.id AS noticeId, n.noticeType AS noticeType,
          cu.id AS citationUseId, cu.role AS citationUseRole, cu.excerpt AS citationUseExcerpt,
          claim.id AS claimId, claim.status AS claimStatus, claim.text AS claimText, claim.location AS claimLocation
   ORDER BY claimId`;
  assertParameterized(cypher, { seeded: true, verified: true, recordIsReal: false, supporting: 'supporting' });
  const res = await session.roQuery(cypher, { seeded: true, verified: true, recordIsReal: false, supporting: 'supporting' });
  return (res.data ?? []).map((row) => ({
    publication: { id: row.publicationId, doi: row.publicationDoi ?? null, isSynthetic: row.isSynthetic },
    notice: { id: row.noticeId, noticeType: row.noticeType },
    citationUse: { id: row.citationUseId, role: row.citationUseRole, excerpt: row.citationUseExcerpt ?? null },
    claim: {
      id: row.claimId,
      status: row.claimStatus ?? null,
      text: row.claimText ?? null,
      location: row.claimLocation ?? null,
      reviewKind: 'direct_evidence_review',
      reviewFlag: {
        kind: 'direct_evidence_review',
        message: `Claim ${String(row.claimId)} is directly supported by publication ${String(row.publicationId)} through a verified status notice; review required. A flag means "needs human review" — never a verdict.`,
      },
    },
    path: [row.noticeId, row.publicationId, row.citationUseId, row.claimId],
  }));
}

/**
 * Indirect evidence review: conclusions depending on a flagged claim.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string[]} flaggedClaimIds
 * @returns {Promise<Array<{conclusion, viaClaimId, dependencyEdge}>>}
 */
async function readDependentConclusions(session, flaggedClaimIds) {
  if (flaggedClaimIds.length === 0) return [];
  const cypher = `MATCH (conclusion:Conclusion)-[dep:CONCLUSION_DEPENDS_ON_CLAIM]->(claim:Claim)
   WHERE conclusion.seeded = $seeded AND claim.seeded = $seeded AND claim.id IN $flaggedClaimIds
   RETURN conclusion.id AS conclusionId, conclusion.text AS conclusionText,
          claim.id AS claimId, claim.text AS claimText,
          dep.id AS dependencyId, dep.provenanceKind AS dependencyProvenanceKind,
          dep.rationale AS dependencyRationale, dep.analysisVersion AS dependencyAnalysisVersion,
          dep.scope AS dependencyScope, dep.confidence AS dependencyConfidence
   ORDER BY conclusionId`;
  assertParameterized(cypher, { seeded: true, flaggedClaimIds });
  const res = await session.roQuery(cypher, { seeded: true, flaggedClaimIds });
  return (res.data ?? []).map((row) => ({
    conclusion: {
      id: row.conclusionId,
      text: row.conclusionText ?? null,
      reviewKind: 'indirect_evidence_review',
      viaClaimId: row.claimId,
      reviewFlag: {
        kind: 'indirect_evidence_review',
        message: `Conclusion ${String(row.conclusionId)} depends on claim ${String(row.claimId)}, which is directly supported by a publication carrying a verified status notice; indirect review required. Dependency is not automatic falsity — a flag means "needs human review".`,
      },
    },
    dependencyEdge: {
      id: row.dependencyId ?? null,
      provenanceKind: row.dependencyProvenanceKind ?? null,
      rationale: row.dependencyRationale ?? null,
      analysisVersion: row.dependencyAnalysisVersion ?? null,
      scope: row.dependencyScope ?? null,
      confidence: row.dependencyConfidence ?? null,
    },
  }));
}

/**
 * Historical-discussion claims: explicitly excluded from the flagged set
 * (invariant §7.2). Returned for disclosure only.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<Array<{citationUse, claim, publicationId}>>}
 */
async function readHistoricalClaims(session) {
  const cypher = `MATCH (cu:CitationUse)-[e:MENTIONS_HISTORICALLY]->(claim:Claim)
   WHERE cu.seeded = $seeded AND claim.seeded = $seeded AND cu.role = $historical
   MATCH (cu)-[:CITATION_USE_REFERENCES_PUBLICATION]->(pub:Publication)
   WHERE pub.seeded = $seeded
   RETURN cu.id AS citationUseId, cu.role AS citationUseRole, cu.excerpt AS citationUseExcerpt,
          claim.id AS claimId, claim.text AS claimText, claim.location AS claimLocation,
          pub.id AS publicationId
   ORDER BY claimId`;
  assertParameterized(cypher, { seeded: true, historical: 'historical' });
  const res = await session.roQuery(cypher, { seeded: true, historical: 'historical' });
  return (res.data ?? []).map((row) => ({
    citationUse: { id: row.citationUseId, role: row.citationUseRole, excerpt: row.citationUseExcerpt ?? null },
    claim: {
      id: row.claimId,
      text: row.claimText ?? null,
      location: row.claimLocation ?? null,
      reviewKind: 'historical_discussion',
      reviewFlag: {
        kind: 'historical_discussion',
        message: `Claim ${String(row.claimId)} mentions publication ${String(row.publicationId)} historically; historical discussion is not a compromised-support signal and is explicitly excluded from flagged evidence.`,
      },
    },
    publicationId: row.publicationId,
  }));
}

/**
 * Unresolved reference occurrences (disclosure, never propagation).
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<Array<{occurrence, candidates, onlyPossibleMatches}>>}
 */
async function readUnresolvedReferences(session) {
  const unresolvedStates = ['unresolved', 'deferred'];
  const cypher = `MATCH (r:ReferenceOccurrence)
   WHERE r.seeded = $seeded AND r.resolutionState IN $unresolvedStates
   RETURN r.id AS occurrenceId, r.rawText AS rawText, r.resolutionState AS resolutionState,
          r.candidatePublicationIds AS candidatePublicationIds
   ORDER BY occurrenceId`;
  assertParameterized(cypher, { seeded: true, unresolvedStates });
  const res = await session.roQuery(cypher, { seeded: true, unresolvedStates });
  return (res.data ?? []).map((row) => {
    const candidateIds = Array.isArray(row.candidatePublicationIds) ? [...row.candidatePublicationIds] : [];
    const candidates = candidateIds.map((publicationId) => ({
      publicationId,
      matchKind: 'POSSIBLE_MATCH',
      note: 'Candidate only — unverified, non-propagating; does not imply a match or a status issue.',
    }));
    return {
      occurrence: {
        id: row.occurrenceId,
        text: row.rawText ?? null,
        resolutionState: row.resolutionState,
        candidatePublicationIds: candidateIds,
      },
      candidates,
      onlyPossibleMatches: true,
    };
  });
}

/**
 * Case node state (text, kind, review state, flags) for revision pack /
 * annotated manuscript assembly.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} caseId
 * @returns {Promise<{id, text, kind, reviewState, reviewFlags} | null>}
 */
async function readCaseState(session, caseId) {
  const cypher = 'MATCH (n) WHERE n.id = $caseId RETURN n.id AS id, n.text AS text, n.kind AS kind, n.reviewState AS reviewState, n.reviewFlags AS reviewFlags LIMIT 1';
  assertParameterized(cypher, { caseId });
  const res = await session.roQuery(cypher, { caseId });
  const row = res.data?.[0];
  if (!row) return null;
  return {
    id: /** @type {string} */ (row.id),
    text: typeof row.text === 'string' ? row.text : '',
    kind: typeof row.kind === 'string' ? row.kind : undefined,
    reviewState: typeof row.reviewState === 'string' && row.reviewState !== '' ? row.reviewState : 'awaiting_review',
    reviewFlags: Array.isArray(row.reviewFlags) ? [...row.reviewFlags] : [],
  };
}

/**
 * Latest revision proposal for a case (drafts only — never treated as applied).
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} caseId
 * @returns {Promise<{proposalId, caseId, originalText, proposedText, rationale?, status, createdAt, updatedAt, provenanceKind, analysisVersion} | null>}
 */
async function readLatestRevisionProposal(session, caseId) {
  const cypher = `MATCH (p:RevisionProposal)
   WHERE p.caseId = $caseId
   RETURN p.id AS proposalId, p.caseId AS caseId, p.originalText AS originalText, p.proposedText AS proposedText,
          p.rationale AS rationale, p.status AS status, p.createdAt AS createdAt, p.updatedAt AS updatedAt,
          p.provenanceKind AS provenanceKind, p.analysisVersion AS analysisVersion
   ORDER BY p.createdAt DESC LIMIT 1`;
  assertParameterized(cypher, { caseId });
  const res = await session.roQuery(cypher, { caseId });
  const row = res.data?.[0];
  if (!row) return null;
  return {
    proposalId: row.proposalId,
    caseId: row.caseId,
    originalText: row.originalText ?? '',
    proposedText: row.proposedText ?? '',
    rationale: row.rationale ?? undefined,
    status: row.status ?? 'draft',
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    provenanceKind: row.provenanceKind ?? null,
    analysisVersion: row.analysisVersion ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Public data-assembly operations
 * ------------------------------------------------------------------ */

/**
 * Assemble the Evidence Impact Report data structure over real graph
 * records, mirroring `deriveDemoImpact` (src/lib/demoImpact.ts) on the
 * server side.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{caseId?: string | null, format?: string}} options
 * @returns {Promise<{snapshot, integrity, graph, verifiedNotices, affected, historical, unresolved, reviewDecisions, revisionProposals, status, limitations}>}
 */
export async function assembleExportReport(session, { caseId = null, format = 'pdf' } = {}) {
  const graph = await readGraphOverview(session);
  const verifiedNotices = await readVerifiedNotices(session);
  const directClaims = await readDirectAffectedClaims(session);

  const flaggedClaimIds = [...new Set(directClaims.map((c) => c.claim.id))];
  const dependentConclusions = await readDependentConclusions(session, flaggedClaimIds);
  const historicalClaims = await readHistoricalClaims(session);
  const unresolvedRefs = await readUnresolvedReferences(session);

  const reviewDecisions = caseId ? await getReviewDecisionsForCase(session, caseId) : [];
  const latestProposal = caseId ? await readLatestRevisionProposal(session, caseId) : null;

  // Integrity: status is incomplete when open tasks remain (unresolved refs,
  // unreviewed flagged claims, or draft proposals awaiting acceptance).
  const openTaskCount =
    unresolvedRefs.length +
    flaggedClaimIds.length +
    dependentConclusions.length +
    (latestProposal && latestProposal.status === 'draft' ? 1 : 0);
  const status = openTaskCount > 0 ? 'incomplete' : 'complete';

  // Scientific-integrity block: labels + verdict policy.
  const hasSyntheticContent = verifiedNotices.some((v) => v.publication.isSynthetic === true)
    || graph.manuscriptTitle !== undefined; // demo manuscript is synthetic
  const integrity = {
    label: SYNTHETIC_LABEL,
    syntheticContentPresent: hasSyntheticContent,
    verdictPolicy: 'review-flag-means-needs-review-never-validation-or-disproof',
    relationTypePolicy: 'supporting ≠ historical ≠ contrasts ≠ method-reuse ≠ has-status-notice — never conflated',
    historicalExclusion: 'historical-discussion claims are disclosed but never flagged as compromised evidence',
    unresolvedDisclosure: 'unresolved reference occurrences are disclosed as unresolved, never fabricated as resolved',
    fabricatedContent: false,
  };

  const limitations = [
    'This export is a snapshot at generation time; new research does not mutate it and it is not re-verified after generation.',
    'A review flag means "needs human review" — it never certifies, validates, disproves, or vindicate a claim.',
    'Historical-discussion citations to a retracted/corrected publication do not flag the citing claim as compromised.',
    'Unresolved/ambiguous reference matches are disclosed as unresolved; they never propagate into claims or conclusions.',
    'No notice, inaccessible full text, or an empty candidate search never implies reliability or completeness.',
    'Coverage is limited to the seeded demo graph at snapshot time; real-world corpora may contain records not present here.',
  ];

  return {
    snapshot: buildSnapshot(caseId ?? '(unspecified)', format, graph.seedVersion, status),
    integrity,
    graph: {
      seedVersion: graph.seedVersion,
      nodeCount: graph.nodeCount,
      edgeCount: graph.edgeCount,
      manuscriptTitle: graph.manuscriptTitle,
    },
    verifiedNotices,
    affected: {
      claims: directClaims,
      conclusions: dependentConclusions,
    },
    historical: historicalClaims,
    unresolved: unresolvedRefs,
    reviewDecisions: reviewDecisions ?? [],
    revisionProposals: latestProposal ? [latestProposal] : [],
    status,
    limitations,
  };
}

/**
 * Assemble the Revision Pack data structure: original text, proposed text,
 * evidence concern, publication/notice, acceptance status, rationale.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{caseId: string}} options
 * @returns {Promise<{snapshot, integrity, case, originalText, proposedText, rationale, acceptanceStatus, evidenceConcern, publication, notice, limitations}>}
 */
export async function assembleRevisionPack(session, { caseId }) {
  const { caseId: normalizedCaseId } = validateExportCaseId({ caseId });

  const graph = await readGraphOverview(session);
  const caseState = await readCaseState(session, normalizedCaseId);
  if (!caseState) {
    throw new ExportNotFoundError(`No case node found for caseId ${normalizedCaseId}.`);
  }

  const reviewDecisions = await getReviewDecisionsForCase(session, normalizedCaseId);
  const latestDecision = reviewDecisions.length > 0 ? reviewDecisions[reviewDecisions.length - 1] : null;
  const proposal = await readLatestRevisionProposal(session, normalizedCaseId);

  const verifiedNotices = await readVerifiedNotices(session);
  const directClaims = await readDirectAffectedClaims(session);
  const flaggedClaimIds = [...new Set(directClaims.map((c) => c.claim.id))];

  // Evidence concern: tie the case to its verified-notice context if it is a
  // flagged claim, otherwise disclose that no direct evidence concern is
  // recorded (never fabricate one).
  const evidenceConcern = {
    caseId: normalizedCaseId,
    caseKind: caseState.kind,
    isFlaggedClaim: flaggedClaimIds.includes(normalizedCaseId),
    latestReviewDecision: latestDecision ?? null,
    noticeContext: verifiedNotices.length > 0 ? verifiedNotices[0] : null,
    disclosure: latestDecision
      ? `Review decision "${String(latestDecision.outcome)}" recorded ${String(latestDecision.decidedAt)}; this means "needs human review" — never a scientific verdict.`
      : 'No review decision recorded for this case; no evidence concern is implied.',
  };

  const acceptanceStatus = proposal ? proposal.status : 'none';
  const openTaskCount =
    (proposal && proposal.status === 'draft' ? 1 : 0) +
    (reviewDecisions.filter((d) => d.outcome === 'revision_needed' || d.outcome === 'more_evidence_needed').length);
  const status = openTaskCount > 0 ? 'incomplete' : 'complete';

  const integrity = {
    label: SYNTHETIC_LABEL,
    syntheticContentPresent: true, // demo manuscript/case content is synthetic
    verdictPolicy: 'review-flag-means-needs-review-never-validation-or-disproof',
    relationTypePolicy: 'supporting ≠ historical ≠ contrasts ≠ method-reuse ≠ has-status-notice — never conflated',
    fabricatedContent: false,
  };

  const limitations = [
    'Original claim/conclusion text is immutable; this pack never modifies it.',
    'A revision proposal is status "draft" until a human accepts it; copying is not applying.',
    'A review flag means "needs human review" — never "disproven/proven".',
    'This pack is a snapshot at generation time; it is not re-verified after generation.',
  ];

  return {
    snapshot: buildSnapshot(normalizedCaseId, 'docx', graph.seedVersion, status),
    integrity,
    case: {
      id: caseState.id,
      text: caseState.text,
      kind: caseState.kind,
      reviewState: caseState.reviewState,
      reviewFlags: caseState.reviewFlags,
    },
    originalText: caseState.text,
    proposedText: proposal ? proposal.proposedText : null,
    rationale: proposal ? proposal.rationale : null,
    acceptanceStatus,
    evidenceConcern,
    publication: verifiedNotices.length > 0 ? verifiedNotices[0].publication : null,
    notice: verifiedNotices.length > 0 ? verifiedNotices[0].notice : null,
    limitations,
  };
}

/**
 * Assemble the Annotated Manuscript data structure: passages with
 * annotations, notices, review statuses.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{caseId?: string | null}} options
 * @returns {Promise<{snapshot, integrity, manuscriptTitle, passages, notices, reviewStatuses, limitations}>}
 */
export async function assembleAnnotatedManuscript(session, { caseId = null } = {}) {
  const graph = await readGraphOverview(session);
  const verifiedNotices = await readVerifiedNotices(session);
  const directClaims = await readDirectAffectedClaims(session);
  const flaggedClaimIds = [...new Set(directClaims.map((c) => c.claim.id))];
  const historicalClaims = await readHistoricalClaims(session);
  const unresolvedRefs = await readUnresolvedReferences(session);

  // Build passage annotations: every claim node gets an annotation block
  // carrying its review status (flagged / historical / unresolved-context /
  // none).
  const passageById = new Map();
  for (const claim of directClaims) {
    passageById.set(claim.claim.id, {
      id: claim.claim.id,
      text: claim.claim.text,
      location: claim.claim.location,
      kind: 'claim',
      annotations: [
        {
          type: 'evidence_review',
          reviewKind: 'direct_evidence_review',
          viaPublicationId: claim.publication.id,
          viaNoticeId: claim.notice.id,
          noticeType: claim.notice.noticeType,
          reviewStatus: 'flagged_for_review',
          message: claim.claim.reviewFlag.message,
        },
      ],
    });
  }
  for (const conclusion of await readDependentConclusions(session, flaggedClaimIds)) {
    passageById.set(conclusion.conclusion.id, {
      id: conclusion.conclusion.id,
      text: conclusion.conclusion.text,
      location: null,
      kind: 'conclusion',
      annotations: [
        {
          type: 'evidence_review',
          reviewKind: 'indirect_evidence_review',
          viaClaimId: conclusion.conclusion.viaClaimId,
          reviewStatus: 'flagged_for_review_indirect',
          message: conclusion.conclusion.reviewFlag.message,
        },
      ],
    });
  }
  for (const historical of historicalClaims) {
    passageById.set(historical.claim.id, {
      id: historical.claim.id,
      text: historical.claim.text,
      location: historical.claim.location,
      kind: 'claim',
      annotations: [
        {
          type: 'historical_discussion',
          reviewKind: 'historical_discussion',
          viaPublicationId: historical.publicationId,
          reviewStatus: 'not_flagged_historical',
          message: historical.claim.reviewFlag.message,
        },
      ],
    });
  }
  for (const unresolved of unresolvedRefs) {
    // Reference occurrences are not claims, but disclose them as unresolved
    // annotations so they are visible in the manuscript context.
    passageById.set(unresolved.occurrence.id, {
      id: unresolved.occurrence.id,
      text: unresolved.occurrence.text,
      location: null,
      kind: 'reference_occurrence',
      annotations: [
        {
          type: 'unresolved_reference',
          reviewStatus: 'unresolved',
          message: `Reference occurrence ${String(unresolved.occurrence.id)} is ${String(unresolved.occurrence.resolutionState)}; candidates are POSSIBLE_MATCH only, non-propagating, and never treated as a confirmed match or status issue.`,
        },
      ],
    });
  }

  // Review decisions + proposals keyed by case id for the statuses block.
  const reviewStatuses = {};
  if (caseId) {
    const decisions = await getReviewDecisionsForCase(session, caseId);
    const proposal = await readLatestRevisionProposal(session, caseId);
    reviewStatuses[caseId] = {
      caseId,
      decisions,
      latestProposal: proposal ?? null,
    };
  }

  const status = passageById.size > 0 ? 'incomplete' : 'complete';
  const integrity = {
    label: SYNTHETIC_LABEL,
    syntheticContentPresent: true,
    verdictPolicy: 'review-flag-means-needs-review-never-validation-or-disproof',
    relationTypePolicy: 'supporting ≠ historical ≠ contrasts ≠ method-reuse ≠ has-status-notice — never conflated',
    fabricatedContent: false,
  };

  const limitations = [
    'Annotations reflect review state at snapshot time only; they are not scientific certifications.',
    'Historical-discussion annotations are explicitly not flagged as compromised evidence.',
    'Unresolved references are disclosed as unresolved, never fabricated as resolved.',
    'This annotated manuscript is a snapshot; old exports are not silently mutated.',
  ];

  return {
    snapshot: buildSnapshot(caseId ?? '(unspecified)', 'pdf-or-html', graph.seedVersion, status),
    integrity,
    manuscriptTitle: graph.manuscriptTitle,
    passages: [...passageById.values()],
    notices: verifiedNotices.map((v) => v.notice),
    reviewStatuses,
    limitations,
  };
}


