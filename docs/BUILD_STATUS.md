# Aftershock — Build Status

Last updated: 2026-10-18 (PR5 merged; brand wave + backend resume running)

## Environment (verified 2026-10-18)
- Repo: /home/ansh/Projects/aftershock → GitHub `Anshieee/aftershock` (main), synced.
- FalkorDB: cloud `instance-ky5pnxl21` (ap-south-1) — `npm run check` passes with real credentials: connect + list (`test_hosting` present) + create/read/delete smoke graph. Existing graphs: `test_hosting` (other project — do not touch). Aftershock graph: `aftershock:demo` (to seed).
- Netlify MCP reachable; free team `RiotisWeird` (`nf_team_dev`); GitHub connected on the account. Existing sites belong to other projects; untouched. Aftershock site: to be created as `aftershock-demo`.
- GitHub MCP reachable (`Anshieee`).
- Node v24 local; `.env` restored from stash (FalkorDB creds present, redacted).

## Milestones
| Stage | Status | Notes |
|---|---|---|
| M0 Environment & architecture | **Done** | ADR 0001, DATA_CONTRACTS, MILESTONES, AGENTS.md committed; CI green |
| M1 Live walking skeleton | **Done — DEPLOYED** | PR #1 approved+merged; `https://aftershock-demo.netlify.app` live: / 200, SPA fallback 200, `/health` = `{ok, service, graph:"not-configured", version}`; no secrets in bundle; unit tests 10/10 (incl. relocated health test); CI green |
| M2 Real FalkorDB & demo seed | **In review — fixes impl.** | PR #2 `feat/m2-graph-library`: reviewer verdict REQUEST_CHANGES (MAJOR: SeedMeta duplication on reseed) — fixes in `aftershock-wt-m2fix` with new integration assertions; 47 unit + 6 live integration tests green + independently reproduced by reviewer (app path) |
| M3 Source verification & impact | **Done (records verified)** | `docs/research/mehra-notice-verification.md` merged; corrected bibliographic fields live in contract §6 + fixture |
| M2 UI (part of M2/M4) | **Merged + deployed** | PR #4 `feat/m2-connected-ui` approved (sage-reservation MODERATE fixed pre-merge) → deployed; E2E suite updated to M2 flow (38/38 green live) |
| Test harness | **Merged** | PR #3 approved → merged; reviewer suggestions applied (html reporter + concurrency); 38/38 green after deploy |
| Brand/UX wave | **In flight** | `feat/brand-wordmark-ux`: wordmark `Aftershock.` (Bodoni Moda 900, compressed), header badge → discreet status, Overview refinement, mobile-resilience specs; user-approved 2026-10-18 |
| M4–M8 | **Wave 3 running** | PR #2 MERGED (`634f871`, delta re-review approved — SeedMeta fix verified: unit 50/50, integration 6/6); backend API wiring (`feat/m3-backend-api`; §5 routes: probe/demo-seed/seed-guarded/graph-edges/documents + netlify.toml rewrites) and UI polish batch (`feat/m3-ui-polish`) in flight |

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
