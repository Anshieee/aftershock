/**
 * Prototype data contracts (MiniMax M3.1 experiment).
 *
 * These mirror the production Aftershock data contract
 * (docs/DATA_CONTRACTS.md) so the prototype can be integrated later without
 * a data-model rewrite — but every record here is PREPARED SAMPLE DATA, not
 * the result of analysing anything.
 */

/** Provenance kind carried by every material edge. */
export type ProvenanceKind =
  | 'observed'
  | 'source_verified'
  | 'human_confirmed'
  | 'model_proposed'
  | 'unresolved';

export type NodeKind =
  | 'ResearchDocument'
  | 'DocumentVersion'
  | 'Claim'
  | 'Conclusion'
  | 'CitationUse'
  | 'Publication'
  | 'SourceNotice'
  | 'ReferenceOccurrence'
  | 'Study'
  | 'Dataset'
  | 'EvidenceReview';

/**
 * Relation types are never interchangeable (research-integrity rule).
 * The UI renders each with its own colour, dash pattern and label.
 */
export type RelationKind =
  | 'DOCUMENT_HAS_VERSION'
  | 'DOCUMENT_HAS_REFERENCE'
  | 'OCCURRENCE_MATCHES_PUBLICATION'
  | 'POSSIBLE_MATCH'
  | 'PUBLICATION_HAS_NOTICE'
  | 'CLAIM_HAS_CITATION_USE'
  | 'CITATION_USE_REFERENCES_PUBLICATION'
  | 'CITATION_USE_SUPPORTS_CLAIM'
  | 'MENTIONS_HISTORICALLY'
  | 'ROLE_UNKNOWN'
  | 'CONTRASTS_CLAIM'
  | 'USES_METHOD_FROM'
  | 'CONCLUSION_DEPENDS_ON_CLAIM'
  | 'STUDY_USES_DATASET'
  | 'PUBLICATION_REPORTS_STUDY'
  | 'REVIEW_SYNTHESIZES_STUDY';

export type PropertyValue =
  | string
  | number
  | boolean
  | null
  | { section: string; page: number; offset: number };

export interface GraphNodeRecord {
  id: string;
  kind: NodeKind;
  /** Short display label. */
  label: string;
  /** True when the record is invented for the demonstration. */
  isSynthetic: boolean;
  /** Extra, kind-specific facts shown in the inspector. */
  properties: Record<string, PropertyValue>;
}

export interface GraphEdgeRecord {
  id: string;
  type: RelationKind;
  fromId: string;
  toId: string;
  provenanceKind: ProvenanceKind;
  rationale: string;
  sourcePointer: string;
  analysisVersion: string;
  reviewState: string;
  createdAt: string;
}

/** The relationship families the graph renders distinctly. */
export type EdgeFamily =
  | 'support'
  | 'contrast'
  | 'historical'
  | 'method'
  | 'uncertain'
  | 'notice'
  | 'confirmed'
  | 'structural'
  | 'dependency';

export type FindingKind =
  | 'direct'
  | 'indirect'
  | 'historical'
  | 'unresolved'
  | 'no_notice'
  | 'method_reuse'
  | 'shared_dataset';

export type FindingStatus =
  | 'awaiting_review'
  | 'review_recorded'
  | 'further_investigation'
  | 'revision_pending'
  | 'draft_prepared'
  | 'resolved';

export interface Finding {
  id: string;
  documentId: string;
  kind: FindingKind;
  /** Short label, e.g. "Supporting source carries a retraction notice". */
  title: string;
  /**
   * Level 1 — plain language. Written for a professor, not a graph
   * engineer. Never states that a claim is false.
   */
  plainExplanation: string;
  /** Anchor id into manuscriptContent.anchorSpecs — null when the passage
   *  cannot be located precisely in the rendered PDF (no fake highlight). */
  anchorId: string | null;
  /** Human-readable location, e.g. "§3 Results, column 1". */
  locationLabel: string;
  citationUseId?: string;
  publicationId?: string;
  noticeId?: string;
  viaClaimId?: string;
  /** Graph nodes that make up this finding. */
  nodeIds: string[];
  /** Graph edges that make up this finding. */
  edgeIds: string[];
  /** What a researcher can do about it, in plain words. */
  actionHint: string;
  /** True when the record is a prepared demonstration artifact. */
  prepared: boolean;
}

export type ReviewOutcome =
  | 'further_investigation'
  | 'revision_needed'
  | 'not_affected'
  | 'evidence_updated';

export interface ReviewDecisionRecord {
  id: string;
  findingId: string;
  outcome: ReviewOutcome;
  note: string;
  reviewer: string;
  decidedAt: string;
  /** Seeded decisions ship with the prototype; user decisions do not. */
  seeded: boolean;
}

export type ProposalStatus = 'draft' | 'accepted' | 'discarded';

export interface RevisionProposalRecord {
  id: string;
  findingId: string;
  originalText: string;
  proposedText: string;
  rationale: string;
  status: ProposalStatus;
  createdAt: string;
}

export type ActivityKind =
  | 'publication_notice'
  | 'indexing_record'
  | 'analysis'
  | 'review'
  | 'report';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  label: string;
  detail: string;
  /** The date kind is explicit — these timestamps are never merged. */
  dateKind: 'announcement' | 'record' | 'system' | 'human';
  timestamp: string;
  synthetic: boolean;
  findingId?: string;
}

export type DocumentStatus =
  | 'example_investigation'
  | 'analysis_complete'
  | 'awaiting_review'
  | 'imported'
  | 'not_started';

export interface DocumentRecord {
  id: string;
  title: string;
  fileName: string;
  authors: string;
  venue: string;
  year: number;
  status: DocumentStatus;
  importedAt: string;
  lastActivityAt: string;
  findingCount: number;
  reviewedCount: number;
  /** Prototype-only flag: true for the generated sample manuscript. */
  isSample: boolean;
  /** Prototype-only flag: marks every prepared record in the UI. */
  prepared: boolean;
  /** Page count of the generated PDF (sample document only). */
  pageCount?: number;
}
