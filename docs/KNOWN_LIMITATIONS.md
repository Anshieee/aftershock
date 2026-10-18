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
- As of 2026-10-18, the deployed production site contains the M1 shell: import-first landing, five-area sidebar + Knowledge Graph destination, truthful discreet service-status line (sidebar/footer). **Graph exploration, seeding, and review flows are not yet live in production** — M2 (`feat/m2-graph-library`) is in review; non-implemented areas show "Feature under construction" and nothing presents static JSON as a live graph (README; availability assertions are gated by matrix #8/#24 once M2 ships). Re-verify this section against `docs/BUILD_STATUS.md` as milestones land.

## Operational incident (2026-10-18)
- FalkorDB MCP `list_graphs` hangs/drops intermittently (BUILD_STATUS blockers). Scope of impact: **MCP-based (agent-side) live verification only** (e.g. reviewer's post-fix graph check of PR #2). App-side connectivity uses the official `falkordb` npm client over the same cloud instance and was verified working earlier the same day via `npm run check`; no app outage or graph data loss has been observed as part of this incident. Recovery is delegated to the DevOps child session; the DevOps report is to be appended to `docs/DEPLOYMENT.md`. Until recovery, agent-side graph audits should read via app-level integration tests / `npm run check` rather than MCP.
- Related toolchain caveat: the FalkorDB MCP binary was rebuilt from source against `falkordb` 0.10.4 to fix cloud-ingress timeouts (FALKORDB.md); reinstalling it must preserve that dependency.

## Third-party / telemetry residuals
- External fetches are time-boxed and logs are content-redacted (AGENTS.md). Sentry, if enabled, is scrubbed for manuscript content and PII (§13). **Residual risks that cannot be fully eliminated in this demo:** the unencrypted graph channel still exposes synthetic workload metadata to network observers; verification fetches reach third-party services (Crossref, NCBI, doi.org) and reveal working IPs/agents without sending user content; direct `thelancet.com` fetch is blocked (403) and only corroborated indirectly. Fonts are self-hosted (no runtime CDN calls).
- No "secure transport" or encryption claims are made anywhere in the demo UI; the disclosure duties of §2 and §4 bind all product surfaces.
