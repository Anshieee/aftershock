import {
  FINDING_LABEL,
  documents,
  edgeById,
  nodeById,
  type DocumentRecord,
  type Finding,
  type GraphEdgeRecord,
  type ReviewDecisionRecord,
  type RevisionProposalRecord,
} from '../fixtures';
import { findingStatus, statusLabel } from './findings';

export interface ReportSectionDefinition {
  id: string;
  label: string;
  description: string;
}

export const REPORT_SECTIONS: ReportSectionDefinition[] = [
  {
    id: 'identity',
    label: 'Document identity',
    description: 'Which document this report covers, and what file it came from.',
  },
  {
    id: 'summary',
    label: 'Investigation summary',
    description: 'Counts of what was found and what has been reviewed.',
  },
  {
    id: 'concerns',
    label: 'Evidence concerns',
    description: 'Each passage that may need a human decision, in plain language.',
  },
  {
    id: 'relationships',
    label: 'Direct and indirect relationships',
    description: 'How each flagged passage connects to the source behind it.',
  },
  {
    id: 'unresolved',
    label: 'Unresolved references',
    description: 'References that could not be confirmed against one publication.',
  },
  {
    id: 'review',
    label: 'Human review status',
    description: 'The decisions a person has recorded, and what they mean.',
  },
  {
    id: 'notices',
    label: 'Source notices',
    description: 'Publication-status notices, with announcement and record dates kept apart.',
  },
  {
    id: 'revisions',
    label: 'Revision proposals',
    description: 'Suggested wording, clearly marked as suggestions.',
  },
  {
    id: 'provenance',
    label: 'Provenance',
    description: 'Where each relationship came from and how it was established.',
  },
  {
    id: 'limitations',
    label: 'Limitations',
    description: 'What this report cannot claim.',
  },
  {
    id: 'timestamps',
    label: 'Timestamps',
    description: 'Publication, recording, analysis and review dates, kept distinct.',
  },
];

export interface ReportModel {
  document: DocumentRecord;
  generatedAt: string;
  summary: {
    total: number;
    awaitingReview: number;
    reviewed: number;
    kinds: Array<{ kind: string; label: string; count: number }>;
  };
  concerns: Finding[];
  relationships: Array<{
    finding: Finding;
    edges: GraphEdgeRecord[];
    via: string;
  }>;
  unresolved: Finding[];
  reviews: Array<{ finding: Finding; decision: ReviewDecisionRecord }>;
  notices: Array<{
    noticeId: string;
    noticeLabel: string;
    noticeType: string;
    publishedDate: string;
    recordedDate: string;
    sourceUrl: string;
    publicationLabel: string;
  }>;
  revisions: Array<{ finding: Finding; proposal: RevisionProposalRecord }>;
  provenance: Array<{ finding: Finding; edges: GraphEdgeRecord[] }>;
  limitations: string[];
  timestamps: Array<{ label: string; value: string; kind: string }>;
}

export const REPORT_LIMITATIONS = [
  'A flag means a person should look at the passage. It never means the claim is false, and no claim in this report has been disproven or certified.',
  'The findings in this report are prepared sample data. They were not produced by analysing the document, and no external service was contacted to produce them.',
  'A human review decision records what a reviewer chose to do. It is a workflow state, not a scientific verdict.',
  'A supporting citation, a historical mention and a reused method are different relationships. They are never merged into a single "linked" statement.',
  'The absence of a recorded notice is not evidence that a source is sound. It only means this dataset holds no adverse record.',
  'Unresolved references remain unresolved. Candidate matches are never promoted to confirmed.',
  'A suggested revision is a suggestion. It has not been applied to the manuscript, and it does not make the wording correct.',
];

export function buildReport(
  documentId: string,
  decisions: Record<string, ReviewDecisionRecord>,
  proposals: Record<string, RevisionProposalRecord>,
  findings: Finding[],
): ReportModel {
  const document = documents.find((doc) => doc.id === documentId) ?? documents[0]!;
  const scope = findings.filter((finding) => finding.documentId === documentId);
  const now = new Date();

  const kinds = new Map<string, number>();
  for (const finding of scope) {
    kinds.set(finding.kind, (kinds.get(finding.kind) ?? 0) + 1);
  }

  const reviews = scope
    .map((finding) => ({ finding, decision: decisions[finding.id] }))
    .filter((entry): entry is { finding: Finding; decision: ReviewDecisionRecord } =>
      Boolean(entry.decision),
    );

  const notices = scope
    .filter((finding) => finding.noticeId)
    .map((finding) => {
      const notice = nodeById.get(finding.noticeId!);
      const publication = finding.publicationId ? nodeById.get(finding.publicationId) : undefined;
      return {
        noticeId: finding.noticeId!,
        noticeLabel: notice?.label ?? finding.noticeId!,
        noticeType: String(notice?.properties['noticeType'] ?? 'status notice'),
        publishedDate: String(notice?.properties['publishedDate'] ?? 'not recorded'),
        recordedDate: String(notice?.properties['noticeRecordedDate'] ?? 'not recorded'),
        sourceUrl: String(notice?.properties['sourceUrl'] ?? ''),
        publicationLabel: publication?.label ?? '',
      };
    });

  const uniqueNotices = [...new Map(notices.map((notice) => [notice.noticeId, notice])).values()];

  const relationships = scope.map((finding) => ({
    finding,
    edges: finding.edgeIds
      .map((id) => edgeById.get(id))
      .filter((edge): edge is GraphEdgeRecord => Boolean(edge)),
    via: finding.viaClaimId
      ? (nodeById.get(finding.viaClaimId)?.label ?? finding.viaClaimId)
      : finding.citationUseId
        ? (nodeById.get(finding.citationUseId)?.label ?? finding.citationUseId)
        : 'the recorded passage',
  }));

  const revisions = scope
    .map((finding) => ({ finding, proposal: proposals[finding.id] }))
    .filter((entry): entry is { finding: Finding; proposal: RevisionProposalRecord } =>
      Boolean(entry.proposal),
    );

  return {
    document,
    generatedAt: now.toISOString(),
    summary: {
      total: scope.length,
      awaitingReview: scope.filter((f) => findingStatus({ reviewDecisions: decisions } as never, f) === 'awaiting_review')
        .length,
      reviewed: reviews.length,
      kinds: [...kinds.entries()].map(([kind, count]) => ({
        kind,
        label: FINDING_LABEL[kind as keyof typeof FINDING_LABEL] ?? kind,
        count,
      })),
    },
    concerns: scope,
    relationships,
    unresolved: scope.filter((finding) => finding.kind === 'unresolved'),
    reviews,
    notices: uniqueNotices,
    revisions,
    provenance: scope.map((finding) => ({
      finding,
      edges: finding.edgeIds
        .map((id) => edgeById.get(id))
        .filter((edge): edge is GraphEdgeRecord => Boolean(edge)),
    })),
    limitations: REPORT_LIMITATIONS,
    timestamps: [
      {
        label: 'Document imported',
        value: document.importedAt,
        kind: 'system',
      },
      ...uniqueNotices.flatMap((notice) => [
        {
          label: `Notice announced — ${notice.publicationLabel}`,
          value: notice.publishedDate,
          kind: 'announcement',
        },
        {
          label: `Notice recorded by the indexing systems — ${notice.publicationLabel}`,
          value: notice.recordedDate,
          kind: 'record',
        },
      ]),
      ...reviews.map((entry) => ({
        label: `Review recorded — ${entry.finding.title}`,
        value: entry.decision.decidedAt,
        kind: 'human',
      })),
      {
        label: 'Report generated',
        value: now.toISOString(),
        kind: 'system',
      },
    ],
  };
}

export { statusLabel };
