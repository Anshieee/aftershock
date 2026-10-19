# Landing-page redesign — design research note (2026-10-20)

Bounded research phase for the five-variant homepage experiment. All experiments run on branches
pinned to main `45f9624`; nothing merges to `main`; production untouched.

## Repos verified

1. **Impeccable** — https://github.com/pbakaus/impeccable (Apache-2.0, 83.1k★, actively maintained,
   ships an OpenCode distribution; a local `impeccable` skill is already available in this runtime).
   - Used: its design-ladder philosophy as operating principles (below). NOT installed: the CLI
     installer writes provider hook manifests/global config — outside this task's boundary
     (no global config changes). Guidance applied directly instead. Its local skill equivalent
     was consulted by the orchestrator to write the briefs.
   - Principles adopted (from README + local skill):
     - Anti-slop: no Inter-everywhere / purple-blue gradients / cards-in-cards / gray-on-color /
       bounce easing / rounded-square icon tiles.
     - `polish`/`distill`/`audit` mindset: simplify to essence; line length, padding rhythm,
       touch targets, heading hierarchy are quality gates; a clean detector is evidence, not proof —
       always inspect rendered pages.
     - Typography-first identity: start from type, then add color/motion; tinted neutrals (never pure
       black/gray).
2. **Awwwards skill repo** — https://github.com/tponscr-debug/claude-skill-awwwards (MIT, small;
   `SKILL.md` + 7 reference files). NOT installed (tiny repo, treat as untrusted external material).
   Its reference files are read as background guidance only:
   - Art direction BEFORE code (emotion → archetype → industry language → composition).
   - "Typography is 90% of design": fluid `clamp()` scales, ≤2 displayed families, tight tracking
     on display sizes.
   - Never pure black/white; oklch/curated tints; motion must answer "what happened?" or "where
     should I look?"; vary section rhythm; performance IS design (<3 s, 60 fps, transform/opacity only).
   - Rejected: WebGL/3D, GSAP dependencies, cursor effects, scroll-jacking — the awwwards repo itself
     notes performance budgets; for a science-integrity product these are complexity without user value
     (and the task bans heavy animation).

## Other sources
- Anthropic's `frontend-design` skill (referenced by Impeccable's README as the original design skill)
  and the locally available catalog skills `frontend-design`, `impeccable` (local), `webapp-testing`
  (Playwright screenshot workflow) were consulted. Vercel's web-design-guidelines list exists locally
  as `web-design-guidelines` (used for review checklists).
- Scientific/product UX facts driving all variants:
  - ChatGPT-class simplicity = one unmistakable start action, no tutorial, no pre-reading.
  - SciSpace-class research tools lead with a scholarly launcher + document context, trustworthy tone,
    progressive disclosure of advanced tools.
  - Aftershock constraints that constrain creativity (kept deliberately): real guided seed workflow
    (`ensureDemoSeed()` → `/results`), metadata-only import honesty, FICTIONAL / GUIDED DEMO labeling,
    no fabricated graph data on the landing page, metrics never invented.

## How it maps to the five directions
- v1 minimalist: Impeccable `distill` — whitespace, single CTA, typographic confidence.
- v2 research studio: SciSpace-style scholarly launcher + Impeccable `layout`/`typeset`.
- v3 evidence lens: restrained Awwwards composition (art-directed motif) + `bolder` sparingly; any
  motif must be clearly NON-evidentiary (decorative) or honestly labeled.
- v4 investigator's desk: paper/editorial affordances via `craft`+`onboard` clarity (workspace feel
  without fabricated history).
- v5 editorial statement: Awwwards typography-first exhibitionism with Impeccable `quieter` guards;
  the "signature moment" is typographic, not decorative FX.
