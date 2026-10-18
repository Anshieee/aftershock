# Aftershock — Research Integrity Policy

Enforceable policy binding every agent and PR (mirrors the hard rules in `AGENTS.md`; scientific-integrity auditing is a mandatory reviewer/tester responsibility per handoff §14.3). Acceptance-matrix numbering at the end reuses handoff §16 exactly.

## Real publication records — verified
- The demo's real seed records are verified in `docs/research/mehra-notice-verification.md` (verified 2026-10-18 via live HTTP fetches: Crossref, PubMed E-utilities, PMC, doi.org — four independent authoritative systems agree; Retraction Watch as secondary).
- Corrected Mehra/Lancet facts that seeds and UI **must** use (and the discarded assumptions they replace):
  - DOI `10.1016/S0140-6736(20)31180-6` is **The Lancet** "Hydroxychloroquine or chloroquine with or without a macrolide … a multinational registry analysis" — **never** the NEJM title "Cardiovascular disease, drug therapy, and mortality in Covid-19" (that belongs to the other retracted Mehra paper, `10.1056/NEJMoa2007621`).
  - Online publication **2020-05-22** (not "12 May 2020"); no print vol/pages; original PMID **32450107** (PMID 32473127 is an unrelated *Cell* paper).
  - Retraction notice: DOI `10.1016/S0140-6736(20)31324-6`, The Lancet 395(10240):1820, PMID **32511943**; announced **2020-06-04**, recorded **2020-06-05** — both dates kept distinct.
  - Expression of Concern `10.1016/S0140-6736(20)31290-3` (PMID 32504543) is related but **never merged** with the retraction.
  - Stored content = structured fields + URLs only; no article/notice body text (© Elsevier).
- The one disclosure-backed gap: a direct `thelancet.com` fetch is blocked (403, bot protection); its existence is corroborated via Crossref/PubMed/PMC/Retraction Watch. This is disclosed — not papered over.

## Synthetic content labeling
- Synthetic fixture content is labeled **`FICTIONAL / GUIDED DEMO` in both UI and fixture data**; synthetic publications carry `isSynthetic: true`; the verified Mehra pair carries `isSynthetic: false` (DATA_CONTRACTS §4, §6). Real scholarly records and synthetic document claims are visually and semantically separated (§12); no synthetic sentence is ever attributed to a real author.
- Synthetic register (DATA_CONTRACTS §6): `doc-demo-manuscript`, Draft A, `claim-A`, `claim-B`, `conclusion-C`, `cu-A-supporting`, `cu-B-historical`, `ref-lee-2020`, `study-E`, `review-F`, `dataset-X`. Real register: `pub-mehra-2020`, `pub-mehra-retraction-2020`, `notice-mehra-retraction-2020-06-04` (+ related notice identifiers).

## Relation-type non-conflation (hard rule)
`cites` ≠ `discusses` ≠ `supports` ≠ `contrasts` ≠ method-reuse ≠ has-status-notice — never interchangeable in graph, UI copy or reports. Contracted edge semantics enforce this: confirmed `OCCURRENCE_MATCHES_PUBLICATION` vs explicitly unverified `POSSIBLE_MATCH`; `PUBLICATION_HAS_NOTICE` asserted only via authoritative records; `MENTIONS_HISTORICALLY` never implies compromised support; `STUDY_USES_DATASET`/`PUBLICATION_REPORTS_STUDY`/`REVIEW_SYNTHESIZES_STUDY` only when verified/qualified (DATA_CONTRACTS §2).

## Flag ≠ falsity
A review flag means **"needs human review"** — never "claim disproven/proven" (AGENTS.md; §1 principle 1). "Not affected" explains why a *specific citation use* isn't compromised and never certifies the claim (§9). Disproval/proof/vindication wording is prohibited in flags, statuses and reports.

## Provenance requirements on material edges
Every material edge carries `provenanceKind` (`observed | source_verified | human_confirmed | model_proposed | unresolved`), `rationale`, `sourcePointer`, `createdAt`, `analysisVersion`, `reviewState` (DATA_CONTRACTS §2–3; AGENTS.md). AI-proposed (`model_proposed`) relations are never promoted to confirmed on display; confidence scores, if used internally, are never reliability certifications (§6). Per-record seeded classification: `docs/DATA_PROVENANCE.md` (publications/notice `source_verified`; authored fixture relations `observed`; candidate-match state `unresolved`; `model_proposed` reserved for real analysis output).

## Retrieval- & source-check-failure disclosure
Failures are disclosed as failures — never replaced by a synthesized "successful" record: external source unavailable, no known notice, no authorized full text (metadata + publisher link only; no invented quotes), ambiguous/wrong/multiple matches, blocked publisher fetch (the 403 case above), empty candidate search (state the coverage limits; never assert no evidence exists) (§4, §8, §9; DATA_CONTRACTS invariant 7 / matrix #1, #7).

## Acceptance-test invariants and matrix
Binding invariants — `docs/DATA_CONTRACTS.md` §7 (numbering preserved): 1 verified retraction → direct supporting citation → Claim A → Conclusion C flags reviews; 2 historical-discussion citation does **not** flag Claim B; 3 `ref-lee-2020` stays unresolved after Skip, candidate edges uncertain and non-propagating; 4 shared-dataset/derivative papers are not counted as independent confirmations without verified edges; 5 no-notice / inaccessible full text / empty search never implies reliability or completeness; 6 every displayed graph path corresponds to FalkorDB-queryable records with sourced/proposed relationship states.
Acceptance matrix — handoff §16 (numbering preserved; every check needs reproducible fixtures, automated tests, hosted smoke where applicable): research integrity **#1–8**; UI/workflow **#9–18**; outputs & history **#19–22**; cloud/security/delivery **#23–28**.

## Definition of done — evidence duties
Features are done **only** with implementation, relevant automated tests, a reviewed diff/PR, real hosted behavior, documentation, and an explicit remaining-limitations list (§16 DoD). Every "done" must cite concrete evidence — URL, test output, query result (AGENTS.md "verify behavior, don't claim it"). Testers and an independent reviewer reproduce pass/fail evidence rather than relying on self-reported completion (matrix #28; §14.2). P0 completion means the fully deployed guided scenario works end-to-end on real FalkorDB with a functioning report; blockers are reported as exact observed state plus the minimal required user decision — never as premature success.
