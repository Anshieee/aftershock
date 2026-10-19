# Five-way homepage design experiment — comparison package
**Date:** 2026-10-20 (overnight run) · **Baseline (pinned for all five):** `45f9624` · **Orchestrator:** independent of the builders; final decision belongs to the user.

## Quick tour — five working previews + branches

| # | Name | Preview URL (draft alias, not prod) | GitHub branch | Final SHA | Worktree |
|---|---|---|---|---|---|
| 1 | **The Minimalist** | https://aftershock-home-v1--aftershock-demo.netlify.app/ | [`experiment/home-v1-minimalist`](https://github.com/Anshieee/aftershock/tree/experiment/home-v1-minimalist) | `b1001c3` | `/home/ansh/Projects/aftershock-ui-v1` |
| 2 | **The Research Studio** | https://aftershock-home-v2--aftershock-demo.netlify.app/ | [`experiment/home-v2-research-studio`](https://github.com/Anshieee/aftershock/tree/experiment/home-v2-research-studio) | `a17ba80` | `/home/ansh/Projects/aftershock-ui-v2` |
| 3 | **The Evidence Lens** | https://aftershock-home-v3--aftershock-demo.netlify.app/ | [`experiment/home-v3-evidence-lens`](https://github.com/Anshieee/aftershock/tree/experiment/home-v3-evidence-lens) | `8111b7a` | `/home/ansh/Projects/aftershock-ui-v3` |
| 4 | **The Investigator's Desk** | https://aftershock-home-v4--aftershock-demo.netlify.app/ | [`experiment/home-v4-investigators-desk`](https://github.com/Anshieee/aftershock/tree/experiment/home-v4-investigators-desk) | `bc84d11` | `/home/ansh/Projects/aftershock-ui-v4` |
| 5 | **The Editorial Statement** | https://aftershock-home-v5--aftershock-demo.netlify.app/ | [`experiment/home-v5-editorial`](https://github.com/Anshieee/aftershock/tree/experiment/home-v5-editorial) | `ecaf767` | `/home/ansh/Projects/aftershock-ui-v5` |

Nothing merged to `main`; production untouched (`aftershock-demo.netlify.app` still serves M7 wave 2 — deploy `6ad664b8e279155d504a8084`, main `4d51305 + docs` — see BUILD_STATUS). Alias deploys are draft/preview URLs only.

## What each variant is

**V1 — The Minimalist** (ChatGPT-level simplicity). One centered column, one serif question, one indigo CTA; everything else is whisper typography. Zero new colors; smallest diff. *Fastest to understand of the five; originality is its weak axis — QA suggests an axis-break (flush-left question + margin note) if chosen as a direction.*

**V2 — The Research Studio** (SciSpace-inspired). Ruled-paper reading room, Source Serif 4 three-line question, drop-cap lede, hairline "research launcher". Most scholarly atmosphere; strongest focus-visibility (7.3:1). *Mobile/desktop-1366 CTA placement was fixed first pass (now y657 @1366, y705 @390).* Honest degraded-state screenshot included.

**V3 — The Evidence Lens.** Giant Bodoni wordmark, indigo tagline as the headline claim, restrained decorative ripple/network artwork (labeled `Illustrative composition — not evidence data.`), launcher card. Most "product-branded" hero; CTA in-fold on all three viewports. *Focus ring fixed to 2px `#524A78` (~5.5:1); motif pushed clear of body text on mobile; a committed `package.json` boundary slip was reverted.*

**V4 — The Investigator's Desk.** Dotted lab-notebook ground, amber `CASE FILE · DESK` tab, `GUIDED DEMO BUILD` stamp, numbered sheets `01 · Start / 02 · Intake / 03 · Records / 04 · Index`, IDLE→failure status lamp. Highest originality and the strongest integrity **teaching** UX (a stamp legend literally defines flag ≠ verdict); full axe scan of the build was 0 violations. *Mobile fold fixed (y757); sheet numbering fixed (always 01→04).*

**V5 — The Editorial Statement.** `After the shock, / the record.` in roman + true italic indigo with a hand-set wave rule; folio rails; right `START HERE` column. Boldest typographic identity. *Brand contract restored (`Aftershock.` + `Trace the evidence.` exact), destination labels restored to canonical names, focus ring fixed (7.27:1), mobile action now y642, font link made non-blocking.*

## Shared guarantees (verified in every variant)

- Real seed workflow intact byte-for-byte: `ensureDemoSeed()` → `/results` only on success; five honest failure states preserved (`No simulated success is shown.`).
- `<ImportPanel/>` reused untouched behind progressive disclosure; metadata-only copy intact; `FICTIONAL / GUIDED DEMO` vs real-public-records separation intact (`Verified real record` featured record inherited unchanged from baseline).
- Sidebar (`Layout.tsx`), ImportPanel, tailwind tokens, api layer, index.html, server/functions: untouched (blob-identity audited); the one boundary violation (v3 `package.json`) was reverted.
- Tests: each branch's landing unit tests green (16–17/variant); tsc clean ×5; production build OK ×5.
- Previews: functions server-side only; audited all five browser bundles for `FALKORDB|SEED_SECRET|CROSSREFCONTACT|password|secret` — zero credential hits (matches are React internals/input types only). `/health` verified live on all five aliases.
- Reduced motion honored (shell rule + variant-level rules); hover-only animation dies under `prefers-reduced-motion`.

## Rubric review (from the independent QA agent; aids, not proof)

| # | Variant | Clarity/first action **30%** | Visual quality & originality **25%** | Navigation **15%** | Mobile **10%** | Brand **10%** | A11y & perf **10%** | **Weighted** |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Minimalist | 9.0 | 6.5 | 8.0 | 8.0 | 9.0 | 8.0 | **8.03** |
| 2 | Research Studio | 7.0 | 8.0 | 8.0 | 6.0 | 9.0 | 8.0 | **7.60** |
| 3 | Evidence Lens | 8.0 | 8.0 | 8.0 | 7.0 | 9.0 | 7.0 | **7.90** |
| 4 | Investigator's Desk | 7.0 | 9.0 | 8.0 | 5.5 | 9.0 | 8.0 | **7.80** |
| 5 | Editorial Statement | 6.0 | 9.0 | 7.0 | 5.5 | 6.0 | 7.0 | **6.95** |

*Scores predate the QA-fix pass; every must-fix below was then fixed and re-verified on the branch.*

## QA findings → fix ledger (all must-fixes resolved)

| Finding | Verdict | Resolution |
|---|---|---|
| v3 modified `package.json` (boundary) | MUST-FIX | reverted to baseline (`8111b7a`) |
| v5 missing brand wordmark/tagline contract | MUST-FIX | restored exact strings (`ecaf767`) |
| v2/v4/v5 mobile CTA below 390×844 fold | MUST-FIX | fixed + measured: v2 y705 · v4 y757 · v5 y642 |
| v3/v5 amber focus ring <3:1 | MUST-FIX | 2px `#524A78` + amber inner halo (v5 7.27:1) |
| v4 sheet numbering 01→03→04 when intake collapsed | nice-to-have | collapsed `02` header present (`bc84d11`) |
| v3 CSS rule duplication + motif over mobile lede | nice-to-have | deduped; motif clipped clear of text |
| v2/v4 screenshot-size honesty + reduced-motion duplicate captures | nice-to-have | truth-sized recaptures; honest thesis notes added |
| v1 small disclosure hit-target | nice-to-have | 24px+ target + focus ring (`b1001c3`) |

## Recommended **directions to consider** (no winner chosen — that's yours)

- If **speed-of-understanding** is the goal: **V1** or **V4**. V1 is the purest "next step is unmissable" page; V4 wraps that clarity in the most original skin (and teaches integrity vocabulary).
- If **product identity** is the goal: **V3** (evidence-lens artwork + branded hero) or **V5** (most memorable typography).
- QA similarity check: only V1↔V2 risk converging (V1 was recommended an axis-break revision); V3, V4, V5 are structurally unlike everything else.

## How to choose (suggested flow)

1. Open the five preview URLs; resize 1440 / 1366 / 390 (or use browser dev tools).
2. For 2–3 finalists, click **Start the guided investigation** (real flow → `/results`) and the **Register a file (metadata only)** toggle on the preview; note that preview function behavior matches production (verified via `/health`).
3. Skim the matching thesis (`v1..v5-thesis.md` in the branch) and screenshots (`docs/design/home-experiments/2026-10-20/assets/v<N>/`).
4. Reply with the winning number. Integration into latest `main` (M7-enabled) is a separate approved task — none of these merge automatically.

## Known limitations

- Previews are draft alias URLs on the existing Netlify site; they may expire/be overwritten by future alias deploys of the same alias name.
- The five branches are pinned to the *pre-wave-2* main (`45f9624`) by design; porting the chosen concept onto current `main` will be its own reviewed task.
- e2e specs that require live Netlify functions (file-input echo/console specs) were verified against worktrees with functions via honesty states; full e2e matrices were not repeated per variant beyond the targeted suites listed above.
