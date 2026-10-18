# Aftershock — Project Rules for Agents

Authoritative spec: `AFTERSHOCK_OPENCODE_HANDOFF.md` (+ `docs/` contracts). Read before coding.

## Scientific integrity (hard rules)
- No fabricated studies, no invented paper passages, no fake graph edges, no simulated "successful scans" or fake download links.
- Real publication records vs. synthetic content must be distinguishable everywhere (`isSynthetic` flag; UI labels synthetic content `FICTIONAL / GUIDED DEMO`).
- Never conflate relation types: cites ≠ discusses ≠ supports ≠ contrasts ≠ method-reuse ≠ has-status-notice.
- A review flag means "needs human review" — never "claim disproven/proven".
- Every material graph edge carries `provenanceKind`, `rationale`, `sourcePointer`, `analysisVersion`, timestamps per `docs/DATA_CONTRACTS.md`.
- Retrieval or source-check failures must be disclosed, never papered over.

## Security & data boundaries (hard rules)
- `.env`, `logs/`, `node_modules/` are git-ignored. Never commit, print, or pipe credentials into logs/screenshots/PR text.
- FalkorDB Cloud Free = no TLS, no durable persistence. **Synthetic demo data only.** Never route real/private manuscripts or sensitive notes through it.
- Secrets live server-side (Netlify env) only. The browser bundle must never contain DB credentials.
- No public unauthenticated graph-write / reset / arbitrary-Cypher endpoint. Seed/reset behind server secret + rate/payload bounds.
- External fetches are time-boxed; logs are content-redacted.

## Engineering
- Work on feature branches in dedicated worktrees; small PRs; main protected by CI. No force-push to main.
- Tests are part of done: unit + integration (graph integration tests skip gracefully when `FALKORDB_*` env is absent in CI but must run locally with `.env`).
- Verify behavior, don't claim it: every "done" cites concrete evidence (URL, test output, query result).
- Graph reads via `roQuery` when possible; all Cypher parameterized (`$param`).
- See `FALKORDB.md` for connection conventions and `npm run check`.

## Status
Keep `docs/BUILD_STATUS.md` current (milestones, URLs, blockers). Decisions in `docs/decisions/`.
