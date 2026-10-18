/**
 * Test fixture mirroring the REAL seeded demo graph exactly as the wire
 * expects it: flat node records (`kind` + property fields, like the server
 * fixture `demo-fixture.json` — FalkorDB stores primitives only, and the
 * functions layer will return records in this same flat shape) and flat
 * edges (`type`/`fromId`/`toId` + provenance). Semantic values (roles,
 * verified flag, possible-match edges) are copied from DATA_CONTRACTS §6
 * and the authoritative server fixture so UI tests exercise the same story
 * the backend invariant tests assert.
 */

const T = '2026-10-18T00:00:00.000Z';

const base = {
  createdAt: T,
  updatedAt: T,
  analysisVersion: 'seed-1',
  syntheticLabel: 'FICTIONAL / GUIDED DEMO' as const,
};

const node = (extra: Record<string, unknown>): Record<string, unknown> => ({ ...base, ...extra });
const edge = (extra: Record<string, unknown>): Record<string, unknown> => ({
  createdAt: T,
  analysisVersion: 'seed-1',
  reviewState: 'unreviewed',
  ...extra,
});

/** Raw `GET /graph/edges` payload — flat records, exactly the §6 fixture. */
export function buildDemoOverviewRecord(): Record<string, unknown> {
  return {
    seedVersion: 'seed-1',
    nodes: [
      node({
        id: 'doc-demo-manuscript',
        kind: 'ResearchDocument',
        provenanceKind: 'observed',
        isSynthetic: true,
        title: 'Data-Integrity Consequences in Respiratory Infection Care (Guided Demo Manuscript)',
        fileName: 'guided-demo-manuscript.pdf',
      }),
      node({
        id: 'ver-demo-manuscript-v1',
        kind: 'DocumentVersion',
        provenanceKind: 'observed',
        isSynthetic: true,
        label: 'Draft A',
      }),
      node({
        id: 'pub-mehra-2020',
        kind: 'Publication',
        provenanceKind: 'source_verified',
        isSynthetic: false,
        title:
          'Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis',
        doi: '10.1016/S0140-6736(20)31180-6',
        publishedDate: '2020-05-22',
      }),
      node({
        id: 'pub-mehra-retraction-2020',
        kind: 'Publication',
        provenanceKind: 'source_verified',
        isSynthetic: false,
        title:
          'Retraction—Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis',
        doi: '10.1016/S0140-6736(20)31324-6',
      }),
      node({
        id: 'notice-mehra-retraction-2020-06-04',
        kind: 'SourceNotice',
        provenanceKind: 'source_verified',
        isSynthetic: false,
        title:
          'Retraction—Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis',
        noticeType: 'retraction',
        verified: true,
        publishedDate: '2020-06-04',
        noticeAnnouncementDate: '2020-06-04',
        noticeRecordedDate: '2020-06-05',
        sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31324-6',
      }),
      node({
        id: 'ref-lee-2020',
        kind: 'ReferenceOccurrence',
        provenanceKind: 'observed',
        isSynthetic: true,
        rawText: 'Lee et al., 2020',
        resolutionState: 'unresolved',
      }),
      node({
        id: 'claim-A',
        kind: 'Claim',
        provenanceKind: 'observed',
        isSynthetic: true,
        text: 'Agent P-9 was selected on the strength of the registry analysis we cite (Mehra et al., 2020), which we read as establishing a drug-treatment mortality signal in the target cohort.',
        status: 'unreviewed',
      }),
      node({
        id: 'claim-B',
        kind: 'Claim',
        provenanceKind: 'observed',
        isSynthetic: true,
        text: 'The 2020 retraction of the registry analysis referenced in Passage 2.1 serves here as a historical example of why mandatory raw-data audits matter; nothing in this manuscript depends on that analysis.',
        status: 'unreviewed',
      }),
      node({
        id: 'conclusion-C',
        kind: 'Conclusion',
        provenanceKind: 'observed',
        isSynthetic: true,
        text: 'Guided-demo recommendation: agent P-9 enters the priority protocol for the simulated care unit; this conclusion depends on the Passage 2.1 statement (claim-A) and inherits its evidence obligations.',
      }),
      node({
        id: 'cu-A-supporting',
        kind: 'CitationUse',
        provenanceKind: 'observed',
        isSynthetic: true,
        role: 'supporting',
        excerpt: 'As our primary evidence we adopt the registry analysis reported by Mehra et al. (2020).',
      }),
      node({
        id: 'cu-B-historical',
        kind: 'CitationUse',
        provenanceKind: 'observed',
        isSynthetic: true,
        role: 'historical',
        excerpt:
          'The June 2020 retraction record for Mehra et al. (2020) is discussed as historical context.',
      }),
      node({
        id: 'pub-lee-2020-candidate-a',
        kind: 'Publication',
        provenanceKind: 'unresolved',
        isSynthetic: true,
        title: 'Outcome modelling after respiratory support adjustment (demo-fictional)',
        doi: '10.demo/demo-lee-2020-a',
      }),
      node({
        id: 'pub-lee-2020-candidate-b',
        kind: 'Publication',
        provenanceKind: 'unresolved',
        isSynthetic: true,
        title: 'Ventilation duration and discharge patterns in modelled clinics (demo-fictional)',
        doi: '10.demo/demo-lee-2020-b',
      }),
      node({
        id: 'study-E',
        kind: 'Study',
        provenanceKind: 'human_confirmed',
        isSynthetic: true,
        title: 'Study E — simulated effectiveness assessment of P-9 (demo-fictional)',
      }),
      node({
        id: 'review-F',
        kind: 'EvidenceFamily',
        provenanceKind: 'human_confirmed',
        isSynthetic: true,
        title: 'Review F — synthetic synthesis family over Study E (demo-fictional)',
      }),
      node({
        id: 'dataset-X',
        kind: 'Dataset',
        provenanceKind: 'human_confirmed',
        isSynthetic: true,
        title: 'Dataset X — shared simulated cohort table (demo-fictional)',
      }),
      {
        id: 'meta-seed-version',
        kind: 'SeedMeta',
        provenanceKind: 'observed',
        seedVersion: 'seed-1',
      },
    ],
    edges: [
      edge({
        id: 'edge-doc-has-version',
        type: 'DOCUMENT_HAS_VERSION',
        fromId: 'doc-demo-manuscript',
        toId: 'ver-demo-manuscript-v1',
        provenanceKind: 'observed',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#doc-demo-manuscript',
      }),
      edge({
        id: 'edge-doc-has-reference-lee',
        type: 'DOCUMENT_HAS_REFERENCE',
        fromId: 'doc-demo-manuscript',
        toId: 'ref-lee-2020',
        provenanceKind: 'observed',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#ref-lee-2020',
      }),
      edge({
        id: 'edge-claimA-has-cuA',
        type: 'CLAIM_HAS_CITATION_USE',
        fromId: 'claim-A',
        toId: 'cu-A-supporting',
        provenanceKind: 'observed',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#claim-A',
      }),
      edge({
        id: 'edge-claimB-has-cuB',
        type: 'CLAIM_HAS_CITATION_USE',
        fromId: 'claim-B',
        toId: 'cu-B-historical',
        provenanceKind: 'observed',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#claim-B',
      }),
      edge({
        id: 'edge-cuA-references-mehra',
        type: 'CITATION_USE_REFERENCES_PUBLICATION',
        fromId: 'cu-A-supporting',
        toId: 'pub-mehra-2020',
        provenanceKind: 'human_confirmed',
        sourcePointer: 'https://doi.org/10.1016/S0140-6736(20)31180-6',
      }),
      edge({
        id: 'edge-cuB-references-mehra',
        type: 'CITATION_USE_REFERENCES_PUBLICATION',
        fromId: 'cu-B-historical',
        toId: 'pub-mehra-2020',
        provenanceKind: 'human_confirmed',
        sourcePointer: 'https://doi.org/10.1016/S0140-6736(20)31324-6',
      }),
      edge({
        id: 'edge-cuA-supports-claimA',
        type: 'CITATION_USE_SUPPORTS_CLAIM',
        fromId: 'cu-A-supporting',
        toId: 'claim-A',
        provenanceKind: 'human_confirmed',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#cu-A-supporting',
      }),
      edge({
        id: 'edge-cuB-mentions-claimB',
        type: 'MENTIONS_HISTORICALLY',
        fromId: 'cu-B-historical',
        toId: 'claim-B',
        provenanceKind: 'human_confirmed',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#cu-B-historical',
      }),
      edge({
        id: 'edge-conclusionC-depends-claimA',
        type: 'CONCLUSION_DEPENDS_ON_CLAIM',
        fromId: 'conclusion-C',
        toId: 'claim-A',
        provenanceKind: 'human_confirmed',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#conclusion-C',
      }),
      edge({
        id: 'edge-mehra-has-notice',
        type: 'PUBLICATION_HAS_NOTICE',
        fromId: 'pub-mehra-2020',
        toId: 'notice-mehra-retraction-2020-06-04',
        provenanceKind: 'source_verified',
        sourcePointer: 'https://doi.org/10.1016/S0140-6736(20)31324-6',
      }),
      edge({
        id: 'edge-lee-possible-match-a',
        type: 'POSSIBLE_MATCH',
        fromId: 'ref-lee-2020',
        toId: 'pub-lee-2020-candidate-a',
        provenanceKind: 'unresolved',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#ref-lee-2020',
      }),
      edge({
        id: 'edge-lee-possible-match-b',
        type: 'POSSIBLE_MATCH',
        fromId: 'ref-lee-2020',
        toId: 'pub-lee-2020-candidate-b',
        provenanceKind: 'unresolved',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#ref-lee-2020',
      }),
      edge({
        id: 'edge-studyE-uses-datasetX',
        type: 'STUDY_USES_DATASET',
        fromId: 'study-E',
        toId: 'dataset-X',
        provenanceKind: 'human_confirmed',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#study-E',
      }),
      edge({
        id: 'edge-reviewF-synthesizes-studyE',
        type: 'REVIEW_SYNTHESIZES_STUDY',
        fromId: 'review-F',
        toId: 'study-E',
        provenanceKind: 'human_confirmed',
        sourcePointer: 'fixture://aftershock-demo-fixture-v1#review-F',
      }),
    ],
  };
}
