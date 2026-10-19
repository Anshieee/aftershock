# V5 — THE EDITORIAL STATEMENT (design thesis, 2026-10-20)

Branch: `experiment/home-v5-editorial` · Variant 05 of five landing-page design
experiments. Scope: `src/pages/LandingPage.tsx` + landing-local files only. No
merge, no deploy.

## First impression

A magazine opening spread inside a research tool. Instead of Wave U1's centered
column of cards, the page reads as bold typographic composition on paper:
`#F7F3EA` field, ink `#27283B`, no card frame around the hero. The visitor's eye
lands on a two-line display statement — **"After the shock, / the record."** —
set at fluid display scale (up to ~8rem) in Bodoni Moda 900, roman on line one,
true italic + indigo `#665C91` on line two. Nothing else competes: the sidebar
wordmark stays where Wave U1 put it, and this page's own masthead sits in the
folio header rail directly above the statement (`Aftershock.` + `N° 01` +
`Trace the evidence.`); typography *is* the composition. The whole
hero is one screen; the featured real record sits below as a documented folio.

## Hierarchy

1. Display statement (the research question restated as an editorial standfirst)
2. Secondary serif question line — "What would you like to investigate?" —
   keeps the original h1 contract's voice present in the composition
3. The ONE dominant action: `Start the guided investigation` (indigo, real
   guarded seed flow, all honest states). On ≤lg the launcher — and therefore
   this CTA — is ordered directly under the display statement behind a small
   `Aftershock.` mobile-start mark, so the primary action lands above the fold
   on a phone (measured action top **y = 642** on 390×844, criterion ≤ y790);
   it stays a single button in the DOM, never a second copy.
4. Progressive-disclosure import: `Have a document? Register a file (metadata only)`
5. Folio header rail (top of the asymmetric grid): the brand contract —
   wordmark `Aftershock.` (shell `.wordmark` treatment), folio micro-label
   `N° 01` as its own adjacent string, tagline `Trace the evidence.` with its
   terminal period; below lg the mark moves to the mobile-start block (see
   Composition) so the page body shows it once per breakpoint
6. Right-margin folio column: destination index (Investigations / Library /
   Review Queue / Knowledge Graph — the sidebar's exact words) as plain links
7. Below the fold: the 2020 hydroxychloroquine retraction — the one featured
   *verified real record*, framed as a magazine clipping with a hairline rule
   and `Verified real record` badge.

## Central interaction

Unchanged data flow from Wave U1, mechanically retestid'd: `ensureDemoSeed()`
with honest guarded states (submitting / unavailable / cooldown / not-wired /
api-error / rejected), `aria-busy` + `aria-live` region, navigate to `/results`
on real success. Import is the untouched `<ImportPanel/>` behind an
`aria-expanded` toggle; Bibliography / Single DOI stay visible-but-disabled
inside the disclosed area. Integrity copy is conceptually identical, re-typeset
(see verbatim copy in the implementation report).

## Signature moment

A thin indigo "wave" rule — a 1.25px SVG sine path — runs beneath the display
line. Under a slow API it stays still; on hover/focus of the CTA it gives a
single small scaleX pulse. Load: three-line staggered fade-and-rise
(transform + opacity only, ~520ms total). `prefers-reduced-motion: reduce`
disables all of it via the shell's global reduced-motion rule (animation and
transition `none !important`), and elements are authored so they are fully
visible when animations are absent (no static hidden state).
**Honest note — reduced-motion state:** that rule kills the stagger outright, so
the at-rest reduced-motion state *is* the initial frame —
`05-reduced-motion-1440x900.png` is the same picture as `01-landing-1440x900.png`
by construction, which is why no separate meaningful motion-off capture exists.

## Composition

Asymmetric editorial grid inside the existing Layout bounds: display text and
body copy occupy the left ~62%; a narrow right column (~34%) holds the launcher
(CTA + document toggle + integrity line + live state) and the folio destination
index, while the masthead — wordmark `Aftershock.`, folio `N° 01`, tagline
`Trace the evidence.` as three separate strings — sits in the hairline folio
header rail above the statement. Hairline rules (`1px solid #DFD8C9`) and
micro-labels in the margin (magazine folio convention: `N° 01`) do the work
that cards did in Wave U1. Below 1024px the asymmetry collapses gracefully to a
single column: display scale steps down through clamp(), the launcher comes
first, the lede and the destination index follow, and there is no horizontal
overflow. The one deliberate reordering below lg puts the launcher — and so the
primary CTA — directly under the display statement behind the small
`Aftershock.` mobile-start mark, so the first screen of a 390×844 phone ends on
an action (measured action top **y = 642**, criterion ≤ y790) instead of
mid-paragraph; the lede keeps its DOM position, no focusable element moves
relative to its neighbours, and the desktop grid, DOM order and tab order are
untouched at lg+.

## Typography

- Bodoni Moda 900 (loaded 800;900 by `index.html`, untouched): display lines.
  A landing-local runtime `<link>` adds the true italic cut (ital,wght 800;900);
  no self-hosted italic cut exists in this repo, so the link stays — but it is
  now **non-blocking** (`rel="preload" as="style"` swapped to `stylesheet` on
  its `load` event, no inline handler, no `index.html` change), so first paint
  of the hero's dominant line never waits on the third-party round trip. When
  the face is denied or is still in flight, the line falls back to a
  **synthesized italic** over the already-loaded 900 roman (then Georgia
  italic) — honest oblique, never a decorative fake; with the face present the
  real `Bodoni Moda | italic | 900` face is confirmed loaded.
  Real-italic, never "decorative FX for its own sake": the italic holds the
  indigo dimension of the identity, the roman holds the ink one.
- Source Serif 4 Variable / Georgia (existing display stack) for the secondary
  question line and featured-record title.
- Inter / system sans for utilitarian micro-labels (uppercase, tracked, 10–12px)
  and body copy. Disciplined line lengths (`max-w-prose`, 60–75 ch).
- Display scale + tracking: `clamp(2.75rem, 7.2vw, 7.75rem)`, `-0.03em`; tight
  leading (0.94 on display).
- Visible focus: **2px `#524A78` (brand-deep) `focus-visible` outline, offset
  2px** on this page's interactive elements — measured **7.27:1** against paper
  `#F7F3EA` (WCAG 2.2 AA needs a legible ring; the amber `#E9B867` it replaced
  sampled 1.66:1). The amber survives only as a subtle inner halo inside the
  offset gap, never carrying the contrast itself.

## Diff vs existing homepage (Wave U1)

| Wave U1                                 | V5 editorial statement                          |
| --------------------------------------- | ----------------------------------------------- |
| Centered `max-w-2xl` card column        | Asymmetric 62/34 typographic grid, no hero card |
| Hero = the research question (serif 6xl)| Hero = two-line display statement, italic indigo turn |
| Launcher inside a raised rounded card   | Launcher de-carded: hairline rule + micro-label + folio column |
| Three centered text-link shortcuts      | Folio destination index with numerals in the margin column |
| Featured investigation as a centered card | Featured record as a bottom clipping strip across full width |
| No entrance motion                      | Staggered line rise + wave rule pulse (reduced-motion-safe) |

Honesty structure is preserved: one seed trigger, quiet integrity line visible
without expansion, `What does that involve?` disclosure, all failure states
verbatim, ImportPanel untouched.

## Diff vs the other four directions

- **V1 (ChatGPT-plain minimalist centered hero):** the opposite pole. V1 is one
  centered serif line and generous negative space; V5 is maximal editorial
  composition — scale contrast, italics, margin machinery, folio numerals.
- **V2 (SciSpace reading room):** V2 borrows journal interiority — drop-cap,
  hairline rules, reading-measure serif body. V5 is the journal *cover*,
  not its interior: Bodoni display instead of body serif, asymmetry instead of
  a single reading column.
- **V3 (evidence-network artwork):** V3 carries identity through generated
  imagery (network motif top-right). V5 deliberately chooses *no artwork*; the
  only wave in evidence is the typographic indigo rule — identity is carried by
  letterforms, not pixels of conceptual decoration.
- **V4 (investigator's notebook):** V4's textures are tactile (tabs, stamps,
  desk paper). V5 shares document-adjacent vocabulary (folio labels, clipping
  strip) but treats paper as a cold press sheet: flat, precise,
  high-modernist, with Bodoni's sharp thick-thin contrast as the only texture.

## References used

- Magazine folio/toc conventions (The New Yorker, Harper's) for the numerated
  destination index and margin micro-labels.
- Bodoni Moda 900 styling and scaleX wordmark treatment from the shipped
  brand identity (`AFTERSHOCK_BRAND_IDENTITY.md`, `.wordmark` global class).
- Strunk & White "omit ornament" applied to motion: <600ms, transform/opacity
  only, one pulse, no scroll effects, no WebGL.
- WCAG 2.2 focus + `prefers-reduced-motion`; axe-clean landmark order.

## QA fix pass (2026-10-20) — six findings, six fixes

1. **M2 brand contract:** the folio rail renders `Aftershock.` (shell
   `.wordmark` treatment) and `Trace the evidence.` as their own exact strings,
   with `N° 01` kept as a separate adjacent micro-label; ≤lg the page-body mark
   moves to the mobile-start block, so each breakpoint shows it exactly once.
2. **M3 mobile fold:** below lg the launcher is ordered directly under the
   display statement — small `Aftershock.` + the same single CTA — measured
   action top **y = 642** on 390×844 (criterion ≤ y790); one dominant indigo
   CTA, real seed machine untouched.
3. **M4 focus contrast:** `#E9B867` (1.66:1) → `#524A78` 2px outline (7.27:1),
   amber demoted to a subtle inner halo.
4. **Label mismatch:** folio destinations now read `Investigations / Library /
   Review Queue / Knowledge Graph`, the sidebar's exact words; routes
   `/investigations · /library · /review-queue · /graph` unchanged.
5. **Font loading:** preload → onload swap instead of a blocking `rel=stylesheet`
   insert. Chosen over the alternative (`@import` at the top of
   `landing-v5.css`) because a CSS `@import` of a remote stylesheet is itself
   render-blocking and would only be requested once the client-side route
   mounts — strictly worse for the hero's dominant line; the preload swap costs
   nothing at paint, needs no `index.html` change, and keeps the
   synthesized-italic fallback documented above.
6. **Evidence honesty:** `03` and `04` were 288px crops — recaptured at
   1440×900; `01` (rail changed) and `06` (first screen changed) recaptured;
   `02`/`05` recaptured with them so no screenshot is stale; reduced-motion
   documented as identical to the initial frame (see Signature moment).

## Verified evidence

- `npx tsc --noEmit` clean; `npx vitest run` root suite green; `npm run build`
  OK (post-QA-fix run).
- Playwright against `npx vite dev --port 4276`, no response mocking:
  **1440×900** — folio rail visible with `Aftershock.` + `N° 01` +
  `Trace the evidence.` as separate strings, destinations read `Investigations /
  Library / Review Queue / Knowledge Graph` on `/investigations · /library ·
  /review-queue · /graph`; **390×844** — primary action visible without
  scrolling at **top y = 642** (≤ y790), lede starts at y = 930, zero
  horizontal overflow; **focus** — computed `outline: rgb(82, 74, 120) solid 2px`
  at `outline-offset: 2px` (**#524A78**, 7.27:1 vs paper) with the amber
  `rgba(233,184,103,0.45)` halo, confirmed on the CTA and the next focusable;
  **font** — the runtime link settles as `rel="stylesheet"` after the preload
  swap and `Bodoni Moda | italic | 900` reports `loaded`; **console** — only the
  pre-existing `/.netlify/functions/health` 404s (plus dev-only React Router
  future-flag warnings), no font-loading errors or preload warnings.
- Screenshots (all recaptured at meaningful sizes after the QA fixes; pixel size
  = filename): `docs/design/home-experiments/2026-10-20/assets/v5/` —
  `01-landing-1440x900` (recaptured: the rail now carries the brand strings),
  `02-landing-1366x768`, `03-doc-picker-expanded` **1440×900** (was a 288px
  crop; `-full` is the 1440-wide full page), `04-keyboard-focus-cta`
  **1440×900** (was a 288px crop), `05-reduced-motion-1440x900` (same frame as
  `01` by construction — see Signature moment), `06-mobile-390x844` (recaptured:
  the first screen now ends on the primary action).
- Acceptance: `e2e/landing.spec.ts` gains the brand-contract, destination-label
  and mobile-fold assertions (fold check is mobile-project-only) — all five new
  cases green against local dev.
- Honest note on the local e2e run: `landing.spec.ts › a native file input is
  present` (2 cases) and `console.spec.ts` fail against `vite dev` because they
  need the live Netlify functions (local dev answers `404` for
  `import-document` / `graph-probe` / `health`, and console.spec asserts zero
  404s) — an environment limit, not this change: `ImportPanel`, `api.ts` and
  the server are untouched.
