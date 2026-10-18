# ADR 0001 — Minimum Viable Stack (Aftershock demo)

## Decision
- **Frontend:** Netlify-hosted static SPA (Vite + React + TypeScript + Tailwind + shadcn/ui), editorial/retro-academic styling.
- **Backend:** Netlify Functions (Node 20, TypeScript) as the only server-side runtime. No always-on server.
- **Graph:** FalkorDB Cloud Free (`instance-ky5pnxl21`, ap-south-1) via official `falkordb` npm client, server-side only. Graph name: `aftershock:demo`.
- **Source control:** GitHub `Anshieee/aftershock` (main). CI via GitHub Actions.
- **Data:** Synthetic demo fixtures only. No real/private manuscripts on free tier.

## Why
- Fixed hosts (Netlify + FalkorDB Free) are already provisioned and verified (`npm run check` passes).
- Keeps $0 footprint; no new paid infra. Netlify Functions suffice for bounded API + seeding.
- FalkorDB is the required reasoning substrate; browser never connects directly.

## Netlify function strategy
- `/.netlify/functions/*` (or Netlify Functions v2 routes) for API.
- Functions are stateless, short-lived. Long analysis runs are staged: accept job → return status token → client polls `GET /status/:id`. If a step exceeds function time limits, degrade to guided synthetic demo path and disclose.
- No background workers; no queues. Idempotent seed endpoint guarded by server-side secret + rate limit.

## FalkorDB connectivity
- Reads `FALKORDB_HOST/PORT/USER/PASSWORD` from Netlify env (server-side only).
- Plaintext RESP (no TLS on free tier). Connections originate only from Netlify function runtime.
- Read queries use `roQuery`; writes use `query` with parameterized Cypher (`$param`).
- One graph per concern: `aftershock:demo`. Ask `db.list()` before create.

## Connection security & demo-only restrictions
- Free tier: **no TLS, no continuous persistence, no backups, no HA**. Treat graph as disposable.
- Synthetic demo data only. Disable/guard real user upload on public instance until secure transport/storage exist.
- No private manuscripts, review notes, secrets, or confidential docs in graph or repo.
- No open unauthenticated graph-write/reset/Cypher endpoints. Seed/reset protected by server secret + rate limit + method guard.
- Credentials in Netlify env only; never in client bundle, logs, screenshots, issues.
- CORS allowlist, payload/rate bounds, input validation, query timeouts, content-redacted logs.
- Sentry (if used) scrubbed for private text.

## Free-tier durability
- Graph may reset on restart. Implement idempotent versioned seeding (`seedVersion` in graph metadata) invoked by controlled server action; UI verifies graph existence before showing results.
- Do not claim durable personal Review Queue/Activity on disposable instance; demonstrate with session state + reproducible synthetic data.

## Residual risk
- Plaintext transit between Netlify runtime and FalkorDB cloud; interception/exposure risk accepted only for synthetic demo data. Production migration requires TLS-capable graph tier + durable storage + auth.

## Consequences
- P0 delivers guided synthetic demo + honestly scoped import path; arbitrary full PDF/reflow may be P1.
- All exports disclose incomplete status and unresolved counts.
