# VARIANT 04 — THE INVESTIGATOR'S DESK — design thesis (2026-10-20)

Branch `experiment/home-v4-investigators-desk`, baseline `45f9624`. Design
experiment only — never merges to `main`, never deploys, never touches
production or any other page. Landing-local changes only (`LandingPage.tsx`,
new `src/pages/landing-v4.css`, composition-pinning tests, screenshots).

Direction: **a beautiful, modern research notebook** — a *usable tool identity*,
not an abstraction of one. The page is the top sheet of a working case file on
an investigator's desk: paper ground, margin tab, hairline rules, one sheet that
casts a shadow, and a practical toolbar readout. Everything it shows is real
affordance or documented product semantics; it invents **no** workspace history,
timestamps, users, or activity.

---

## 1. First impression

Within three seconds the visitor reads, top to bottom:

1. a **desk pad** — warm paper with a faint dotted grid (a dot-grid lab
   notebook, decorative only, never data);
2. a **manila case-label margin tab** in amber (`#E9B867`) running up the left
   margin of the hero — `CASE FILE · DESK`;
3. the brand block: `Aftershock.` in Bodoni Moda 900 with the mandatory period,
   and the tagline `Trace the evidence.` in letterspaced mono caps;
4. the case-file question in Source Serif display — *What would you like to
   investigate?* — the title written at the top of the page;
5. an ink **stamp-style label** `GUIDED DEMO BUILD` (double outline, slightly
   rotated) — honest scope, on the surface, not buried;
6. one dominant sheet — the **case card** — carrying the single indigo action.

The register is *quiet competence*: a practical tool that happens to be
beautiful. No icon tiles, no feature cards, no gradients, no glass, no invented
"recent activity". The only thing that raises its voice is the CTA.

## 2. Primary visual hierarchy

1. **Brand block** — `Aftershock.` (existing `.wordmark` token, Bodoni Moda
   900) + `Trace the evidence.` (mono, 11px, `0.3em` tracking, ink-muted).
2. **Hero question (h1)** — Source Serif 4, fluid `clamp()`, tight tracking,
   `text-wrap: balance`.
3. **Case card `01 · START`** — the page's only white surface with a
   paper-edge shadow (the design-of-record shadow budget: at most one soft
   shadow, here, and nowhere else). Inside it: the mono meta strip
   (`GUARDED, RATE-LIMITED SEED API · IDEMPOTENT RESEED`), the dominant indigo
   CTA, the quiet secondary intake toggle, the integrity line, and a live
   status lamp.
4. **`02 · INTAKE`** — the real `<ImportPanel/>` revealed as an "intake form"
   sheet (collapsed by default).
5. **`03 · RECORDS`** — the verified real record (Mehra et al. 2020) plus a
   two-item **stamp legend** that defines the product's own stamp language.
6. **`04 · INDEX`** — below the fold, real navigation typeset as a notebook
   index/table of contents: text links, hairline leaders, and the real route
   path on the right of each row.

Exactly one element is loud (the indigo CTA). Exactly one surface has depth
(the case card). Exactly one tab is manila amber (the hero margin tab). Exactly
one red is used (the `FLAGGED — NEEDS HUMAN REVIEW` legend stamp).

## 3. Central interaction

**One start action + one intake disclosure, both real.**

- **Primary:** `Start the guided investigation` — the single indigo
  (`#665C91`, hover `#524A78`) button, wired to the *unchanged* seed
  state machine: `ensureDemoSeed()` → navigate `/results` on success, with every
  honest failure state preserved verbatim and in place — `submitting`,
  `unavailable`, `cooldown` (429), `not-wired` (404/501/ambiguous 2xx),
  `api-error`, `rejected` — plus the same `aria-live="polite"` region, the same
  `aria-busy`/`disabled` in-flight behavior, and the same testids
  (`guided-seed-button`, `hero-guided-action`, `guided-seed-state`,
  `guided-seed-copy`, `investigation-launcher`). No handler body was rewritten.
- **Secondary:** `Have a document? Register a file (metadata only)` — an outline
  toggle (`aria-expanded` + `aria-controls="document-area"` +
  `data-testid="choose-document-toggle"`) that discloses the **untouched**
  `<ImportPanel/>` as the intake sheet, with the still-unbuilt
  Bibliography / Single DOI affordances visible-but-disabled inside that sheet
  only, and their scope note appearing exactly once on the page.
- **Status lamp:** a terse mono readout in the case-card header
  (`IDLE · SUBMITTING… · COOLDOWN (429) · NOT WIRED · HTTP 5xx · REJECTED`)
  mirrors the seed machine. It is `aria-hidden` — the accessible source of
  truth stays the existing live region — so screen readers hear one status, not
  two. It never reports a state that did not happen.
- **Motion:** none on load; a 150 ms hover lift on the CTA and a 150 ms
  translate on index links only, both removed under
  `prefers-reduced-motion`.
  prefers-reduced-motion: hover transitions suppressed by shell rule; static-at-rest equals the initial frame (no separate meaningful capture).

## 4. Composition

- One centered column (`max-w-3xl`) vertically balanced in the usable viewport
  (`min-h-[calc(100svh-4rem)]` + `justify-center`), **left-aligned** inside — a
  document has a left margin, not a center axis.
- **Margin lane:** on `md+` the column reserves a left lane for the vertical
  manila case tab; below `md` the same tab reflows to a horizontal pill above
  the wordmark (no absolute positioning, no horizontal overflow at 390px).
- **Sheet stack:** hero (on the dotted pad) → `01 START` card (white, hairline,
  the one shadow) → `02 INTAKE` (white, hairline, no shadow, conditional) →
  `03 RECORDS` (white, hairline) → `04 INDEX` (white, hairline). Section labels
  are mono tabs that sit on the sheet's top rule, like file-divider labels.
- Structural margin labels only — `01 · START / 02 · INTAKE / 03 · RECORDS /
  04 · INDEX`. They describe the page's own structure; they never imply content,
  recency, or a user's history.
- Below the fold the page goes quiet: index rows with dotted hairline leaders
  and the literal route (`/investigations`, `/library`, `/review-queue`,
  `/graph`) right-aligned in mono — real destinations, no icon tiles.

## 5. Typography

- **Fluid scale**, landing-local CSS only, e.g.
  `--v4-display: clamp(2.25rem, 1.2rem + 3.6vw, 3.25rem)` for the hero question,
  `clamp(1.6rem, 1rem + 2vw, 2.1rem)` for sheet headings, `clamp(1.4rem, 1rem +
  1.6vw, 1.9rem)` for the wordmark.
- Display: Source Serif 4 (`font-display`), `letter-spacing: -0.015em`,
  `line-height: 1.08`, balanced wrap. Body: Inter at `leading-7` (1.75) for
  lede/notes, `leading-6` for captions.
- Margin labels, meta strip, index paths, status lamp: system monospace
  (`font-mono`, the same stack already used for DOIs and runIds in
  `ImportPanel`) at 11–12px, uppercase, `0.14em` tracking — typewriter-ish,
  legible, and **no new webfont is loaded** (only the existing self-hosted
  families are used; `index.html` is untouched).
- Tagline `Trace the evidence.` — 11px mono caps, `0.3em` tracking: a stamp
  line under the mark, not a second headline.

## 6. Diff vs. the existing homepage (Wave U1 baseline)

| Aspect | Baseline (Wave U1) | V4 — Investigator's Desk |
| --- | --- | --- |
| Centering | Centered column, centered text | Centered column, **left-aligned** document body |
| Brand | `Aftershock.` lives only in the sidebar | Wordmark + `Trace the evidence.` tagline in the hero (period mandatory) |
| Hero | Serif question, no frame | Question framed by a manila case tab, a stamp, and a lede naming the three real paths |
| Launcher | Rounded card, two near-equal buttons | **Case card `01`** with divider tab, mono meta strip, one dominant CTA + one quiet intake toggle |
| CTA copy | `Explore guided investigation` | `Start the guided investigation` (same handler, same states) |
| Secondary copy | `Choose a document` | `Have a document? Register a file (metadata only)` (same `choose-document-toggle` contract) |
| Picker area | Nested, undifferentiated | Own sheet `02 · INTAKE` — reads as an intake form on the desk |
| Status | Text in the live region only | Same live region **plus** an `aria-hidden` mono status lamp in the card header |
| Nav row | 3 links with `·` separators | 4-entry **notebook index** with hairline leaders and real route paths |
| Featured record | Centered card | `03 · RECORDS` sheet + stamp legend (flag = needs human review) |
| Depth | Soft shadow on launcher *and* card styling elsewhere | Exactly **one** shadow (the case card); everything else hairline |
| Ground | Flat paper | Faint dotted grid (desk pad) |

Honesty contracts that did **not** change: the seed machine and all its states,
the integrity line, the `What does that involve?` disclosure, the disabled
Bibliography/Single DOI row and its scope note (exactly one instance),
`<ImportPanel/>` untouched, and the featured record's real, distinct dates and
PMIDs.

## 7. Diff vs. the other four directions

- **v1 — ChatGPT-plain minimalist hero.** V1 *subtracts*: no card chrome,
  whitespace as the layout device, one loud button, everything else whispered.
  V4 *builds a surface*: paper ground, margin tab, sheets, divider labels, a
  status lamp. V1 shows the door to the workspace; V4 lays the workspace's
  desk out on the page. Both keep exactly one indigo and one honest CTA.
- **v2 — SciSpace journal reading-room with serif drop-cap launcher.** V2 is a
  reading room: centered measure, hairline rules instead of boxes, editorial
  drop-cap, small-caps eyebrows. V4 is a working desk: left margin lane, file
  tabs, a practical toolbar readout, and sheets that stack like paper. V2's
  texture is a ruled baseline (bound journal); V4's is a dot grid (lab
  notebook). V2 leads with a drop-cap lede; V4 leads with a stamped case file.
- **v3 — evidence-network artwork motif hero.** V3 art-directs a *visual
  motif* (network/lens imagery) as the hero's centerpiece — graphic, ambient,
  illustrative. V4 has **zero artwork**: its only "graphics" are CSS hairlines,
  a dotted ground, and two stamps. V3 says *look at the evidence field*; V4
  says *sit down and work the case*.
- **v5 — bold editorial typographic statement.** V5 is typographic exhibition:
  oversized display moments, strong section rhythm, poster energy. V4 is
  typographic *restraint in service of tooling*: a display question capped at
  ~3.25rem, mono micro-labels doing the texture work, and hierarchy expressed
  by sheets and labels rather than by scale. Same tool, opposite volume.

## 8. Integrity constraints honored (non-negotiable)

- No invented recent investigations, fake timestamps, fake user names, or
  activity feeds. Every visible string is either (a) a real action, (b) a real
  destination, (c) a documented product semantic, or (d) existing honest copy.
- Synthetic vs. real stays distinguishable: `FICTIONAL / GUIDED DEMO` appears
  on the surface (meta strip + integrity line) and in the disclosure; the
  featured record keeps `Verified real record` and its distinct real dates.
- Relation types, review flags, and retrieval failures are never reworded:
  "A review flag means *needs human review* — never proven/disproven" is quoted
  from `docs/RESEARCH_INTEGRITY.md` §1 and `ExportPage`.
- Seed failures stay disclosed exactly as before; a failed or unavailable seed
  shows its honest state, never substitute results.
- Palette restricted to the frozen tokens: paper `#F7F3EA`, ink `#27283B`,
  indigo `#665C91`/`#524A78`, lavender `#DED6FA`, amber `#E9B867`, sage
  `#658C79`, muted red `#B85F59` (border/stamp) with `#8F3B36` for text at AA
  contrast. Tinted neutrals only; no pure black/gray, no gradients, no glass.

## 9. References used

- `docs/design/2026-10-19-redesign-spec.md` §1 — frozen palette, type families,
  radii, and the "at most one soft shadow" discipline (V4 spends it on the case
  card).
- `AGENTS.md` + `docs/RESEARCH_INTEGRITY.md` §1 — flag semantics, synthetic vs.
  real labeling, "disclose retrieval failures, never paper over".
- `src/pages/LandingPage.test.tsx` and `e2e/landing.spec.ts` — the honesty
  contract that must survive the redesign (mechanical updates only: labels and
  composition pins, never a weakened assertion).
- Variant 01 (`v1-thesis.md`) and Variant 02 (`v2-thesis.md`) — for explicit
  contrast and to avoid converging on the same device.
- Field-notebook / case-file conventions: dot-grid lab paper, manila folder
  tabs, rubber-stamp labels, ruled index pages with leaders (design culture
  references; no third-party component library used).
- WCAG 2.2 AA focus-visible treatment from `src/index.css` (unchanged) and the
  project's axe critical-violation gate in `e2e/a11y.spec.ts`.
- Playwright capture pass against `npx vite dev --port 4274` with **no response
  mocking**, so degraded states are real.
