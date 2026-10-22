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
| W3 | Make CI execute what the rules require | orchestrator | `.github/workflows/ci.yml`, `package.json` (engines), `server/package.json` (engines) | Workflow runs root suite + `server/` suite + typecheck + build for the candidate SHA; runtime matrix explicit; `engines` declared in both manifests |
| W4 | Independent read-only review of W1+W2+W3 | reviewer | — | Falsification attempt on each claim; findings addressed or recorded as blockers |
| W5 | Auditable handoff | orchestrator | `docs/BUILD_STATUS.md`, this file | SHA + commands + results + CI URLs + blockers + next action |

Dependency order: W1 ∥ W2 → W3 → W4 → W5. W3 may proceed while W1/W2 run because it owns different files.

### Runtime decision (deliberate, not a version-label change)

- **Supported Node for this repository: `>=20`** (declared via `engines` in both manifests). Node 20 is kept because it is the current CI runtime and the deployed functions' baseline.
- The root suite must pass on **both** Node 20 and Node 24 → CI runs a matrix; a single-version run would hide exactly the divergence found above.
- `falkordb@6.8.0` declares `engines: node >=22` (npm warns `EBADENGINE` on Node 20; it is advisory, and the graph client is exercised only through fakes in unit tests). `falkordb@6.5.0` declared `>=20`, `6.2.7` declared none. **Not changed in this sprint** (it touches the deployed dependency tree → needs its own approval); recorded as a known constraint in §6.
- `pdfjs-dist@4.10.38` declares `>=20` ✓ (the M9/M10 pin is Node-20-safe; `pdfjs-dist@6` would not be).

## 5. Correction to the M9/M10 completion report (recorded, not buried)

The M9/M10 completion report and `docs/BUILD_STATUS.md` stated that the 2 `report-export` PDF failures were a *pre-existing, worktree-only* pdfkit/vitest quirk. **That claim was wrong.** The clean-clone matrix in §3 proves: `main` passes 297/297 on both runtimes, while the M9/M10 SHA fails 2/400 on both — the regression was introduced by the branch (correlated with adding `pdfjs-dist` to the server dependency tree) and was invisible because CI never ran the server suite. The report's local evidence (398/400) was accurate; the *attribution* was not. Fixed by W2 and by the BUILD_STATUS correction in W5.

## 6. Known constraints and follow-ups (not silently dropped)

- `falkordb@6.8.0` wants Node >=22: either pin a Node-20-compatible minor or move the deploy runtime to >=22 — both touch production and need separate approval.
- Branch protection / required checks on `main` are **not** configured (GitHub API reports no protection on `main`); configuring them needs repository-admin rights the agent account may not hold. Until then the orchestrator enforces the stop manually and reports the gap — per AGENTS.md, "not protected" is a release-governance gap, not a safeguard.
- `.github/workflows/e2e.yml` targets `AFTERSHOCK_BASE_URL`, defaulting to the long-lived production site → a green e2e run does **not** prove the candidate SHA is deployed. Exact-SHA preview identity remains P1 work.
- `docs/ops/ci-reliability-premerge.md` (a milestone-scoped variant of this plan) was never created; this file supersedes it and is deliberately milestone-agnostic.

## 7. Definition of done for this sprint

- [ ] Root suite green on Node 20 and Node 24 (clean clone, committed lockfiles) — no assertion weakened.
- [ ] `server/` suite green on Node 20 and Node 24, including the M9/M10 branch (the pdfkit regression fixed at the source, not suppressed).
- [ ] `.github/workflows/ci.yml` runs root suite + `server/` suite + typecheck + build; matrix explicit; `engines` declared in both manifests.
- [ ] A deliberately failing `server/` unit test makes the required check fail (proved by a controlled local run of the workflow's server-suite command, not by pushing broken code).
- [ ] Independent read-only review completed; findings addressed or recorded as open blockers.
- [ ] PRs opened for `fix/ci-reliability` and for the M9/M10 branch; **no merge, no deploy** without explicit user approval.
- [ ] `docs/BUILD_STATUS.md` records SHAs, commands, results, CI run URLs, blockers, and next action — and carries the §5 correction.
