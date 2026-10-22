# Aftershock — Project Rules for Agents

Authoritative spec: `AFTERSHOCK_OPENCODE_HANDOFF.md` (+ `docs/` contracts). Read the relevant sections before coding.

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

## Engineering and Git
- Work on feature branches in dedicated worktrees; use focused commits and PRs. Do not directly merge or push feature changes to `main` without explicit user approval. Never force-push `main`.
- Inspect branch, worktree, uncommitted changes, and actual current HEAD before modifying anything; preserve unrelated work.
- Do not assume `main` is protected: confirm actual GitHub branch protection / required checks. If missing, report it as a release-governance gap, not as an enforced safeguard.
- Tests are part of done: focused unit tests, relevant integration tests and independent review. Graph integration tests may skip without `FALKORDB_*` in CI; run live integration only in an authorized, safe environment.
- Graph reads via `roQuery` when possible; all Cypher parameterized (`$param`). See `FALKORDB.md` and `npm run check`.

## Mandatory verification and release gates (all milestones)
- **Evidence over assertions.** Treat agent, reviewer, and local-test reports as claims until reproduced. For each completion claim, record the exact commit SHA, command, result, and supporting CI run URL or artifact. State **NOT VERIFIED** when evidence is unavailable.
- **Check GitHub Actions for the exact candidate HEAD SHA.** A locally green suite does not override a failing, missing, cancelled, or still-running required remote check. Never describe such a revision as fully verified or release-ready; stop merge/deploy and diagnose it.
- **Verify complete test coverage.** The automation must execute both the root/frontend suite and the separately configured `server/` unit suite, plus typecheck and build. Before relying on the gate, verify workflow config actually includes these steps; do not infer coverage from test counts. Run additional integration/e2e checks appropriate to the change.
- **Align runtimes and dependencies.** Reproduce CI failures under CI's declared Node version and dependency lockfiles; resolve version incompatibilities deliberately. Never make test assertions weaker merely to get green. When a failure predates the branch, prove that on a clean baseline and disclose it; it remains a release blocker until fixed or explicitly accepted by the user.
- **Independent review.** For nontrivial changes, use a read-only reviewer given requirements, source diff, and test evidence—not the implementer's verdict. Reviewers should attempt to falsify at least one important claim. Integrate only after findings are addressed or recorded as open blockers.
- **No false E2E success.** Tests must fail when required functionality is missing; do not accept an unavailable/placeholder screen as a success state when the feature is expected. Do not widen selectors or acceptance regexes merely to match the current UI.
- **Build-to-deploy identity.** For any hosted acceptance or production deployment, verify that the served build identifies the exact expected commit (or immutable build artifact). A 200 response or green test against an older Netlify site does not verify the current change. Test against an exact-SHA preview or the newly deployed artifact; document manual publish steps where Git-based auto-deploy is absent.
- **Merge and deploy policy.** Open a PR for milestone integration; require verified green checks for the candidate SHA, an independent review, and explicit user approval before merging or deploying. Where protections are not configured, the orchestrator must enforce a manual stop and report the gap. Do not touch production during experimental/backend-only work.
- **Finish with an auditable handoff.** Update `docs/BUILD_STATUS.md` with branch, SHA, test commands/results, CI URLs, deploy ID/served SHA if applicable, unresolved blockers, and next action. Preserve recoverable checkpoints for interrupted sessions; clean up merged worktrees/branches only after verifying no unique unmerged work remains and cleanup is authorized.

## Orchestration defaults
- Use the project's atomic-orchestrator skill when delegating multi-file work. Keep tasks small, with exact file ownership, dependencies, acceptance criteria and focused tests. Only parallelize genuinely independent tasks; prefer no more than two active coding workers on a 16 GB workstation unless memory evidence supports more.
- The orchestrator owns cross-module contracts and the final integration gate. Do not let subagents independently alter shared APIs/configuration or declare the whole milestone complete.
- Do not substitute longer prompts, more agents, or larger test counts for verified outcomes.

## Status
Keep `docs/BUILD_STATUS.md` current (milestones, URLs, blockers). Record architectural decisions in `docs/decisions/`.
