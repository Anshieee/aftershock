# Aftershock — Deployment & Operations

Deployment reality as of 2026-10-18 (M1 deployed; M2 in PR review — see `docs/BUILD_STATUS.md` for live milestone status).

## Hosted site
- Site **`aftershock-demo`**, Netlify free team `RiotisWeird` — site id `b1bb72a1-23de-46c4-8af8-ad4c5010f041`, production URL **https://aftershock-demo.netlify.app** (BUILD_STATUS: `/` 200, SPA fallback 200, `/health` 200).
- Deploy method: the configured Netlify MCP write tool (`netlify-deploy-services-updater`, operation **`deploy-site`**) with `deployDirectory` = repository root and the `siteId` above.
- Build config (`netlify.toml`): command `npm run build`; publish `dist`; functions directory **`netlify/functions`** (esbuild bundler); SPA fallback redirect `/* → /index.html` status 200 (files on disk are served first).
- Current function: `health` → **`GET /.netlify/functions/health`** returns `{ ok, service, graph, version }` — no secrets, no DB access (the contracts' `GET /health` in DATA_CONTRACTS §5 refers to this route).

## Environment variables (Netlify `functions` scope)
Names only — **values are never printed, committed, or logged** (AGENTS.md; secrets live server-side only, never in the client bundle):
`FALKORDB_HOST`, `FALKORDB_PORT`, `FALKORDB_USER`, `FALKORDB_PASSWORD` (secret), `FALKORDB_GRAPH_NAME`, `SEED_SECRET` (secret), `NODE_VERSION=20`.
The `FALKORDB_*` names match the local convention in `scripts/check.mjs` / `.env.example`; `FALKORDB_GRAPH_NAME` (`aftershock:demo`, ADR 0001) and `SEED_SECRET` are consumed by the M2 graph/seed path. The browser bundle must never contain DB credentials.

## CI
- `.github/workflows/ci.yml` — triggers: push to `main` / `feat/**`, PRs to `main`; concurrency group per ref; Node 20.
- Steps: `npm ci` → `npm run typecheck` → `npx vitest run` → `npm run build`.
- **`npm run check` is deliberately not part of CI** — no credentials in CI; graph integration tests skip gracefully when `FALKORDB_*` env is absent (AGENTS.md).

## Local run
1. `npm ci`
2. Copy `.env.example` → `.env`; fill FalkorDB credentials (git-ignored; connection details in `FALKORDB.md`).
3. `npm run dev` · or `npm run build` + `npm run typecheck` + `npm test`
4. `npm run check` — live connectivity smoke (connect, list graphs, create/read/delete a smoke graph, cleaned up after), **local only**, requires `.env`.

## Seed / rebuild strategy (disposable free-tier graph)
- FalkorDB Cloud Free has no continuous persistence or backups (ADR 0001) — the graph is treated as **disposable**; fixtures are versioned, synthetic-only, and non-sensitive (handoff §13). No real/private manuscripts ever enter the graph or repo.
- Idempotent seeding: `POST /seed` writes the fixed synthetic fixture set (DATA_CONTRACTS §6), guarded by the server-side **`SEED_SECRET` header** + rate limit + payload bounds + method guard; seed state is versioned via the `meta-seed-version` graph node (`seedVersion`), so reseeding over stale/partial state is safe (DATA_CONTRACTS §5–6; ADR 0001).
- **No public unauthenticated graph-write, reset, seed, or arbitrary-Cypher endpoint** exists or may be added (handoff §13; AGENTS.md). Reads use `roQuery` where possible; all Cypher is parameterized (`$param`); writes only from server-side function code.
- The app verifies graph existence/records (graph probe) before presenting graph-derived results (ADR 0001) — a vacated free-tier graph must fail visibly, not render statically.
- Graph + seed implementation ships with PR #2 `feat/m2-graph-library` (in review 2026-10-18; BUILD_STATUS records 47 unit + 6 live integration tests passing against the real instance).

## Verification checklist (per deploy / pre-merge)
- CI green (typecheck, tests, build).
- Hosted `/health` returns `{ ok: true, service: "aftershock-demo", version }`; post-M2 `graph` reflects a real connectivity probe with no secrets leaked in the response.
- `npm run check` passes locally with real credentials (pre-merge, non-CI).
- No secrets in the client bundle; logs content-redacted; external fetches time-boxed.
- Synthetic-only data confirmed on the public instance before publish.
- Seed idempotency smoke: reseed after a verified graph reset reproduces the fixture graph with the expected `seedVersion`.
- Negative test: no unauthenticated write/reset/Cypher route reachable.
- Graph hygiene: `aftershock:demo` present; `test_hosting` (another project's graph) untouched; smoke graphs deleted after use (FALKORDB.md conventions).

## Incident log
- **2026-10-18 — FalkorDB MCP connectivity incident:** MCP `list_graphs` hangs/drops intermittently; orchestrator-side MCP probing suspended; recovery delegated to the DevOps child session. App-side connectivity (official `falkordb` npm client over the same cloud instance) was verified working earlier the same day via `npm run check`; MCP-based live verification (e.g. reviewer's post-fix check of PR #2) is blocked until recovery. Tracked in `docs/BUILD_STATUS.md` blockers; limitations in `docs/KNOWN_LIMITATIONS.md`. (DevOps recovery report to be appended here when available.)
- **2026-10-18 — Netlify function filename rule:** Netlify rejects function filenames containing dots; the health unit test was relocated to `tests/netlify/` and the vitest include adjusted (BUILD_STATUS).
