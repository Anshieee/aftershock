# Aftershock. — design system (MiniMax M3.1 prototype)

A standalone design system for a document-first research-integrity workspace.
Warm academic colour, ChatGPT's proportional discipline, and editorial
typography — built for a professor who is not technical.

---

## 1. Principles

1. **The document is the interface.** Chrome recedes; the paper and the
   evidence attached to it carry the visual weight.
2. **Plain before technical.** Every finding opens in ordinary language.
   Provenance, relation types and source pointers are one disclosure away,
   never in the way.
3. **Proportion over emphasis.** Controls are compact (24–32 px). Nothing
   shouts. Hierarchy comes from typography, spacing and hairline rules.
4. **Restraint in colour.** The palette is warm and mostly neutral; colour is
   reserved for meaning — a relation family, a status, a review state.
5. **A flag is not a verdict.** Every state in the interface is worded so it
   can never be read as "this claim is false".

---

## 2. Colour

### 2.1 Light theme — "warm paper"

| Token | Value | Role |
|---|---|---|
| `--c-paper` | `#F7F2E8` | Application background (warm ivory) |
| `--c-paper-deep` | `#EEE7D8` | Recessed panels, sidebar ground |
| `--c-paper-raised` | `#FFFDF8` | Cards, inspector, toolbar |
| `--c-ink` | `#23222E` | Primary text (warm charcoal-violet) |
| `--c-ink-muted` | `#5C5A69` | Secondary text |
| `--c-ink-soft` | `#807C8C` | Metadata, captions, axes |
| `--c-ink-border` | `#DED5C4` | Hairlines, dividers, card edges |
| `--c-brand` | `#5A5183` | Indigo — Aftershock's own voice |
| `--c-brand-deep` | `#3F3862` | Hover / pressed brand |
| `--c-brand-soft` | `#EBE6F9` | Lavender surface (selection, active nav) |
| `--c-sage` | `#4A7660` | Human-reviewed |
| `--c-amber` | `#A3711A` | Needs review / pending |
| `--c-notice` | `#A34C45` | A publication-status notice exists |
| `--c-uncertain` | `#38587C` | Unresolved or unverified relationship |

### 2.2 Dark theme — "warm ink"

Art-directed, not inverted. The ground is a warm near-black (`#16151B`),
the text a warm paper (`#ECE6DA`), and every semantic hue was re-tuned for
contrast on that ground rather than flipped. `--c-brand` becomes a light
lavender (`#A79BDB`) so it still reads as the product's own colour; the
status hues are lifted (`#7AB495`, `#E0B05F`, `#E08B82`, `#7FA6D6`) so they
stay legible without glowing.

PDF pages are **never** re-tinted. The manuscript canvas keeps its original
appearance in both themes.

### 2.3 Semantic contract

| Meaning | Colour | Never used for |
|---|---|---|
| A notice exists | muted red | generic errors |
| Needs a human decision | amber | decoration |
| A human has decided | sage | "verified / correct" |
| Unresolved or unverified | steel blue | ordinary links |
| Aftershock's own structure | indigo | status |

The mapping is fixed. A relation family never borrows another family's
colour, so a red line always means "a notice" and never "important".

---

## 3. Typography

| Role | Face | Notes |
|---|---|---|
| Display / editorial | **Fraunces Variable** | Optical-size axis; `WONK` is enabled only for the wordmark. Headings, manuscript title, report headings, finding titles. |
| Interface / body | **Inter Tight Variable** | Compact and neutral. All controls, labels, navigation, tables. |
| Metadata / provenance | **JetBrains Mono Variable** | DOIs, record ids, source pointers, page numbers, timestamps. |

All three are self-hosted (`@fontsource-variable/*`) — no runtime CDN call.

### Scale

```
2xs  11px / 1rem      eyebrows, metadata, chips
xs   12px / 1.125rem  captions, helper text
sm   13px / 1.25rem   secondary UI
base 15px / 1.55rem   body
lg   17px / 1.65rem   lead paragraphs
xl   20px / 1.75rem
2xl  24px / 1.95rem   panel headings
3xl  30px / 2.25rem
4xl  38px / 2.6rem    page headings
5xl  50px / 3.2rem    hero
```

Headings use `-0.015em` to `-0.028em` tracking depending on size. The
homepage hero is set at 3.25 rem / 1.06 leading with the last line in Fraunces
italic and indigo — the one moment the brand colour enters the typography.

---

## 4. Spacing & rhythm

4 px base. The recurring rhythm is **4 / 8 / 12 / 16 / 24 / 32 / 48 / 72**,
with hairline rules (`1px`, `--c-ink-border`) instead of boxed containers
wherever a divider will do.

Reading columns are capped at **680 px** (reflowed manuscript, report body).
The reader never uses more than **392 px** for the inspector.

---

## 5. Controls

Everything is compact and consistent:

| Control | Size | Treatment |
|---|---|---|
| Button `xs` | 24 px | Ghost / secondary / primary |
| Button `sm` | 28 px | Default |
| Button `md` | 32 px | Rarely used |
| Icon button | 28 × 28 | Ghost by default |
| Segmented | 24 px inside a 28 px track | Single selected item lifts on `--c-paper-raised` |
| Chip | 18 px | Tinted surface + matching border + optional dot |
| Field | 32 px | 1 px border, brand focus ring |
| Toggle | 16 × 28 track | Brand when on |

Primary buttons appear once per view. There are no oversized calls to
action, no dashed upload boxes, and no glassmorphic panels.

---

## 6. Brand treatment

**Wordmark.** `Aftershock` in Fraunces at weight 600 with −0.022 em tracking,
followed by a full stop in indigo. The period is part of the name.

**Mark.** A filled origin with three concentric rings of decreasing weight
and increasing radius — a ripple spreading from a single event. The rings
are drawn rather than filled so the silhouette stays open at 20 px, and it
reads as a favicon.

**Ripple motif.** The same concentric geometry appears once, very faintly, in
the top-right of the homepage hero, and once as a three-ring pulse when a
document is selected. That is the whole motion vocabulary for the brand —
it is not repeated anywhere else.

**Tagline.** *Trace the evidence.* appears in the homepage eyebrow and in
report footers.

---

## 7. Motion

| Moment | Treatment | Duration / curve |
|---|---|---|
| Sidebar collapse | width + label fade | 300 ms `cubic-bezier(.16,1,.3,1)` |
| Panel / sheet open | fade + 6 px rise | 320 ms `cubic-bezier(.22,1,.36,1)` |
| Selection highlight | opacity + underline weight | 140–160 ms |
| Document opening | ripple + workspace transition | ~520 ms, then the document is already readable |
| Graph layout | force simulation, α-decay 0.032 | settles ≈ 2.5 s |
| Graph fit | eased interpolation | 420 ms `cubic-bezier(.22,1,.36,1)` |
| Findings reveal | staggered, one every ~700 ms | ≈ 5 s total, document stays usable |

`prefers-reduced-motion: reduce` collapses every animation and transition to
0.001 ms; the graph still settles, it simply does so without interpolation.

There are no floating particles, no parallax, no scroll hijacking, no
auto-playing backgrounds.

---

## 8. Components

`Button` · `IconButton` · `Chip` · `Segmented` · `Disclosure` · `TextArea` ·
`Toggle` · `MetaRow` · `Sheet` · `EmptyState` · `Wordmark` · `AftershockMark`
· `RippleGlyph` · `AppShell` · `SidebarContent` · `DocumentLauncher` ·
`PdfViewer` · `ReflowReader` · `FindingsList` · `EvidenceInspector` ·
`ForceGraph` · `RevisionCompare` · `Guide` · `FindingStatusPill` · `Icons`.

All live in `src/components/`; the design tokens in
`src/styles/tokens.css` and the Tailwind mapping in `tailwind.config.js`.

---

## 9. Accessibility

- Every control has an accessible name; icon-only controls carry `aria-label`.
- The graph exposes a visually-hidden list of every record with its kind, and
  its canvas carries a descriptive `aria-label`.
- Semantic colour is always paired with a text label or an icon — never
  colour alone.
- Focus is a 2 px brand outline with a 2 px offset, visible on every ground.
- Body text is at least 13 px; metadata at 11 px, and never the only carrier
  of meaning.
- `prefers-reduced-motion` is honoured globally.
