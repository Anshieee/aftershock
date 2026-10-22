# Aftershock — Milestone Plan

## M0 — Environment & architecture (current)
- Confirm tools, repo, $0 footprint, free-tier limits.
- Write ADR 0001 (done), shared entity/edge schema, API/event contracts, synthetic fixtures, acceptance tests, milestones.
- CI skeleton (lint/test/build).

## M1 — Live walking skeleton
- Netlify site + health check + GitHub CI + UI shell (editorial design).
- No fake connected-feature labels.

## M2 — Real FalkorDB & demo seed
- Server-side authenticated connectivity; idempotent synthetic seeding; read/write verified.
- UI graph/inspector queries live FalkorDB (not static JSON). Protect seed/reset + credentials.

## M3 — Source verification & impact
- Real Mehra publication/notice verification; citation-use + claim-dependency paths; distinguish support/historical/unresolved; test provenance.

## M4 — Import & transparent analysis
- Guided sample first; honest demo-safe import; automatic analysis, true state, errors/retry, partial results, skip ambiguous match. No private research over free unencrypted graph.

## M5 — Review UX
- Review Overview → annotated manuscript → focused Evidence Reader → human outcome → correct green/amber states; back-nav + keyboard. PDF + accessible reading with honest MVP coverage.

## M6 — Reports & Activity
- Functional Evidence Impact Report export; auditable review event history; date distinctions; unresolved preserved. No fake download.

## M7 — P1 enhancements (as feasible)
- Find Evidence assessment, grouped shared-data deps, richer revision pack, graph explorer, replay, full reflow, expanded export. Only after P0 passes.
- **Shipped 2026-10-19: Find Evidence v1 (P4)** — Crossref-backed evidence search from the review queue (`POST /evidence-find`), prepare/search modes, honest unknown/unverified fields, no graph writes, rate budget tighter than write routes. Design: `docs/decisions/0002-find-evidence-design.md`; limitations: `docs/KNOWN_LIMITATIONS.md`. Remaining M7 candidates: grouped shared-data dependencies, richer revision pack, graph explorer, replay, full reflow, expanded export.
- **Shipped 2026-10-19: Wave 3** — in-memory import metadata extraction (TXT DOI detection, never persisted) in `POST /import-document` responses + honest ImportPanel disclosure.
- **Shipped 2026-10-19: Wave 4** — grouped shared-data dependencies as read-only **independence groups** (`GET /independence-groups`, panel on the review queue): same-publication sharing detection with strict relation-type discipline; plus the user-import ghost fix and the bounded imported-documents read. Remaining M7 candidates: richer revision pack, graph explorer, replay, full reflow, expanded export.
- **Shipped 2026-10-19: M7 wave 1 (plan of record `docs/m7-plan.md`)** — **(A) full reflow Evidence Reader** `/reader`: read-only reflow of the graph's recorded passages (no reconstruction of original layout; honest basis/truncation disclosures; careful flag semantics; publication-notice inspector; `?focus=` deep links). **(B) Find Evidence connection**: Results-page mounting from affected claims/conclusions + origin context/return links; still read-only, nothing recorded (no safe auditable persistence for candidates — see KNOWN_LIMITATIONS). **(D) Impact Replay v1**: activity events labeled by date kind (published / indexing-record / first-recorded-by-Aftershock(demo-seed) / reviewed / analysis) with review before→after rendering and a case-filtered view (`GET /activity?caseId=`, additive+parameterized). **(C) richer revision pack + report interiors**: additive structure (original-vs-proposed labeled pairs, full decision trail, graph-wide unresolved refs, honest acceptance status), deterministic renderer plans, "not a scientific validation" framing. Remaining M7 candidates: graph explorer deeper graph traversal views; wave 2 cohesion (review-queue↔reader case anchors, per-case deep links), KNOWN_LIMITATIONS sync each wave.
- **Shipped 2026-10-20: M7 wave 2 (cohesion E)** — reader ↕ queue ↕ graph cohesion: queue `?case=` deep-links with honest missing-case note; reader find-evidence affordance per flagged passage; ContextInspector → reader hop. Scroll/anchor coexisted with reader deep anchors; no endpoints changed.
- **Shipped 2026-10-20: M7 wave 3 (graph explorer)** — KnowledgeGraphPage honest overview-slice text search (explicitly not a full-graph index), selection provenance panel (raw relation types + provenance fields, "not provided" when absent, static relation legend), focus-revealed screen-reader node list + polite live count/status region. Client-side only. Remaining M7 candidates: deeper graph traversal views, full-graph indexed search (backend task), comparison surfaces beyond replay.

## M8 — Independent final audit
- Hosted E2E, synthetic-vs-real attribution, graph/data verification, security/privacy, a11y, smoke under graph reset, limitations documented.

## M9/M10 — Local offline document parsing & citation detection
- Canonical local extraction record contract + honest budgets; bounded TXT decode with located lines; deterministic FICTIONAL fixture corpus (searchable + image-only PDF); pdf.js text-layer extraction with per-line geometry; conservative reference-section/entry detection; DOI candidate detection aligned with the deployed metaExtract semantics; local CLI with honest failure/truncation states; module + fixture-driven tests. **Strictly offline/non-graph; no production, frontend, or deployed-module changes; DOCX deliberately deferred with an honest stub.**
- **Shipped 2026-10-22 (branch `feat/m9-m10-doc-parsing`, base `57ddfb4` → `2cc20c0`; NOT merged/deployed):** contract `documentExtract-1`/`parse-1` (`server/parse/schema.mjs` + validator), `doiDetect`/`txtDocument`/`pdfText`/`documentExtract` modules, `pdfjs-dist@4.10.38` exact pin (Node-20 engines — v6 rejected requiring Node ≥ 22.13), deterministic fixture corpus + README, CLI `scripts/extract-document.mjs` with input guards, independent review (APPROVE-WITH-NITS) + security audit (PASS-WITH-NOTES) with disclosed-truncation hardening landed (60k/page + 1M total text budgets), and docs: ADR `docs/decisions/0003-offline-document-extraction.md`, `docs/DATA_CONTRACTS.md` §2 note, `docs/KNOWN_LIMITATIONS.md` M9/M10 section. Evidence: at delivery 398 passing / 2 failing server tests — **attribution corrected 2026-10-22**: those 2 were a latent, install-layout-dependent pdfkit resolution defect that affected `main` identically (server-only install → vite inlines pdfkit → its `#standard-fonts/*` imports map breaks), not a branch regression, and it was invisible because CI never ran the `server/` suite. Now fixed (runner config + regression guard) and the branch is green on Node 20 and Node 24 (server suite 401 → 410 passing with the added CLI guard tests); CLI runs verified for TXT/PDF/image-only/DOCX/unknown/missing-file states, with the CLI guard logic now covered by automated tests.

## P0 essentials
Real source notice, real FalkorDB traversal, clear review overview/reader, human decision, honest report, deployed site.
