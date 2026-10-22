/**
 * Regression guard: the PDF export path MUST resolve the real `pdfkit`
 * package under this unit runner, never an inlined virtual copy.
 *
 * Why this exists (observed failure): `pdfkit` resolves its bundled standard
 * font metrics through its OWN package.json `imports` map
 * (`"#standard-fonts/*": "./js/standard-fonts/*.cjs"`). vite-node inlines any
 * module whose resolved id has no `/node_modules/` segment. The export
 * handler lives OUTSIDE this suite's root (`server/`), in
 * `netlify/functions/export-report.mjs`. When `pdfkit` is not resolvable
 * from that importer — e.g. a `server/`-only `npm ci` with no root
 * `node_modules/` — vite returns `null`, the runner receives the bare id
 * `pdfkit`, maps it to `<root>/pdfkit`, inlines the CJS build, and pdfkit's
 * `createRequire(__filename)` then resolves `#standard-fonts/Helvetica`
 * against `server/package.json` (no such imports map) → MODULE_NOT_FOUND →
 * the handler answers 500. `server/vitest.unit.config.js` externalizes
 * `pdfkit`; this test fails loudly if that regresses.
 *
 * The import chain is deliberate: importing `pdfkit` directly from this file
 * would resolve inside `server/node_modules` and never exercise the failing
 * out-of-root resolution. The test therefore drives the production handler
 * (with a stubbed assemble seam, no DB, no credentials) and asserts a real
 * PDF is rendered with its standard fonts.
 */

import { describe, expect, it } from 'vitest';

import { createExportReportHandler } from '../../../netlify/functions/export-report.mjs';

/** Graph name used only to satisfy the demo env lookup; no connection is opened. */
const GRAPH_NAME = 'aftershock:demo-smoke';

/** Minimal fake layer: the assemble seam below never reads from the session. */
const fakeLayer = {
  open: async () => ({ close: async () => {} }),
};

/**
 * Minimal assembled-report shape consumed by `buildReportPdfPlan`. Empty
 * collections exercise the honest "nothing recorded" branches; the report is
 * rendered for real by pdfkit, including its bundled standard fonts.
 */
function minimalAssembledReport() {
  return {
    snapshot: {
      generatedAt: '2026-01-01T00:00:00.000Z',
      snapshotTakenAt: '2026-01-01T00:00:00.000Z',
      caseId: 'case-pdfkit-resolution-guard',
      format: 'pdf',
      analysisVersion: 'guard-1',
      version: 'export-guard-1',
      status: 'draft',
      seedVersion: 'seed-guard-1',
    },
    integrity: {
      label: 'FICTIONAL / GUIDED DEMO',
      verdictPolicy: 'Exports carry no verdicts; a review flag means human review is needed.',
      relationTypePolicy: 'Relation types are never conflated.',
      historicalExclusion: 'Historical mentions are excluded from the flagged set.',
      unresolvedDisclosure: 'Unresolved references are disclosed, never propagated.',
      fabricatedContent: true,
    },
    graph: { nodeCount: 1, edgeCount: 0, manuscriptTitle: null },
    verifiedNotices: [],
    affected: { claims: [], conclusions: [] },
    historical: [],
    unresolved: [],
    reviewDecisions: [],
    revisionProposals: [],
    limitations: ['Synthetic guard report: not a real evidence review.'],
  };
}

describe('pdfkit — standard-font resolution under the unit runner', () => {
  it('renders a real PDF through the export handler (pdfkit loaded from node_modules)', async () => {
    const handler = createExportReportHandler({
      env: { FALKORDB_GRAPH_NAME: GRAPH_NAME },
      layer: fakeLayer,
      assemble: async () => minimalAssembledReport(),
    });

    const res = await handler(
      new Request(`http://localhost/${GRAPH_NAME}/export-report?caseId=case-pdfkit-resolution-guard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ format: 'pdf' }),
      }),
    );

    // 500 here is the inlined-pdfkit failure (standard-font MODULE_NOT_FOUND).
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const body = Buffer.from(await res.arrayBuffer());
    // A real PDF magic header, not an error payload.
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // `%PDF-` alone could come from any producer; the section headings prove
    // the handler's real renderer ran. The standard-font metrics that broke
    // (`Helvetica`, `Helvetica-Bold`) are what produced these glyphs.
    const text = body.toString('latin1');
    expect(text).toContain('/Helvetica');
    expect(text).toContain('/Helvetica-Bold');
    // Complete document: pdfkit wrote its trailer instead of failing midway.
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});
