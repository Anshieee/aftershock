# ADR 0003 — Local offline document extraction & citation detection (M9/M10)

## Status
- Implemented 2026-10-22 on feature branch `feat/m9-m10-doc-parsing` (base `57ddfb4`, through `2cc20c0`). **Branch-local: not merged to `main`, not deployed, not wired into any production or frontend surface.**
- Supersedes nothing; complements ADR 0002 (Crossref evidence search) and the Wave-3 in-memory import metadata extraction note in `docs/DATA_CONTRACTS.md` §2.

## Decision
Add a **local, offline document-extraction tier** that never touches the graph, the network, or the Netlify surface:

- **Canonical record contract:** every run produces one `documentExtract-1` record (`analysisVersion: parse-1`) — source block (format, fileName, sizeBytes, sha256 of received bytes), extraction block (attempted/reason + located pages/lines with optional per-line geometry), additive `references` block (conservative `References`-heading detection + numbered-entry segmentation), additive `dois` block (deduplicated occurrence aggregates with first-seen locations), and `honesty.caveats`. `server/parse/schema.mjs` owns the constants, the wire contract, and a fail-loud validator.
- **Modules (all pure, no I/O in detectors):** `server/parse/schema.mjs` (contract), `txtDocument.mjs` (bounded tolerant UTF-8 decode → located lines; standalone-heading detection; conservative numbered-entry segmentation), `doiDetect.mjs` (DOI candidate detection/norm dedup — patterns deliberately duplicated from the deployed `server/metaExtract.mjs`, which stays untouched), `pdfText.mjs` (pdf.js text-layer extraction with per-line geometry; per-use lazy `import('pdfjs-dist/legacy/build/pdf.mjs')`), `documentExtract.mjs` (format dispatcher + hard validation gate: an invalid record throws rather than being emitted).
- **Pinned dependency:** `pdfjs-dist@4.10.38` exact, server package only. v6 was evaluated and rejected: its engines require Node ≥ 22.13 while CI pins Node 20. Pinned Node-safe options: `useWorkerFetch:false, isEvalSupported:false, useSystemFonts:false, disableFontFace:true, verbosity:0` — no worker, no eval, no network (verified against the pdf.js 4.10.38 source: Node path uses the fs standard-font factory).
- **CLI (the only consumer in this milestone):** `node scripts/extract-document.mjs <file> [--format txt|pdf|docx] [--max-pages N] [--out path]` — structured JSON to stdout or a local file, honest exit codes (0 valid record incl. honest no-scan states; 1 unreadable input; 2 usage; 3 internal validation failure), input guards (regular file, ≤ 200 MB read cap, `--out` refused when equal to the source).
- **Budgets with disclosed truncation** (all in the schema): decode/scan window 512 KiB, PDF pages ≤ 120, per-page text ≤ 60 000 chars, whole-text ≤ 1 000 000 chars, unique DOIs ≤ 50, reference entries ≤ 200, snippet ≤ 120. Every hit flips a `truncated` flag and emits an exact disclosure note — truncation is surfaced, never silent, never fabricated around.
- **Fixtures:** committed, deterministic (byte-identical on regeneration), `FICTIONAL / GUIDED DEMO` labeled, DOI space confined to the reserved-example prefix `10.5555/aft-fixture-001…005`; includes a scanned-image-style PDF (no text layer) and TXT mirrors. `docs/DATA_CONTRACTS.md` §2 gains the local-tier note; limitations live in `docs/KNOWN_LIMITATIONS.md`.

## Why
- The deployed import path is metadata-only and its TXT DOI scan cannot address documents generally; reviewers need a way to see *where* citations occur in a local document without uploading anything — especially given the free-tier graph's no-TLS/no-durability boundary, which forbids private manuscripts from any networked path.
- Detection must be structurally incapable of verification claims here: the tier performs **no external identifier resolution** and every emitted detection carries `provenanceKind: 'observed'` + `rationale`/`analysisVersion`, so future graph-bearing consumers can only ever inherit "pattern observed at location", never "citation valid/verified".
- A CLI-first milestone keeps the new tier provably decoupled from production: nothing in `netlify/`, `src/`, or any deployed module changed, and `server/metaExtract.mjs` remains exactly as deployed.

## Alternatives considered
- **pdfjs-dist v6 / v5:** rejected on Node-20 engine grounds (see above); v6 additionally requires the modern build path that is ESM-tool-sensitive in CI.
- **System pdftotext (Poppler) as the extractor:** would add a native binary dependency to CI and complicate byte-identical/deterministic test data; pdf.js is pure JS with per-item coordinates and is already vetted for the pinned option set.
- **DOCX extraction now:** deferred (`DEFERRED_FORMATS=['docx']`) — honest stub reason instead of a guessed parser; the record shape already accommodates it later without a schema version bump.
- **Wiring results into `/import-document` in this milestone:** rejected — that surface is production/deployed; extending it belongs to a later reviewed milestone (and any future persistence requires the ADR 0001 secure-tier migration).

## Consequences
- The tier is independently testable and ships with 103 parse-focused tests (schema 30, doiDetect 15, txtDocument 20, pdfText 15, dispatcher 17, fixtures-integration 6 — plus 9 CLI guard tests and 1 pdfkit-resolution guard added by the CI-reliability sprint, i.e. 410 server-suite tests in total) plus CLI evidence runs covering all honest states.
- Known residual risks are documented, not hidden: heading detection is a layout heuristic (standing note stamped into records), DOI scan work is bounded by the decode/char windows (same worst-case class as the deployed `metaExtract` within those windows), and `validateExtractionRecord` validates the core envelope while `references`/`dois` payloads are additive contracts locked by their producers' tests.
- Next milestone can consume `documentExtract-1` records (e.g. a future secure-tier import surface) without reshaping the wire contract; until then the CLI is the sole interface and nothing server-side reads these modules.
