# Aftershock — Build Status

Last updated: 2026-10-18 (M4 backend import/analyze code-complete on `feat/m4-import-analyze`; metadata-only tier, tests green)

## Environment (verified 2026-10-18)
- Repo: /home/ansh/Projects/aftershock → GitHub `Anshieee/aftershock` (main), synced.
- FalkorDB: cloud `instance-ky5pnxl21` (ap-south-1) — `npm run check` passes with real credentials: connect + list (`test_hosting` present) + create/read/delete smoke graph. Existing graphs: `test_hosting` (other project — do not touch). Aftershock graph: `aftershock:demo` (to seed). Post-M3-live-run verified read-only: `db.list() = ["test_hosting"]` (smoke graph deleted).
- Netlify MCP reachable; free team `RiotisWeird` (`nf_team_dev`); GitHub connected on the account. Existing sites belong to other projects; untouched. Aftershock site: to be created as `aftershock-demo`.
- GitHub MCP reachable (`Anshieee`).
- Node v24 local; `.env` restored from stash (FalkorDB creds present, redacted).

## Milestones
| Stage | Status | Notes |
|---|---|---|
| M0 Environment & architecture | **Done** | ADR 0001, DATA_CONTRACTS, MILESTONES, AGENTS.md committed; CI green |
| M1 Live walking skeleton | **Done — DEPLOYED** | PR #1 approved+merged; `https://aftershock-demo.netlify.app` live: / 200, SPA fallback 200, `/health` = `{ok, service, graph:"not-configured", version}`; no secrets in bundle; unit tests 10/10 (incl. relocated health test); CI green |
| M2 Real FalkorDB & demo seed | **Done — LIVE** | PRs #2 (graph lib, reviewer fixes applied) + #6 (backend §5 wiring) + #8 (canonical dash routes) merged. Production verified 2026-10-18: /health `{graph:aftershock:demo, graphReachable:true, seedState:seeded, nodeCount:16}`; probe/edges/documents live; demo-seed idempotent (`alreadySeeded:true`); guarded seed 401 without secret; stubs 501. Demo graph seeded via the real public guided path (16 records: synthetic manuscript labeled FICTIONAL / GUIDED DEMO + verified real Mehra notice/publication records) |
| M3 Source verification & impact | **Done (records verified)** | `docs/research/mehra-notice-verification.md` merged; corrected bibliographic fields live in contract §6 + fixture |
| M3 Wave 3 backend API wiring | **Code complete — tests green** | Branch `feat/m3-backend-api`: read endpoints (graph-probe/graph-edges/documents), bodyless idempotent `/demo/seed`, secret-guarded `/seed`, 501 stubs for M4/M5 routes, health graph-probe (`not-configured`/connected-name/`unreachable` string semantics), netlify.toml rewrites above SPA fallback; 93 unit tests + 7 live integration tests (smoke graph, skip without creds) |
| M2 UI (part of M2/M4) | **Merged + deployed** | PR #4 `feat/m2-connected-ui` approved (sage-reservation MODERATE fixed pre-merge) → deployed; E2E suite updated to M2 flow (38/38 green live) |
| Test harness | **Merged** | PR #3 approved → merged; reviewer suggestions applied (html reporter + concurrency); 38/38 green after deploy |
| Brand/UX wave | **In flight** | `feat/brand-wordmark-ux`: wordmark `Aftershock.` (Bodoni Moda 900, compressed), header badge → discreet status, Overview refinement, mobile-resilience specs; user-approved 2026-10-18 |
| M4–M8 | **M2/M3 core merged** | PR #5 (UI polish + SPA-shade hardening) and PR #6 (backend §5 wiring: probe/demo-seed/guarded-seed/graph-edges/documents/stubs, rewrites above SPA; unit 152 passed + live 7/7) MERGED. Brand/UX wave (PR #7: wordmark `Aftershock.`, discreet status line, Overview refinement, mobile specs) in review. Next: deploy + production verification sweep |
| M4 backend (import/analyze, metadata-only tier) | **Code complete — tests green** | Branch `feat/m4-import-analyze`: `POST /import-document` (metadata-only registration: sha256+size+format, `contentStored:false` + verbatim disclosure; bytes NEVER enter the no-TLS free graph; 415/400/413/429/503 rails), `POST /analyze` (real fixture-derived analysis via impact traversals for the seeded demo manuscript version → AnalysisRun `{runId}`; honest 422 `content-not-stored` for contentless versions), `GET /analyze-status?runId=` (real lookup, honest 404), `GET /document-detail?id=` (real doc + versions, seeded-filter-free so imports resolve). Ops in `server/importAnalyze.mjs`; handlers follow demo-seed limiter/guard patterns. 41 new handler unit tests; live integration extended (import→detail→analyze→status→422→415→413→404s on smoke graph; protected graphs intact). Limitation: content analysis requires persistent storage (M5); imported docs not shown in seeded-filter read surfaces (`/documents`, `/graph-edges`) this tier |

## Deployed URLs
- Production: https://aftershock-demo.netlify.app (site id b1bb72a1-23de-46c4-8af8-ad4c5010f041)

## Current blockers
- **None global.** FalkorDB MCP incident: **closed at process level** (`docs/ops/mcp-incident-2026-10-18.md`, root cause = wedged idle pools in `falkordb-mcp`; stale servers serviced SIGTERM'd 21:10 local, service untouched; DB state intact; app path healthy throughout). **Residual, needs user action (non-blocking):** MCP tools are absent from all agent-spawned sessions afterward — regaining assistant-side FalkorDB MCP visibility requires an OpenCode service restart/reconnect on the user's side. Until then, assistant-side graph verification runs through the application path (the same path the product uses).
- Netlify env persistence SOLVED: MCP `manage-env-vars` requires `upsertEnvVar: true`; secret-flag upserts are dropped by the MCP (known bug) — both sensitive values currently stored non-secret (site-scoped, server-only), manual re-entry as native secrets recommended at project close (DEPLOYMENT.md).
- `.netlify/functions/envcheck` temporary public names-only diagnostic; to gate/remove at M2.

## Open risks
- Plaintext FalkorDB connection (demo-only, synthetic data enforced).
- Function time limits for analysis; staged polling fallback planned.
- CI secrets not required (integration tests skip without creds).
