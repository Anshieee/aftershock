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

## QA phase (complete)
- Independent QA agent (mimo) reviewed all five variants: boundary audit, seed-machine byte-identity, ImportPanel reuse, integrity copy, similarity check, rubric scoring. 4 must-fixes found.
- All must-fixes resolved + re-verified on-branch: v3 `package.json` reverted (`8111b7a`); v5 brand contract restored + focus ring 2px #524A78 + labels canonical + mobile action y642 (`ecaf767`); v2/v4 mobile CTA above fold (y705 / y757, commits `a17ba80` / `bc84d11`); v1 disclosure hit-target + focus ring (`b1001c3`, orchestrator-applied).
- Similarity (QA): only v1↔v2 at risk; v3/v4/v5 structurally distinct.
- Rubric (aids, not proof): v1 8.03 · v3 7.90 · v4 7.80 · v2 7.60 · v5 6.95.

## Previews (live, draft alias deploys — NEVER --prod)
| Variant | URL |
|---|---|
| v1 | https://aftershock-home-v1--aftershock-demo.netlify.app/ |
| v2 | https://aftershock-home-v2--aftershock-demo.netlify.app/ |
| v3 | https://aftershock-home-v3--aftershock-demo.netlify.app/ |
| v4 | https://aftershock-home-v4--aftershock-demo.netlify.app/ |
| v5 | https://aftershock-home-v5--aftershock-demo.netlify.app/ |

Verified: all five HTTP 200; per-variant bundle markers present; `/health` live on each; **0 credential hits** in all five served bundles (audit greps matched only React internals/input type tokens). Site ID used for alias deploy: `b1bb72a1-23de-46c4-8af8-ad4c5010f041`.

## Final SHAs
v1 `b1001c3` · v2 `a17ba80` · v3 `8111b7a` · v4 `bc84d11` · v5 `ecaf767` — all pushed to GitHub on their experiment branches.

## Comparison package
`docs/design/home-experiments/2026-10-20/comparison.md` on main (rubric, fix ledger, recommendation directions, how-to-choose). Morning report to the user references it.

## Wave 3 shipped (2026-10-20): graph explorer + previews + comparison
- All five homepage variants QA-fixed and pushed; five live draft previews; comparison package + research note on main (`docs/design/home-experiments/2026-10-20/`).
- M7 wave 3 (graph explorer) implemented/merged/deployed — production deploy `6ad692827f0122ef8f88666f`, main `3b85c35`; gates 528/297 + sweep 116/0; docs updated (BUILD_STATUS, MILESTONES, KNOWN_LIMITATIONS graph section refreshed).

## Wave 4 shipped (2026-10-20, hygiene + a11y): deploy `6ad69d8e727b842d4f611430`, main `9db7459`
- `fix/e2e-flaky-hygiene` (`49c0018`): deterministic waits; sweep went 116+3-flakes → **122/0 no flakes**.
- `fix/graph-canvas-a11y` (`33718a5`): canvas heading-order + SVG label-name fixes + committed axe gate; `ContextInspector` reader-link aria-label removed by orchestrator + gate extended to zero-mismatch page-wide.
- Gate wrap-up: root 531/13-skip · server 297 · tsc+build · guard 200 · prod live-verified. NOTE: an agent left the shared checkout on its branch; fixed via `--ff-only` advance of `main` (strictly-linear; branches preserved). Night ops lesson: after subagents that were told to branch, always `git branch --show-current` before continuing orchestrator work on the shared repo.

## Next actions queue (remaining night)
1. OPTIONAL remaining M7 capacity: wave 3 (graph explorer) was NOT dispatched — provider capacity went to the 5-variant experiment + QA + fix wave. If resuming M7 work later tonight, dispatch wave-3 explore agent first (read-only inventory of KnowledgeGraphPage needs) before implementation wave.
2. Keep ledger updated; human chooses winner; integration is a separate approved task (rebase onto latest main + reviewed PR).

## Next actions queue
1. Design-research note (bounded) → create 5 worktrees/branches from baseline → dispatch variant agents in batches of 2.
2. M7 wave 3 (graph explorer) dispatch only when design batch 1 is airborne and capacity allows.
3. Comparison package in `docs/design/home-experiments/2026-10-20/` after all variants + screenshots.
4. Keep BUILD_STATUS updated per M7 wave; docs-only commits don't deploy.

## Rules pinned (do not violate)
- Experiments: no `--prod` deploys; alias-only draft deploys (`aftershock-home-v1..v5`); do not modify Layout.tsx / tailwind.config.js / backend; do not weaken integrity tests; no fake chat/DOI UI; keep `ensureDemoSeed()` + `/results` navigation + ImportPanel integrity.
- M7: standard gates before merge/deploy; revert toml pin after every harness run.
