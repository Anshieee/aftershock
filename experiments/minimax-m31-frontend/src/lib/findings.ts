import {
  EDGE_LABEL,
  FINDING_LABEL,
  FINDING_STATUS_LABEL,
  FINDING_TONE,
  REVIEW_OUTCOME_HINT,
  REVIEW_OUTCOME_LABEL,
  edgeById,
  edgeFamily,
  nodeById,
  type Finding,
  type FindingStatus,
  type FindingTone,
  type GraphEdgeRecord,
  type GraphNodeRecord,
} from '../fixtures';
import type { AppState } from '../state/store';

/* ------------------------------------------------------------------ *
 * Presentation helpers shared by the reader, the review queue and the
 * report workspace.
 * ------------------------------------------------------------------ */

export function findingTone(finding: Finding): FindingTone {
  return FINDING_TONE[finding.kind];
}

export function findingKindLabel(finding: Finding): string {
  return FINDING_LABEL[finding.kind];
}

export function findingNodes(finding: Finding): GraphNodeRecord[] {
  return finding.nodeIds.map((id) => nodeById.get(id)).filter((n): n is GraphNodeRecord => Boolean(n));
}

export function findingEdges(finding: Finding): GraphEdgeRecord[] {
  return finding.edgeIds.map((id) => edgeById.get(id)).filter((e): e is GraphEdgeRecord => Boolean(e));
}

export function findingPublication(finding: Finding): GraphNodeRecord | undefined {
  return finding.publicationId ? nodeById.get(finding.publicationId) : undefined;
}

export function findingNotice(finding: Finding): GraphNodeRecord | undefined {
  return finding.noticeId ? nodeById.get(finding.noticeId) : undefined;
}

export function findingStatus(state: AppState, finding: Finding): FindingStatus {
  const decision = state.reviewDecisions[finding.id];
  if (!decision) return 'awaiting_review';
  if (decision.outcome === 'further_investigation') return 'further_investigation';
  if (decision.outcome === 'revision_needed') {
    const proposal = state.proposals[finding.id];
    if (proposal?.status === 'accepted') return 'draft_prepared';
    if (proposal) return 'revision_pending';
    return 'further_investigation';
  }
  if (decision.outcome === 'evidence_updated') return 'resolved';
  return 'review_recorded';
}

export const STATUS_TONE: Record<FindingStatus, FindingTone> = {
  awaiting_review: 'amber',
  review_recorded: 'sage',
  further_investigation: 'amber',
  revision_pending: 'amber',
  draft_prepared: 'brand',
  resolved: 'sage',
};

export function statusLabel(status: FindingStatus): string {
  return FINDING_STATUS_LABEL[status] ?? status;
}

export function outcomeLabel(outcome: string): string {
  return REVIEW_OUTCOME_LABEL[outcome] ?? outcome;
}

export function outcomeHint(outcome: string): string {
  return REVIEW_OUTCOME_HINT[outcome] ?? '';
}

/**
 * A plain-language account of the relationships that make up a finding.
 * Relation types are never merged into a single "linked to" statement.
 */
export function relationSummary(finding: Finding): Array<{
  edge: GraphEdgeRecord;
  relation: string;
  provenance: string;
  source: string;
  analysisVersion: string;
  reviewState: string;
}> {
  return findingEdges(finding).map((edge) => ({
    edge,
    relation: EDGE_LABEL[edge.type],
    provenance: edge.provenanceKind,
    source: edge.sourcePointer,
    analysisVersion: edge.analysisVersion,
    reviewState: edge.reviewState,
  }));
}

/** Renders a node property for display without losing structured values. */
export function formatProperty(value: unknown): string {
  if (value === null || value === undefined) return 'not recorded';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') {
    const record = value as { section?: string; page?: number; offset?: number };
    const parts: string[] = [];
    if (record.section) parts.push(record.section);
    if (typeof record.page === 'number') parts.push(`page ${record.page}`);
    return parts.join(' · ') || JSON.stringify(value);
  }
  return String(value);
}

export function familyLabel(family: string): string {
  return family.charAt(0).toUpperCase() + family.slice(1);
}

export { edgeFamily };
