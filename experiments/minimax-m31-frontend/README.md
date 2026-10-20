# Aftershock. — Trace the evidence

**MiniMax M3.1 frontend prototype.**

A complete, standalone frontend prototype for Aftershock., a research-
integrity tool that traces the evidence behind a claim and shows where that
support has changed since you cited it.

This is an independent experiment. It lives in its own directory, runs on its
own port, and **does not touch the existing Aftershock application, its
Netlify Functions, its FalkorDB instance or its deployment.**

---

## Run it

```bash
cd /home/ansh/Projects/aftershock-wt-minimax-m31/experiments/minimax-m31-frontend
npm install
npm run dev
```

Then open **http://127.0.0.1:5183**.

To regenerate the sample manuscript (only needed if you change the content):

```bash
node scripts/make-sample-manuscript.ts
node scripts/verify-anchors.ts
```

Other commands:

```bash
npm run typecheck   # tsc --noEmit, strict
npm run build       # typecheck + production build to dist/
npm test            # vitest — 47 tests
npm run preview     # serve the production build
```

---

## What is in here

| Path | Contents |
|---|---|
| `src/app/` | (reserved) application entry points |
| `src/pages/` | Home, Reader, Evidence, Review, Graph, Report, Library, Investigations, Activity |
| `src/components/` | App shell, sidebar, PDF viewer, annotation overlay, evidence inspector, force graph, revision comparison, guide, UI primitives |
| `src/features/` | (reserved) feature modules |
| `src/fixtures/` | The prepared sample dataset, separated from the UI |
| `src/lib/` | PDF anchoring, word diff, report model, exporters, PDF.js bootstrap |
| `src/state/` | Prototype state (context + reducer + local persistence) |
| `src/styles/` | Design tokens and base styles |
| `scripts/` | Sample-manuscript generator, anchor verifier, screenshot capture |
| `public/` | The generated sample manuscript PDF and PDF.js standard font data |
| `tests/` | Vitest suites |
| `deliverables/` | Design system, limitations, build status, screenshots |

---

## The two-minute tour

1. **Home** — the document launcher is the point of the page. Drop a file, or
   take the guided example.
2. **Reader** — the original PDF opens immediately and stays usable. Example
   findings are revealed on a clearly labelled timer; the document is never
   taken over.
3. **Select a marked passage** — the Evidence Inspector opens with a
   plain-language explanation. Two further levels add the evidence
   relationship and the full provenance.
4. **Graph** — a force-directed knowledge graph of the whole investigation.
   Every record is present from the first frame; clicking inspects, it never
   expands.
5. **Review** — record what you decide. The decision propagates to the
   inspector, the queue, the activity timeline and the report.
6. **Revisions** — the original passage against a suggested revision, in
   side-by-side or tracked-changes form.
7. **Report** — eleven configurable sections, a live preview, and real
   HTML / DOCX exports plus PDF through the browser's print dialogue.

---

## Honesty rules this prototype follows

- A flag means **a person should look**, never that a claim is false.
- Supporting citations, historical mentions and reused methods are
  different relationships and are never merged.
- Unresolved references stay unresolved; candidate matches are never
  promoted to confirmed.
- A human review decision is a workflow state, not a scientific verdict.
- A suggested revision is a suggestion; the original PDF is never modified.
- The absence of a recorded notice is never treated as a clean bill of health.
- The findings shown are **prepared sample data**. No document is analysed
  and no service is contacted. The interface says this wherever it matters.

See `deliverables/prototype-limitations.md` for the full list of what is
real, what is prepared, and what is not implemented here.

---

## Stack

React 18 · TypeScript (strict) · Vite 5 · Tailwind CSS 3 · React Router 6 ·
PDF.js 4 · d3-force 3 · `docx` 9 · Vitest + Testing Library.

Fonts (Fraunces, Inter Tight, JetBrains Mono) are self-hosted through
`@fontsource-variable`; no runtime CDN call is made.
