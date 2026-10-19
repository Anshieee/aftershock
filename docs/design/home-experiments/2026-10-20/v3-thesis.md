# VARIANT 03 — THE EVIDENCE LENS — design thesis (2026-10-20)

Branch `experiment/home-v3-evidence-lens` @ baseline `45f9624`. Experiment only: never merged to
main, never deployed. Landing-local change (`src/pages/LandingPage.tsx` + `src/pages/landing-v3/`),
no shared components, tokens, or pages touched.

## First impression

The visitor lands mid-investigation. A giant Bodoni-modern wordmark — `Aftershock.` — stands over
the promise `Trace the evidence.`, and one indigo action — **Start the guided investigation** —
is the only loud control on the page. Behind and to the right of the headline, a quiet constellation
blooms outward from a single point: the visual metaphor of *one publication whose citations ripple
through the literature*. The page reads as "there is a network here, and one way through it" — not
as a dashboard, not as a chat box, not as a marketing site.

## Hierarchy (top → bottom)

1. **Wordmark + tagline (hero, left)** — `Aftershock.` (Bodoni Moda 900, fluid ~3.4→7.1rem,
   tracked tight) above `Trace the evidence.` in display serif indigo. The tagline is the h1; the
   wordmark is a brand mark (aria: plain text, not a heading).
2. **Lede** — two sentences that explain the lens in evidence-blind language (ripples, citations,
   review flags) and end on the inversion that defines the product: a flag is a request for review,
   never a verdict.
3. **The one CTA** — loud indigo block, wired to the existing guarded seed machine, beneath it the
   same quiet integrity line as every other variant (conceptually identical copy).
4. **Evidence motif (right/behind on desktop, scaled crop top-right on mobile)** — see below.
5. **Progressive-disclosure import** — `Have a document? Register a file (metadata only)` reveals
   the untouched `<ImportPanel/>`.
6. **Reading guide strip** — flag semantics + the featured *verified real record* (2020
   hydroxychloroquine retraction) kept verbatim, clearly separated from the fictional guided demo.
7. **Quiet links row** — Investigations · Library · Review Queue · Knowledge Graph.

## Central interaction

`Start the guided investigation` is the page's single indigo surface and the only trigger for the
seed state machine — the handler body is byte-identical to the design-of-record page (`AbortController`
guard, `ensureDemoSeed()`, honest submitting / unavailable / cooldown / not-wired / api-error /
rejected states, `aria-live` region, navigate to `/results` on real success). Only presentation
changed: the label (`Start the guided investigation`) and a signature focus ring in amber.

The motif itself is *non-interactive by intent*: the art layer is `aria-hidden`,
`pointer-events-none`, and sits fully outside the controls layer. The only motif motion is a subtle
transform shift of a handful of nodes when the artwork itself (not the page) is hovered —
transform/opacity only, disabled under `prefers-reduced-motion`. The CTA's focus ring in amber
(`#E9B867`) is the single deliberate color exception on an otherwise indigo/paper page; it answers
"where should I look" for keyboard users, and it never animates.

## Composition — ripple + network motif

One SVG layer, hand-drawn strokes, palette-restricted:

- **Origin burst** (lower-left of the art layer): a small indigo hub with a pentagon of short
  "jolt" ticks and two broken concentric ripple arcs — the aftershock.
- **Lavender hairlines** (`#DED6FA`, 1px, bowed like hand-plotted guides) radiate from the burst to
  seven *abstract* finding nodes: a hollowed point, a tilted square, a triangle, a dashed ring, a
  plus, a wave, a twin-dot satellite. A few dashed secondary hairlines connect findings to findings
  — shape-language for "works citing works" without a single word of fake data.

**Integrity rule, hard-coded into the art:** the motif is decorative artwork, not data. It fetches
nothing, contains no text, no metrics, no dates, no claims, and is marked with a permanent visible
caption: *"Illustrative composition — not evidence data."* (`aria-hidden` on the art itself; the
caption stays readable). No node can be mistaken for a real record: none resembles a citation card,
none carries an identifiable title or number; the two accent nodes (amber tick-notches, sage fill
dots) vary the composition only. Nothing on the page claims analysis beyond the recorded
capabilities (seed → real graph-derived results; metadata-only import; review queue).

**Colors / shape rules:** hairlines lavender only on paper; nodes indigo `#665C91`, deep `#524A78`;
accents `#E9B867` amber, `#658C79` sage, `#B85F59` muted red used as three tiny opacity-muted
marks (< 2% of the artwork's stroke area, sub-tags of the palette, no semantic role).

## Typography

- Fluid single scale, `clamp()`, no fixed viewport widths (`.type-hero`, `.type-tagline`,
  `.body-lede` in `landing-v3.css`).
- Wordmark: existing `.wordmark` token classes (Bodoni Moda 900) — reused, not re-derived. Unused
  sizes are cropped by the transformation rather than re-scaled inline.
- Display tracking tight (-2/-3 hundredths), body line-height ≥ 1.65, headings leading ≤ 1.05 —
  all per the shared experiment brief.
- Copy uses short declarative fragments, the same register used by the audit-facing features.

## Diff vs. the existing homepage (Wave U1, design-of-record)

| Existing | v3 evidence lens |
| --- | --- |
| Centered single column, `max-w-2xl` | Asymmetric: text block left, motif constellation right; crop past the fold |
| Hero asks a question ("What would you like to investigate?") | Hero states a promise (`Trace the evidence.`) and surfaces the wordmark into the hero |
| No artwork, no motif | Ripple + network SVG layer, honest decorative caption |
| CTA `Explore guided investigation` | CTA `Start the guided investigation`, amber focus ring |
| Toggle `Choose a document` | `Have a document? Register a file (metadata only)` — reveals the same untouched `<ImportPanel/>` |
| 3 shortcuts (Library, Review Claims, Evidence Graph) | 4: Investigations · Library · Review Queue · Knowledge Graph |
| Featured investigation question mark card | Same real record card, verbatim copy, moved below an integrity strip that states the flag rule |

Unchanged on purpose: the seed machine (code paths and honest copy), the import panel internals,
the guided-demo disclosure, the quiet integrity line, the featured-record facts.

## Diff vs. the other four directions

- **v1 (ChatGPT-plain minimalist)**: v1 proves identity with whitespace alone and assumes no motif.
  v3 keeps the single-CTA discipline but *earns* the product identity visually — the artwork is the
  differentiator v1 deliberately lacks. If v1 is the safest, v3 is the most specific.
- **v2 (SciSpace reading-room)**: v2 is typographically warm (serif launcher, drop-cap, study table
  feel). v3 refuses the desk metaphor entirely — no paper textures, no drop caps; it trades reading
  intimacy for network legibility, which matches the "evidence graph" product surface more than
  "reading a paper" does.
- **v4 (paper investigator's desk)**: v4 borrows stationery affordances (notebook cues). v3 has the
  inverse priority: affordances recede; the *relations* are drawn, not the desk. Where v4 says
  "someone works here", v3 says "something is connected here".
- **v5 (bold editorial statement)**: v5 is typographic exhibitionism; its signature moment is type.
  v3's signature moment is a drawing plus Savannah-quiet type. Both are bolder than the
  design-of-record, but v5's boldness lives in the headline scale, v3's in the motif — so even at
  reassure-quiet type sizes v3 stays *specific*, and can survive the headline being resized.

## References used

- Shared research note (`research-note.md`, same directory): Impeccable design-ladder principles
  (no slop palettes, type first), Awwwards skill-repo guidance (art-direction before code, fluid
  clamp scales, transform/opacity-only motion, performance as design).
- Palette + tokens: `tailwind.config.js` design-of-record (`paper/ink/brand/review/uncertain`),
  `.wordmark` token classes from `src/index.css` — reused verbatim.
- Awwwards-era science tools for network-lens precedents (nodal constellation layouts with
  restrained accent color on paper backgrounds), adapted to hand-drawn strokes so the art matches
  the product's evidence-review tone (not a "crypto-tech" gradient planet).
- The five-variant brief's hard rules (integrity captions, honest labels, non-overlap of art and
  controls, reduced-motion + mobile degradation).
