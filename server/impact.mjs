/**
 * @aftershock/server — impact traversals (M2 reading layer)
 *
 * Server-side-only read/write helpers on top of `graphClient` that expose the
 * core impact semantics distinguishing support / historical / unresolved
 * (M2 → M3 groundwork). Every function takes a bound `GraphSession`
 * (`connectFromEnv()` result) and operates on `session.graphName` — no
* module talks to any other graph.
 *
 * Honesty invariants honored here (DATA_CONTRACTS §7, AGENTS.md):
 * 1. A verified retracted study reached via a supporting citation flags its
 *    claim and every dependent conclusion for *human review* — never a
 *    "disproven" verdict.
 * 2. Historical-discussion citation to the same study does not flag its
 *    claim.
 * 3. Unresolved reference candidates stay `POSSIBLE_MATCH`-only and never
 *    propagate; a Skip records `deferred`, which remains non-resolved.
 */

import { FIXTURE_IDS, RESOLUTION_STATES } from './contract.mjs';
import { defaultFixture, expectedCountsFor, readSeedMeta } from './seed.mjs';

/**
 * @typedef {Object} SeedStatus
 * @property {string} graphName
 * @property {boolean} graphExists
 * @property {boolean} seeded
 * @property {string | null} seedVersion
 * @property {string | null} seededAt
 * @property {string | null} fixtureId
 * @property {number} nodeCount
 * @property {number} edgeCount
 * @property {Record<string, number>} nodesByLabel
 * @property {Record<string, number>} edgesByType
 * @property {{nodes: number, edges: number, nodesByLabel: Record<string, number>, edgesByType: Record<string, number>}} expected
 * @property {boolean} upToDate
 */

/**
 * Status of the seeded demo subgraph in the session's graph. Purely read-side
 * (roQuery only); safe against graphs that were wiped between calls because a
 * missing graph reports "not seeded" instead of throwing.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {Record<string, unknown>} [fixture] defaults to the guided-demo fixture
 * @returns {Promise<SeedStatus>}
 */
export async function getSeedStatus(session, fixture = defaultFixture()) {
  const graphName = session.graphName;
  const graphExists = await session.graphExists();
  if (!graphExists) {
    return {
      graphName,
      graphExists: false,
      seeded: false,
      seedVersion: null,
      seededAt: null,
      fixtureId: null,
      nodeCount: 0,
      edgeCount: 0,
      nodesByLabel: {},
      edgesByType: {},
      expected: expectedCountsFor(fixture),
      upToDate: false,
    };
  }

  const meta = await readSeedMeta(session);
  const [nodesRes, edgesRes] = await Promise.all([
    session.roQuery('MATCH (n) WHERE n.seeded = $seeded RETURN count(n) AS c', { seeded: true }),
    session.roQuery('MATCH ()-[r]->() WHERE r.seeded = $seeded RETURN count(r) AS c', { seeded: true }),
  ]);
  const [labelRes, typeRes] = await Promise.all([
    session.roQuery('MATCH (n) WHERE n.seeded = $seeded RETURN n.primaryLabel AS label, count(*) AS c', { seeded: true }),
    session.roQuery('MATCH ()-[r]->() WHERE r.seeded = $seeded RETURN type(r) AS label, count(*) AS c', { seeded: true }),
  ]);

  /** @type {Record<string, number>} */
  const nodesByLabel = {};
  for (const row of /** @type {Array<Record<string, unknown>>} */ (labelRes.data ?? [])) {
    nodesByLabel[/** @type {string} */ (row.label)] = Number(row.c);
  }
  /** @type {Record<string, number>} */
  const edgesByType = {};
  for (const row of /** @type {Array<Record<string, unknown>>} */ (typeRes.data ?? [])) {
    edgesByType[/** @type {string} */ (row.label)] = Number(row.c);
  }

  const nodeCount = Number(nodesRes.data?.[0]?.c ?? 0);
  const edgeCount = Number(edgesRes.data?.[0]?.c ?? 0);
  const expected = expectedCountsFor(fixture);
  const seeded = nodeCount > 0 && Boolean(meta.seedVersion);
  const upToDate = seeded
    && meta.seedVersion === fixture.fixtureVersion
    && nodeCount === expected.nodes
    && edgeCount === expected.edges;

  return {
    graphName,
    graphExists: true,
    seeded,
    seedVersion: meta.seedVersion,
    seededAt: meta.seededAt,
    fixtureId: meta.fixtureId,
    nodeCount,
    edgeCount,
    nodesByLabel,
    edgesByType,
    expected,
    upToDate,
  };
}

/**
 * @typedef {Object} VerifiedNoticeRecord
 * @property {{id: string, doi: string | null, title: string | null, isSynthetic: boolean | null}} publication
 * @property {{id: string, noticeType: string, verified: boolean, publishedDate: string | null, sourceUrl: string | null, lastVerifiedAt: string | null}} notice
 * @property {{provenanceKind: string, rationale: string | null, sourcePointer: string | null, analysisVersion: string | null}} edge
 * @property {{kind: 'verified_notice_requiring_review', message: string}} reviewFlag
 */

/**
 * All publications with a *verified* status notice (e.g. the Mehra retraction)
 * plus the notice itself and the provenance of the connecting edge.
 * Every record here is a review trigger input: a record never implies a
 * verdict about manuscript correctness, only "needs human review".
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<VerifiedNoticeRecord[]>}
 */
export async function verifiedNotices(session) {
  const res = await session.roQuery(
    `MATCH (p:Publication)-[e:PUBLICATION_HAS_NOTICE]->(n:SourceNotice)
     WHERE n.verified = $verified
     RETURN p.id AS publicationId, p.doi AS publicationDoi, p.title AS publicationTitle, p.isSynthetic AS isSynthetic,
            n.id AS noticeId, n.noticeType AS noticeType, n.publishedDate AS publishedDate,
            n.sourceUrl AS sourceUrl, n.lastVerifiedAt AS lastVerifiedAt,
            e.provenanceKind AS edgeProvenanceKind, e.rationale AS edgeRationale,
            e.sourcePointer AS edgeSourcePointer, e.analysisVersion AS edgeAnalysisVersion
     ORDER BY p.id`,
    { verified: true },
  );
  return /** @type {Array<any>} */ (res.data ?? []).map((row) => ({
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
      message: `Verified ${String(row.noticeType)} notice for publication ${String(row.publicationId)}; any directly supported passage may need evidence review.`,
    },
  }));
}

/**
 * @typedef {Object} ImpactPathRecord
 * @property {{id: string, doi: string | null, isSynthetic: unknown}} publication
 * @property {{id: string, noticeType: string, publishedDate: string | null, sourceUrl: string | null}} notice
 * @property {{id: string, role: string, excerpt: string | null}} citationUse
 * @property {{id: string, status: string | null, text: string | null, reviewFlag: {kind: 'direct_evidence_review' | 'indirect_evidence_review', message: string}}} claim
 * @property {({id: string, text: string | null} | null)} conclusion
 * @property {({id: string, provenanceKind: string, rationale: string | null, analysisVersion: string | null, scope: string | null, confidence: unknown} | null)} dependencyEdge
 * @property {string[]} path provenance-link chosen for the report: publication → … → (claim → conclusion?)
 */

/**
 * The core impact path: verified notice → publication → supporting citation
 * use → claim → (optional) dependent conclusion. This is the M2 traversal
 * behind "direct evidence review" and "indirect evidence review required"
 * flags (invariant §7.1). Read-only.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<ImpactPathRecord[]>}
 */
export async function impactPathFromSupportedClaims(session) {
  const res = await session.roQuery(
    `MATCH (p:Publication)-[:PUBLICATION_HAS_NOTICE]->(n:SourceNotice)
     WHERE p.isSynthetic = $recordIsReal AND n.verified = $verified
     MATCH (cu:CitationUse)-[:CITATION_USE_REFERENCES_PUBLICATION]->(p)
     WHERE cu.role = $supporting
     MATCH (cu)-[:CITATION_USE_SUPPORTS_CLAIM]->(claim:Claim)
     OPTIONAL MATCH (conclusion:Conclusion)-[dep:CONCLUSION_DEPENDS_ON_CLAIM]->(claim)
     RETURN p.id AS publicationId, p.doi AS publicationDoi, p.isSynthetic AS isSynthetic,
            n.id AS noticeId, n.noticeType AS noticeType, n.publishedDate AS publishedDate, n.sourceUrl AS sourceUrl,
            cu.id AS citationUseId, cu.role AS citationUseRole, cu.excerpt AS citationUseExcerpt,
            claim.id AS claimId, claim.status AS claimStatus, claim.text AS claimText,
            conclusion.id AS conclusionId, conclusion.text AS conclusionText,
            dep.id AS dependencyId, dep.provenanceKind AS dependencyProvenanceKind,
            dep.rationale AS dependencyRationale, dep.analysisVersion AS dependencyAnalysisVersion,
            dep.scope AS dependencyScope, dep.confidence AS dependencyConfidence
     ORDER BY claimId, conclusionId`,
    { recordIsReal: false, verified: true, supporting: 'supporting' },
  );

  return /** @type {Array<any>} */ (res.data ?? []).map((row) => {
    const hasConclusion = row.conclusionId !== null && row.conclusionId !== undefined;
    return {
      publication: { id: row.publicationId, doi: row.publicationDoi ?? null, isSynthetic: row.isSynthetic },
      notice: {
        id: row.noticeId,
        noticeType: row.noticeType,
        publishedDate: row.publishedDate ?? null,
        sourceUrl: row.sourceUrl ?? null,
      },
      citationUse: { id: row.citationUseId, role: row.citationUseRole, excerpt: row.citationUseExcerpt ?? null },
      claim: {
        id: row.claimId,
        status: row.claimStatus ?? null,
        text: row.claimText ?? null,
        reviewFlag: {
          kind: hasConclusion ? 'indirect_evidence_review' : 'direct_evidence_review',
          message: hasConclusion
            ? `Conclusion ${String(row.conclusionId)} depends on claim ${String(row.claimId)}, which is directly supported by the cited publication through a verified status notice; review required.`
            : `Claim ${String(row.claimId)} is directly supported by the cited publication through a verified status notice; review required.`,
        },
      },
      conclusion: hasConclusion ? { id: row.conclusionId, text: row.conclusionText ?? null } : null,
      dependencyEdge: hasConclusion
        ? {
            id: row.dependencyId ?? null,
            provenanceKind: row.dependencyProvenanceKind ?? null,
            rationale: row.dependencyRationale ?? null,
            analysisVersion: row.dependencyAnalysisVersion ?? null,
            scope: row.dependencyScope ?? null,
            confidence: row.dependencyConfidence,
          }
        : null,
      path: hasConclusion
        ? [row.noticeId, row.publicationId, row.citationUseId, row.claimId, row.conclusionId]
        : [row.noticeId, row.publicationId, row.citationUseId, row.claimId],
    };
  });
}

/**
 * @typedef {Object} HistoricalSafetyResult
 * @property {boolean} safe true when no historical-discussion claim leaks into the flagged impact path
 * @property {Array<{citationUseId: string, claimId: string, excerpt: string | null}>} historicalUses
 * @property {string[]} flaggedClaimIds claims flagged by the support path (invariant §7.1)
 * @property {string[]} historicalClaimIds claims carried by historical-discussion citation uses
 * @property {string[]} leakedClaimIds intersection — expected to stay empty
 * @property {{historicalRoleWithoutSupportEdge: boolean}} consistencyChecks
 */

/**
 * Invariant §7.2 check: a historical-discussion citation to a publication
 * carrying a verified notice must NOT put its claim into the flagged impact
 * path. Read-only.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<HistoricalSafetyResult>}
 */
export async function historicalSafetyCheck(session) {
  const [flagged, histRes, misclassifiedRes] = await Promise.all([
    impactPathFromSupportedClaims(session),
    session.roQuery(
      `MATCH (cu:CitationUse)-[e:MENTIONS_HISTORICALLY]->(claim:Claim)
       WHERE cu.role = $historical
       RETURN cu.id AS citationUseId, claim.id AS claimId, cu.excerpt AS excerpt
       ORDER BY citationUseId`,
      { historical: 'historical' },
    ),
    session.roQuery(
      `MATCH (cu:CitationUse)-[:CITATION_USE_SUPPORTS_CLAIM]->(claim:Claim)
       WHERE cu.role = $historical
       RETURN count(*) AS c`,
      { historical: 'historical' },
    ),
  ]);

  const flaggedClaimIds = [...new Set(flagged.map((r) => r.claim.id))];
  const historicalUses = /** @type {Array<any>} */ (histRes.data ?? []).map((row) => ({
    citationUseId: row.citationUseId,
    claimId: row.claimId,
    excerpt: row.excerpt ?? null,
  }));
  const historicalClaimIds = [...new Set(historicalUses.map((u) => u.claimId))];
  const leakedClaimIds = historicalClaimIds.filter((id) => flaggedClaimIds.includes(id));
  const historicalRoleWithoutSupportEdge = Number(misclassifiedRes.data?.[0]?.c ?? 0) === 0;

  return {
    safe: leakedClaimIds.length === 0,
    historicalUses,
    flaggedClaimIds,
    historicalClaimIds,
    leakedClaimIds,
    consistencyChecks: { historicalRoleWithoutSupportEdge },
  };
}

/**
 * @typedef {Object} UnresolvedNonPropagationResult
 * @property {boolean} safe true when the occurrence stays non-resolved, keeps zero confirmed matches and no path into claims/conclusions
 * @property {{occurrenceId: string, resolutionState: string, rawText: string | null, candidatePublicationIds: string[]}} occurrence
 * @property {Array<{publicationId: string, isSynthetic: unknown, provenanceKind: string, matchConfidence: unknown, rationale: string | null}>} candidates
 * @property {{confirmedMatchCount: number, propagationPathCount: number, candidateDerivativePathCount: number}} counts
 */

/**
 * Invariant §7.3 check for an ambiguous reference occurrence (default:
 * `ref-lee-2020`): candidates remain POSSIBLE_MATCH (unresolved), there is no
 * confirmed match edge and no traversal path from the occurrence or its
 * candidates into claims or conclusions. Read-only.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} [occurrenceId]
 * @returns {Promise<UnresolvedNonPropagationResult>}
 */
export async function unresolvedNonPropagationCheck(session, occurrenceId = FIXTURE_IDS.referenceOccurrence) {
  const occRes = await session.roQuery(
    'MATCH (r:ReferenceOccurrence) WHERE r.id = $id RETURN r.resolutionState AS resolutionState, r.rawText AS rawText, r.candidatePublicationIds AS candidatePublicationIds',
    { id: occurrenceId },
  );
  const occRow = occRes.data?.[0];
  if (!occRow) {
    throw new Error(`Reference occurrence ${JSON.stringify(occurrenceId)} not found in graph ${session.graphName}.`);
  }

  const [candRes, confirmedRes, occPropRes] = await Promise.all([
    session.roQuery(
      `MATCH (r:ReferenceOccurrence)-[e:POSSIBLE_MATCH]->(p:Publication)
       WHERE r.id = $id
       RETURN p.id AS publicationId, p.isSynthetic AS isSynthetic, e.provenanceKind AS provenanceKind,
              e.matchConfidence AS matchConfidence, e.rationale AS rationale
       ORDER BY publicationId`,
      { id: occurrenceId },
    ),
    session.roQuery(
      'MATCH (r:ReferenceOccurrence)-[:OCCURRENCE_MATCHES_PUBLICATION]->(p:Publication) WHERE r.id = $id RETURN count(*) AS c',
      { id: occurrenceId },
    ),
    session.roQuery(
      `MATCH (r:ReferenceOccurrence)-[*1..6]->(t)
       WHERE r.id = $id AND (t:Claim OR t:Conclusion)
       RETURN count(*) AS c`,
      { id: occurrenceId },
    ),
  ]);

  const candidates = /** @type {Array<any>} */ (candRes.data ?? []).map((row) => ({
    publicationId: row.publicationId,
    isSynthetic: row.isSynthetic,
    provenanceKind: row.provenanceKind ?? null,
    matchConfidence: row.matchConfidence ?? null,
    rationale: row.rationale ?? null,
  }));

  // Candidate publications themselves must not carry any path into claims/conclusions either.
  const candidateIds = candidates.map((c) => c.publicationId);
  const candPropRes = candidateIds.length
    ? await session.roQuery(
        `MATCH (p:Publication)-[*1..6]->(t)
         WHERE p.id IN $candidateIds AND (t:Claim OR t:Conclusion)
         RETURN count(*) AS c`,
        { candidateIds },
      )
    : { data: [{ c: 0 }] };

  const resolutionState = /** @type {string} */ (occRow.resolutionState);
  const confirmedMatchCount = Number(confirmedRes.data?.[0]?.c ?? 0);
  const propagationPathCount = Number(occPropRes.data?.[0]?.c ?? 0);
  const candidateDerivativePathCount = Number(/** @type {Record<string, unknown>} */ (candPropRes.data?.[0] ?? {}).c ?? 0);

  return {
    safe: confirmedMatchCount === 0
      && propagationPathCount === 0
      && candidateDerivativePathCount === 0
      && RESOLUTION_STATES.includes(/** @type {'unresolved'} */ (resolutionState))
      && (resolutionState === 'unresolved' || resolutionState === 'deferred'),
    occurrence: {
      occurrenceId: /** @type {string} */ (occurrenceId),
      resolutionState,
      rawText: occRow.rawText ?? null,
      candidatePublicationIds: /** @type {string[]} */ (occRow.candidatePublicationIds ?? []),
    },
    candidates,
    counts: { confirmedMatchCount, propagationPathCount, candidateDerivativePathCount },
  };
}

/**
 * Record a human "Skip" on an ambiguous reference occurrence: the resolution
 * state moves to `deferred` — still non-resolved per contract §4, so the
 * non-propagation invariant keeps holding (allowed states: unresolved,
 * deferred — both are safe states in unresolvedNonPropagationCheck).
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} occurrenceId
 * @param {{reason?: string, now?: Date | string}} [options]
 * @returns {Promise<{deferred: boolean, resolutionState: string | null, occurrenceId: string}>}
 */
export async function deferReferenceOccurrence(session, occurrenceId, options = {}) {
  const deferable = ['unresolved', 'deferred'];
  const reason = options.reason ?? 'Skipped by reviewer — ambiguous match intentionally left unresolved (demo-guided defer).';
  const ts = options.now instanceof Date
    ? options.now.toISOString()
    : typeof options.now === 'string' ? new Date(options.now).toISOString() : new Date().toISOString();

  const res = await session.writeQuery(
    `MATCH (r:ReferenceOccurrence)
     WHERE r.id = $id AND r.resolutionState IN $deferableStates
     SET r.resolutionState = $deferred, r.deferredReason = $reason, r.updatedAt = $ts
     RETURN r.id AS id, r.resolutionState AS resolutionState`,
    { id: occurrenceId, deferableStates: deferable, deferred: 'deferred', reason, ts },
  );
  const row = res.data?.[0];
  return {
    deferred: Boolean(row?.resolutionState),
    resolutionState: (row?.resolutionState ?? null),
    occurrenceId: /** @type {string} */ ((row?.id) ?? occurrenceId),
  };
}
