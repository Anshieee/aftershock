# Aftershock — Post-Submission Technical Audit (2026-10-19)

Snapshot taken after the hackathon submission, before the normal-development phase.

## Deployment & repository state
- Production: https://aftershock-demo.netlify.app — live, serving main (integrated sprint build).
- Real FalkorDB Cloud Free connected app-side; demo graph `aftershock:demo` seeded (16 records,
  `seed-1`), idempotent public re-seed verified. `test_hosting` untouched throughout.
- main = merged sprint waves: M0–M3 (contract/seed/graph lib), M4 backend + import UI,
  M5-lite Review Queue/Investigations, E2E harness + specs, brand wave, SciSpace homepage,
  design-polish wave (A/B/C/D branches). Tests: 285 unit passed (root) + 50 server unit +
  13 live integration (functions) + 6 server integration; E2E green against production.
- FalkorDB MCP incident (2026-10-18) fully closed: root cause = wedged idle pools in long-lived
  `falkordb-mcp` processes; fresh service spawn restored healthy reads (verified 2026-10-19:
  `list_graphs` → `["test_hosting","aftershock:demo"]`).

## Feature reality map (real / partial / placeholder)
REAL (working end-to-end):
- Guided demo seeding (public, guarded, idempotent) → real graph.
- Graph records API (probe/edges/documents), health with honest connectivity semantics.
- Guided investigation results: verified notice → direct claim concern → indirect conclusion;
  historical mention explicitly not affected; unresolved reference stays unresolved.
- Review Queue from real flagged graph nodes with rationale; decisions honestly disabled
  (no review backend yet).
- Library with real documents (synthetic labeled FICTIONAL / GUIDED DEMO) + demo-manuscript Analyze.
- Knowledge Graph canvas + legend + records list + Context Inspector (selection, a11y list).
- Knowledge Graph usability wave: wider canvas, node selection emphasis, roving tabindex.

PARTIAL (honest, disclosed in UI):
- Import = **metadata-only registration** (`contentStored:false` + verbatim disclosure); content
  analysis only for the seeded demo manuscript (fixture-derived). This is a deliberate
  privacy decision: no manuscript bytes on the free-tier graph (no TLS/persistence).
- AnalysisRun stage: demo run writes `completed`; contract §4 enum ends at `results`
  (alignment pending — see Debt).
- Graph view: selection/inspector done; zoom/pan/filter/focused paths not yet.

PLACEHOLDER (explicitly disabled with explanations, not faked):
- Bibliography / Single DOI import (honest gating + scope note).
- Review decisions (need review backend + audit trail).
- Exports (Impact Report / Revision Pack / Annotated Manuscript) — not started.
- Find Evidence / research assistance — not started.
- Activity timeline / Impact Replay — not started.

## Known bugs / technical debt
1. AnalysisRun stage-enum alignment (contract vs handler) — small; assign to backend.
2. `netlify.toml` test drift-guard `PENDING_FUNCTION_FILES` seam from M4 UI — now resolved on
   main (function files exist); tidy the list.
3. Rate-limit windows tuned for sprint test sweeps; revisit for realistic demo traffic.
4. `envcheck` public names-only diagnostic still deployed — gate or remove at next functions wave.
5. Two secret env vars stored non-secret (Netlify MCP bug) — user-side re-entry recommended
   (documented in DEPLOYMENT.md).
6. E2E suite: some specs assert copy that may drift with polish waves — keep specs contract-level.

## Security & privacy gaps (accepted for demo; fix before any real-user data)
- Free-tier FalkorDB: no TLS, no durable persistence, no backups → synthetic-data-only rule
  enforced; no manuscript bytes stored (metadata-only import).
- No authentication/authz layer (intentional for demo); required BEFORE any private content.
- No retention/deletion controls; no encryption at rest.
- No third-party AI transmission exists today; must stay that way until a data agreement exists.

## Prioritized roadmap (next milestones)
M5 — Review workflow (real): review-case endpoints with persistent audit history, decision
recording, revision proposals requiring human acceptance; risk-prioritized queue ordering.
M4.5 — Graph interactivity: zoom/pan/filter, focused dependency paths, inspector deepening.
M6 — Reports & history: Evidence Impact Report (HTML/PDF), versioned snapshots, Activity
timeline, Impact Replay; export never blocks, disclosures mandatory.
M4.6 — Research assistance: Find Evidence workflow (candidate publications w/ provenance),
shared-dataset/independence warnings; no auto-validation.
M7 — Product hardening: a11y audit fixes, performance, error recovery polish, visual QA sweep.
M8 — Independent integrity/security audit (external agent), submission-grade docs refresh.
BLOCKED-on-user (requires explicit approval): any real manuscript-content storage (needs
auth/authz/encryption/retention design + likely paid infra); any third-party AI processing.

## Immediate parallel tasks (this wave)
1. Graph interactivity (zoom/pan/filter + focused paths) — frontend, GraphCanvas/KGPage.
2. Backend: stage-enum alignment + rate-limit tuning + envcheck gating — after Agent E reports
   (its session owns netlify/server right now).
3. Docs: contract §4 stage note + roadmap adoption — orchestrator.
