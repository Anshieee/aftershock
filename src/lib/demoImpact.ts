/**
 * Client-side derivation of the guided-demo impact story from REAL graph
 * API data (src/lib/api.ts `getGraphOverview`).
 *
 * Hard rules honored:
 * - Uses only returned node/edge records — no fixture constants drive the
 *   numbers displayed, only their interpretation. If the API is silent the
 *   UI shows "not recorded", never an invented count (AGENTS.md integrity).
 * - Never conflates relation types: supporting ≠ historical ≠ possible
 *   match ≠ status notice (DATA_CONTRACTS §2).
 * - A flag always means "needs human review", never "disproven" (§7).
 */

import type { GraphEdge, GraphNode, GraphOverview } from './api';

export interface VerifiedNoticeItem {
  noticeId: string;
  noticeType: string;
  verified: boolean | undefined;
  publishedDate?: string;
  noticeAnnouncementDate?: string;
  noticeRecordedDate?: string;
  sourceUrl?: string;
  publicationId?: string;
  title?: string;
}

export interface AffectedItem {
  id: string;
  kind: 'claim' | 'conclusion';
  /** Direct support of the retracted source, or indirect via a depended claim. */
  reviewKind: 'direct_evidence_review' | 'indirect_evidence_review';
  /** The verified-notice publication triggering this review. */
  viaPublicationId: string;
  /** Citation use whose supporting role connects the claim to the publication. */
  viaCitationUseId?: string;
  /** For indirect reviews: the flagged claim the conclusion depends on. */
  viaClaimId?: string;
  text?: string;
}

export interface HistoricalItem {
  id: string;
  text?: string;
  viaCitationUseId?: string;
  viaPublicationId: string;
}

export interface UnresolvedItem {
  id: string;
  text?: string;
  resolutionState?: string;
  candidateIds: string[];
  /** True when every candidate connection is an unverified POSSIBLE_MATCH edge. */
  onlyPossibleMatches: boolean;
}

export interface DemoImpact {
  /** Counts describe exactly what the server returned, nothing more. */
  nodeCount: number;
  edgeCount: number;
  seedVersion?: string;
  verifiedNotices: VerifiedNoticeItem[];
  affected: AffectedItem[];
  historical: HistoricalItem[];
  unresolved: UnresolvedItem[];
  syntheticEntityCount: number;
  realEntityCount: number;
}

function prop(node: GraphNode, key: string): unknown {
  return node.properties[key];
}

function optionalText(node: GraphNode, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = node.properties[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Derives the demo impact story. This is a graph traversal over the returned
 * records mirroring the server-side impact module semantics:
 * verified notice → publication → supporting citation use → claim →
 * dependent conclusion, while historical mentions and unresolved possible
 * matches never join the flagged set.
 */
export function deriveDemoImpact(overview: GraphOverview): DemoImpact {
  const { nodes, edges } = overview;

  const nodeById = new Map<string, GraphNode>(nodes.map((node) => [node.id, node]));

  const isEdgeOfType = (edge: GraphEdge, type: string) => edge.type === type;

  // §7.1 step 1: notices attached to publications via PUBLICATION_HAS_NOTICE,
  // treated as verified only when the notice record itself is marked verified.
  const verifiedNotices: VerifiedNoticeItem[] = [];
  const verifiedPublications = new Set<string>();
  for (const edge of edges) {
    if (!isEdgeOfType(edge, 'PUBLICATION_HAS_NOTICE')) continue;
    const notice = nodeById.get(edge.toId);
    if (!notice || notice.kind !== 'SourceNotice') continue;
    const verified = prop(notice, 'verified');
    if (verified === true) {
      if (edge.fromId) verifiedPublications.add(edge.fromId);
      verifiedNotices.push({
        noticeId: notice.id,
        noticeType: String(prop(notice, 'noticeType') ?? 'unknown'),
        verified: true,
        publishedDate: optionalText(notice, ['publishedDate']),
        noticeAnnouncementDate: optionalText(notice, ['noticeAnnouncementDate']),
        noticeRecordedDate: optionalText(notice, ['noticeRecordedDate']),
        sourceUrl: optionalText(notice, ['sourceUrl']),
        publicationId: edge.fromId,
        title: optionalText(notice, ['title']),
      });
    }
  }

  // §7.1 step 2–3: affected claims come only from a citation use whose
  // CITATION_USE_SUPPORTS_CLAIM edge lands on the claim AND whose referenced
  // publication carries a verified notice.
  const affected: AffectedItem[] = [];
  const affectedClaimIds = new Set<string>();
  const referencesPublication = new Map<string, string>(); // citationUseId -> publicationId
  for (const edge of edges) {
    if (!isEdgeOfType(edge, 'CITATION_USE_REFERENCES_PUBLICATION')) continue;
    if (!edge.fromId || !edge.toId) continue;
    // Only target publications with a verified notice — does not conflate
    // any other edge semantics into this map.
    referencesPublication.set(edge.fromId, edge.toId);
  }

  for (const edge of edges) {
    if (!isEdgeOfType(edge, 'CITATION_USE_SUPPORTS_CLAIM')) continue;
    const citationUse = nodeById.get(edge.fromId);
    const claim = nodeById.get(edge.toId);
    if (!citationUse || citationUse.kind !== 'CitationUse') continue;
    if (!claim || claim.kind !== 'Claim') continue;
    const publicationId = referencesPublication.get(citationUse.id);
    if (!publicationId || !verifiedPublications.has(publicationId)) continue;
    if (affectedClaimIds.has(claim.id)) continue;
    affectedClaimIds.add(claim.id);
    affected.push({
      id: claim.id,
      kind: 'claim',
      reviewKind: 'direct_evidence_review',
      viaPublicationId: publicationId,
      viaCitationUseId: citationUse.id,
      text: optionalText(claim, ['text', 'excerpt']),
    });
  }

  // §7.2: historical mentions of the same publication must NOT flag their claim.
  const historical: HistoricalItem[] = [];
  for (const edge of edges) {
    if (!isEdgeOfType(edge, 'MENTIONS_HISTORICALLY')) continue;
    const citationUse = nodeById.get(edge.fromId);
    const claim = nodeById.get(edge.toId);
    if (!citationUse || citationUse.kind !== 'CitationUse') continue;
    if (!claim || claim.kind !== 'Claim') continue;
    if (affectedClaimIds.has(claim.id)) continue; // integrity guard
    const publicationId = referencesPublication.get(citationUse.id);
    if (!publicationId || !verifiedPublications.has(publicationId)) continue;
    historical.push({
      id: claim.id,
      text: optionalText(claim, ['text', 'excerpt']),
      viaCitationUseId: citationUse.id,
      viaPublicationId: publicationId,
    });
  }

  // §7.1 step 4: conclusions depending on a flagged claim inherit an
  // indirect review requirement — never automatic falsity.
  for (const edge of edges) {
    if (!isEdgeOfType(edge, 'CONCLUSION_DEPENDS_ON_CLAIM')) continue;
    const conclusion = nodeById.get(edge.fromId);
    const claim = nodeById.get(edge.toId);
    if (!conclusion || conclusion.kind !== 'Conclusion') continue;
    if (!claim || !affectedClaimIds.has(claim.id)) continue;
    const publicationId =
      affected.find((item) => item.kind === 'claim' && item.id === claim.id)?.viaPublicationId ??
      '';
    affected.push({
      id: conclusion.id,
      kind: 'conclusion',
      reviewKind: 'indirect_evidence_review',
      viaPublicationId: publicationId,
      viaClaimId: claim.id,
      text: optionalText(conclusion, ['text']),
    });
  }

  // §7.3: unresolved reference occurrences with their candidate records.
  const unresolved: UnresolvedItem[] = [];
  for (const node of nodes) {
    if (node.kind !== 'ReferenceOccurrence') continue;
    const resolutionState = prop(node, 'resolutionState');
    const isUnresolvedState = resolutionState === 'unresolved' || resolutionState === 'deferred';
    const candidateIds: string[] = [];
    let hasConfirmedMatch = false;
    for (const edge of edges) {
      if (edge.fromId !== node.id) continue;
      if (isEdgeOfType(edge, 'POSSIBLE_MATCH')) {
        candidateIds.push(edge.toId);
      } else if (isEdgeOfType(edge, 'OCCURRENCE_MATCHES_PUBLICATION')) {
        // A confirmed match edge means this is resolved, not unresolved.
        hasConfirmedMatch = true;
      }
    }
    if (hasConfirmedMatch && !isUnresolvedState) continue;
    // Every kind of unresolved state here relies on possible matches only.
    if (isUnresolvedState || candidateIds.length > 0) {
      unresolved.push({
        id: node.id,
        text: optionalText(node, ['rawText', 'text']),
        resolutionState: typeof resolutionState === 'string' ? resolutionState : undefined,
        candidateIds,
        onlyPossibleMatches: hasConfirmedMatch === false,
      });
    }
  }

  // Synthetic-vs-real attribution stays explicit on every record family.
  let syntheticEntityCount = 0;
  let realEntityCount = 0;
  for (const node of nodes) {
    if (node.kind === 'SeedMeta') continue;
    if (node.isSynthetic === true) syntheticEntityCount += 1;
    else if (node.isSynthetic === false) realEntityCount += 1;
  }

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    seedVersion: overview.seedVersion,
    verifiedNotices,
    affected,
    historical,
    unresolved,
    syntheticEntityCount,
    realEntityCount,
  };
}
