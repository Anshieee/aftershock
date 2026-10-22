// Unit tests only — must never require FalkorDB credentials (bare `npm test`
// passes with an empty environment).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 15_000,
    server: {
      deps: {
        // Force `pdfkit` to load as a real Node package (native require) instead
        // of letting vite-node inline it. The export handler that imports it
        // (`netlify/functions/export-report.mjs`) lives OUTSIDE this suite's root
        // (`server/`), so a `server/`-only install (no root `node_modules/`)
        // leaves `pdfkit` unresolvable from that importer. vite then hands
        // vite-node the bare id `pdfkit`, which is mapped to `<root>/pdfkit`
        // (no `/node_modules/` segment) and INLINED as a virtual module.
        // pdfkit resolves its bundled standard-font metrics via its own
        // package.json `imports` map (`#standard-fonts/*`); from the virtual
        // filename the nearest package.json is `server/package.json`, which has
        // no such map → `Cannot find module '#standard-fonts/Helvetica'` → every
        // PDF export answers 500. Externalizing keeps PDFKit's file-anchored
        // resolution intact. A regex is required: string patterns in
        // `deps.external` match `/node_modules/<name>` paths, not bare ids.
        // Guarded by test/unit/parse/pdfkitResolution.test.mjs.
        external: [/^pdfkit$/],
      },
    },
  },
});
