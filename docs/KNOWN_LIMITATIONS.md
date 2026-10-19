# Aftershock — Known Limitations

Honest, evidence-linked list of what the current demo does **not** guarantee. Updated 2026-10-18 (M1 deployed; M2 in PR review — see `docs/BUILD_STATUS.md` for milestones/URLs). This list is a required repo deliverable (handoff §17) and must be kept current at project close.

## Graph service — free tier
- FalkorDB Cloud Free provides **no TLS, no continuous persistence, no automated backups, no HA** (handoff §13; ADR 0001). The instance endpoint speaks plaintext RESP (FALKORDB.md). Consequence: the graph is **disposable** — data can be lost on restart or instance churn; durability, availability and recovery are not production-grade. Recovery is by design through idempotent versioned reseeding (`docs/DEPLOYMENT.md`), not by restored snapshots.
- The Netlify Function → FalkorDB connection is unencrypted; the interception/exposure risk is accepted **only because the transported data is synthetic** (ADR 0001 residual risk). This is the demo plan's single accepted security posture trade-off and is not claimed safe for real content.

## Data boundary — synthetic only
- Only synthetic demo data may enter the free graph. Real/private manuscripts, unpublished research, sensitive source passages and private review notes must **never** be routed through it: unencrypted transit + volatile storage + no per-user access controls make any private content unsafe there (handoff §13; AGENTS.md). The secure full product (TLS-capable graph tier + durable storage + authenticated per-user storage) is a future migration requirement, not an implemented feature — migration requirements documented in ADR 0001.
- The public instance must not misrepresent uploads as secure or durable personal research; unsafe user-upload paths stay guarded/disabled until secure transport and storage exist (§13).

## Import scope (demo-honest; M4 target per handoff §15)
- The P0 demonstration path is the **guided example** (fixed fixture §12). Sample-only support must never be labeled arbitrary-document support.
- Real import supports **PDF, DOCX, TXT only** as truly supported, with explicit format/size limits (§4); DOI/bibliography-only import does **not** produce passage-level dependencies for the user's own claims.
- Full arbitrary-PDF parsing/reflow, faithful page-coordinate overlays where extraction is unreliable, and sophisticated alternative-evidence discovery are P1 (M7) — MVP coverage of both PDF and accessible-reading modes is accepted for M5 with honest disclosure of extraction/OCR limits (§7, §15).

## Review, exports, history
- Product rule (not a defect, but an honesty constraint): exports **never block** on unfinished review and therefore always ship with prominent disclosure of review status, unresolved counts, last source-check timestamps and limitations; "review workflow completed" is never "scientifically certified" (§10). A format that cannot be correctly produced is disabled rather than downloaded as a fake file — no fake downloads (§10; matrix #19).
- **No durable personal history is claimed** on the disposable instance: Review Queue/Activity behavior is demonstrated with live session state and reproducible synthetic fixtures, not with durable per-user storage (§13).

## Graph view capabilities — current deployed state
- As of 2026-10-20 (post-M7 waves 1–3), production serves the guided demo end-to-end: real graph exploration with node-kind + edge-provenance filters, an honest overview-slice text search ("not a full-graph index"), a selection provenance panel (raw relation types + `provenanceKind`/`rationale`/`sourcePointer`/`analysisVersion`, "not provided" when absent), the Evidence Reader, Review Queue (with `?case=` deep-links), Find Evidence (with origin context), Impact Replay before/after view, activity with case-scope filter, and honest-degraded states for seed/import/export when the graph or functions are unavailable. The seed workflow is guarded + rate-limited + idempotent (`SEED_SECRET` site-side); no public unauthenticated write/reset/Cypher surface exists. Nothing presents static JSON as a live graph. This section is re-verified against `docs/BUILD_STATUS.md` as work lands.

## Operational incident (2026-10-18)
- FalkorDB MCP `list_graphs` hangs/drops intermittently (BUILD_STATUS blockers). Scope of impact: **MCP-based (agent-side) live verification only** (e.g. reviewer's post-fix graph check of PR #2). App-side connectivity uses the official `falkordb` npm client over the same cloud instance and was verified working earlier the same day via `npm run check`; no app outage or graph data loss has been observed as part of this incident. Recovery is delegated to the DevOps child session; the DevOps report is to be appended to `docs/DEPLOYMENT.md`. Until recovery, agent-side graph audits should read via app-level integration tests / `npm run check` rather than MCP.
- Related toolchain caveat: the FalkorDB MCP binary was rebuilt from source against `falkordb` 0.10.4 to fix cloud-ingress timeouts (FALKORDB.md); reinstalling it must preserve that dependency.

## Find Evidence (v1, deployed 2026-10-19) — honest scope
- **Metadata-only search:** candidates come from Crossref public bibliographic metadata. No abstracts, no full text, no citation-context fetch; relevance is the provider's bibliographic ranking, never a statement of support.
- **Per-candidate statuses start unknown and stay unknown until human review:** `retractionStatus:unknown`, `evidenceRelationship:unverified`, `independence:unknown`, `fullTextAvailability:unknown`. Independence is NOT verified (different DOIs can share datasets/analyses/review trees); no identical-analysis grouping exists in v1.
- **No persistence, no graph writes:** candidates are returned to the caller and never written to the graph (which would also violate the synthetic-only data boundary for real bibliographic records emerging from live searches). The response itself carries a non-manipulation caveat; it does not modify citations, review states, or the manuscript.
- **Retraction/status checking is NOT performed in v1** — a Crossref hit carries no retraction assessment; the UI shows the unknown state verbatim.
- **Rate/cost shaping:** per-IP search budget cooldown 60 s, ≤10 per 10 min (deliberately tighter than write routes); per-claim budget separate; Crossref polite-pool `mailto` sent only when `CROSSREF_CONTACT_EMAIL` is configured.
- **The panel cannot be used to "confirm" a claim:** the UI states and enforces that support/contrast assessment happens at the paper itself in human review; the finding surface never flips a review state.

## Import metadata extraction (Wave 3, deployed 2026-10-19) — honest scope
- **TXT only, bounded excerpt:** DOI detection scans at most the first 512 KiB of a TXT upload and is explicitly NOT attempted for PDF/DOCX in this tier (responses state this instead of lying by omission). Larger files disclose `truncated` and matches beyond the excerpt are not looked for.
- **Detection, never verification:** a detected DOI is an UNVERIFIED pattern-match candidate — presence in the file proves nothing about claim support, citation integrity, or the identifier's validity. The UI shows the standing caveat verbatim; no scoring, ranking, or "relevance" is asserted.
- **Session-scoped, never persisted:** the extraction lives only in the import HTTP response. No node label, edge type, or graph property exists for it; the graph contract of `/import-document` is unchanged (`contentStored:false` still primary).
- **OTL (out of this tier) explicitly:** no reference-section parsing (author/year/title structure), no retraction lookups on detected DOIs, no DOI resolution/verification, no PDF/DOCX text extraction, no claim↔reference linkage from file content.

## Independence groups (Wave 4, deployed 2026-10-19) — honest scope
- **Same-publication sharing only:** a group means two or more claims have supporting citation uses referencing the SAME publication record. Shared datasets, analyses, or review trees are NOT detected in this tier (Find Evidence responses disclose the same limitation).
- **Support-only contribution:** historical mentions (`MENTIONS_HISTORICALLY`) and unresolved possible matches never feed a group; only `CITATION_USE_SUPPORTS_CLAIM` with `role='supporting'` does.
- **Read-only and decision-neutral:** the panel informs review and never changes a review state; a group is never a verdict, and absence of groups is never a guarantee of independence.

## Evidence Reader (M7 wave 1, deployed 2026-10-19) — honest scope
- **Reflow of recorded passages only:** the manuscript full text is NOT stored (`contentStored:false`); the reader shows exactly the seeded graph's claim/conclusion/citation-use/reference-occurrence records ordered by the recorded section/page/offset metadata. It is NOT a reconstruction of the original PDF or its layout — no page-perfect rendering, no overall pagination, and records without usable locations are grouped last ("Not located in the recorded layout"), never assigned invented positions.
- **Demo-graph basis:** the reader covers the seeded demo manuscript only; the returned graph may be truncated at the client cap and the reader shows only what was returned (disclosed). Reader is read-only — no state, review, or graph changes.
- **No new evidence data is created:** the inspector surfaces existing relation types (supports / mentions historically / possible match) and the verified publication-notice linkage that already exists in the graph; a flag always means "evidence review needed", never a verdict of truth or falsity.

## Impact Replay / activity history (M7 wave 1, deployed 2026-10-19) — honest scope
- **Date kinds stay separate and honestly labeled:** notice `publishedDate` (official announcement), `noticeRecordedDate` (indexing-system record — PubMed/PMC/Crossref), `detectedAt` labeled "First recorded by Aftershock (demo seed)" — in the demo this equals the seed timestamp and never implies live scanning or discovery — `lastVerifiedAt`, human-review `decidedAt`, analysis `startedAt`/`completedAt`, export `generatedAt` (shown at export time only).
- **No historical graph snapshots, no export history:** before→after renderings show only recorded review-decision state blobs; there is no reconstruction of "the graph as it was", and no list of past report exports is claimed or invented. Per-case filter (`GET /activity?caseId=`) returns only review decisions because notices and analysis runs are genuinely not case-scoped records — an empty per-case list is the honest answer, not an error.

## Third-party / telemetry residuals
- External fetches are time-boxed and logs are content-redacted (AGENTS.md). Sentry, if enabled, is scrubbed for manuscript content and PII (§13). **Residual risks that cannot be fully eliminated in this demo:** the unencrypted graph channel still exposes synthetic workload metadata to network observers; verification fetches reach third-party services (Crossref, NCBI, doi.org) and reveal working IPs/agents without sending user content; direct `thelancet.com` fetch is blocked (403) and only corroborated indirectly. Fonts are self-hosted (no runtime CDN calls).
- No "secure transport" or encryption claims are made anywhere in the demo UI; the disclosure duties of §2 and §4 bind all product surfaces.
