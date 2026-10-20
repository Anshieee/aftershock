# Prototype limitations — what this build is and is not

This prototype is a **frontend demonstration**. It is deliberately honest
about the line between a working interaction and prepared sample data.
Read this before drawing conclusions about the product.

---

## 1. Working locally, for real

| Area | What genuinely works |
|---|---|
| PDF reading | The original manuscript is rendered by PDF.js from `public/sample-manuscript.pdf`. It is a real PDF with a real text layer, real pagination, real columns, a real table and a real vector figure. |
| Annotation geometry | A highlight is located by searching the PDF's own text runs and reading their coordinates. Nothing is drawn at an estimated position. A phrase that cannot be found produces **no** highlight. |
| Reflowed mode | The same manuscript content, typeset for the screen. It is generated from the same source as the PDF (`src/fixtures/manuscriptContent.ts`), so the two cannot drift apart. |
| Reading controls | Zoom in/out, fit-to-width, fit-to-page, page navigation, scroll — all implemented against the live PDF. |
| Evidence graph | A real d3-force simulation on canvas: pan, zoom, drag, hover, select, fit-to-view. Every node and edge in the dataset is present from the first frame; clicking never reveals new relationships. |
| Review decisions | Recorded in browser state and reflected consistently in the reader, the inspector, the review queue, the activity timeline and the report. |
| Revision proposals | Side-by-side and tracked-changes views computed with a real word-level diff. Accepting a proposal adds it to a draft plan. |
| Report exports | **HTML** and **DOCX** are produced in the browser from the prepared records (`src/lib/exporters.ts`). **PDF** goes through the browser's own print dialogue with a print stylesheet. All three are real files. |
| Theme | Light and dark, system-preference detection on first visit, manual override, persisted in `localStorage`. |
| Guide | The guided example runs end to end and can be paused, resumed, skipped and restarted. |

---

## 2. Prepared sample data (not computed)

Everything the interface knows comes from `src/fixtures/`.

- **The manuscript is fictional.** Its title, authors, journal, dataset,
  numbers and results are invented. It exists so the reader can be
  demonstrated against a real PDF.
- **The findings are written, not derived.** Seven findings for the sample
  manuscript and five for the other prepared investigations. They encode the
  demonstration cases from the production data contract — direct support
  with a retraction, an indirect dependency, a historical mention, an
  unresolved reference, a source with no notice, a reused method, and a
  shared cohort — but no code in this project computes them from the
  manuscript.
- **The graph is a fixed dataset.** Thirty-five records and forty-one
  relationships, hand-written to match the data contract. The force layout
  is real; the content is prepared.
- **The activity timeline is authored.** Only the notice announcement
  (2020-06-04) and the indexing record date (2020-06-05) are real
  historical dates, and they are kept distinct.
- **Two publication records are real.** The Mehra et al. (2020) Lancet
  registry analysis and its retraction notice are genuine publication
  records, cited inside the fictional manuscript. Everything else in the
  graph is synthetic and marked `isSynthetic`.

---

## 3. Simulated behaviour

- **The analysis progress is a timer.** Opening a document reveals prepared
  findings on a ~5-second schedule. The toolbar says *Preparing example
  findings…* and the expandable detail says plainly that the stages are a
  simulation and that no service was contacted. No percentage is ever
  shown, because there is no real progress to measure.
- **No document is analysed.** Not the sample manuscript, not an uploaded
  file.
- **Nothing is uploaded.** A file chosen in the launcher is opened in the
  browser through an object URL and rendered by PDF.js. It is never sent
  anywhere, never written to a graph, and never analysed. The reader says
  so in the toolbar (*opened locally, not analysed*).

---

## 4. No backend

- There is no server, no database, no API client and no network call other
  than fetching the prototype's own static assets.
- State lives in React and in `localStorage` under
  `aftershock.m31.state.v1`. It is **not** durable history: clearing site
  data or using *Reset prototype state* in the sidebar removes it. The
  report and activity screens say so.
- The existing Aftershock application, its Netlify Functions and its
  FalkorDB instance are untouched by this prototype.

---

## 5. Not implemented here

These belong to a later integration, not to a frontend prototype:

- Real passage extraction and claim/reference segmentation of an arbitrary
  manuscript.
- Crossref / PubMed / Retraction Watch lookups and notice detection.
- Persistent per-user review history and audit trails.
- Server-side report generation with the production export matrix
  (PDF/DOCX/HTML as Netlify Functions).
- Multi-document collections, shared workspaces, authentication.
- The production `find-evidence` candidate search.
- Full-text retrieval and citation-context fetching (the production
  limitation applies equally here).

---

## 6. Known rough edges in this build

- The sample PDF uses the base-14 Times faces; PDF.js loads the standard
  font data from `public/pdfjs/standard_fonts/`, so metrics are correct on
  every browser, but the manuscript is set in one serif rather than a
  journal's real typeface stack.
- The text layer used for selection is an approximation of the PDF's own
  glyph positions; it is good enough to select text, not to be a
  typographic reproduction.
- The compact graph inside the evidence inspector is small enough that
  labels collide; it is deliberately kept to the records in the finding.
- The report's print output uses the browser's pagination, so page breaks
  do not match the on-screen preview exactly.
- The prototype has not been audited with axe or with a screen reader;
  accessibility was implemented deliberately (names, roles, focus, reduced
  motion) but not verified with assistive technology.

---

## 7. How to reset

*Reset prototype state* in the sidebar footer clears the review decisions,
proposals, revealed findings, report configuration and theme preference
that this browser session accumulated.
