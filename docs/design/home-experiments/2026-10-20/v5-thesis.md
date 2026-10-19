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
wordmark stays where Wave U1 put it; typography *is* the composition. The whole
hero is one screen; the featured real record sits below as a documented folio.

## Hierarchy

1. Display statement (the research question restated as an editorial standfirst)
2. Secondary serif question line — "What would you like to investigate?" —
   keeps the original h1 contract's voice present in the composition
3. The ONE dominant action: `Start the guided investigation` (indigo, real
   guarded seed flow, all honest states)
4. Progressive-disclosure import: `Have a document? Register a file (metadata only)`
5. Right-margin folio column: tagline `Trace the evidence.` + destination index
   (Investigations / Library / Review Queue / Knowledge Graph) as plain links
6. Below the fold: the 2020 hydroxychloroquine retraction — the one featured
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

## Composition

Asymmetric editorial grid inside the existing Layout bounds: display text and
body copy occupy the left ~62%; a narrow right column (~34%) holds the standfirst
tagline, the launcher (CTA + document toggle + integrity line + live state), and
the folio destination index. Hairline rules (`1px solid #DFD8C9`) and rotated
micro-labels in the margin (magazine folio convention: `N° 01 — …`) do the work
that cards did in Wave U1. Below 1024px the asymmetry collapses gracefully to a single
column: display scale steps down through clamp(),
the folio column reads in document order, no horizontal overflow.

## Typography

- Bodoni Moda 900 (loaded 800;900 by `index.html`, untouched): display lines.
  A landing-local runtime `<link>` adds the true italic cut (ital,wght 800;900)
  — it degrades to synthesized oblique then Georgia italic when offline.
  Real-italic, never "decorative FX for its own sake": the italic holds the
  indigo dimension of the identity, the roman holds the ink one.
- Source Serif 4 Variable / Georgia (existing display stack) for the secondary
  question line and featured-record title.
- Inter / system sans for utilitarian micro-labels (uppercase, tracked, 10–12px)
  and body copy. Disciplined line lengths (`max-w-prose`, 60–75 ch).
- Display scale + tracking: `clamp(2.75rem, 7.2vw, 7.75rem)`, `-0.03em`; tight
  leading (0.94 on display).
- Visible focus: amber `#E9B867` focus-visible ring/atmosphere on interactive
  elements, offset 2px, per the experiment brief (WCAG 2.2 AA).

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

## Verified evidence

- `npx vitest run` root suite, `npx tsc --noEmit`, `npm run build` (see report).
- Screenshots: `docs/design/home-experiments/2026-10-20/assets/v5/` —
  1440×900, 1366×768, 390×844, doc-picker-expanded, keyboard focus ring,
  reduced-motion, mobile no-overflow console check.
