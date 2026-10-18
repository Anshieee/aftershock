/**
 * @aftershock/server — contract constants
 *
 * Single source of truth for identifiers and enums copied from
 * `docs/DATA_CONTRACTS.md` (§1–§6). Everything that validates data against the
 * contract (fixture validation, seed planning, graph queries, tests) imports
 * from here so the module layer never swaps two relation types silently.
 *
 * Hard rule (AGENTS.md): never conflate relation types
 * — cites ≠ discusses ≠ supports ≠ contrasts ≠ method-reuse ≠ has-status-notice.
 */

/** Edge provenance kinds — DATA_CONTRACTS §3. @type {ReadonlyArray<string>} */
export const PROVENANCE_KINDS = Object.freeze([
  'observed',
  'source_verified',
  'human_confirmed',
  'model_proposed',
  'unresolved',
]);

/**
 * Default edge reviewState used by the seeded fixture: seeded relationships are
 * curated demo content that no human ReviewDecision has been recorded against
 * yet, so they start neutral — a flag means "needs human review", never
 * "disproven/proven" (AGENTS.md scientific-integrity rule).
 * @type {string}
 */
export const SEED_EDGE_REVIEW_STATE = 'unreviewed';

/** Node labels — DATA_CONTRACTS §1 (optional labels: Dataset/Study/EvidenceFamily). */
export const NODE_LABELS = Object.freeze([
  'ResearchDocument',
  'DocumentVersion',
  'Collection',
  'ReferenceOccurrence',
  'Publication',
  'SourceNotice',
  'Claim',
  'Conclusion',
  'CitationUse',
  'EvidenceAssessment',
  'ReviewDecision',
  'RevisionProposal',
  'AnalysisRun',
  'EvidenceSource',
  'Dataset',
  'Study',
  'EvidenceFamily',
  'SeedMeta',
]);

/** Edge types — DATA_CONTRACTS §2. */
export const EDGE_TYPES = Object.freeze([
  'DOCUMENT_HAS_VERSION',
  'DOCUMENT_HAS_REFERENCE',
  'OCCURRENCE_MATCHES_PUBLICATION',
  'POSSIBLE_MATCH',
  'PUBLICATION_HAS_NOTICE',
  'CLAIM_HAS_CITATION_USE',
  'CITATION_USE_REFERENCES_PUBLICATION',
  'CITATION_USE_SUPPORTS_CLAIM',
  'CONTRASTS_CLAIM',
  'MENTIONS_HISTORICALLY',
  'USES_METHOD_FROM',
  'ROLE_UNKNOWN',
  'CONCLUSION_DEPENDS_ON_CLAIM',
  'STUDY_USES_DATASET',
  'PUBLICATION_REPORTS_STUDY',
  'REVIEW_SYNTHESIZES_STUDY',
  'COLLECTION_CONTAINS_DOCUMENT',
]);

/** CitationUse.role — DATA_CONTRACTS §1. */
export const CITATION_ROLES = Object.freeze([
  'supporting',
  'historical',
  'contrasting',
  'method_reuse',
  'role_unknown',
]);

/** ReferenceOccurrence.resolutionState — DATA_CONTRACTS §4. */
export const RESOLUTION_STATES = Object.freeze(['resolved', 'unresolved', 'deferred']);

/** SourceNotice.noticeType — DATA_CONTRACTS §1. */
export const NOTICE_TYPES = Object.freeze([
  'retraction',
  'correction',
  'expression_of_concern',
  'erratum',
]);

/** Every seeded node/edge carries analysisVersion so wipe scope is unambiguous. */
export const SEED_ANALYSIS_VERSION = 'seed-1';

/**
 * Fixed, stable fixture ids — DATA_CONTRACTS §6. Synthetic content is labeled
 * `FICTIONAL / GUIDED DEMO`; real bibliographic records carry isSynthetic=false.
 */
export const FIXTURE_IDS = Object.freeze({
  seedVersion: 'seed-1',
  syntheticLabel: 'FICTIONAL / GUIDED DEMO',
  seedMeta: 'meta-seed-version',
  document: 'doc-demo-manuscript',
  documentVersion: 'ver-demo-manuscript-v1',
  publicationReal: 'pub-mehra-2020',
  publicationRetractionRecord: 'pub-mehra-retraction-2020',
  notice: 'notice-mehra-retraction-2020-06-04',
  claimSupporting: 'claim-A',
  claimHistorical: 'claim-B',
  conclusion: 'conclusion-C',
  citationUseSupporting: 'cu-A-supporting',
  citationUseHistorical: 'cu-B-historical',
  referenceOccurrence: 'ref-lee-2020',
  candidatePublicationA: 'pub-lee-2020-candidate-a',
  candidatePublicationB: 'pub-lee-2020-candidate-b',
  study: 'study-E',
  evidenceFamily: 'review-F',
  dataset: 'dataset-X',
});

/**
 * Real bibliographic identifiers for the guided-demo anchor record. These are
 * public record facts verified live on 2026-10-18 against Crossref, PubMed,
 * PMC and doi.org (see docs/research/mehra-notice-verification.md, HIGH
 * confidence; four independent systems agree). The fixture and its tests pin
 * these values.
 */
export const REAL_RECORD = Object.freeze({
  publicationDoi: '10.1016/S0140-6736(20)31180-6',
  publicationPublishedDate: '2020-05-22',
  publicationPmId: '32450107',
  retractionRecordDoi: '10.1016/S0140-6736(20)31324-6',
  retractionPmId: '32511943',
  noticePublishedDate: '2020-06-04',
  noticeRecordedDate: '2020-06-05',
  noticeSourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31324-6',
  noticePmcMirrorUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7274621/',
});

/** Default managed demo graph — never confuse with integration smoke targets. */
export const DEMO_GRAPH_NAME = 'aftershock:demo';

/**
 * Sources an agent must never touch: the unrelated hosting-test graph that
 * lives on the same FalkorDB cloud instance (FALKORDB.md). The library never
 * writes to any graph the caller did not explicitly select, and tests pin the
 * smoke graph name to a distinct suffix so this cannot slip.
 * @type {ReadonlyArray<string>}
 */
export const PROTECTED_FOREIGN_GRAPHS = Object.freeze(['test_hosting']);
