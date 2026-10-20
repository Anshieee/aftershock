# Build status — Aftershock. MiniMax M3.1 frontend prototype

Compact checkpoint for resuming work after a context compaction or an
interruption.

- **Branch:** `experiment/minimax-m31-frontend`
- **Worktree:** `/home/ansh/Projects/aftershock-wt-minimax-m31`
- **Project path:** `experiments/minimax-m31-frontend/`
- **Remote:** `https://github.com/Anshieee/aftershock`
- **Latest local commit:** see `git log --oneline -1` in the worktree
- **Latest pushed commit:** see `git log --oneline -1 origin/experiment/minimax-m31-frontend`

---

## Phase

**Phase 7 — verification and delivery.** Phases 1–6 are complete.

---

## Completed features

### Phase 1 — project
- [x] Standalone Vite + React 18 + TypeScript project under `experiments/minimax-m31-frontend/`
- [x] Project-local Tailwind, PostCSS, Vitest configuration (root config untouched)
- [x] Dev server verified on `http://127.0.0.1:5183`
- [x] Fictional sample manuscript generated with pdfkit: 5 pages, A4, a
      two-column spread, a typeset table and a vector figure
- [x] `scripts/verify-anchors.ts` — every annotation anchor verified against
      the rendered PDF (all 6 resolve)

### Phase 2 — design system
- [x] Warm editorial palette as CSS custom properties; art-directed dark theme
- [x] Fraunces / Inter Tight / JetBrains Mono, self-hosted
- [x] Wordmark + concentric-ripple mark, favicon
- [x] Compact control scale, disclosure, chips, segmented control, sheet
- [x] Documented in `deliverables/design-system.md`

### Phase 3 — core application
- [x] App shell with collapsible ChatGPT-style sidebar (252 px → 56 px rail)
- [x] Homepage: centred document launcher, drag-and-drop, keyboard access,
      unsupported-file feedback, guided-example entry, recent investigations
- [x] Upload → ripple → workspace transition
- [x] PDF.js reader: real rendering, zoom, fit-to-width/page, page navigation
- [x] Reflowed reader mode generated from the same content source
- [x] Annotation overlay: fine underline, translucent highlight when
      selected, margin indicator, hover emphasis, semantic colours
- [x] Evidence Inspector: plain language → evidence relationship → provenance
- [x] Compact force-directed graph inside the inspector

### Phase 4 — research workflows
- [x] Guided example (start / pause / resume / skip / restart)
- [x] Compact collapsible findings overview, progressive reveal of the
      prepared example findings
- [x] Review Queue with scope filter, kind filter, decision recording
- [x] Revision comparison: side-by-side and tracked changes (real word diff)
- [x] Full Obsidian/Logseq-style graph workspace: search, kind filters,
      label modes, node and relationship inspection, zoom / pan / drag / fit
- [x] Report workspace with eleven configurable sections and live preview
- [x] Real HTML and DOCX export; PDF through the browser print dialogue
- [x] Library, Investigations, Activity, 404
- [x] Mobile companion: bottom-sheet inspector, mobile reading controls

### Phase 5 — motion and responsive
- [x] Sidebar collapse, panel transitions, ripple, annotation reveals
- [x] `prefers-reduced-motion` honoured globally
- [x] Verified at 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 360×800

### Phase 6 — visual inspection
- [x] 22 screenshots captured from the running app (`scripts/capture.mjs`)
- [x] Refinement passes: PDF text colour leak, canvas render race, analysis
      timer cancellation, toolbar overflow, graph label collisions, stale
      d3 link references, diff legibility, mobile mode switch

### Phase 7 — verification and delivery
- [x] `npm run typecheck` — clean
- [x] `npm run build` — clean
- [x] `npm test` — 47 tests passing
- [x] `npm run verify:anchors` — all 6 anchors resolve against the PDF
- [x] `npm run journey` — 22/22 steps of the required user journey pass,
      no console errors, real HTML and DOCX files produced
- [x] `npm run capture` — 22 screenshots, no console errors
- [x] `deliverables/design-system.md`
- [x] `deliverables/prototype-limitations.md`
- [x] `deliverables/screenshots/`
- [ ] Final push verification (see below)

---

## Tests

| Command | Result |
|---|---|
| `npm run typecheck` | clean (TypeScript 5.6, strict, `noUncheckedIndexedAccess`) |
| `npm run build` | clean — `tsc --noEmit` then `vite build` |
| `npm test` | 5 files, 47 tests, all passing |
| `npm run verify:anchors` | all 6 anchors resolve against the PDF |
| `npm run journey` | 22/22 steps pass, **no console errors** |
| `npm run capture` | 22 screenshots, **no console errors** |

Test coverage:
- `tests/anchors.test.ts` — phrase location across line breaks, geometry,
  no fabricated highlights, case-insensitive matching
- `tests/fixtures-integrity.test.ts` — the production acceptance invariants
  (DATA_CONTRACTS §7), provenance on every edge, relation non-conflation,
  no false verdicts in the copy
- `tests/report.test.ts` — diff reconstruction, report model, date
  separation, HTML export
- `tests/store.test.ts` — review decisions, proposals, progressive reveal,
  section toggles, reset
- `tests/evidence-inspector.test.tsx` — the inspector's disclosure levels and
  its plain-language copy

---

## Remaining tasks

1. Final `git status` review, then push the final commit to
   `origin/experiment/minimax-m31-frontend`.
2. Verify `origin/experiment/minimax-m31-frontend` exists and that local
   HEAD matches it.
3. Confirm no file outside `experiments/minimax-m31-frontend/` was changed
   in the shared checkout.

---

## Known blockers

None.

---

## Exact next action

```bash
cd /home/ansh/Projects/aftershock-wt-minimax-m31
git add -A experiments/minimax-m31-frontend
git commit -m "feat(experiment): tests, documentation and final visual pass"
git push origin experiment/minimax-m31-frontend
git rev-parse HEAD origin/experiment/minimax-m31-frontend
```
