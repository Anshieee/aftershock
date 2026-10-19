# Aftershock — Overnight Development Checkpoint (2026-10-19)

Running log for the autonomous session started 2026-10-19 ~04:45 UTC. Orchestrator context; concise entries.

## Session start state (verified)
- Repo /home/ansh/Projects/aftershock, main `bef7a64` (= deployed production build `6598bc5` + docs).
- Production https://aftershock-demo.netlify.app healthy: `/health` via `/.netlify/functions/health` = ok, graph `aftershock:demo` reachable, seeded `seed-1`, 17 records (16 fixture + 1 AnalysisRun).
- M5/M6/P2/P3 all merged+deployed from the previous overnight run. Deploy discipline: commits to main DO NOT auto-publish; production updates need manual `netlify deploy --build --prod`.

## Wave 1 — core workflow verification (COMPLETE, ran 04:45–05:25 UTC)
- Path/ordering false alarm resolved: client calls `/.netlify/functions/<dash-named>` directly; root paths (`/health`, `/review-decide`) intentionally fall through to the SPA fallback (netlify.toml canonical dash-path convention; no rewrites inside the reserved namespace). External root-path tests are NOT the app surface — documented to avoid repeating this misdetect.
- E2E vs production: desktop 28 passed / 0 failed / 4 skipped (24s); mobile 31 passed / 1 flaky-preexisting (empty-states /library retries green) / 0 failed (30s). Real review-decision recording verified earlier in `/activity`.
- Export content check: POST /export-report (pdf) 200, real PDF, review-decision section present. NOTE: "No review decisions" at time of check because the guided-seed had wiped seeded-scope decisions — root-caused below, not an export bug.

## Wave 1 completion — INTEGRITY FIX (merged to main 05:40 UTC)
**Bug:** recorded ReviewDecision/HAS_REVIEW_DECISION edges/RevisionProposal were stamped `seeded:true` → seeded-count idempotency accounting saw "drift" → next guided-seed (incl. every landing E2E run) wiped the audit history. Violated append-only audit invariant; explains "decisions vanish" reports.
**Fix (branch `fix/reseed-preserves-audit`, commit `78102b7`, merge `5c0aae5`):**
1. reviewState.mjs: decisions/proposals/link edges stamp `seeded:false` (never fixture content).
2. seed.mjs wipe: hard label guard `AND NOT n:ReviewDecision AND NOT n:RevisionProposal` (protects legacy/mis-stamped nodes).
3. seed.mjs relinkReviewDecisionEdges: after a wipe, re-establishes case→decision edges (idempotent read-first + UNWIND); seed result carries `auditRelink` when it ran.
4. Tests: review-state assertions updated (seeded:false invariant pinned); new unit `seed.relink.test.mjs` (5 tests); new live integration suite "audit survival across reseeds" (3 tests) — real decision survives noop reseed AND forced drift reseed, linkage healed, counts exact.
5. DATA_CONTRACTS §4 note "Audit artifacts & reseed" added.
**Evidence:** server unit 160/160; live integration 9/9 (incl. drift reseed + relink); `npm run check` smoke pass; test_hosting + aftershock:demo untouched.
**Deploy status:** merged to main + pushed (5c0aae5) but NOT yet deployed to production — deploying with the next feature wave.

## Wave 2 — P4 Find Evidence (IN FLIGHT)
- Design of record written to /tmp/opencode/p4-spec.md (endpoint contract, payloads, safeguards).
- Worktrees: /home/ansh/Projects/aftershock-wt-p4-backend (feat/p4-evidence-backend), …-p4-frontend (feat/p4-evidence-frontend), both at bef7a64 root + node_modules installed.
- Backend agent (ses_ead79b7d6ffe2x9JsWIoHg4sqz, glm-5.3-flash-free): `netlify/functions/evidence-find.mjs` + `server/evidenceSearch.mjs` + tests + contract note. Prepare/search modes, Crossref polite pool, 6s timeout + ≤1 retry, DOI dedupe, honest providersStatus, NO graph writes.
- Frontend agent (ses_ead79b7d4ffeFHSFTnbAqFY6uA, glm-5.3-flash-free): api.ts client fn + types, FindEvidencePanel component + tests, ReviewQueuePage integration, deterministic stubbed E2E.
- Merge order: backend → main, then frontend (single-owner files; api.ts is frontend-owned).

## Queue (next after P4 merge)
1. Deploy verified main to production (netlify CLI).
2. Crossref contact email env var — set via netlify MCP if tool supports (non-secret; else omit mailto gracefully).
3. Wave 3 doc intelligence: metadata-only tier reality (server/importAnalyze.mjs: content NEVER stored; analysis only for seeded fixture). Candidate: bounded in-memory reference/DOI extraction returned in import response (NOT persisted), honest scope.
4. Wave 4 hardening: envcheck diagnostic gating; AnalysisRun stage-enum alignment; rate-limit windows tuning; netlify.toml test tidy.
5. Mobile E2E + typecheck loops after each merge; BUILD_STATUS/KNOWN_LIMITATIONS refresh at wave end.
