# Aftershock UX Redesign — Design-of-Record (Wave U1: shell, tokens, homepage)

Status: design-of-record for the 2026-10-19 redesign. Phase C scope = this
document. Phase F (secondary pages) inherits these tokens verbatim; nothing
here may be re-derived per page.

Reference: `docs/design/2026-10-19-ux-audit.md` (+ before screenshots).

---

## 1. Design system tokens (frozen)

### Palette — `tailwind.config.ts`

Approved brand palette (brief) plus derived tints, all frozen here:

| Token           | Value     | Notes                                        |
| --------------- | --------- | -------------------------------------------- |
| `paper`         | `#F7F3EA` | Warm Paper (page background)                 |
| `paper.deep`    | `#F1EBDC` | quiet tinted surfaces                         |
| `paper.raised`  | `#FFFFFF` | cards / launcher surfaces                     |
| `ink`           | `#27283B` | Dark Ink (body/headings)                      |
| `ink.muted`     | `#5B5C6D` | secondary text — ≥5.5:1 on paper              |
| `ink.border`    | `#DFD8C9` | hairlines tuned to warm paper                 |
| `brand`         | `#665C91` | Indigo — primary actions; white text AAs (6:1)|
| `brand.deep`    | `#524A78` | hover / pressed                               |
| `brand.surface` | `#DED6FA` | Lavender — active nav, subtle highlights      |
| `review.border` | `#E9B867` | Amber — "needs review" accents                |
| `review.surface`| `#F9F0DC` |                                               |
| `review.text`   | `#8A5A05` | unchanged                                     |
| `reviewed.*`    | keep      | Sage `#658C79` already matches the brief      |
| `notice.text`   | `#8F3B36` | Muted-red family, tuned to `#B85F59` accents  |
| `notice.border` | `#E5C0BB` |                                               |
| `notice.surface`| `#F7E7E4` |                                               |
| `uncertain.*`   | keep      | semantic "uncertain" blue stays               |

Rules: one indigo for emphasis (never two competing indigo fills in one
viewport); color communicates state, not decoration.

### Typography (unchanged families — already licensed + self-hosted)

- Wordmark: Bodoni Moda 900, `.wordmark` utility (unchanged).
- Display/headings + site wordmark style: Source Serif 4 Variable, tight
  tracking (`tracking-tight`), weights 600–700.
- UI/body: Inter Variable.
- New scale for the hero: `text-4xl md:text-6xl` with `leading-[1.05]`;
  launcher secondary text stays `text-sm/base`; never smaller than 14px.
- Semantic scale tokens (radii): cards `rounded-2xl`, panels `rounded-xl`,
  buttons/inputs `rounded-lg`. Shadow discipline: at most a soft single
  shadow on the launcher card; no decorative shadows elsewhere.

### Composition tokens

- Content columns: homepage hero+launcher column `max-w-2xl` **centered**;
  text sections `max-w-prose`; page padding `px-6 md:px-10`.
- First viewport (md+): hero + launcher vertically balanced — the landing
  content wrapper uses `min-h-[calc(100svh-4rem)]` + `justify-center`, so
  the composition sits in the usable viewport, not pinned to the top.

---

## 2. Shell / navigation (`src/components/Layout.tsx`)

1. Sidebar: keep 240px (`md:w-60`), skip link, and the `details` diagnostics
   block with `data-testid="sidebar-diagnostics"` (unchanged testids).
2. Nav destinations (brief): primary = **Home (`/`)**, Investigations,
   Library, Review Queue, Activity; secondary = Knowledge Graph.
   - `/overview` **route stays mounted** (console/mobile/health e2e depend
     on it); it simply leaves the sidebar. Its fate is a Phase F decision.
3. Standalone "GUIDED-DEMO BUILD" line is removed from the nav column; the
   phrase moves to the first line *inside* the diagnostics disclosure
   (honesty preserved, prominence reduced). `sidebar-diagnostics` testid kept.
4. Active nav state: lavender surface + brand-deep text + font-medium
   (calmer than the current solid indigo pill); hover: `paper.deep`.
5. Mobile header: wordmark row, then a single **horizontal scrollable nav**
   (`flex overflow-x-auto`, no JS/burger) containing primary + Knowledge
   Graph, visible to tests (`nav[aria-label="Primary"]` stays visible on
   390px). Diagnostics `details` stays under it.

## 3. Homepage (`src/pages/LandingPage.tsx`)

Single centered column, in order:

```
[hero]        H1 "What would you like to investigate?"   (font-display, centered)
              p  "Follow the evidence. Understand what changed."  (ink-muted, centered)

[launcher]    data-testid="investigation-launcher"
              rounded-2xl border ink-border bg-paper-raised p-6 md:p-8, soft shadow,
              centered, max-w-2xl; sr-only h2 "Start an investigation"
              [primary]   "Explore guided investigation"  (bg-brand, lg)
              [secondary] "Choose a document" (outline: border-ink-border,
                           text-ink, bg-paper; NOT indigo) with aria-expanded
              quiet line (text-sm ink-muted, centered):
                "The guided example uses clearly labeled synthetic content
                 (FICTIONAL / GUIDED DEMO) alongside real public records —
                 nothing is simulated."
              expanded note (unchanged text incl. "guarded, rate-limited",
              "synthetic demo data only", idempotent-reseed scope) behind the
              existing "What does that involve?" toggle; aria-live
              `guided-seed-state` region unchanged (all honest seed states).

              [document area — collapsed by default]
              toggled by "Choose a document": renders <ImportPanel/> as-is plus
              the existing truthful disabled Bibliography / Single DOI chips
              + their scope line. One document-selection action in the
              initial viewport: the toggle itself.

[discovery]   centered quiet links row: My Library · Review Claims ·
              Evidence Graph (text links, ink → brand-deep hover)

[featured]    "Featured investigation" — quieter: centered max-w-2xl panel,
              serif title "The 2020 hydroxychloroquine retraction",
              "Verified real record" chip kept, honest distinction paragraph
              kept (FICTIONAL / GUIDED DEMO naming), single "Open the guided
              investigation" outline link to /results — no seed trigger.
```

Hardmusts carried over unchanged:

- All existing data-testids survive: `hero-guided-action`,
  `guided-seed-button`, `guided-seed-state`, `guided-seed-copy`, plus
  ImportPanel's internal testids (`import-panel`, `import-input`,
  `selection-state`, …) because `<ImportPanel/>` is rendered untouched.
- The honest seed-flow state machine (idle/submitting/unavailable/cooldown/
  not-wired/api-error/rejected) is unchanged — only its container moves.
- No fake chat box, no fake DOI search: only the two real actions exist.
- The wordmark stays in the sidebar, never the hero.

## 4. Test updates (mechanical, honesty-preserving)

| File | Change |
| ---- | ------ |
| `e2e/layout.spec.ts` | `PRIMARY_AREAS` `'Overview'` → `'Home'`; keep 5-count + secondary assertions; mobile assertions unchanged (nav still visible) |
| `e2e/console.spec.ts` | navigate via `goto('/overview')` instead of clicking the renamed nav link (console-hygiene test, not IA test) |
| `e2e/landing.spec.ts` | keyboard test: Tab to the "Choose a document" toggle → Enter → then Tab reaches `#import-input` (label text assertion unchanged); gated-affordances test expands the document area first; "guarded, rate-limited" expansion note requires expanding "What does that involve?" first |
| `e2e/import.spec.ts` | add `openDocumentPicker(page)` helper (clicks toggle; no-op if already open) and call it at each `goto('/')` + `import-input` site |
| `e2e/analyze.spec.ts` | guided section located via `investigation-launcher` testid instead of `section hasText 'Try guided example'` |
| `src/components/Layout.test.tsx` | nav label expectations Overview→Home; "Guided-demo build" text assertion now matches text inside the details |
| `src/pages/LandingPage.test.tsx` | update to new copy/structure; keep every honesty assertion |

Forbidden in test edits: removing the no-fabrication assertions (never match
`analyzed|extracted|verified|imported successfully`), removing the
`FICTIONAL / GUIDED DEMO` + "synthetic demo data only" disclosures from the
page, weakening keyboard reachability.

## 5. Acceptance gates (Wave U1)

1. `npm run check` clean (typecheck + unit + build).
2. Playwright suites green: landing, layout, import, analyze, console,
   health, mobile, a11y (full sweep before merge).
3. axe: zero critical violations on `/` at all three viewports.
4. Self-review screenshots at 1440×900, 1366×768, 390×844 captured and
   *inspected* by the implementer; iterate on visible defects (clipped
   headings, off-center composition, crowded buttons, scroll-before-action)
   before reporting.
5. Compositional criteria (from the brief §7): primary CTA visible without
   scroll at 1366×768; exactly one document action in the initial viewport;
   no implementation-status text in hero/launcher; launcher + hero are the
   dominant elements; result clearly different from the audited dashboard.
