# Aftershock — Build Status

Last updated: 2026-10-18 (M0 close)

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
| M2 Real FalkorDB & demo seed | **In review** | PR #2 `feat/m2-graph-library`: `server/` lib (client+contract+fixture+seed+impact), 47 unit + 6 live integration tests pass on real instance (smoke graph isolated); reviewer verifying |
| M3 Source verification & impact | **Done (records verified)** | `docs/research/mehra-notice-verification.md` merged; corrected bibliographic fields live in contract §6 + fixture |
| M4–M8 | Not started | Wave 2 dispatch after PR #2 merge |

## Deployed URLs
- Production: https://aftershock-demo.netlify.app (site id b1bb72a1-23de-46c4-8af8-ad4c5010f041)

## Current blockers
- **Non-global — FalkorDB MCP incident (2026-10-18):** MCP `list_graphs` hangs/drops intermittently. Orchestrator-side probing suspended; recovery delegated to DevOps child session (diagnosing process/transport/config vs app-side connectivity with bounded timeouts; app-side connection verified OK earlier via `npm run check`). Impact: ONLY MCP-based live verification is blocked (e.g., reviewer's post-fix MCP check of PR #2). App traffic itself uses the official npm client over the same cloud instance — unaffected so far. PR #2 merge requires reviewer verdict + post-recovery graph-state verification (read-only: `test_hosting` present, `aftershock:demo-smoke` absent).
- (Netlify deploy fact: Netlify rejects function filenames with dots — health unit test relocated to `tests/netlify/`; vitest include fixed.)

## Open risks
- Plaintext FalkorDB connection (demo-only, synthetic data enforced).
- Function time limits for analysis; staged polling fallback planned.
- CI secrets not required (integration tests skip without creds).
