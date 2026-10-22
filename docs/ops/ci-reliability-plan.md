# CI Reliability & Release-Gate Sprint

**The binding rules live in `AGENTS.md`** → sections *Mandatory verification and release gates* and *Merge and deploy policy*. This file is **only** the concrete work plan, the reproduced evidence, and the definition of done for one sprint. It is not a rulebook, and it is not scoped to a single milestone: any future milestone inherits the same gates.

Status: in progress (started 2026-10-22). Owner: orchestrator.

## 1. Why this sprint exists

The repository's CI has been failing on `main` since at least 2026-10-19, so *no* commit could honestly claim a green remote gate. Three concrete gaps were reproduced (matrix in §3):

1. **The root suite fails on the CI runtime (Node 20).** `src/lib/api.ts` validates a binary download with `payload instanceof Blob`. Under Node 20 + jsdom, `Response.blob()` returns the runtime's own `Blob` class, which is not `instanceof` the environment's global `Blob` → the client throws `Export endpoint returned a non-blob body`. The same tree passes on Node 24. The check is also genuinely cross-realm-fragile in production (iframes, workers).
2. **The `server/` unit suite is never executed by CI.** `.github/workflows/ci.yml` runs root `npm ci`, typecheck, `npx vitest run`, build. The separately configured server suite (`server/vitest.unit.config.js`) is not invoked at all, so a server regression cannot fail CI.
3. **A branch-introduced server regression went unnoticed for exactly this reason** (see the correction in §5).

## 2. Rules that already apply (from AGENTS.md — not restated)

- Evidence over assertions: record exact SHA, command, result, CI run URL; say **NOT VERIFIED** when evidence is missing.
- A locally green suite never overrides a failing/missing/cancelled/still-running remote check for the candidate HEAD SHA.
- The automation must execute root suite + `server/` suite + typecheck + build; verify the workflow config actually includes them.
- Reproduce failures under the CI-declared Node version and lockfiles; never weaken assertions to get green.
- Independent read-only review; integrate only after findings are addressed or recorded as blockers.
- Open a PR; require green checks for the candidate SHA + independent review + explicit user approval before merge or deploy.

## 3. Reproduced failure matrix (evidence, 2026-10-22)

Clean clones (`git clone` → `npm ci` from the committed lockfiles), not reused worktrees.

| SHA | Suite | Node 20.20.2 | Node 24.22.0 |
|---|---|---|---|
| `main` `57ddfb4` | root (`vitest` 2.1.9) | **FAIL — 7 failed / 524 passed / 13 skipped** (2 files) | PASS — 531 passed / 13 skipped |
| `main` `57ddfb4` | `server/` (own vitest 3.2.7), **server-only install** | **FAIL — 2 failed / 295 passed** | **FAIL — 2 failed / 295 passed** |
| `main` `57ddfb4` | `server/` with root `node_modules` present | PASS — 297/297 | PASS — 297/297 |
| `feat/m9-m10-doc-parsing` `7d28889a` | `server/`, server-only install | **FAIL — 2 failed / 398 passed** | **FAIL — 2 failed / 398 passed** |

Failing root tests (Node 20): `src/lib/api.test.ts` → *exportReport POSTs … returns a PDF Blob*, *exportReport defaults to pdf format*, *exportRevisionPack … returns a DOCX Blob*, *exportAnnotatedManuscript … returns a Blob*; `src/pages/ExportPage.test.tsx` → 3 × *generates a … download through POST /export-* (downstream of the same client error).

Failing server tests (both runtimes): `test/unit/report-export.unit.test.mjs` → *returns 200 with PDF binary and correct headers for a valid request*, *renders a PDF through the real renderer with a rich decision trail*. Error: `Error: Cannot find module '#standard-fonts/Helvetica'` — pdfkit's package-scoped `imports` map cannot resolve from the virtual path the runner assigns to an **inlined** copy.

> **Correction — three successive claims, ending with the proven mechanism.** (a) The M9/M10 completion report attributed these 2 failures to a *worktree-only, pre-existing* pdfkit/vitest quirk. (b) A first clean-clone matrix appeared to show `main` passing and the branch failing, which suggested the branch *introduced* them. (c) That matrix was confounded — the clone had a root `node_modules`, which masks the failure. Decisive experiments (server-only install; removing `pdfjs-dist`; `main` failing identically) prove the real mechanism: **the failure depends on the install layout, not on the branch and not on the Node version** — with a server-only install, vite inlines `pdfkit` and its `#standard-fonts/*` map breaks. It affected `main` identically all along and was invisible because CI never ran the server suite. Fixed by externalizing `pdfkit` in the runner config + a regression guard. The original "not branch-introduced" conclusion happened to be right; its stated mechanism was wrong, and the failure stayed an unresolved release blocker until now.

CI run URLs (logs require admin rights; job-step conclusions were read via the API): `main` → https://github.com/Anshieee/aftershock/actions/runs/39337700559 (`Typecheck` success, `Unit tests (vitest)` failure, `Build` skipped); M9/M10 → https://github.com/Anshieee/aftershock/actions/runs/39726097799 (same step pattern).

## 4. Work plan

Ownership is exclusive per file; the orchestrator owns the cross-cutting contract and the final gate.

| ID | Task | Owner | Files (exclusive) | Acceptance |
|---|---|---|---|---|
| W1 | Make the binary-download client realm-safe (production fix, not a test-only workaround) | frontend worker | `src/lib/api.ts`, `src/lib/api.test.ts`, `src/pages/ExportPage.test.tsx` | Root suite green on Node 20 **and** Node 24; the assertion still requires a real Blob (no weakening); production behaviour unchanged in browsers |
| W2 | Fix the latent pdfkit resolution failure under the server unit runner (affects `main` equally; surfaced only because the server suite now runs in CI) | server worker | `server/vitest.unit.config.js`, `server/test/unit/pdfkitResolution.test.mjs` | `server/` suite green on Node 20 **and** Node 24 in a clean clone **with a server-only install**; pdfjs extraction still verified; no test weakened |
| W3 | Make CI execute what the rules require | orchestrator | `.github/workflows/ci.yml`, `package.json` (engines), `server/package.json` (engines) |
| W3b | Make the release-gate rules permanent (project ruleset, not a one-off plan) | orchestrator | `AGENTS.md` | Workflow runs root suite + `server/` suite + typecheck + build for the candidate SHA; runtime matrix explicit; `engines` declared in both manifests |
| W4 | Independent read-only review of W1+W2+W3 | reviewer | — | Falsification attempt on each claim; findings addressed or recorded as blockers |
| W5 | Auditable handoff | orchestrator | `docs/BUILD_STATUS.md`, this file | SHA + commands + results + CI URLs + blockers + next action |

Dependency order: W1 ∥ W2 → W3 → W4 → W5. W3 may proceed while W1/W2 run because it owns different files.

### Runtime decision (deliberate, not a version-label change)

- **Supported Node for this repository: `>=20`** (declared via `engines` in both manifests). Node 20 is kept because it is the current CI runtime and the deployed functions' baseline.
- The root suite must pass on **both** Node 20 and Node 24 → CI runs a matrix; a single-version run would hide exactly the divergence found above.
- `falkordb@6.8.0` declares `engines: node >=22` (npm warns `EBADENGINE` on Node 20; it is advisory, and the graph client is exercised only through fakes in unit tests). `falkordb@6.5.0` declared `>=20`, `6.2.7` declared none. **Not changed in this sprint** (it touches the deployed dependency tree → needs its own approval); recorded as a known constraint in §6.
- `pdfjs-dist@4.10.38` declares `>=20` ✓ (the M9/M10 pin is Node-20-safe; `pdfjs-dist@6` would not be).

## 5. Correction to the M9/M10 completion report (recorded, not buried)

The M9/M10 completion report and `docs/BUILD_STATUS.md` stated that the 2 `report-export` PDF failures were a *pre-existing, worktree-only* pdfkit/vitest quirk. **That claim was wrong in its mechanism**, and it stayed an unresolved release blocker until this sprint closed it.

**Proven mechanism** (reproduced independently by the reviewer on `main` itself, server-only install, Node 20 and Node 24): with a **server-only** install — `server/node_modules` present, **no root `node_modules`** — vite cannot resolve `pdfkit` from the out-of-root importer `netlify/functions/export-report.mjs`, hands the runner the bare id, and **inlines** pdfkit. pdfkit's bundled standard fonts resolve through its own package.json `imports` map (`#standard-fonts/*`), which cannot resolve from the inlined virtual path `<root>/pdfkit` → `Cannot find module '#standard-fonts/Helvetica'` → the handler answers **500**. With a root `node_modules` present, pdfkit resolves to a real path and is externalized → native require → the imports map works → the suite is green.

**Therefore:** the failure was **not introduced by the M9/M10 branch** (`main` fails identically under a server-only install: 2 failed / 295 passed, and passes 297/297 with the branch's `server/vitest.unit.config.js` alone) — but the report's "worktree quirk, main is green" explanation was wrong, and per `AGENTS.md` a failure that predates the branch "remains a release blocker until fixed or explicitly accepted by the user". It was invisible because **CI never ran the `server/` suite**. Fixed by W2 (externalize `pdfkit` in the runner config + a regression guard that renders a real PDF through the production handler) and by the BUILD_STATUS correction in W5.

The `pdfjs-dist` correlation in the first matrix was a **confound**: that clone had a root `node_modules`, which masks the failure. Removing `pdfjs-dist` from `server/package.json` alone did not change the outcome.

## 6. Known constraints and follow-ups (not silently dropped)

- `falkordb@6.8.0` wants Node >=22: either pin a Node-20-compatible minor or move the deploy runtime to >=22 — both touch production and need separate approval. Two further lockfile deps also declare newer engines (`@axe-core/playwright@4.14.0` → `>=22.12`, `nanoid@6.0.2` → `^22 || ^24 || >=26`); neither is imported by the unit suites, but the declared `engines: ">=20"` is therefore **wider than the dependency tree's own declarations** — disclosed, not silently asserted.
- Branch protection on `main`: **CONFIGURED AND VERIFIED 2026-10-22** (authenticated API read-back): required status checks = the four new contexts (`typecheck, root tests, build (node 20|24)`, `server unit tests (node 20|24)`), force-pushes and deletions blocked. Two deliberate limits: `enforce_admins` is **off** and `required_approving_review_count` is **0** — the acting token is the repository owner's account, so a required GitHub approval would deadlock (GitHub blocks self-approval), and the "human approval before merge" gate therefore stays **procedural** (the orchestrator stops and asks). Per `AGENTS.md`, an unconfigured protection is a governance gap; a configured-but-bypassable one is reported the same way.
- `.github/workflows/e2e.yml` targets `AFTERSHOCK_BASE_URL`, defaulting to the long-lived production site → a green e2e run does **not** prove the candidate SHA is deployed. Exact-SHA preview identity remains P1 work.
- Each pushed SHA produces **two** CI runs (push + pull_request) with identical check names — duplicated minutes, not duplicated coverage; harmless but worth noting when reading run lists.
- `docs/ops/ci-reliability-premerge.md` (a milestone-scoped variant of this plan) was never created; this file supersedes it and is deliberately milestone-agnostic.

## 7. Definition of done for this sprint

- [x] Root suite green on Node 20 and Node 24 (clean clone, committed lockfiles) — no assertion weakened.
- [x] `server/` suite green on Node 20 and Node 24 (server-only install), including the M9/M10 branch (the latent pdfkit failure fixed at the source, not suppressed).
- [x] `.github/workflows/ci.yml` runs root suite + `server/` suite + typecheck + build; matrix explicit; `engines` declared in both manifests.
- [x] A deliberately failing `server/` unit test makes the required check fail (proved by a controlled local run of the workflow's server-suite command, not by pushing broken code).
- [x] Independent read-only review completed; its two blockers (the stale attribution in this file's §5 and in `docs/MILESTONES.md`) and its code nits are fixed in the follow-up commit; remaining nits are recorded in §6.
- [x] PRs opened: #9 (`fix/ci-reliability`) and #10 (`feat/m9-m10-doc-parsing`); **no merge, no deploy** without explicit user approval.
- [x] `docs/BUILD_STATUS.md` records SHAs, commands, results, CI run URLs, blockers, and next action — and carries the §5 correction.
- [x] Branch protection on `main` configured and verified by an authenticated API read-back (four required contexts; force-push and deletion blocked) — with the disclosed `enforce_admins=false` / 0-approval limits (§6).
- [ ] P1 follow-ups (deliberately out of this sprint): exact-SHA preview identity for hosted e2e; `falkordb` engine alignment; production deploy of the merged branch.
