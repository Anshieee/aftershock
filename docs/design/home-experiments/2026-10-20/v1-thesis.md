# VARIANT 01 — THE MINIMALIST — design thesis (2026-10-20)

Branch `experiment/home-v1-minimalist`, baseline `45f9624`. Experiment only — never
merges to `main`, never deploys. Landing-local changes only (`LandingPage.tsx`, new
`src/pages/landing-v1.css`, composition-pinning tests).

## Intended first impression

The page should feel like a calm, well-set page in a serious academic journal that
asks you one question and then steps back. Within 3 seconds the eye travels to a
single place: a display-serif question and one indigo action beneath it. Everything
else — the micro-nav, the featured record, the document picker — is typographically
present but visually "whispered", positioned below the vertically-centered hero
action so the first viewport is essentially whitespace, type, and one button.
The emotional register is *quiet confidence*, not product-marketing energy: no
cards stacked on cards, no icon rows, no feature theater.

## Primary visual hierarchy

1. `Aftershock.` wordmark (Bodoni Moda 900, the existing self-hosted `.wordmark`
   token class) + the tagline `Trace the evidence.` in letterspaced 11px caps —
   the brand beat, deliberately small.
2. The hero question `What would you like to investigate?` in Source Serif 4
   display at a fluid `clamp()` scale (40px mobile → 60px desktop-cap), tight
   tracking, balanced wrapping.
3. THE CTA `Start the guided investigation` — the page's only indigo-filled,
   only visually loud element (larger type, generous padding, single hover state
   toward brand-deep).
4. A whisper-grade integrity line (the synthetic/real labeling), then
   `Have a document?` as a quiet text toggle.
5. Below the fold: the micro-nav `Investigations · Library · Review Queue ·
   Knowledge Graph` in near-whisper smallcaps-grade type, then the featured real
   retraction record typeset as quiet text under a hairline rule — no card.

## Central interaction pattern

**Single primary action + progressive disclosure.** One button starts the guarded
guided investigation (real `ensureDemoSeed()` flow, all honest state mappings
verbatim from the baseline: submitting / unavailable / cooldown / not-wired /
api-error / rejected — no success guessing, identical aria-live behavior and
testids). Document import is disclosed by a one-line quiet toggle
(`Have a document?`) that reveals the untouched `<ImportPanel/>`; the still-unbuilt
Bibliography / Single DOI affordances remain visible-but-disabled inside that
disclosure, honestly scoped. The `What does that involve?` note stays as the
integrity disclosure of what the seed really does (guarded, rate-limited,
labeled synthetic fixtures + one real public record).

## Layout composition

One centered column (`max-w-xl`), vertically balanced in the usable viewport at
desktop majors, top-anchored on small screens. Whitespace is the layout device:
no border cards in the hero zone (the baseline's launcher *card* becomes
borderless type), generous vertical rhythm (10–x units between beats), hairline
`ink-border` rule separating the below-fold zone. Content lives in a strict
vertical order: brand → question → action → honesty → import disclosure →
micro-nav → featured record.

## Typography treatment

- Fluid `clamp()` display scale for the hero question, defined in landing-local
  CSS (`.v1-hero-title`), `leading-[1.04]`, modest negative tracking on display.
- Body copy at ≥1.6 line-height, measured width (`max-w-[38ch]` beats).
- Wander-free: exactly one typographic "loudness" (the CTA's size + indigo fill).
  The micro-nav and inventory lines use 12px/11px letterspaced caps in ink-muted
  — legible but never competing. Amber/lavender/sage are reserved for the
  existing honest status chips; no new accent colors.

## How it differs from the existing Aftershock homepage

The baseline (Wave U1) already had a centered column, but framed everything in a
raised *launcher card* and a *featured card* with two near-equal buttons
(primary + "Choose a document"). V1 removes card chrome from the hero entirely,
promotes the document picker from a peer secondary button to a quiet one-line
toggle, moves the workspace links from a same-size text row to whisper typography
below the fold, and stretches the type scale (larger display question, larger
single CTA) so exactly one element is loud.

## How it differs from the other directions

- **v2 research studio (SciSpace-like)** adds scholarly launcher furniture —
  document-context chips, tool surfaces, procedural framing. V1 has none of that
  apparatus; it subtracts.
- **v3 evidence lens** art-directs a visual motif (a lens/veil device). V1's only
  "device" is typography and whitespace — zero decorative composition.
- **v4 investigator's desk** builds a workspace feel (desk/paper affordances,
  working surfaces visible up front). V1 shows the desk *door*, not the desk.
- **v5 editorial statement** is typographic exhibitionism (oversized display
  moments, section rhythm). V1 is typographic *restraint* — the same tool,
  opposite intent.

## Skills & references

- **Impeccable** (github.com/pbakaus/impeccable, README + principles from the
  2026-10-20 research note): `distill` pass — remove card chrome, single CTA,
  typography-first identity, tinted neutrals, anti-slop checks (no
  purple-gradient, no icon-tile rows, no gray-on-color).
- **Awwwards skill repo (read-only)**: fluid clamp() scale, ≤2 displayed
  typefaces, transform/opacity-only motion, performance as design.
- **webapp-testing** workflow for the Playwright capture pass (dev server + real
  rendered screenshots, no function mocking).
- Product voice constraint: heading stays the approved question; honesty lines
  re-typeset, wording conceptually identical (FICTIONAL / GUIDED DEMO labeling,
  flagged = needs review, import is metadata-only).
