import { graphEdges, graphNodes } from './graph';
import { documents, findings } from './investigations';
import { anchorSpecs } from './manuscriptContent';
import type { EdgeFamily, FindingKind, GraphEdgeRecord, GraphNodeRecord, RelationKind } from './types';

export * from './types';
export { graphEdges, graphNodes } from './graph';
export {
  activity,
  documents,
  findings,
  reviewDecisions,
  revisionProposals,
} from './investigations';
export { anchorSpecs, manuscript } from './manuscriptContent';

/* ------------------------------------------------------------------ *
 * Derived lookups
 * ------------------------------------------------------------------ */

export const nodeById = new Map<string, GraphNodeRecord>(graphNodes.map((n) => [n.id, n]));
export const edgeById = new Map<string, GraphEdgeRecord>(graphEdges.map((e) => [e.id, e]));
export const documentById = new Map(documents.map((d) => [d.id, d]));
export const anchorById = new Map(anchorSpecs.map((a) => [a.id, a]));

export function findingsForDocument(documentId: string) {
  return findings.filter((f) => f.documentId === documentId);
}

/**
 * The connected component of the prepared graph reachable from a document.
 * The graph view never expands on click — this is the complete network the
 * investigation contains, computed once.
 */
export function graphComponentForDocument(documentId: string): {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
} {
  const adjacency = new Map<string, Set<string>>();
  const push = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const edge of graphEdges) {
    push(edge.fromId, edge.toId);
    push(edge.toId, edge.fromId);
  }
  const seen = new Set<string>([documentId]);
  const queue = [documentId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return {
    nodes: graphNodes.filter((n) => seen.has(n.id)),
    edges: graphEdges.filter((e) => seen.has(e.fromId) && seen.has(e.toId)),
  };
}

/* ------------------------------------------------------------------ *
 * Relation semantics
 * ------------------------------------------------------------------ */

const EDGE_FAMILY: Record<RelationKind, EdgeFamily> = {
  DOCUMENT_HAS_VERSION: 'structural',
  DOCUMENT_HAS_REFERENCE: 'structural',
  OCCURRENCE_MATCHES_PUBLICATION: 'confirmed',
  POSSIBLE_MATCH: 'uncertain',
  PUBLICATION_HAS_NOTICE: 'notice',
  CLAIM_HAS_CITATION_USE: 'structural',
  CITATION_USE_REFERENCES_PUBLICATION: 'structural',
  CITATION_USE_SUPPORTS_CLAIM: 'support',
  MENTIONS_HISTORICALLY: 'historical',
  ROLE_UNKNOWN: 'uncertain',
  CONTRASTS_CLAIM: 'contrast',
  USES_METHOD_FROM: 'method',
  CONCLUSION_DEPENDS_ON_CLAIM: 'dependency',
  STUDY_USES_DATASET: 'structural',
  PUBLICATION_REPORTS_STUDY: 'structural',
  REVIEW_SYNTHESIZES_STUDY: 'structural',
};

export function edgeFamily(type: RelationKind): EdgeFamily {
  return EDGE_FAMILY[type];
}

/** Plain-language label for a relation. Never interchangeable. */
export const EDGE_LABEL: Record<RelationKind, string> = {
  DOCUMENT_HAS_VERSION: 'contains version',
  DOCUMENT_HAS_REFERENCE: 'lists reference',
  OCCURRENCE_MATCHES_PUBLICATION: 'matches publication (confirmed)',
  POSSIBLE_MATCH: 'possible match (unverified)',
  PUBLICATION_HAS_NOTICE: 'has publication notice',
  CLAIM_HAS_CITATION_USE: 'contains citation use',
  CITATION_USE_REFERENCES_PUBLICATION: 'cites publication',
  CITATION_USE_SUPPORTS_CLAIM: 'supports claim',
  MENTIONS_HISTORICALLY: 'mentions historically',
  ROLE_UNKNOWN: 'role unknown',
  CONTRASTS_CLAIM: 'contrasts claim',
  USES_METHOD_FROM: 'reuses method from',
  CONCLUSION_DEPENDS_ON_CLAIM: 'depends on claim',
  STUDY_USES_DATASET: 'uses dataset',
  PUBLICATION_REPORTS_STUDY: 'reports study',
  REVIEW_SYNTHESIZES_STUDY: 'synthesises study',
};

/** Short description of what a relation family means. */
export const EDGE_FAMILY_MEANING: Record<EdgeFamily, string> = {
  support: 'The cited work is offered as evidence for the claim.',
  contrast: 'The cited work argues against the claim.',
  historical: 'The work is discussed for context and is not relied upon.',
  method: 'A method or definition is reused; no result is relied upon.',
  uncertain: 'The connection is a candidate only and has not been confirmed.',
  notice: 'An official publication-status notice exists for this publication.',
  confirmed: 'A bibliographic match confirmed by DOI and title.',
  structural: 'A record-level connection describing how the records are organised.',
  dependency: 'One record inherits an evidence concern from another.',
};

/* ------------------------------------------------------------------ *
 * Finding presentation
 * ------------------------------------------------------------------ */

export type FindingTone = 'notice' | 'amber' | 'uncertain' | 'sage' | 'brand';

export const FINDING_TONE: Record<FindingKind, FindingTone> = {
  direct: 'notice',
  indirect: 'amber',
  historical: 'sage',
  unresolved: 'uncertain',
  no_notice: 'brand',
  method_reuse: 'brand',
  shared_dataset: 'uncertain',
};

export const FINDING_LABEL: Record<FindingKind, string> = {
  direct: 'Direct support',
  indirect: 'Indirect dependency',
  historical: 'Historical citation',
  unresolved: 'Unresolved reference',
  no_notice: 'No notice recorded',
  method_reuse: 'Method reuse',
  shared_dataset: 'Shared evidence',
};

export const FINDING_STATUS_LABEL: Record<string, string> = {
  awaiting_review: 'Awaiting review',
  review_recorded: 'Review recorded',
  further_investigation: 'Further investigation',
  revision_pending: 'Revision pending',
  draft_prepared: 'Draft prepared',
  resolved: 'Resolved',
};

export const REVIEW_OUTCOME_LABEL: Record<string, string> = {
  further_investigation: 'Further investigation required',
  revision_needed: 'Revision needed',
  not_affected: 'Not affected',
  evidence_updated: 'Evidence updated',
};

export const REVIEW_OUTCOME_HINT: Record<string, string> = {
  further_investigation:
    'The reviewer needs more evidence before deciding. The record stays open.',
  revision_needed:
    'The passage should change. A revision can be drafted alongside this decision.',
  not_affected:
    'This specific citation use is not compromised support. This says nothing about the claim itself.',
  evidence_updated:
    'The supporting record has changed and the finding now reflects the newer evidence.',
};

export { graphNodes as allGraphNodes, graphEdges as allGraphEdges };
