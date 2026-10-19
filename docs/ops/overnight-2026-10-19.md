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

## Wave 1 completion — INTEGRITY FIX (merged to main 05:40 UTC, DEPLOYED 05:13 UTC)
**Bug:** recorded ReviewDecision/HAS_REVIEW_DECISION edges/RevisionProposal were stamped `seeded:true` → seeded-count idempotency accounting saw "drift" → next guided-seed (incl. every landing E2E run) wiped the audit history. Violated append-only audit invariant; explains "decisions vanish" reports.
**Fix (branch `fix/reseed-preserves-audit`, commit `78102b7`, merge `5c0aae5`):**
1. reviewState.mjs: decisions/proposals/link edges stamp `seeded:false` (never fixture content).
2. seed.mjs wipe: hard label guard `AND NOT n:ReviewDecision AND NOT n:RevisionProposal` (protects legacy/mis-stamped nodes).
3. seed.mjs relinkReviewDecisionEdges: after a wipe, re-establishes case→decision edges (idempotent read-first + UNWIND); seed result carries `auditRelink` when it ran.
4. Tests: review-state assertions updated (seeded:false invariant pinned); new unit `seed.relink.test.mjs` (5 tests); new live integration suite "audit survival across reseeds" (3 tests) — real decision survives noop reseed AND forced drift reseed, linkage healed, counts exact.
5. DATA_CONTRACTS §4 note "Audit artifacts & reseed" added.
**Evidence:** server unit 160/160; live integration 9/9 (incl. drift reseed + relink); `npm run check` smoke pass; test_hosting + aftershock:demo untouched.
**Deploy status:** DEPLOYED to production `6ad5a6cfcfc554f169258083` (main `e0f9c6c`) at 2026-10-19 05:13 UTC; `/health` ok. **Live regression proof 05:14 UTC:** POST /review-decide?caseId=claim-A recorded `39161bd9` → POST /demo-seed returned `alreadySeeded:true` (noop — accounting no longer sees drift) → GET /activity still shows the decision. Append-only demo behavior restored; production verified.

## Wave 2 — P4 Find Evidence (IN FLIGHT)
- Design of record written to /tmp/opencode/p4-spec.md (endpoint contract, payloads, safeguards).
- Worktrees: /home/ansh/Projects/aftershock-wt-p4-backend (feat/p4-evidence-backend), …-p4-frontend (feat/p4-evidence-frontend), both at bef7a64 root + node_modules installed.
- Backend agent (ses_ead79b7d6ffe2x9JsWIoHg4sqz, glm-5.3-flash-free): `netlify/functions/evidence-find.mjs` + `server/evidenceSearch.mjs` + tests + contract note. Prepare/search modes, Crossref polite pool, 6s timeout + ≤1 retry, DOI dedupe, honest providersStatus, NO graph writes.
- Frontend agent (ses_ead79b7d4ffeFHSFTnbAqFY6uA, glm-5.3-flash-free): api.ts client fn + types, FindEvidencePanel component + tests, ReviewQueuePage integration, deterministic stubbed E2E.
- Merge order: backend → main, then frontend (single-owner files; api.ts is frontend-owned).

## Post-merge status (updated 05:15 UTC)
- main `e0f9c6c` typecheck clean; production deploy `6ad5a6cfcfc554f169258083` verified live (health ok; decision survives reseed).
- Audit item #1 (AnalysisRun stage-enum alignment) already resolved on main: importAnalyze writes `status:'completed', stage:'results'` per contract §4 — removed from queue.
- Remaining hardening queue: envcheck diagnostic gating; PENDING_FUNCTION_FILES tidy check; rate-window tuning; E2E empty-states /library flake (pre-existing, retries green).

## Queue (next after P4 merge)
1. Deploy verified main to production (netlify CLI).
2. Crossref contact email env var — set via netlify MCP if tool supports (non-secret; else omit mailto gracefully).
3. Wave 3 doc intelligence: metadata-only tier reality (server/importAnalyze.mjs: content NEVER stored; analysis only for seeded fixture). Candidate: bounded in-memory reference/DOI extraction returned in import response (NOT persisted), honest scope.
4. Wave 4 hardening: envcheck diagnostic gating; AnalysisRun stage-enum alignment; rate-limit windows tuning; netlify.toml test tidy.
5. Mobile E2E + typecheck loops after each merge; BUILD_STATUS/KNOWN_LIMITATIONS refresh at wave end.

## P4 DEPLOYED + verified (06:20 UTC block)
- **KG filter-init race fixed at root** (`edcf151` → merge `61c26df`): filter sets + filtersReady now initialize inside load()'s success handler in the same React batch as phase:'ready' — previously a separate effect ran one tick after the canvas first rendered, and a filter change landing in that window was clobbered by the initializer (this was the intermittent KnowledgeGraphPage test failure under full-suite parallel load; also an in-principle user race). Full vitest 439/13-skip/0-fail across THREE consecutive runs; typecheck clean.
- **Production deploy `6ad5aeeb5d9eeb73735e1bf2`** from main `61c26df` (netlify CLI manual deploy).
- **Find Evidence live-verified on production:**
  - Prepare mode HTTP 200: claim context + suggestedQuery + provider roster + 5 honest caveats, no external fetch.
  - Search mode HTTP 200: 8 real Crossref candidates, each `retractionStatus:unknown / evidenceRelationship:unverified / independence:unknown / fullTextAvailability:unknown`; `providersStatus:[{id:'crossref',status:'ok'}]`.
  - Rate design observed working: back-to-back second call → honest 429 rate-limited (per-IP cooldown 60 s, ≤10/10 min — by design, tighter than write routes).
- **E2E vs production: 74 passed / 0 failed / 4 skipped** (desktop + mobile + find-evidence), 48.7 s.
- **Docs:** BUILD_STATUS (P4 row + verification section + blocker refresh), MILESTONES (M7 shipped bullet), KNOWN_LIMITATIONS (Find Evidence v1 section), decisions/0002-find-evidence-design.md (new ADR).
- Next: Wave 3 — bounded in-memory reference/DOI extraction for imports (metadata-only tier; NEVER persisted to graph), TXT-first honest PDF limits, synthetic fixtures only.

## Wave 3 launch + small fixes (11:20–11:30 UTC block)
- **KG filter-init race fix committed** `edcf151` → merge `61c26df` (see P4 block above for evidence).
- **fixtureId display-quote drift fixed** (`d31ae56`): `str()` (error-message display helper that JSON-quotes strings) was used for the SeedMeta `fixtureId` DATA value — the graph stored literal quoted characters. New `coercePlainString()` for stored values + regression test (`plan.metaNode.fixtureId` has no quotes). Server unit 220/220. Existing seeded graph heals on next drift reseed (noop reseeds don't rewrite the meta node; cosmetic until then).
- `.zcode/` (local agent-role config) added to .gitignore, files untouched (`c26575c`).
- **Wave 3 (in-memory import metadata extraction) launched** — two parallel MEDIUM agents on worktrees:
  - backend `ses_ead461980ffeSMJxveCZSfkMpa` on `feat/w3-meta-extract-backend` (`/home/ansh/Projects/aftershock-wt-w3-backend`): `server/metaExtract.mjs` pure DOI/reference extraction module (TXT only, 512 KiB scan budget, ≤50 DOIs, tolerant decode, honest attempted:false + reason for pdf/docx), handler integration (extraction must never fail the import), unit tests, DATA_CONTRACTS note. NO graph writes.
  - frontend `ses_ead46197effecaSk2oa9ugShu2` on `feat/w3-meta-extract-frontend` (`/home/ansh/Projects/aftershock-wt-w3-frontend`): typed optional `extraction` member in `src/lib/api.ts`, honest "Detected in your file — unverified candidate references" section in ImportPanel, unit + stubbed E2E.
  - Design of record: `/tmp/opencode/wave3-spec.md`.
- Deploy decision: sweep `d31ae56`/`c26575c` into production in the Wave-3 deploy after both branches merge (fixtureId fix is cosmetic; no urgency).
- Empty-states `/library` E2E flake: did NOT reproduce in the last two full production sweeps (74/0/4 clean); leaving spec as-is per bounded-diagnostics constraint.

## Wave 3 complete — DEPLOYED + live-verified (11:35–11:45 UTC block)
- Backend merged `42becc9` (branch commit `3e2c42b` + wording polish `10a14f9`); frontend merged `baa23a0` (commit `2a6a668`). Both agent diffs reviewed by orchestrator before merge: only owned files touched; `registerDocumentImport` byte-identical; honesty contract intact.
- One merge-tail fix by orchestrator: `f91b8a9` aligned the handler-test's expected extraction-failure string with the polished wording (the agent had pinned the earlier "Recursive…" string from my spec typo).
- **Gates on merged main `baa23a0`:** root suite 449 passed / 13 skipped / 0 failed; typecheck clean; production build clean.
- **Production deploy `6ad5b322b4ae0df977a3e1bf`.**
- **Live verification vs production:** synthetic TXT import → `extraction.attempted:true`, 326/524288 bytes scanned, both planted DOIs detected with exact occurrence counts (2 and 1 — doi.org URL form counted once), snippets + verbatim caveat present, `contentStored:false` unchanged; synthetic PDF import → honest `attempted:false` + reason, no dois key. Both test docs are synthetic-only content (safe for the no-TLS graph).
- **Production E2E: 80 passed / 0 failed / 4 skipped** (was 74 pre-W3; +6 new extraction/coverage tests).
- Docs: BUILD_STATUS (Wave 3 row + verification section), KNOWN_LIMITATIONS (import extraction scope), this checkpoint.
- Note: two synthetic verification docs now exist in demo Library (`wave3-verify-synthetic.txt`, `wave3-pdf-check-synthetic.pdf`) — real registrations of synthetic test files with honest metadata; harmless and disclosed.
- NEXT: Wave 4 — reliability/security hardening + first M7 candidate (grouped shared-data dependencies is parked pending design; feasibility via read-only Cypher traversal).

## Wave 4 complete — DEPLOYED + live-verified (11:55–12:10 UTC block)
- Both W4 agent branches reviewed against the Wave-4 spec (diff vs merge-base: only owned files) and merged: backend `3bcc8f7` (op `3e2c42b`-style pure module + handler + 20 unit tests + opt-in live integration 4/4), frontend `4a9150a` (panel + 12 tests + 4 stubbed E2E). Pairing seam in the route-drift guard retired after both halves landed (strict empty PENDING_FUNCTION_FILES restored, `a0f254b`).
- **Production-relevant integrity drift found while verifying live:** user imports were GHOSTS — M4-era registration never stamped `seeded`, and openCypher `n.seeded = false` does not match ABSENT properties → user imports invisible to BOTH document cohorts since P3. Fixed on main (`274cc75` registration stamps seeded:false + `coalesce` bucketing in readDocuments; `a5c7541` bounded honest imported read: newest-first cap 20 + importedTotal + truncated + Library disclosure). 183 legacy demo-traffic metadata rows surfaced (all contentStored:false, synthetic test traffic by construction — no private content was ever stored).
- **E2E integrity guard worked as designed:** the queue's VERDICT_LANGUAGE body guard failed the new panel's note ("never marks a claim disproven" — honest negation of a banned word). Reworded to upheld/rejected (`878f592`); guard semantics unchanged. Deployed `6ad5b97e42e0e37dd5416b6a`.
- **Live verification vs production:** independence-groups HTTP 200 with honest zeros (supportingCitationUses 1, sharedGroups 0, groups [] — fixture has exactly one supporting claim; historical mention correctly excluded), caveat + limitations verbatim. documents-imported returns bounded envelope (importedTotal 183 → newest 20, truncated true).
- **Gates on merged main:** root 472/13-skip/0-fail; server 260; typecheck + build clean; **production E2E 88 passed / 0 failed / 4 skipped** (was 80 pre-W4).
- Docs: BUILD_STATUS (W4 row + verification section + ghost-drift finding), KNOWN_LIMITATIONS (independence scope), this checkpoint.
- Commit message hygiene note: bash interpolated `$seeded` inside one commit message (`274cc75`) — body fragments lost; bullets remain accurate; NOT amended (no force-push main).

## Session wrap-up block (12:15–12:20 UTC)
- Page-attached rate budget for independence-groups shipped (`04e362c`): 1 s anti-hammer gap + 30/10 min window (real abuse bound), typed 429 unchanged. Deviation from the activity-mirror default is deliberate and documented in-code (the panel fetches on every queue page load; a reviewer navigating between pages must not see honest-but-annoying 429s). New handler tests: different-IP isolation, realistic navigation burst (fake timers), window-exhaustion refusal. Server 260; root 474/13-skip/0-fail.
- Deploy `6ad5be2ceeaad83914613fb6`; live check: 3 rapid calls all HTTP 200.
- a11y: critical-violation axe scan extended to all five remaining primary pages (review-queue/library/activity/investigations/export) — zero criticals vs production (`8666a2d` parent `8e2e219`).
- Final production sweep: **89 passed / 0 failed / 4 skipped** — the only flake is the pre-existing `/library` empty-states flake (retries green; bounded-diagnostics constraint keeps it from deeper chasing).
- MILESTONES.md updated (W3 + W4 shipped bullets). BUILD_STATUS current. Checkpoint file current.

## Mission pivot — dedicated UX/UI redesign (starts 12:40 UTC)
- **User directive: highest-priority product-design milestone; M7 feature expansion PAUSED** until the primary experience is redesigned and visually verified. Production stays untouched until the user's visual review (no --prod deploy of redesign work; draft/preview deploy only for approval).
- Phase A audit DONE: before captures committed (`docs/design/assets/2026-10-19/before/`: home @1440×900/1366×768/390×844 + review-queue/library/activity/investigations/export/graph). Diagnosis: `docs/design/2026-10-19-ux-audit.md` — top-aligned dashboard hero, two equal-weight indigo CTAs (competing "Choose a document" full-width button), implementation jargon in hero zone ("rate-limited API" as marketing copy), always-expanded disclaimer wall in first viewport, nav labeled Overview not Home, palette ≈ but ≠ approved values.
- Phase B design-of-record: `docs/design/2026-10-19-redesign-spec.md` — frozen token table (approved palette + derived tints), shell/nav spec (Overview→Home, `/overview` route stays mounted for e2e, GUIDED-DEMO BUILD folded into diagnostics details, mobile horizontal-scroll nav), homepage composition (centered hero "Follow the evidence. Understand what changed.", single launcher card with ONE primary CTA + outline "Choose a document" toggle that reveals the untouched ImportPanel, honest quiet line + expandable integrity note, quiet discovery links, quieter featured card), mechanical e2e-update table (landing/layout/console/import/analyze — honesty assertions preserved), acceptance gates (npm check, playwright subset + full sweep, axe zero-critical @3 viewports, implementer screenshot self-review, then orchestrator screenshot review).
- Wave U1 (Phase C) delegated: worktree `/home/ansh/Projects/aftershock-wt-uxhome` branch `feat/ux-homepage` from `b9b287d`; single implementer owns tokens/shell/landing + the listed test files only; ImportPanel internals and all other pages explicitly out of scope.

## Wave U1 — UX redesign Phase C homepage (COMPLETE 21:35 UTC; NOT deployed to production)
- Mission pivot logged above (12:40 UTC). M7 paused. Production intentionally UNCHANGED; redesign lives on the draft alias only pending the user's visual review.
- Merged: `feat/ux-homepage` `79cab0c` → main `e10b984` (+ docs). Worktree composite diff 11 files, +374/−205.
- Gates: typecheck + build clean; unit 476/13-skip (root); hosted-acceptance e2e **88 passed / 0 failed / 2 flaky** (pre-existing `/library` empty-states, retry green) in 53 s against **built dist + local functions + real graph** (`netlify dev` with a temporary in-worktree `[dev] framework="#static"` pin — reverted; toml guard 65/65 after revert; netlify.toml diff clean).
- First-person verification: draft screenshots at 1440×900 / 1366×768 / 390×844 inspected (`docs/design/assets/2026-10-19/after-u1/`); expanded-picker capture; sidebar nav probes (library/review-queue/graph/investigations); reachable-by-keyboard covered by the updated landing.spec; real guided-seed probe → `/results` real graph-derived content (`results-real-seeded.png`).
- Learnings: (a) the e2e harness is hosted-acceptance (`AFTERSHOCK_BASE_URL`); running new specs against un-migrated production is invalid; (b) draft/alias deploys did NOT receive read-path graph env despite `--context deploy-previews` then `--context all` copies (values identical to production; root cause unconfirmed — CLI env introspection in this version exposes no context metadata; decision: stop chasing, CLI drafts keep honest degraded states on graph-dependent pages); (c) `netlify dev` framework mode serves vite dev assets → StrictMode double-invoke (e.g. find-evidence recorded 2 prepare calls) and lambda-local 30 s queueing timeouts under parallel load; the `#static` pin removes both artifacts.
- Draft approval URL (refreshed post-merge): https://uxr-u1--playful-entremet-45b0f2.netlify.app — production https://aftershock-demo.netlify.app still serves the previous UI.

## Wave U2 — design system applied to secondary pages (COMPLETE ~22:10 UTC; preview-only)
- `feat/ux-secondary-pages` `1947ed3` → main `de2d369`. **Presentation-only**: diff contains zero onClick/fetch/state lines across the six pages (Overview, Investigations, Library, Activity, Export, Knowledge Graph). Serif headings + kicker pattern, unified radius/button/panel language, one indigo per viewport, per-page column widths; knowledge-graph canvas untouched. ReviewQueuePage deliberately EXCLUDED (next wave owns queue parity — it was explicitly on the Phase-F list).
- Gates on merged main: typecheck + build clean; unit 476/13-skip; implementer's full hosted-acceptance sweep 88 passed / 0 failed / 2 flaky (both retry-green: pre-existing `/library` empty-states + an oversized-file timing flake) vs built dist + local functions + real graph; toml guard 65/65 after pin revert.
- Design-lead spot checks: draft captures of Library/Export (honest 503 panels on drafts = env artifact, not a defect) plus local built screenshots with real graph content committed as `docs/design/assets/2026-10-19/after-u2-secondary/` (nine captures incl. mobile review-queue + library). Zero off-system colors; honest states rendered in-system.

## Incident + rotation (22:00 UTC)
- **Secret exposure (self-inflicted, remediated):** `netlify-cli env:list --plain` printed site secrets into this session transcript (FALKORDB_PASSWORD incl. its weak literal value, SEED_SECRET, host/port/user). Cause: careless output filtering on my side; never a repo or log leak.
- **Remediation:** `SEED_SECRET` ROTATED site-wide (`--context all`, new `openssl rand -hex 32`); verified after rotation: `/seed` without header → unauthorized, `envcheck` with wrong header → forbidden ("configured value never disclosed"). The secret gates only raw `/seed` + `/envcheck` diagnostics (UI paths never send it: demo-seed/review-decide are user routes). Key not present in local `.env` — no local propagation needed.
- **User action recommended (non-blocking):** rotate the FalkorDB cloud password in the dashboard (DB holds only synthetic demo data; free tier is no-TLS — already a documented open risk; now visible in this transcript).
- Netlify env-state note: the five FALKORDB_* read-path keys carry duplicate identical values under extra contexts from my scoping attempts (`deploy-previews` + all) alongside production — zero behavioral change (values identical); drafts still degrade honestly.

## Wave U3 — review-queue parity + landing polish (COMPLETE ~22:45 UTC; preview-only)
- `feat/ux-review-queue-parity` `58d19bc` → main `cdea5de`. Presentation-only: serif heading + "Evidence review workspace" kicker, rounded-xl panels, record-decision = the indigo primary, outline secondaries, dead `notice-surface-deep` hover fixed in-family; landing hero `[text-wrap:balance]` + launcher focal lift. Zero logic-line diff; honesty copy/testids/aria/disabled verbatim; queue guard untouched.
- Gates: unit 476/13-skip; typecheck + build clean; static-harness sweep 87 passed / 0 failed / 3 flaky (all retry-green known flakes); toml guard 65/65 after revert.
- Screenshots committed: `docs/design/assets/2026-10-19/after-u3-queue/` (queue desktop+mobile, home after polish). Design-lead inspected queue capture: real flagged items + sage recorded state + independence panel with honest zeros + caveats render in-system.
- Remaining visual issues ledger: (1) draft/alias deploys show honest 503 degraded states on graph-dependent pages (env context; the user reviews populated states via committed local-graph captures or after approval deploy); (2) Activity page reads as a broad lavender field when the demo feed is all analysis_run events (semantic tokens honest; moderation candidate if it bothers the reviewer); (3) minor: case-id glyphs in queue card titles render with wide tracking under the heading font; (4) Phase F remainder per original plan (progressive disclosure polish across pages, possible OverviewPage retirement decision) is subject to the user's homepage/queue review verdicts.

