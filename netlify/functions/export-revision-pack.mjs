/**
 * POST /.netlify/functions/export-revision-pack — Revision Pack (DOCX).
 *
 * Body: { caseId?: string } → returns DOCX binary
 * (content-type: application/vnd.openxmlformats-officedocument.wordprocessingml.document).
 *
 * Handler seam: `createExportRevisionPackHandler(deps)` accepts an injectable
 * `layer` plus scripted `ops.assembleRevisionPack` so unit tests never touch
 * a real DB and never stub ESM modules (see server/demoApi.mjs).
 *
 * Honesty contract:
 * - Method guard: POST only (405 + Allow: POST).
 * - Graph failure → 503 with no fabricated data (errorBodyFor).
 * - Reads are read-only; every Cypher is $param-parameterized.
 * - Original claim text is immutable; a proposal is status "draft" until
 *   human acceptance (copying is not applying).
 * - Scientific-integrity labeling (FICTIONAL / GUIDED DEMO; no validation
 *   claims) is emitted by the data assembly layer.
 */

import {
  clientIpOf,
  createGraphLayer,
  createRateLimiter,
  demoGraphName,
  errorBodyFor,
  jsonResponse,
  textBodyOf,
  withSession,
} from '../../server/demoApi.mjs';
import { assembleRevisionPack, validateExportCaseId } from '../../server/reportExport.mjs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Footer, PageNumber } from 'docx';

/** Wall-clock budget: must stay below the client's 10 s abort. */
const READ_BUDGET_MS = 8_000;
const ALLOW = 'POST';
const CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FILENAME = 'revision-pack.docx';

/** Brand color helpers (docx uses hex strings without '#'). */
const INK = '27283B';
const INDIGO = '665C91';
const MUTED = '89857F';
const AMBER = 'E9B867';
const MUTED_RED = 'B85F59';

/**
 * Render the assembled revision-pack data into a DOCX buffer.
 * @param {import('../../server/reportExport.mjs').ReturnType<typeof import('../../server/reportExport.mjs').assembleRevisionPack>} data
 * @returns {Promise<Buffer>}
 */
async function renderRevisionPackDocx(data) {
  const doc = new Document({
    creator: 'Aftershock (research integrity)',
    title: 'Aftershock — Revision Pack',
    description: 'Export snapshot of revision state for a review case',
    sections: [{
      properties: {},
      children: [
        /* ---------- Brand header ---------- */
        new Paragraph({
          text: 'Aftershock.',
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.LEFT,
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Revision Pack — export snapshot', bold: true, size: 22, color: INDIGO })],
          spacing: { after: 120 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '────────────────────────────────────────────────────────────────', color: MUTED_RED, size: 16 })],
          spacing: { after: 180 },
        }),

        /* ---------- Snapshot / metadata ---------- */
        new Paragraph({ text: 'Export snapshot', heading: HeadingLevel.HEADING_1, spacing: { before: 60, after: 60 } }),
        ...snapshotTable(data.snapshot),
        new Paragraph({ spacing: { after: 120 } }),

        /* ---------- Scientific integrity ---------- */
        new Paragraph({ text: 'Scientific integrity (export disclosure)', heading: HeadingLevel.HEADING_1, spacing: { before: 60, after: 60 } }),
        ...bulletList(data.integrity.label ? [
          `Content label: ${data.integrity.label}`,
          `Verdict policy: ${data.integrity.verdictPolicy}`,
          `Relation-type policy: ${data.integrity.relationTypePolicy}`,
          `Fabricated content: ${data.integrity.fabricatedContent ? 'yes' : 'no'}`,
        ] : []),
        new Paragraph({ spacing: { after: 120 } }),

        /* ---------- Case ---------- */
        new Paragraph({ text: 'Case under review', heading: HeadingLevel.HEADING_1, spacing: { before: 60, after: 60 } }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Case id: ', bold: true, color: INK, size: 20 }),
            new TextRun({ text: data.case.id, color: MUTED, size: 20 }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Kind: ', bold: true, color: INK, size: 20 }),
            new TextRun({ text: data.case.kind ?? '(not recorded)', color: MUTED, size: 20 }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Review state: ', bold: true, color: INK, size: 20 }),
            new TextRun({ text: data.case.reviewState, color: MUTED, size: 20 }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Review flags: ', bold: true, color: INK, size: 20 }),
            new TextRun({ text: data.case.reviewFlags.length ? data.case.reviewFlags.join(', ') : '(none)', color: MUTED, size: 20 }),
          ],
          spacing: { after: 120 },
        }),

        /* ---------- Original vs proposed text ---------- */
        new Paragraph({ text: 'Original text (immutable — never modified by this pack)', heading: HeadingLevel.HEADING_2, spacing: { before: 60, after: 40 } }),
        new Paragraph({
          children: [new TextRun({ text: data.originalText ?? '(no original text recorded)', italic: true, size: 20, color: INK })],
          spacing: { after: 120 },
        }),
        new Paragraph({ text: 'Proposed text (draft — copying is not applying; status below)', heading: HeadingLevel.HEADING_2, spacing: { before: 60, after: 40 } }),
        new Paragraph({
          children: [new TextRun({ text: data.proposedText ?? '(no proposed text — draft not yet created)', italic: true, size: 20, color: AMBER })],
          spacing: { after: 120 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Acceptance status: ', bold: true, color: INK, size: 20 }),
            new TextRun({ text: data.acceptanceStatus.toUpperCase(), bold: true, color: data.acceptanceStatus === 'draft' ? AMBER : INK, size: 20 }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Rationale: ', bold: true, color: INK, size: 20 }),
            new TextRun({ text: data.rationale ?? '(none provided)', size: 20, color: MUTED }),
          ],
          spacing: { after: 120 },
        }),

        /* ---------- Evidence concern ---------- */
        new Paragraph({ text: 'Evidence concern', heading: HeadingLevel.HEADING_1, spacing: { before: 60, after: 60 } }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Is flagged claim: ', bold: true, color: INK, size: 20 }),
            new TextRun({ text: String(data.evidenceConcern.isFlaggedClaim), color: MUTED, size: 20 }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Latest review decision: ', bold: true, color: INK, size: 20 }),
            new TextRun({ text: data.evidenceConcern.latestReviewDecision ? `${data.evidenceConcern.latestReviewDecision.outcome} (${data.evidenceConcern.latestReviewDecision.decidedAt})` : '(none recorded)', color: MUTED, size: 20 }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [new TextRun({ text: data.evidenceConcern.disclosure, italic: true, size: 20, color: MUTED })],
          spacing: { after: 120 },
        }),

        /* ---------- Publication / notice ---------- */
        new Paragraph({ text: 'Publication & source notice', heading: HeadingLevel.HEADING_1, spacing: { before: 60, after: 60 } }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Publication: ', bold: true, color: INK, size: 20 }),
            new TextRun({ text: data.publication ? `${data.publication.id} (${data.publication.doi ?? 'no DOI'})` : '(none)', color: MUTED, size: 20 }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Notice: ', bold: true, color: INK, size: 20 }),
            new TextRun({ text: data.notice ? `${data.notice.noticeType} — published ${data.notice.publishedDate ?? '(not recorded)'}` : '(none)', color: MUTED, size: 20 }),
          ],
          spacing: { after: 120 },
        }),

        /* ---------- Limitations ---------- */
        new Paragraph({ text: 'Limitations & coverage', heading: HeadingLevel.HEADING_1, spacing: { before: 60, after: 60 } }),
        ...bulletList(data.limitations),
        new Paragraph({ spacing: { after: 120 } }),

        /* ---------- Footer ---------- */
        new Paragraph({
          children: [new TextRun({ text: 'Aftershock — Trace the evidence. This pack is a snapshot at generation time; it is not re-verified after generation.', size: 14, color: MUTED, italic: true })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

/**
 * Build a two-column metadata table from the snapshot block.
 * @param {{generatedAt: string, caseId: string, format: string, analysisVersion: string, status: string, seedVersion: string | null}} snapshot
 * @returns {Array<import('docx').Table | import('docx').Paragraph>}
 */
function snapshotTable(snapshot) {
  const rows = [
    ['Generated at', snapshot.generatedAt],
    ['Case id', snapshot.caseId],
    ['Format', snapshot.format],
    ['Analysis version', snapshot.analysisVersion],
    ['Export status', snapshot.status.toUpperCase()],
    ['Seed version', snapshot.seedVersion ?? '(none — unseeded graph)'],
  ];
  const tableRows = rows.map(([k, v]) => new TableRow({
    children: [
      new TableCell({ width: { size: 90, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, color: INK, size: 18 })] })] }),
      new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: v, size: 18, color: MUTED })] })] }),
    ],
  }));
  return [new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: MUTED_RED } } })];
}

/** Build bulleted paragraphs from an array of strings. */
function bulletList(items) {
  return items.map((item) => new Paragraph({
    children: [new TextRun({ text: '• ' + item, size: 18, color: MUTED })],
    indent: { left: 280 },
    spacing: { after: 60 },
  }));
}

export function createExportRevisionPackHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter();
  const assemble = deps.assemble ?? assembleRevisionPack;
  const renderDocx = deps.renderDocx ?? renderRevisionPackDocx;

  return async function handler(request /*, context */) {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: ALLOW });
    }

    const graphName = demoGraphName(env);
    const url = new URL(request.url);
    const caseId = url.searchParams.get('caseId') ?? '';
    const ip = clientIpOf(request);

    // Per-IP rate limit (demo-scope, in-memory).
    const ipGate = limiter.check(`ip:${ip}`);
    if (!ipGate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(ipGate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        { error: 'rate-limited', message: 'Too many export requests from this IP. Wait and try again; nothing was generated by this request.' },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    // Parse the JSON body.
    let input = {};
    try {
      const text = await textBodyOf(request);
      input = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      return jsonResponse(400, { error: 'invalid-request', message: 'Request body must be a JSON object.' });
    }
    input.caseId = caseId;

    // Validate caseId format when one is provided (caseId is optional per
    // contract; an empty/unspecified caseId is rejected by the assembly op).
    if (caseId !== '') {
      try {
        validateExportCaseId({ caseId });
      } catch (err) {
        if (Number.isInteger(err.status) && err.status === 400) {
          return jsonResponse(400, { error: 'invalid-request', message: err.message });
        }
        throw err;
      }
    }

    // Per-case rate limit.
    const gate = limiter.check(caseId);
    if (!gate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        { error: 'rate-limited', message: 'Exports are rate limited for this case. Wait and try again; nothing was generated by this request.' },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    try {
      const data = await withSession(layer, graphName, (session) => assemble(session, { caseId }), {
        timeoutMs: READ_BUDGET_MS,
      });

      const docxBuffer = await renderDocx(data);

      return new Response(docxBuffer, {
        status: 200,
        headers: {
          'content-type': CONTENT_TYPE,
          'content-disposition': `attachment; filename="${FILENAME}"`,
          'cache-control': 'no-store',
          'content-length': String(docxBuffer.length),
        },
      });
    } catch (err) {
      if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
        return jsonResponse(err.status, { error: err.name === 'ExportNotFoundError' ? 'not-found' : 'invalid-request', message: err.message });
      }
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createExportRevisionPackHandler();
