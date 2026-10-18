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
import { assembleExportReport, validateExportCaseId } from '../../server/reportExport.mjs';
import { PDFDocument } from 'pdfkit';

/** Wall-clock budget: must stay below the client's 10 s abort. */
const READ_BUDGET_MS = 8_000;
const ALLOW = 'POST';
const CONTENT_TYPE = 'application/pdf';
const FILENAME = 'evidence-impact-report.pdf';

/**
 * Render the assembled export report data into a PDF buffer.
 * Professional layout: branding, metadata, executive summary, notices,
 * impacted claims (direct/indirect), historical exclusions, unresolved refs,
 * review decisions, outstanding tasks, limitations, timestamps.
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

    /* ---------- Snapshot / metadata ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Export snapshot');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    const snapshotRows = [
      ['Generated at', data.snapshot.generatedAt],
      ['Snapshot taken at', data.snapshot.snapshotTakenAt],
      ['Case id', data.snapshot.caseId],
      ['Format', data.snapshot.format],
      ['Analysis version', data.snapshot.analysisVersion],
      ['Export status', data.snapshot.status.toUpperCase()],
      ['Seed version', data.snapshot.seedVersion ?? '(none — unseeded graph)'],
    ];
    for (const [k, v] of snapshotRows) {
      doc.fillColor('#27283B').font('Helvetica-Bold').text(k + ':', { continued: true, width: 120 });
      doc.fillColor('#89857F').font('Helvetica').text(v);
    }
    doc.moveDown(0.5);

    /* ---------- Scientific integrity ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Scientific integrity (export disclosure)');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    const integrityLines = [
      `Content label: ${data.integrity.label}`,
      `Verdict policy: ${data.integrity.verdictPolicy}`,
      `Relation-type policy: ${data.integrity.relationTypePolicy}`,
      `Historical exclusion: ${data.integrity.historicalExclusion}`,
      `Unresolved disclosure: ${data.integrity.unresolvedDisclosure}`,
      `Fabricated content: ${data.integrity.fabricatedContent ? 'yes' : 'no'}`,
    ];
    for (const line of integrityLines) {
      doc.text('• ' + line, { indent: 14 });
    }
    doc.moveDown(0.5);

    /* ---------- Graph overview ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Graph overview (at snapshot time)');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    doc.text(`Node count: ${data.graph.nodeCount}   Edge count: ${data.graph.edgeCount}`);
    if (data.graph.manuscriptTitle) {
      doc.text(`Manuscript: ${data.graph.manuscriptTitle}`);
    }
    doc.moveDown(0.5);

    /* ---------- Verified notices ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Verified source notices');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    if (data.verifiedNotices.length === 0) {
      doc.text('No verified source notices recorded in this graph snapshot.', { indent: 14 });
    } else {
      for (const vn of data.verifiedNotices) {
        doc.fillColor('#B85F59').font('Helvetica-Bold').text(`Notice ${vn.notice.id} — ${vn.notice.noticeType}`, { indent: 14 });
        doc.fillColor('#89857F').font('Helvetica').text(`Publication: ${vn.publication.id} (${vn.publication.doi ?? 'no DOI'})`, { indent: 28 });
        doc.text(`Notice published: ${vn.notice.publishedDate ?? '(not recorded)'}   |   Verified: ${vn.notice.verified}`, { indent: 28 });
        doc.text(`Source: ${vn.notice.sourceUrl ?? '(none recorded)'}   |   Edge provenance: ${vn.edge.provenanceKind ?? '(none)'}`, { indent: 28 });
        doc.text(`${vn.reviewFlag.message}`, { indent: 28 });
        doc.moveDown(0.3);
      }
    }
    doc.moveDown(0.3);

    /* ---------- Affected claims (direct) ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Affected claims — direct evidence review');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    if (data.affected.claims.length === 0) {
      doc.text('No claims directly supported by a publication carrying a verified status notice.', { indent: 14 });
    } else {
      for (const c of data.affected.claims) {
        doc.fillColor('#27283B').font('Helvetica-Bold').text(`Claim ${c.claim.id}`, { indent: 14 });
        doc.text(`Text: ${c.claim.text ?? '(no text recorded)'}`, { indent: 28 });
        doc.text(`Via publication ${c.publication.id} through citation use ${c.citationUse.id} (role: ${c.citationUse.role}).`, { indent: 28 });
        doc.text(`${c.claim.reviewFlag.message}`, { indent: 28 });
        doc.moveDown(0.3);
      }
    }
    doc.moveDown(0.3);

    /* ---------- Affected conclusions (indirect) ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Affected conclusions — indirect evidence review');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    if (data.affected.conclusions.length === 0) {
      doc.text('No conclusions depending on a flagged claim.', { indent: 14 });
    } else {
      for (const con of data.affected.conclusions) {
        doc.fillColor('#27283B').font('Helvetica-Bold').text(`Conclusion ${con.conclusion.id}`, { indent: 14 });
        doc.text(`Text: ${con.conclusion.text ?? '(no text recorded)'}`, { indent: 28 });
        doc.text(`Depends on claim ${con.conclusion.viaClaimId}.`, { indent: 28 });
        doc.text(`${con.conclusion.reviewFlag.message}`, { indent: 28 });
        doc.moveDown(0.3);
      }
    }
    doc.moveDown(0.3);

    /* ---------- Historical discussion (excluded) ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Historical-discussion claims (explicitly excluded from flagged set)');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    if (data.historical.length === 0) {
      doc.text('No historical-discussion citation uses recorded.', { indent: 14 });
    } else {
      for (const h of data.historical) {
        doc.fillColor('#27283B').font('Helvetica-Bold').text(`Claim ${h.claim.id}`, { indent: 14 });
        doc.text(`Text: ${h.claim.text ?? '(no text recorded)'}`, { indent: 28 });
        doc.text(`Mentions publication ${h.publicationId} historically — not a compromised-support signal.`, { indent: 28 });
        doc.text(`${h.claim.reviewFlag.message}`, { indent: 28 });
        doc.moveDown(0.3);
      }
    }
    doc.moveDown(0.3);

    /* ---------- Unresolved references ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Unresolved reference occurrences (disclosure, never propagation)');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    if (data.unresolved.length === 0) {
      doc.text('No unresolved reference occurrences recorded.', { indent: 14 });
    } else {
      for (const u of data.unresolved) {
        doc.fillColor('#27283B').font('Helvetica-Bold').text(`Reference ${u.occurrence.id}`, { indent: 14 });
        doc.text(`State: ${u.occurrence.resolutionState}   |   Raw text: ${u.occurrence.text ?? '(none)'}`, { indent: 28 });
        doc.text(`Candidates (POSSIBLE_MATCH only, non-propagating): ${u.candidates.length === 0 ? 'none' : u.candidates.map((c) => c.publicationId).join(', ')}`, { indent: 28 });
        doc.moveDown(0.3);
      }
    }
    doc.moveDown(0.3);

    /* ---------- Review decisions ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Review decisions for this case');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    if (data.reviewDecisions.length === 0) {
      doc.text('No review decisions recorded for this case.', { indent: 14 });
    } else {
      for (const d of data.reviewDecisions) {
        doc.fillColor('#27283B').font('Helvetica-Bold').text(`Decision ${d.id} — outcome: ${d.outcome}`, { indent: 14 });
        doc.text(`Decided at ${d.decidedAt}   |   Reviewer: ${d.reviewer ?? '(not recorded)'}   |   Provenance: ${d.provenanceKind ?? '(none)'}`, { indent: 28 });
        doc.text(`Explanation: ${d.explanation}`, { indent: 28 });
        doc.moveDown(0.3);
      }
    }
    doc.moveDown(0.3);

    /* ---------- Revision proposals ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Revision proposals for this case');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    if (data.revisionProposals.length === 0) {
      doc.text('No revision proposals recorded for this case.', { indent: 14 });
    } else {
      for (const p of data.revisionProposals) {
        doc.fillColor('#27283B').font('Helvetica-Bold').text(`Proposal ${p.proposalId} — status: ${p.status}`, { indent: 14 });
        doc.text(`Proposed text: ${p.proposedText ?? '(none)'}`, { indent: 28 });
        doc.text(`Rationale: ${p.rationale ?? '(none)'}   |   Created: ${p.createdAt ?? '(not recorded)'}`, { indent: 28 });
        doc.moveDown(0.3);
      }
    }
    doc.moveDown(0.3);

    /* ---------- Limitations ---------- */
    doc.fillColor('#27283B').fontSize(11).font('Helvetica-Bold').text('Limitations & coverage');
    doc.fillColor('#89857F').fontSize(8.5).font('Helvetica');
    for (const lim of data.limitations) {
      doc.text('• ' + lim, { indent: 14 });
    }
    doc.moveDown(0.8);

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
