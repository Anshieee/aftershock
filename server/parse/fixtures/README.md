# Aftershock parsing fixtures — provenance

Synthetic corpus for the M9/M10 document-parsing pipeline. **Everything here is
FICTIONAL / GUIDED DEMO content, generated fully offline.** No real
publications, manuscripts, notes, or private material are stored in this
directory (AGENTS.md scientific-integrity and data-boundary rules).

Every fixture document literally starts with the line:

```
FICTIONAL / GUIDED DEMO — Aftershock parsing fixture (not real research)
```

## Files

| File | What it is |
|---|---|
| `synthetic-article-1p.pdf` | 1-page fictional article (pdfkit). Body prose + `References` with 3 numbered entries. `10.5555/aft-fixture-001` occurs twice on the page (once raw in body prose, once as a `https://doi.org/…` URL in the references); `10.5555/aft-fixture-002` is reference-only; entry `[3]` has no identifier at all. |
| `synthetic-article-2p.pdf` | 2-page fictional article (pdfkit). Page 1 mentions `10.5555/aft-fixture-003` twice in different surface forms (URL + raw) to exercise dedupe; page 2 repeats it in the references (occurrences across pages) and adds a URL entry (`…-004`), an entry with no identifier, and an entry whose DOI URL is followed by trailing punctuation (`…-005.` — exercises punctuation-stripping). |
| `synthetic-scanned-image-only.pdf` | 1-page rasterized "scan" of `synthetic-article-1p.pdf` (ghostscript PNG → img2pdf). **No text layer** — text extraction must return empty and any pipeline ingestion path must disclose the failure rather than fabricate content. |
| `synthetic-notes.txt` | Plain-text mirror of the 1p article structure (header, 2 body sentences, `References`, 2 numbered entries) so text extraction can be compared without a PDF layer. Entry `[2]` uses the raw (non-URL) DOI form. |
| `generate-fixtures.mjs` | Deterministic generator for the two article PDFs and the TXT file. PDF metadata (Title, Author, CreationDate, ModDate pinned to `2026-01-01T00:00:00Z`) makes re-runs byte-identical **on the same Node major** (the committed artifacts were generated on Node 24; Node 20 regenerates deterministically but with different bytes — the PDF writer's internal layout differs, so do not regenerate them under a different Node major unless you intend to re-commit them). The committed PDFs/TXT are the exact script output and must never be hand-edited. The script auto-shrinks the reference font so DOI URLs always render on a single, unbroken line. |

## Provenance / DOI statement

- All document text is invented fixture prose written offline by
  `generate-fixtures.mjs`; it describes no real study, dataset, or result.
- The `10.5555/…` identifiers are documentation-example-style, **fictional**
  DOIs in the reserved example space — they are never real publications and
  never resolve to real records. Parser output must treat them only as
  **unverified pattern candidates**, exactly like any other unconfirmed
  extraction (a match is a candidate, not a verified identity).
- The fixtures exist to exercise the parsing pipeline offline in CI; they are
  committed so CI is stable and deterministic, not sourced from the network.

## Regenerating

```sh
# 1) image-only "scan" (requires ghostscript + img2pdf — only needed when regenerating)
gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r150 -sOutputFile=/tmp/scanned.png synthetic-article-1p.pdf
img2pdf /tmp/scanned.png -o synthetic-scanned-image-only.pdf && rm /tmp/scanned.png

# 2) the two article PDFs + the notes file (pdfkit via the server package)
node generate-fixtures.mjs
```

After regenerating, verify determinism: run `node generate-fixtures.mjs` twice
and compare `md5sum` output — checksums must be identical. CI does **not**
need `gs`/`img2pdf`/`node generate-fixtures.mjs`: all artifacts are committed.
