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
import {
  REVISION_PACK_LABELS,
  assembleRevisionPack,
  exportStatusDisplay,
  validateExportCaseId,
} from '../../server/reportExport.mjs';
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
 * @typedef {Object} DocxBlock
 * @property {'h1'|'h2'|'field'|'bullet'|'note'|'quote'|'table'} kind
 * @property {string} [text]
 * @property {string} [k]
 * @property {string} [v]
 * @property {'ink'|'muted'|'amber'|'red'} [tone]
 * @property {string[][]} [rows]
 */

/**
 * Pure, deterministic structural plan for the Revision Pack DOCX (unit-
 * testable without binary comparison). renderRevisionPackDocx consumes this;
 * every value flows from the assembled `data` (never hardcoded), original
 * text is rendered verbatim under its immutable label, the proposed text is
 * always framed as a draft that never reads as applied, and the full review
 * decision trail (not latest-only) is rendered.
 * @param {import('../../server/reportExport.mjs').ReturnType<typeof import('../../server/reportExport.mjs').assembleRevisionPack>} data
 * @returns {DocxBlock[]}
 */
export function buildRevisionPackDocxPlan(data) {
  /** @type {DocxBlock[]} */
  const blocks = [];

  /* ---------- Snapshot / metadata ---------- */
  blocks.push({ kind: 'h1', text: 'Export snapshot' });
  blocks.push({ kind: 'table', rows: [
    ['Generated at', data.snapshot.generatedAt],
    ['Snapshot taken at', data.snapshot.snapshotTakenAt],
    ['Case id', data.snapshot.caseId],
    ['Format', data.snapshot.format],
    ['Analysis version', data.snapshot.analysisVersion],
    ['Export version', data.snapshot.version],
    ['Export status', exportStatusDisplay(data.snapshot.status)],
    ['Seed version', data.snapshot.seedVersion ?? '(none — unseeded graph)'],
  ] });
  blocks.push({ kind: 'spacer' });

  /* ---------- Scientific integrity ---------- */
  blocks.push({ kind: 'h1', text: 'Scientific integrity (export disclosure)' });
  for (const line of [
    `Content label: ${data.integrity.label}`,
    `Verdict policy: ${data.integrity.verdictPolicy}`,
    `Relation-type policy: ${data.integrity.relationTypePolicy}`,
    `Fabricated content: ${data.integrity.fabricatedContent ? 'yes' : 'no'}`,
  ]) {
    blocks.push({ kind: 'bullet', text: line });
  }
  blocks.push({ kind: 'spacer' });

  /* ---------- Case ---------- */
  blocks.push({ kind: 'h1', text: 'Case under review' });
  blocks.push({ kind: 'field', k: 'Case id', v: data.case.id });
  blocks.push({ kind: 'field', k: 'Kind', v: data.case.kind ?? '(not recorded)' });
  blocks.push({ kind: 'field', k: 'Review state', v: data.case.reviewState });
  blocks.push({ kind: 'field', k: 'Review flags', v: data.case.reviewFlags.length ? data.case.reviewFlags.join(', ') : '(none)' });
  blocks.push({ kind: 'spacer' });

  /* ---------- Original vs proposed (labeled, side-by-side order) ---------- */
  blocks.push({ kind: 'h1', text: 'Original passage vs proposed revision' });
  blocks.push({ kind: 'h2', text: data.textPair.original.label });
  blocks.push({ kind: 'quote', text: data.textPair.original.text ?? '(no original text recorded)' });
  blocks.push({ kind: 'note', text: data.textPair.original.note });
  if (data.textPair.proposed) {
    blocks.push({ kind: 'h2', text: data.textPair.proposed.label });
    blocks.push({ kind: 'quote', text: data.textPair.proposed.text, tone: 'amber' });
    blocks.push({ kind: 'note', text: data.textPair.proposed.note });
  } else {
    blocks.push({ kind: 'note', text: data.textPair.noProposalNote ?? REVISION_PACK_LABELS.noProposalNote });
  }
  blocks.push({ kind: 'h2', text: REVISION_PACK_LABELS.acceptanceHeading });
  blocks.push({ kind: 'field', k: 'Acceptance status', v: data.acceptanceDisplay.label, tone: data.acceptanceDisplay.applied ? 'ink' : 'amber' });
  blocks.push({ kind: 'note', text: data.acceptanceDisplay.note });
  if (data.textPair.proposed) {
    // Rationale belongs to the draft proposal — only rendered when one exists.
    blocks.push({ kind: 'h2', text: REVISION_PACK_LABELS.rationaleHeading });
    blocks.push({ kind: 'note', text: data.rationale ?? '(none recorded with the draft proposal)' });
  } else {
    // Section-level honest note: no invented "rationale: none" for a missing proposal.
    blocks.push({ kind: 'note', text: REVISION_PACK_LABELS.noRationaleNote });
  }
  blocks.push({ kind: 'spacer' });

  /* ---------- Evidence concern ---------- */
  blocks.push({ kind: 'h1', text: 'Evidence concern' });
  blocks.push({ kind: 'field', k: 'Is flagged claim', v: String(data.evidenceConcern.isFlaggedClaim) });
  blocks.push({ kind: 'field', k: 'Latest review decision', v: data.evidenceConcern.latestReviewDecision
    ? `${data.evidenceConcern.latestReviewDecision.outcome} (${data.evidenceConcern.latestReviewDecision.decidedAt})`
    : '(none recorded)' });
  blocks.push({ kind: 'note', text: data.evidenceConcern.disclosure });
  blocks.push({ kind: 'spacer' });

  /* ---------- Review decision trail (full, ordered by decidedAt) ---------- */
  blocks.push({ kind: 'h1', text: REVISION_PACK_LABELS.reviewTrailHeading });
  if (data.reviewDecisions.length === 0) {
    blocks.push({ kind: 'note', text: REVISION_PACK_LABELS.noDecisionNote });
  } else {
    // ONE section-level note — not repeated under every decision.
    blocks.push({ kind: 'note', text: 'A review decision means "needs human review" was exercised — it never validates or disproves the passage.' });
    for (const d of data.reviewDecisions) {
      blocks.push({ kind: 'field', k: `Decision ${d.id}`, v: `outcome: ${d.outcome}` });
      blocks.push({ kind: 'field', k: 'Decided at', v: `${d.decidedAt}   |   Reviewer: ${d.reviewer || '(not recorded)'}   |   Provenance: ${d.provenanceKind ?? '(none)'}` });
      blocks.push({ kind: 'field', k: 'Explanation', v: d.explanation });
    }
  }
  blocks.push({ kind: 'spacer' });

  /* ---------- Publication & notice ---------- */
  blocks.push({ kind: 'h1', text: 'Publication & source notice' });
  blocks.push({ kind: 'field', k: 'Publication', v: data.publication ? `${data.publication.id} (${data.publication.doi ?? 'no DOI'})` : '(none)' });
  blocks.push({ kind: 'field', k: 'Notice', v: data.notice ? `${data.notice.noticeType} — published ${data.notice.publishedDate ?? '(not recorded)'}` : '(none)' });
  blocks.push({ kind: 'note', text: 'Verified notice context is global snapshot context, not a per-case diagnosis; a verified notice means the notice record itself was verified — evidence review is still needed at the passage.' });
  blocks.push({ kind: 'spacer' });

  /* ---------- Unresolved references (count + list) ---------- */
  blocks.push({ kind: 'h1', text: REVISION_PACK_LABELS.unresolvedHeading });
  blocks.push({ kind: 'field', k: REVISION_PACK_LABELS.unresolvedCountLabel, v: String(data.unresolvedReferences.count) });
  if (data.unresolvedReferences.count === 0) {
    blocks.push({ kind: 'note', text: 'No unresolved reference occurrences recorded in this graph snapshot.' });
  } else {
    for (const u of data.unresolvedReferences.items) {
      const candidateIds = u.occurrence.candidatePublicationIds ?? [];
      blocks.push({ kind: 'field', k: `Reference ${u.occurrence.id}`, v: `state: ${u.occurrence.resolutionState}   |   raw text: ${u.occurrence.text ?? '(none)'}` });
      blocks.push({ kind: 'bullet', text: `Candidates (POSSIBLE_MATCH only, non-propagating): ${candidateIds.length === 0 ? 'none' : candidateIds.join(', ')}` });
    }
  }
  blocks.push({ kind: 'spacer' });

  /* ---------- Limitations ---------- */
  blocks.push({ kind: 'h1', text: 'Limitations & coverage' });
  for (const lim of data.limitations) {
    blocks.push({ kind: 'bullet', text: lim });
  }

  return blocks;
}

/** Tone → TextRun color for value runs. */
function toneColor(tone) {
  if (tone === 'amber') return AMBER;
  if (tone === 'red') return MUTED_RED;
  if (tone === 'ink') return INK;
  return MUTED;
}

/**
 * Render the assembled revision-pack data into a DOCX buffer by walking the
 * pure plan (buildRevisionPackDocxPlan), so heading hierarchy (TITLE → H1 →
 * H2 → body), spacing and section ordering stay consistent by construction.
 * @param {import('../../server/reportExport.mjs').ReturnType<typeof import('../../server/reportExport.mjs').assembleRevisionPack>} data
 * @returns {Promise<Buffer>}
 */
async function renderRevisionPackDocx(data) {
  /** @param {DocxBlock} block */
  function blockToElements(block) {
    if (block.kind === 'h1') {
      return [new Paragraph({ text: block.text ?? '', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 80 } })];
    }
    if (block.kind === 'h2') {
      return [new Paragraph({ text: block.text ?? '', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 40 } })];
    }
    if (block.kind === 'field') {
      const k = block.k ?? '';
      const v = block.v ?? '';
      // Decision-trail entries read slightly stronger (ink value); other
      // field values render muted unless an explicit tone is given.
      const decisionEntry = k.startsWith('Decision ') || k === 'Explanation';
      return [new Paragraph({
        children: [
          new TextRun({ text: k + ': ', bold: true, color: INK, size: 20 }),
          new TextRun({
            text: v,
            size: 20,
            color: block.tone ? toneColor(block.tone) : (decisionEntry ? INK : MUTED),
          }),
        ],
        spacing: { after: 40 },
      })];
    }
    if (block.kind === 'bullet') {
      return [new Paragraph({
        children: [new TextRun({ text: '• ' + (block.text ?? ''), size: 18, color: MUTED })],
        indent: { left: 280 },
        spacing: { after: 60 },
      })];
    }
    if (block.kind === 'note') {
      return [new Paragraph({
        children: [new TextRun({ text: block.text ?? '', italic: true, size: 18, color: MUTED })],
        spacing: { after: 60 },
      })];
    }
    if (block.kind === 'quote') {
      return [new Paragraph({
        children: [new TextRun({ text: `"${block.text ?? ''}"`, italic: true, size: 20, color: toneColor(block.tone ?? 'ink') })],
        indent: { left: 200, right: 200 },
        spacing: { after: 40 },
      })];
    }
    if (block.kind === 'table') {
      const rows = block.rows ?? [];
      if (rows.length === 0) return [];
      return [new Table({
        rows: rows.map(([k, v]) => new TableRow({
          children: [
            new TableCell({ width: { size: 35, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, color: INK, size: 18 })] })] }),
            new TableCell({ width: { size: 65, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: v, size: 18, color: MUTED })] })] }),
          ],
        })),
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.SINGLE, size: 4, color: MUTED_RED } },
      })];
    }
    // spacer
    return [new Paragraph({ spacing: { after: 120 } })];
  }

  const children = [
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
  ];
  for (const block of buildRevisionPackDocxPlan(data)) {
    children.push(...blockToElements(block));
  }
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Aftershock — Trace the evidence. This pack is a snapshot at generation time; it is not re-verified after generation.', size: 14, color: MUTED, italic: true })],
    alignment: AlignmentType.CENTER,
  }));

  const doc = new Document({
    creator: 'Aftershock (research integrity)',
    title: 'Aftershock — Revision Pack',
    description: 'Export snapshot of revision state for a review case',
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
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
