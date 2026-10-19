/**
 * POST /.netlify/functions/export-report — Evidence Impact Report (PDF).
 *
 * Body: { caseId?: string, format?: 'pdf' } → returns PDF binary
 * (content-type: application/pdf) with Content-Disposition: attachment.
 *
 * Handler seam: `createExportReportHandler(deps)` accepts an injectable
 * `layer` plus scripted `ops.assembleExportReport` so unit tests never
 * touch a real DB and never stub ESM modules (see server/demoApi.mjs).
 *
 * Honesty contract:
 * - Method guard: POST only (405 + Allow: POST).
 * - Graph failure → 503 with no fabricated data (errorBodyFor).
 * - Reads are read-only; every Cypher is $param-parameterized.
 * - Export is a snapshot at generation time; never mutates old exports.
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
import { assembleExportReport, exportStatusDisplay, validateExportCaseId } from '../../server/reportExport.mjs';
import { PDFDocument } from 'pdfkit';

/** Wall-clock budget: must stay below the client's 10 s abort. */
const READ_BUDGET_MS = 8_000;
const ALLOW = 'POST';
const CONTENT_TYPE = 'application/pdf';
const FILENAME = 'evidence-impact-report.pdf';

/**
 * @typedef {{type:'kv', k:string, v:string} |
 *           {type:'bullet', text:string} |
 *           {type:'note', text:string} |
 *           {type:'text', text:string} |
 *           {type:'entry', title:string, lines:string[], tone?:'alert'}} PlanItem
 * @typedef {{heading:string, items:PlanItem[]}} PlanSection
 */

/**
 * Pure, deterministic structural plan for the Evidence Impact Report (unit-
 * testable without binary comparison). renderReportPdf consumes this; every
 * value flows from the assembled `data` (never hardcoded), every data section
 * is preserved (verified notices, affected direct/indirect, historical
 * exclusions, unresolved, review decisions, proposals, limitations, integrity
 * block), and wording stays guard-clean (needs-review vocabulary, no verdict
 * language).
 * @param {import('../../server/reportExport.mjs').ReturnType<typeof import('../../server/reportExport.mjs').assembleExportReport>} data
 * @returns {PlanSection[]}
 */
export function buildReportPdfPlan(data) {
  /** @type {PlanSection[]} */
  const sections = [];

  sections.push({
    heading: 'Export snapshot',
    items: [
      { type: 'kv', k: 'Generated at', v: data.snapshot.generatedAt },
      { type: 'kv', k: 'Snapshot taken at', v: data.snapshot.snapshotTakenAt },
      { type: 'kv', k: 'Case id', v: data.snapshot.caseId },
      { type: 'kv', k: 'Format', v: data.snapshot.format },
      { type: 'kv', k: 'Analysis version', v: data.snapshot.analysisVersion },
      { type: 'kv', k: 'Export version', v: data.snapshot.version },
      { type: 'kv', k: 'Export status', v: exportStatusDisplay(data.snapshot.status) },
      { type: 'kv', k: 'Seed version', v: data.snapshot.seedVersion ?? '(none — unseeded graph)' },
    ],
  });

  sections.push({
    heading: 'Scientific integrity (export disclosure)',
    items: [
      { type: 'bullet', text: `Content label: ${data.integrity.label}` },
      { type: 'bullet', text: `Verdict policy: ${data.integrity.verdictPolicy}` },
      { type: 'bullet', text: `Relation-type policy: ${data.integrity.relationTypePolicy}` },
      { type: 'bullet', text: `Historical exclusion: ${data.integrity.historicalExclusion}` },
      { type: 'bullet', text: `Unresolved disclosure: ${data.integrity.unresolvedDisclosure}` },
      { type: 'bullet', text: `Fabricated content: ${data.integrity.fabricatedContent ? 'yes' : 'no'}` },
    ],
  });

  sections.push({
    heading: 'Graph overview (at snapshot time)',
    items: [
      { type: 'kv', k: 'Node count', v: String(data.graph.nodeCount) },
      { type: 'kv', k: 'Edge count', v: String(data.graph.edgeCount) },
      ...(data.graph.manuscriptTitle ? [{ type: 'kv', k: 'Manuscript', v: data.graph.manuscriptTitle }] : []),
    ],
  });

  sections.push({
    heading: 'Verified source notices',
    items: data.verifiedNotices.length === 0
      ? [{ type: 'note', text: 'No verified source notices recorded in this graph snapshot.' }]
      : data.verifiedNotices.map((vn) => ({
          type: 'entry',
          title: `Notice ${vn.notice.id} — ${vn.notice.noticeType}`,
          tone: 'alert',
          lines: [
            `Publication: ${vn.publication.id} (${vn.publication.doi ?? 'no DOI'})`,
            `Notice published: ${vn.notice.publishedDate ?? '(not recorded)'}   |   Verified: ${vn.notice.verified}`,
            `Source: ${vn.notice.sourceUrl ?? '(none recorded)'}   |   Edge provenance: ${vn.edge.provenanceKind ?? '(none)'}`,
            vn.reviewFlag.message,
          ],
        })),
  });

  sections.push({
    heading: 'Affected claims — direct evidence review',
    items: data.affected.claims.length === 0
      ? [{ type: 'note', text: 'No claims directly supported by a publication carrying a verified status notice.' }]
      : data.affected.claims.map((c) => ({
          type: 'entry',
          title: `Claim ${c.claim.id}`,
          lines: [
            `Text: ${c.claim.text ?? '(no text recorded)'}`,
            `Via publication ${c.publication.id} through citation use ${c.citationUse.id} (role: ${c.citationUse.role}).`,
            c.claim.reviewFlag.message,
          ],
        })),
  });

  sections.push({
    heading: 'Affected conclusions — indirect evidence review',
    items: data.affected.conclusions.length === 0
      ? [{ type: 'note', text: 'No conclusions depending on a flagged claim.' }]
      : data.affected.conclusions.map((con) => ({
          type: 'entry',
          title: `Conclusion ${con.conclusion.id}`,
          lines: [
            `Text: ${con.conclusion.text ?? '(no text recorded)'}`,
            `Depends on claim ${con.conclusion.viaClaimId}.`,
            con.conclusion.reviewFlag.message,
          ],
        })),
  });

  sections.push({
    heading: 'Historical-discussion claims (explicitly excluded from flagged set)',
    items: data.historical.length === 0
      ? [{ type: 'note', text: 'No historical-discussion citation uses recorded.' }]
      : data.historical.map((h) => ({
          type: 'entry',
          title: `Claim ${h.claim.id}`,
          lines: [
            `Text: ${h.claim.text ?? '(no text recorded)'}`,
            `Mentions publication ${h.publicationId} historically — not a compromised-support signal.`,
            h.claim.reviewFlag.message,
          ],
        })),
  });

  sections.push({
    heading: 'Unresolved reference occurrences (disclosure, never propagation)',
    items: data.unresolved.length === 0
      ? [{ type: 'note', text: 'No unresolved reference occurrences recorded.' }]
      : data.unresolved.map((u) => ({
          type: 'entry',
          title: `Reference ${u.occurrence.id}`,
          lines: [
            `State: ${u.occurrence.resolutionState}   |   Raw text: ${u.occurrence.text ?? '(none)'}`,
            `Candidates (POSSIBLE_MATCH only, non-propagating): ${u.candidates.length === 0 ? 'none' : u.candidates.map((c) => c.publicationId).join(', ')}`,
          ],
        })),
  });

  sections.push({
    heading: 'Review decisions for this case',
    items: data.reviewDecisions.length === 0
      ? [{ type: 'note', text: 'No review decisions recorded for this case.' }]
      : data.reviewDecisions.map((d) => ({
          type: 'entry',
          title: `Decision ${d.id} — outcome: ${d.outcome}`,
          lines: [
            `Decided at ${d.decidedAt}   |   Reviewer: ${d.reviewer ?? '(not recorded)'}   |   Provenance: ${d.provenanceKind ?? '(none)'}`,
            `Explanation: ${d.explanation}`,
          ],
        })),
  });

  sections.push({
    heading: 'Revision proposals for this case',
    items: data.revisionProposals.length === 0
      ? [{ type: 'note', text: 'No revision proposals recorded for this case.' }]
      : data.revisionProposals.map((p) => ({
          type: 'entry',
          title: `Proposal ${p.proposalId} — status: ${p.status}`,
          lines: [
            `Proposed text: ${p.proposedText ?? '(none)'}`,
            `Rationale: ${p.rationale ?? '(none)'}   |   Created: ${p.createdAt ?? '(not recorded)'}`,
          ],
        })),
  });

  sections.push({
    heading: 'Limitations & coverage',
    items: data.limitations.map((lim) => ({ type: 'bullet', text: lim })),
  });

  return sections;
}

/** Consistent heading style for every section heading in the PDF. */
function sectionHeading(doc, text) {
  doc.fillColor('#27283B').fontSize(11.5).font('Helvetica-Bold').text(text.toUpperCase(), { characterSpacing: 0.4 });
  doc.fillColor('#B85F59').lineWidth(0.7).moveTo(54, doc.y + 2).lineTo(doc.page.width - 54, doc.y + 2).stroke();
  doc.moveDown(0.35);
}

/** Consistent key/value metadata row style. */
function kvRow(doc, item) {
  doc.fillColor('#27283B').font('Helvetica-Bold').text(`${item.k}:`, { continued: true, width: 130 });
  doc.fillColor('#89857F').font('Helvetica').text(item.v);
}

/**
 * Render the assembled export report data into a PDF buffer by walking the
 * pure plan (buildReportPdfPlan), so hierarchy (heading → entry → lines),
 * spacing and section ordering stay consistent by construction.
 * @param {import('../../server/reportExport.mjs').ReturnType<typeof import('../../server/reportExport.mjs').assembleExportReport>} data
 * @returns {Promise<Buffer>}
 */
async function renderReportPdf(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 54, info: {
      Title: 'Aftershock — Evidence Impact Report',
      Author: 'Aftershock (research integrity)',
      Subject: 'Export snapshot of graph-backed review state',
      CreationDate: new Date(data.snapshot.generatedAt),
      ModDate: new Date(data.snapshot.generatedAt),
    } });

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    /* ---------- Brand header ---------- */
    doc.fillColor('#27283B').fontSize(20).font('Helvetica-Bold').text('Aftershock.', { align: 'left' });
    doc.fillColor('#665C91').fontSize(10).text('Evidence Impact Report — export snapshot', { align: 'right' });
    doc.moveDown(0.5);
    doc.strokeColor('#B85F59').lineWidth(1).moveTo(54, doc.y).lineTo(doc.page.width - 54, doc.y).stroke();
    doc.moveDown(0.8);

    for (const section of buildReportPdfPlan(data)) {
      sectionHeading(doc, section.heading);
      doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
      for (const item of section.items) {
        if (item.type === 'kv') {
          kvRow(doc, item);
        } else if (item.type === 'bullet') {
          doc.text('• ' + item.text, { indent: 14 });
        } else if (item.type === 'note') {
          doc.fillColor('#89857F').fontSize(8.5).font('Helvetica-Oblique').text(item.text, { indent: 14 });
          doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
        } else if (item.type === 'text') {
          doc.text(item.text, { indent: 14 });
        } else {
          // entry: bold title (alert-red for notices) + uniformly indented lines.
          doc.fillColor(item.tone === 'alert' ? '#B85F59' : '#27283B').fontSize(8.5).font('Helvetica-Bold')
            .text(item.title, { indent: 14 });
          doc.fontSize(8.5).font('Helvetica');
          for (const line of item.lines) {
            doc.text(line, { indent: 28 });
          }
          doc.moveDown(0.3);
        }
      }
      doc.moveDown(0.5);
    }

    doc.moveDown(0.3);

    /* ---------- Footer ---------- */
    doc.fillColor('#89857F').fontSize(7.5).font('Helvetica-Oblique');
    doc.text('Aftershock — Trace the evidence. This export is a snapshot at generation time; it is not re-verified after generation and old exports are not silently mutated.', { align: 'center' });

    doc.end();
  });
}

export function createExportReportHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter();
  const assemble = deps.assemble ?? assembleExportReport;
  const renderPdf = deps.renderPdf ?? renderReportPdf;

  return async function handler(request /*, context */) {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: ALLOW });
    }

    const graphName = demoGraphName(env);
    const url = new URL(request.url);
    const caseId = url.searchParams.get('caseId') ?? '';
    const ip = clientIpOf(request);

    // Per-IP rate limit (demo-scope, in-memory; the platform edge is the real control).
    const ipGate = limiter.check(`ip:${ip}`);
    if (!ipGate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(ipGate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        { error: 'rate-limited', message: 'Too many export requests from this IP. Wait and try again; nothing was generated by this request.' },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    // Parse the JSON body; unreadable/malformed → 400 before consuming the rate budget.
    let input = {};
    try {
      const text = await textBodyOf(request);
      input = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      return jsonResponse(400, { error: 'invalid-request', message: 'Request body must be a JSON object.' });
    }
    input.caseId = caseId;

    // Validate caseId format when one is provided (caseId is optional per
    // contract; an empty/unspecified caseId is allowed and reported as such).
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

    // Per-case rate limit (demo-scope, in-memory).
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
      const data = await withSession(layer, graphName, (session) => assemble(session, { caseId, format: input.format ?? 'pdf' }), {
        timeoutMs: READ_BUDGET_MS,
      });

      const pdfBuffer = await renderPdf(data);

      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          'content-type': CONTENT_TYPE,
          'content-disposition': `attachment; filename="${FILENAME}"`,
          'cache-control': 'no-store',
          'content-length': String(pdfBuffer.length),
        },
      });
    } catch (err) {
      // Domain errors carry an explicit HTTP status; graph/backend failures use
      // errorBodyFor (503 for connectivity/query/deadline, never fabricated data).
      if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
        return jsonResponse(err.status, { error: err.name === 'ExportNotFoundError' ? 'not-found' : 'invalid-request', message: err.message });
      }
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createExportReportHandler();
