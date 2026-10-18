# aftershock

Aftershock evidence-integrity and research-impact workspace (demo).

## M1 — walking skeleton (this branch)

Netlify-deployable app shell with a real `/health` endpoint and GitHub CI.

**Implemented:** import-first landing (native file picker with an honest
"not wired yet" state after selection), an empty five-area sidebar shell
(Overview, Investigations, Library, Review Queue, Activity) plus the
"Knowledge Graph" secondary destination, and a truthful service-status chip
 querying `/.netlify/functions/health` ("API: online/unavailable" only).

**Not implemented (honest):** document import/upload/analysis, FalkorDB
connectivity or graph seeding, graph exploration, review workflows, exports,
activity history. Non-implemented areas show "Feature under construction"
only — nothing is simulated or labeled as available.

## Health endpoint

`GET /.netlify/functions/health` →
`{ "ok": true, "service": "aftershock-demo", "graph": "not-configured", "version": "0.1.0" }`
No DB connectivity, no secrets in M1.

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # production build → dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest (npm test -- --run for one pass)
npm run check      # FalkorDB connectivity smoke test (needs local .env; NEVER run in CI)
```

## Fonts & licenses

Self-hosted via [Fontsource](https://fontsource.org/) — bundled woff2 files,
no runtime CDN fonts.

- **Inter Variable** (body/controls/graph labels) — SIL Open Font License 1.1
  (`@fontsource-variable/inter`) · Copyright The Inter Project Authors.
- **Source Serif 4 Variable** (display/brand/headings) — SIL Open Font
  License 1.1 (`@fontsource-variable/source-serif-4`) · Copyright 2017 The
  Source Serif 4 Project Authors.

## Development

- Stack: Vite + React 18 + TypeScript + Tailwind CSS. Netlify Functions v2
  (Node 20) serve the API. CI: `npm ci` → typecheck → vitest → build
  (`npm run check` is deliberately not part of CI).
- See `docs/DATA_CONTRACTS.md` for API/data contracts and
  `docs/decisions/0001-architecture.md` for the MVS decision.
