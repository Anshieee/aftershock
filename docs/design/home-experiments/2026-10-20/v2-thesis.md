# VARIANT 02 — THE RESEARCH STUDIO

**Design experiment variant** — Aftershock landing page (`/`), branch
`experiment/home-v2-research-studio`, baseline `45f9624`. Date: 2026-10-20.
This variant is one of five directions explored in this directory; it is a
design experiment, not a new design-of-record. Production code outside the
landing page is untouched.

---

## 1. First impression

A quiet reading room, not a dashboard. The visitor lands on warm paper
(`#F7F3EA`) with a faint ruled texture — a bound journal, not a SaaS wall.
Centered in the measure: the `Aftershock.` wordmark, a small-caps eyebrow
`Trace the evidence.`, and one large serif question that names the research
tool's reason to exist. There is exactly one thing to do, and it is obvious:
a single indigo button in a calm launcher panel. Nothing glows, nothing
tiles, nothing begs. The page behaves like the tool it describes: careful,
sourced, unhurried.

## 2. Hierarchy

1. **Wordmark + eyebrow** — brand (`Aftershock.`, Bodoni Moda) over the
   small-caps eyebrow `Trace the evidence.`
2. **Headline (h1, Source Serif 4, fluid clamp)** — the research question the
   tool answers: *"What happened to this research after it was published?"*
3. **Intro paragraph (drop-cap)** — one quiet lede in journal measure
   (~65–75ch) that says what the workspace does and what it refuses to claim.
4. **RESEARCH LAUNCHER** — the page's only action surface: one dominant indigo
   primary CTA, its honest status line, the "What does that involve?"
   disclosure, and the import disclosure behind a secondary text toggle.
5. **Integrity lines** — three quiet, hairline-separated lines (synthetic vs.
   real; flag ≠ verdict; import = metadata only).
6. **Shortcuts row** — four plain text links (Investigations · Library ·
   Review Queue · Knowledge Graph) with hairline dividers.
7. **Featured real record** — a compact footnote-style block: the verified
   2020 hydroxychloroquine retraction with its real, distinct dates and one
   amber badge. Real content, clearly separated from the fictional demo
   manuscript.

## 3. Central interaction

**The RESEARCH LAUNCHER.** Large, calm, confident: a hairline-ruled panel
(no heavy card) whose single dominant control is the indigo
`Start the guided investigation` button (`#665C91`, deep `#524A78` on hover).
It is wired to the *real* seed workflow, unchanged from the design of record:
the existing seed-state machine (`ensureDemoSeed()` → navigate to `/results`)
with every honest failure state preserved verbatim — submitting, unavailable,
cooldown (429), not-wired (404/501/ambiguous 2xx), api-error, rejected. The
button is `aria-busy` and disabled while in flight; the status line is an
`aria-live="polite"` region.

Below the CTA: the secondary line `Have a document? Register a file
(metadata only)` — a text toggle (never a second button competing for
attention) that progressively discloses the existing `<ImportPanel/>`,
reused untouched with its privacy/honesty copy intact. The still-unbuilt
Bibliography / Single DOI affordances stay visible-but-honestly-disabled
inside that area only, with their scope note.

## 4. Composition

- Single centered column, `max-w-2xl` (journal measure), generous leading —
  reading rhythm like a bound journal.
- **Thin rules instead of boxes:** the launcher is separated by hairline
  `border-t`/`border-b` rules, not a heavy card surface. The featured record
  is a footnote block, not another card.
- **Ruled-paper texture:** a faint baseline grid (1px rule every 2rem at ~4%
  ink opacity) on the landing background — decorative only, clearly not data.
- **Serif drop-cap** on the intro paragraph's first letter — decorative
  editorial cue, Source Serif 4, ink color.
- **Small-caps-style eyebrows** (`text-xs`, `uppercase`, wide tracking) for
  section labels — no icon tiles anywhere.
- Fluid `clamp()` type scale for the headline and launcher CTA; Inter for
  UI/body, Source Serif 4 for display.
- **Responsive fold budget (QA fix, 2026-10-20):** below 768px the hero leads
  with a two-line summary lede (15px, full mobile column) and the headline's
  clamp floor drops to `1.875rem`, so the primary CTA lands fully inside a
  390×844 first screen (button top y≈705). The full lede is **not removed** on
  small screens: it renders verbatim (same shared string) on md+ in the hero
  and below the launcher on small screens. Short laptop viewports (≤820px of
  viewport height, e.g. 1366×768) tighten the hero rhythm via a height-based
  CSS rule so the CTA is fully above the fold (button top y≈657); tall
  viewports keep the generous journal spacing unchanged.

## 5. Typography

- **Source Serif 4** (already self-hosted via `font-display`): wordmark-adjacent
  display voice, h1, drop-cap, featured-record title.
- **Inter** (already self-hosted via `font-sans`): eyebrows, body, controls,
  integrity lines.
- Eyebrow labels: uppercase, `tracking-[0.18em]`, `text-xs`, `text-ink-muted`.
- Headline: `clamp(1.875rem, 5.4vw, 3.75rem)`, tight leading, balanced wrap
  (the 1.875rem floor keeps the question to ≤3 lines at 390px wide).
- Integrity lines: `text-sm`, `leading-7`, muted ink, separated by hairlines.
- Motion: `150ms` ease micro-transitions on hover/focus only;
  `prefers-reduced-motion` disables all of it (global rule already covers us;
  the landing adds no animation that can start).

## 6. Palette usage

| Token | Use |
|---|---|
| paper `#F7F3EA` | page background, raised surfaces |
| ink `#27283B` | headlines, body, drop-cap |
| indigo `#665C91` / deep `#524A78` | the single primary CTA, focus-adjacent accents |
| lavender `#DED6FA` | quiet surface tint behind the launcher status/note regions only |
| amber `#E9B867` | **one** highlighted badge: `Verified real record` |
| sage `#658C79` | reserved — used only where a status is honestly meaningful; not decorative here |
| uncertain / notice | honest failure states in the seed flow (unchanged) |

No purple gradients, no glassmorphism, no icon tiles.

## 7. Diff vs the existing homepage (Wave U1, 2026-10-19 design of record)

- **Wordmark moves into the hero.** U1 kept `Aftershock.` in the sidebar
  only; V2 frames the workspace with the wordmark + eyebrow above the
  question (deliberate, per the V2 brief).
- **Headline changes from an open prompt to a research question.** U1 asked
  *"What would you like to investigate?"*; V2 states the question the tool
  answers: *"What happened to this research after it was published?"*
- **Launcher becomes the visual center.** U1's launcher was a filled raised
  card with shadow; V2 restyles it as a hairline-ruled, calm panel with a
  larger CTA and the import disclosure as a text toggle line.
- **Shortcuts grow from three to four** and rename to the brief's IA:
  Investigations / Library / Review Queue / Knowledge Graph (plain text,
  hairline dividers — U1 used `·` separators).
- **Import disclosure rephrased** per the brief: `Have a document? Register a
  file (metadata only)` — same progressive disclosure, same untouched
  `<ImportPanel/>`.
- **Featured real record kept** (real dates, PMIDs, FICTIONAL distinction)
  but re-typeset as a footnote-style block; it is the single sanctioned use
  of amber.
- **Seed flow machine: byte-for-byte behavior preserved** — same states,
  same messages, same navigation, same `aria-live` region. Only the CTA label
  changes (`Explore guided investigation` → `Start the guided investigation`).

## 8. Diff vs the other four directions

- **V1 Minimalist** strips the page to the question + one button, removing the
  featured record and shortcuts. V2 keeps the journal's *contents* (shortcuts,
  featured record, three integrity lines) but expresses them with restraint —
  the information stays, the chrome goes.
- **V3 Evidence lens** leads with the evidence graph / record viewer as the
  hero. V2 keeps the graph one honest click away (Knowledge Graph shortcut +
  featured record) and leads with the *question*, not the machinery.
- **V4 Investigator's desk** leans into workspace density (manuscript panes,
  queues, tools). V2 is the opposite temperature: one launcher, one question,
  one featured record — the desk is organized elsewhere in the app.
- **V5 Editorial** pushes magazine-style storytelling (big narrative, sourcing
  marginalia). V2 borrows the editorial *typography* (serif display, drop-cap,
  hairlines) but keeps the launcher as the page's spine — it reads like a
  journal's first page, not a feature article.

## 9. References

- **SciSpace / paper-search launchers** — calm, single-query scholarly
  workspaces; the "one confident box, one action" pattern adapted here to an
  action launcher.
- **iA Writer / bound-journal reading rhythm** — single measure, generous
  leading, hairline rules instead of boxes.
- **The Atlantic / Aeon editorial openers** — small-caps eyebrow, serif
  display question, drop-cap lede.
- Internal: `docs/design/2026-10-19-redesign-spec.md` (frozen palette and
  tokens), `docs/design/2026-10-19-ux-audit.md` (IA and honesty findings the
  launcher must not regress).

## 10. Integrity constraints (unchanged hard rules)

- The guided example is the **only** wired path: a bodyless POST to the
  guarded, rate-limited demo-seed API; synthetic fixture content is labeled
  **FICTIONAL / GUIDED DEMO**; the one real record is the verified 2020
  hydroxychloroquine retraction (announced 2020-06-04, recorded 2020-06-05;
  PMIDs 32450107 / 32511943 — dates kept distinct).
- A flag means **evidence review is needed — never a verdict**.
- Import registers **metadata only** — nothing is stored; the server's
  verbatim disclosure is shown untouched.
- No fabricated studies, no fake graph, no fake metrics, no invented history.
  Every failure state says so.

## 11. Evidence (screenshots)

Captured against a real `npx vite dev --port 4272` build with the live
backend (no response mocking). The only console message on every view is
the pre-existing `/.netlify/functions/health` 404 (absent under `netlify
dev`).

- `01-desktop-1440x900.png` — full page at 1440×900.
- `01b-desktop-1440x900-fold.png` — first screen at 1440×900.
- `02-desktop-1366x768.png` — first screen at 1366×768; the primary CTA is
  fully inside the fold (button top y=657, bottom y=717).
- `03-mobile-390x844.png` — true viewport-clipped first screen at 390×844
  (not a full-page capture); CTA top y=705, fully visible with its label;
  horizontal overflow = 0.
- `03b-mobile-390x844-fullpage.png` — the full mobile page (390×2274), kept
  separately from the fold shot.
- `04-doc-picker-expanded.png` — progressive disclosure of the real
  `<ImportPanel/>` at 1440×900.
- `05-keyboard-focus-ring.png` — keyboard focus ring on the primary CTA.
- `07-honest-degraded-state.png` — the honest "not wired on this build yet —
  nothing ran" failure state.

Reduced motion: page defines no additional animation; expanded prefers-reduced-motion check equals the initial static frame — verified via the shell rule; therefore no separate capture is meaningful.

The former `06-reduced-motion.png` was byte-identical to the 1440×900 fold
capture (md5 `6f17e04…`), so it was **deleted rather than re-badged** as new
evidence. Verified in code: the landing defines no `@keyframes` and no
`animation:` property; its only motion is 150ms hover/focus/active
transitions, which both the shell rule (`src/index.css` —
`prefers-reduced-motion: reduce` → `animation: none !important`,
`transition: none !important`) and the landing's own reduced-motion block
(`src/pages/landing-v2.css`) disable. The seed flow's in-flight state has
no animated element to capture either.
