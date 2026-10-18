# Aftershock — Data Provenance (seeded demo records)

Per-record provenance for the guided demo, classified with exactly the kinds defined in `docs/DATA_CONTRACTS.md` §3. Fixture IDs per DATA_CONTRACTS §6 — that section is the fixture source of truth; the fixture/seed implementation ships with PR #2 (`feat/m2-graph-library`, in review at 2026-10-18 per `docs/BUILD_STATUS.md`). This file does not duplicate schema or edge contracts.

## Per-record classification

| Record(s) | provenanceKind | isSynthetic | Basis / evidence |
|---|---|---|---|
| `pub-mehra-2020` | `source_verified` | false | Title/authors/journal/online date **2020-05-22**, PMID 32450107, retracted=true — Crossref + PubMed + PMC + doi.org all agree (`docs/research/mehra-notice-verification.md`) |
| `pub-mehra-retraction-2020` | `source_verified` | false | Lancet 395(10240):1820, PMID 32511943; notice→original linkage asserted by Crossref `relation.retraction`/`update-to`, PubMed "Retraction in/of", PMC header, doi.org |
| `notice-mehra-retraction-2020-06-04` | `source_verified`, `verified=true` | false | Official open mirror PMC7274621; thelancet.com direct fetch 403-disclosed in the verification doc |
| Related-notice links: EoC `10.1016/S0140-6736(20)31290-3` (PMID 32504543); retraction-linked record `10.1016/S0140-6736(20)31528-2` (PMID 32653079) | `source_verified` | false | Verified to exist; stored as **separate records, never merged** into the retraction |
| `doc-demo-manuscript`, `ver-demo-manuscript-v1` (Draft A), `claim-A`, `claim-B`, `conclusion-C`, `cu-A-supporting`, `cu-B-historical` | `observed` | true | Authored synthetic fixture, labeled `FICTIONAL / GUIDED DEMO`; roles (supporting/historical/dependency) are fixture-authored, not produced by a live analysis run |
| `ref-lee-2020` + its `POSSIBLE_MATCH` candidate edges | `unresolved` (explicitly unverified) | true | Ambiguity preserved; `resolutionState: unresolved/deferred`; candidate edges are non-propagating and never `source_verified` |
| `study-E`, `review-F`, `dataset-X` (+ `STUDY_USES_DATASET`/`PUBLICATION_REPORTS_STUDY`/`REVIEW_SYNTHESIZES_STUDY` within the family) | `observed` | true | Explicitly fictional shared-dataset demonstrator; demonstrates grouping, not independent confirmations |
| `model_proposed` | reserved | — | Future genuine analysis output only; displayed as proposals, never auto-promoted to confirmed |
| `human_confirmed` | reserved | — | Real user confirmations (e.g. candidate confirmation, reimport linkage) — absent from the seed |

Seeded relationship edges (`DOCUMENT_HAS_REFERENCE`, `CLAIM_HAS_CITATION_USE`, `CITATION_USE_REFERENCES_PUBLICATION`, `CITATION_USE_SUPPORTS_CLAIM`, `MENTIONS_HISTORICALLY`, `CONCLUSION_DEPENDS_ON_CLAIM`) are authored by the fixture → `observed`, each with `sourcePointer` back to the fixture/verification record. The one exception: `PUBLICATION_HAS_NOTICE` is `source_verified` (authoritative-record basis).

## Timestamp semantics — never merged (§11; §16 matrix #21)

| Timestamp | Meaning | Value / source |
|---|---|---|
| Notice **announcement** | Actual publication of the retraction notice | **2020-06-04** (Lancet editorial statement; Retraction Watch). Used in the fixture ID and as `publishedDate` |
| Notice **recorded** | When indexing systems recorded it | **2020-06-05** (`noticeRecordedDate` — PubMed epubdate, PMC header, Crossref deposit). Kept distinct from the announcement date, always |
| Original **publication** | Mehra et al. online publication | **2020-05-22** (`publishedDate` of `pub-mehra-2020`) |
| **Detected** | First detected by Aftershock | `SourceNotice.detectedAt` — set when the seed/analysis records the notice; never presented as the notice's publication date |
| **Last verified/checked** | Most recent authoritative re-check | `SourceNotice.lastVerifiedAt` — dated at each re-verification |
| **Human decision** | Reviewer's recorded decision | `ReviewDecision.decidedAt` |
| **Export generated** | Snapshot moment | Recorded per export with snapshot/version; historical exports are not silently rewritten |

Principle: what was known *when*, when analysis *ran*, and when a human *decided* are distinct, user-visible distinctions. Impact Replay uses recorded state or an explicitly labeled reconstruction — never invented past snapshots.

## Export snapshot rule
Every export records a snapshot/version and its generation date. New research does not mutate old exports; incomplete status is disclosed when open tasks remain (§10; acceptance #19–#22).

## Provenance rules for impact traversals

| Edge / basis | Propagates review impact? | Rule |
|---|---|---|
| `PUBLICATION_HAS_NOTICE` (`verified=true`) | Basis for flags | Source-verified only; unverified notice states are displayed as such |
| Confirmed `OCCURRENCE_MATCHES_PUBLICATION` + `CITATION_USE_SUPPORTS_CLAIM` | **Yes** — direct review flag on the citing claim | Only for the `supporting` role |
| `MENTIONS_HISTORICALLY`, `CONTRASTS_CLAIM`, `USES_METHOD_FROM`, `ROLE_UNKNOWN` | **No** "compromised-signal" flag | Roles are never conflated; a historical mention of a retracted paper does not flag its claim (invariant 2) |
| `POSSIBLE_MATCH` / `unresolved` candidate edges | **Never** | Matching-priority elevation only, labeled "possible source-status issue — verification required" (§4) |
| `CONCLUSION_DEPENDS_ON_CLAIM` | **Yes** — indirect review on the dependent conclusion | Requires an inspectable path; dependency is not automatic falsity (invariants 1, §16 #4) |
| `STUDY_USES_DATASET` / evidence-family edges | Grouping only | Never counted as independent confirmations without verified edges (invariant 4) |
