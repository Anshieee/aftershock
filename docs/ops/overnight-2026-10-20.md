# Overnight checkpoint — 2026-10-20 (rolling)

Maintained by the orchestrator during autonomous overnight execution. Recover from here on compaction.

## Current objective
Two parallel tracks, strictly separated:
1. **M7 continuation** (product features, merges to `main`, authorized: verified changes may deploy to production).
2. **Five-variant landing-page design experiment** (NEVER merges to `main`; NEVER touches production; homepage only; five branches `experiment/home-v1..v5`; user picks the winner).

## State ledger (update after each verified change)
- **M7 wave 1 (A/B/D/C): DEPLOYED** — main `45f9624`, deploy `6ad65c27b8e7b78e034ecadd`, verified on prod.
- **M7 wave 2 (E cohesion): DEPLOYED 2026-10-20** — main merge `4d513051d37e89ae29df7a21dcd92fde41109072`, deploy `6ad664b8e279155d504a8084`, live bundle contains all three wave-2 surfaces; main pushed to GitHub (`10cfa98..4d51305`).
- Gates at wave-2 merge: root 522/13-skip · server 297 · tsc+build clean · hosted sweep (static pin harness, real graph) **114 passed / 0 failed / 2 known import-timing flakes / 4 skipped** · toml reverted byte-identical + guard 200-green.
- **Design experiment: BASELINE PIN = `45f9624`** (verified, deployed main at experiment start). Branches must base here; not rebased onto later M7 work until user approves a winner.

## Worktree ownership (active)
- `aftershock-wt-m7-wave2` → `feat/m7-wave2-cohesion` (merged, idle)
- `aftershock-ui-v1` .. `-v5` → `experiment/home-v1-minimalist` ... `experiment/home-v5-editorial` (design experiments; baseline `45f9624`)
- (all historical worktrees preserved)

## Model/agent state
- `glm-5.3-flash-free` rate-limited once this evening (wave-2 initial dispatch); **fallback `mimo-v2.6-flash-free` verified working** (wave-2 resume). Fallback order: mimo → longcat-2.5-preview-free → (auto router). `beam-free` available for LOW.
- Experiment concurrency: ≤2 design agents at a time (provider quota shared with M7 orchestrator + sweeps).

## Design experiment ledger (fill as variants land)
| Variant | Branch | Worktree | Agent model | Status | Commit | Preview URL |
|---|---|---|---|---|---|---|
| v1 minimalist | experiment/home-v1-minimalist | aftershock-ui-v1 | glm-5.3-flash-free | **done+pushed** | (3 commits; thesis `09da0ac`) | pending alias deploy |
| v2 research studio | experiment/home-v2-research-studio | aftershock-ui-v2 | longcat-2.5-preview-free | **done+pushed** | (thesis `b3da17f`) | pending alias deploy |
| v3 evidence lens | experiment/home-v3-evidence-lens | aftershock-ui-v3 | glm-5.3-flash-free | **done+pushed** | (thesis `b90b4d6`, impl+polish `b096083`/`191278a`) | pending alias deploy |
| v4 investigator's desk | experiment/home-v4-investigators-desk | aftershock-ui-v4 | mimo-v2.6-flash-free | **done+pushed** | (thesis `0682c2d`, 3 commits) | pending alias deploy |
| v5 editorial | experiment/home-v5-editorial | aftershock-ui-v5 | glm-5.3-flash-free | **done+pushed** | (thesis `5e818fd`, assets `4e926d7`) | pending alias deploy |

## QA phase (independent reviewer — mimo)
- Consolidated QA agent reviews all five variants: boundary compliance (diff name-status), seed-machine preservation, ImportPanel reuse, integrity copy, similarity check (any two too-alike → name weaker + fix), rubric scoring, per-variant fix lists.
- After must-fix items resolved → 5 alias draft deploys (`aftershock-home-v1..v5`) + URL verification + comparison package + morning handoff.

## Next actions queue
1. Design-research note (bounded) → create 5 worktrees/branches from baseline → dispatch variant agents in batches of 2.
2. M7 wave 3 (graph explorer) dispatch only when design batch 1 is airborne and capacity allows.
3. Comparison package in `docs/design/home-experiments/2026-10-20/` after all variants + screenshots.
4. Keep BUILD_STATUS updated per M7 wave; docs-only commits don't deploy.

## Rules pinned (do not violate)
- Experiments: no `--prod` deploys; alias-only draft deploys (`aftershock-home-v1..v5`); do not modify Layout.tsx / tailwind.config.js / backend; do not weaken integrity tests; no fake chat/DOI UI; keep `ensureDemoSeed()` + `/results` navigation + ImportPanel integrity.
- M7: standard gates before merge/deploy; revert toml pin after every harness run.
