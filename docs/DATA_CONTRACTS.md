# Aftershock — Data Contracts

Shared contract reference for backend, frontend, graph and tests. All identifiers are stable strings (UUID v4 unless noted). Timestamps are ISO-8601 UTC. No code; contracts are descriptive.

## 1. Entity types (FalkorDB node labels)

Core graph nodes. Every node carries `id`, `createdAt`, `updatedAt`, `provenanceKind`, `analysisVersion`.

- `ResearchDocument` — imported manuscript container. Fields: `title`, `fileName`, `format` (pdf|docx|txt), `sizeBytes`, `collectionId?`, `importedAt`, `versionId`.
- `DocumentVersion` — immutable snapshot. Fields: `documentId`, `label` (Draft A/B), `sourceHash`, `pageCount?`, `extractedTextRef?`, `createdAt`.
- `Collection` — optional grouping. Fields: `name`, `createdAt`.
- `ReferenceOccurrence` — exact local reference text + location. Fields: `documentVersionId`, `rawText`, `location` (page/section/offset), `candidatePublicationIds[]`, `resolutionState` (resolved|unresolved|deferred).
- `Publication` — canonical identity by DOI. Fields: `doi`, `title`, `authors[]`, `journal`, `year`, `url`, `isSynthetic`.
- `SourceNotice` — official publication-status notice. Fields: `publicationId`, `noticeType` (retraction|correction|expression_of_concern|erratum), `publishedDate`, `detectedAt`, `lastVerifiedAt`, `sourceUrl`, `verified` (bool).
- `Claim` — passage-level assertion in a document. Fields: `documentVersionId`, `text`, `location`, `status`.
- `Conclusion` — downstream conclusion depending on claims. Fields: `documentVersionId`, `text`, `location`.
- `CitationUse` — specific citing passage + role. Fields: `documentVersionId`, `publicationId`, `excerpt`, `location`, `role` (supporting|historical|contrasting|method_reuse|role_unknown), `provenanceKind`.
- `EvidenceAssessment` — human/assessor evaluation of a source for a claim. Fields: `claimId`, `publicationId`, `assessment` (supporting|contrasting|context_only|uncertain), `assessor`, `notes`, `createdAt`.
- `ReviewDecision` — human review outcome. Fields: `caseId`, `outcome` (revision_needed|more_evidence_needed|not_affected|evidence_updated), `explanation`, `reviewer`, `decidedAt`.
- `RevisionProposal` — AI/human suggested replacement. Fields: `caseId`, `originalText`, `proposedText`, `rationale`, `status` (draft|copied|discarded|reported_applied_externally), `createdAt`.
- `AnalysisRun` — analysis execution record. Fields: `documentVersionId`, `startedAt`, `completedAt?`, `status`, `stage`, `error?`.
- `EvidenceSource` — provenance pointer (URL/file location/excerpt). Fields: `kind`, `uri`, `excerpt`, `createdAt`.
- `Dataset`, `Study`, `EvidenceFamily` — optional verified provenance. Fields: minimal; only when sourced/qualified.

## 2. Edge types

- `DOCUMENT_HAS_VERSION` (ResearchDocument → DocumentVersion)
- `DOCUMENT_HAS_REFERENCE` (ResearchDocument → ReferenceOccurrence)
- `OCCURRENCE_MATCHES_PUBLICATION` (ReferenceOccurrence → Publication) **confirmed**
- `POSSIBLE_MATCH` (ReferenceOccurrence → Publication) **explicitly unverified**
- `PUBLICATION_HAS_NOTICE` (Publication → SourceNotice) verified via authoritative record
- `CLAIM_HAS_CITATION_USE` (Claim → CitationUse)
- `CITATION_USE_REFERENCES_PUBLICATION` (CitationUse → Publication)
- `CITATION_USE_SUPPORTS_CLAIM` (CitationUse → Claim)
- `CONTRASTS_CLAIM` (CitationUse → Claim)
- `MENTIONS_HISTORICALLY` (CitationUse → Claim)
- `USES_METHOD_FROM` (CitationUse → Claim)
- `ROLE_UNKNOWN` (CitationUse → Claim)
- `CONCLUSION_DEPENDS_ON_CLAIM` (Conclusion → Claim) with scope, confidence, provenance
- `STUDY_USES_DATASET`, `PUBLICATION_REPORTS_STUDY`, `REVIEW_SYNTHESIZES_STUDY` only when verified/qualified
- `COLLECTION_CONTAINS_DOCUMENT` (Collection → ResearchDocument)

Every material edge carries: `id`, `provenanceKind` (observed|source_verified|human_confirmed|model_proposed|unresolved), `rationale`, `sourcePointer`, `createdAt`, `analysisVersion`, `reviewState`.

## 3. Provenance kinds

`observed`, `source_verified`, `human_confirmed`, `model_proposed`, `unresolved`.

## 4. Status enums

### AnalysisRun.status
`pending | running | completed | failed | partial`

### AnalysisRun.stage (ordered)
`file_selected | uploading | uploaded | parsing | resolving | checking_notices | classifying | writing_graph | results`

### ReferenceOccurrence.resolutionState
`resolved | unresolved | deferred`

### Review case states (orthogonal)
`awaiting_review | review_recorded | further_investigation | revision_pending | draft_prepared | reported_applied_externally | resolved | reopened_due_to_new_information`

### RevisionProposal.status
`draft | copied | discarded | reported_applied_externally`

### Publication / notice
`verified` boolean on SourceNotice; `isSynthetic` boolean on Publication.

### Export status
`complete | incomplete` (incomplete if any open task/unresolved).

## 5. API routes (Netlify Functions)

Base: `/.netlify/functions/*` (or Functions v2 routes). All JSON. Server-side only for graph access.

**Canonical path convention (production-verified 2026-10-18):** routes are the **dash-named function
filenames** (`graph-probe`, `demo-seed`, `graph-edges`, `documents`, …). Netlify resolves
`/.netlify/functions/<first-path-segment>/…` by function name and user rewrites CANNOT intercept
inside that reserved namespace — subpath spellings like `/graph/probe` fall through to the SPA
fallback and serve HTML. Client (`src/lib/api.ts`) and handlers must agree on dash paths; a unit
drift-guard test cross-checks client routes against function filenames. Endpoints not yet
implemented are served by `unimplemented` (HTTP 501 `{reason:'not-implemented'}`) addressed via
query params (e.g. `/unimplemented?for=document&id=…`), never by fabricated data.

- `GET /health` — liveness + graph connectivity probe (no secrets).
- `POST /seed` — idempotent synthetic fixture seeding. Guarded by server secret + rate limit + method guard.
- `POST /demo-seed` — public, bodyless, rate-limited guided-example seeding of the demo graph (idempotent; same seed engine; returns `{seeded, alreadySeeded, seedVersion}`).
- `GET /graph-probe` — verify graph exists/records (read-only).
- `POST /import` — accept document upload (bounded size/format). Returns `{ documentId, versionId }`.
- `POST /analyze` — start analysis job. Body `{ documentVersionId }`. Returns `{ runId }`.
- `GET /analyze/:runId/status` — poll status/stage.
- `GET /documents`, `GET /documents/:id`
- `GET /publications/:id`, `GET /publications/:id/notices`
- `GET /claims/:id`, `GET /claims/:id/path` — dependency path.
- `POST /references/:id/skip` — defer ambiguous match.
- `POST /references/:id/confirm` — confirm candidate publication.
- `POST /review/cases/:id/decide` — submit ReviewDecision.
- `POST /review/cases/:id/revision` — create/edit RevisionProposal.
- `POST /evidence/find` — candidate search for a claim. Deploy path = function filename `evidence-find`;
  `?claimId=` query param in place of the path segment; body `{query}` optional (empty/`{}` → prepare, no
  external fetch); read-only, no graph writes.
- `POST /export/report` — Evidence Impact Report (PDF).
- `POST /export/revision-pack` — Revision Pack (DOCX).
- `POST /export/annotated-manuscript` — Annotated Manuscript.
- `GET /activity` — timeline events.

All write endpoints require method guard + input validation + rate limit. No arbitrary Cypher or reset exposed.

## 6. Synthetic fixture IDs (guided demo)

Fixed, stable IDs for the guided demo. All synthetic content labeled `FICTIONAL / GUIDED DEMO`.

Publications:
- `pub-mehra-2020` — Mehra MR, Desai SS, Ruschitzka F, Patel AN (2020), The Lancet. Title "Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis". DOI `10.1016/S0140-6736(20)31180-6`. Published online 2020-05-22 (no print vol/pages). PMID 32450107. `isSynthetic=false` (real source record; verified via Crossref/PubMed/PMC — see docs/research/mehra-notice-verification.md). Do NOT use the NEJM paper's title ("Cardiovascular disease, drug therapy, and mortality in Covid-19") — different DOI/paper.
- `pub-mehra-retraction-2020` — retraction-notice publication. "Retraction—Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis", The Lancet 395(10240):1820. DOI `10.1016/S0140-6736(20)31324-6`. PMID 32511943. `isSynthetic=false`.

Notices:
- `notice-mehra-retraction-2020-06-04` — retraction. `publishedDate=2020-06-04` (= `noticeAnnouncementDate`, Lancet statement); `noticeRecordedDate=2020-06-05` (PubMed/PMC/Crossref record date — keep both timestamps distinct, never merged). `verified=true`. Links: `https://doi.org/10.1016/S0140-6736(20)31324-6`, official open mirror `https://pmc.ncbi.nlm.nih.gov/articles/PMC7274621/`. Related-but-never-merged: Expression of Concern DOI `10.1016/S0140-6736(20)31290-3` (PMID 32504543).

Synthetic document:
- `doc-demo-manuscript` — guided demo manuscript (fictional).
- `ver-demo-manuscript-v1` — Draft A.

Passages/claims:
- `claim-A` — Passage A supporting: relies directly on Mehra et al. findings → direct evidence review.
- `claim-B` — Passage B historical: mentions Mehra retraction as example of data verification → not compromised supporting evidence.
- `conclusion-C` — Conclusion C depends on Claim A → indirect review required.

Citation uses:
- `cu-A-supporting` — CitationUse for Claim A, role=supporting, references `pub-mehra-2020`.
- `cu-B-historical` — CitationUse for Claim B, role=historical (MENTIONS_HISTORICALLY), references `pub-mehra-2020`.

Reference occurrence:
- `ref-lee-2020` — "Lee et al., 2020" ambiguous match → unresolved/deferred. `POSSIBLE_MATCH` edges only, non-propagating.

Optional synthetic evidence family (fictional, labeled):
- `study-E`, `review-F`, `dataset-X` — demonstrate shared-dataset grouping. `isSynthetic=true` on all. No independent-confirmation claims without verified edges.

Graph metadata:
- `meta-seed-version` node stores `seedVersion` string for idempotent reseed.

## 7. Key acceptance invariants (must hold)

1. Verified retracted study → direct supporting citation → Claim A → Conclusion C flags reviews.
2. Historical-discussion citation to same study does NOT flag Claim B.
3. `ref-lee-2020` remains unresolved after Skip; candidate edges uncertain and non-propagating.
4. Shared dataset/derivative papers not counted as independent confirmations without verified edges.
5. No notice / inaccessible full text / empty candidate search never implies reliability or completeness.
6. Every graph path corresponds to FalkorDB queryable records with sourced/proposed relationship states.
