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
| M0 Environment & architecture | **Done** | ADR 0001, DATA_CONTRACTS, MILESTONES, AGENTS.md committed; CI skeleton lands with scaffold PR |
| M1 Live walking skeleton | In progress | coder agent: app scaffold + UI shell + `/health` + netlify.toml + CI |
| M2 Real FalkorDB & demo seed | In progress | database agent: `server/` graph library + fixtures + idempotent seed |
| M3 Source verification & impact | In progress | researcher agent: Mehra notice authoritative-record verification |
| M4–M8 | Not started | after Wave 1 integration |

## Current blockers
- None.

## Deployed URLs
- (pending — first Netlify deploy after scaffold PR merge)

## Open risks
- Plaintext FalkorDB connection (demo-only, synthetic data enforced).
- Function time limits for analysis; staged polling fallback planned.
- CI secrets not required (integration tests skip without creds).
