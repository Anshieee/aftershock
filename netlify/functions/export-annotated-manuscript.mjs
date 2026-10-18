/**
 * POST /.netlify/functions/export-annotated-manuscript — Annotated Manuscript.
 *
 * Body: { caseId?: string } → returns an HTML document (content-type:
 * text/html) with passages annotated by review status. HTML is used here
 * because it is a faithful "document" output that requires no extra binary
 * toolchain in the Netlify function bundle; PDF remains an option for a
 * later tier.
 *
 * Handler seam: `createExportAnnotatedManuscriptHandler(deps)` accepts an
 * injectable `layer` plus scripted `ops.assembleAnnotatedManuscript` so unit
 * tests never touch a real DB and never stub ESM modules (see
 * server/demoApi.mjs).
 *
 * Honesty contract:
 * - Method guard: POST only (405 + Allow: POST).
 * - Graph failure → 503 with no fabricated data (errorBodyFor).
 * - Reads are read-only; every Cypher is $param-parameterized.
 * - Annotations reflect review state at snapshot time only; never a
 *   scientific certification.
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
import { assembleAnnotatedManuscript, validateExportCaseId } from '../../server/reportExport.mjs';

/** Wall-clock budget: must stay below the client's 10 s abort. */
const READ_BUDGET_MS = 8_000;
const ALLOW = 'POST';
const CONTENT_TYPE = 'text/html; charset=utf-8';
const FILENAME = 'annotated-manuscript.html';

/** Brand color helpers (inline CSS). */
const CSS = `
:root { --ink: #27283B; --indigo: #665C91; --muted: #89857F; --amber: #E9B867; --muted-red: #B85F59; --paper: #F7F3EA; --lavender: #DED6FA; }
* { box-sizing: border-box; }
body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--ink); background: var(--paper); line-height: 1.6; margin: 0; padding: 40px 20px; }
.page { max-width: 820px; margin: 0 auto; background: #fff; padding: 46px 54px; border: 1px solid var(--lavender); }
.brand { font-family: "Bodoni Moda", "Source Serif 4", Georgia, serif; font-weight: 900; font-size: 26px; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 6px; }
.brand .period { color: var(--indigo); }
.subtitle { color: var(--indigo); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 26px; }
.rule { border: 0; border-top: 1px solid var(--muted-red); margin: 18px 0 26px 0; }
h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--indigo); margin: 24px 0 10px 0; border-bottom: 1px solid var(--lavender); padding-bottom: 6px; }
h3 { font-size: 12.5px; color: var(--ink); margin: 14px 0 6px 0; }
p, li { font-size: 12.5px; color: var(--muted); margin: 0 0 8px 0; }
.meta { font-size: 11px; color: var(--muted); display: grid; grid-template-columns: 150px 1fr; gap: 6px 14px; margin-bottom: 22px; }
.meta .k { font-weight: 700; color: var(--ink); }
.integrity { background: var(--lavender); border-left: 3px solid var(--indigo); padding: 12px 16px; margin-bottom: 22px; font-size: 11px; color: var(--ink); }
.integrity ul { margin: 6px 0 0 0; padding-left: 18px; }
.integrity li { margin: 0 0 4px 0; color: var(--ink); }
.passage { border-left: 3px solid var(--muted); padding: 10px 16px; margin-bottom: 16px; background: #fbfaf6; }
.passage.flagged { border-left-color: var(--muted-red); background: #faf3f0; }
.passage.historical { border-left-color: var(--lavender); background: #f6f3fb; }
.passage.unresolved { border-left-color: var(--amber); background: #fdf7ec; }
.passage-id { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
.passage-id.direct { color: var(--muted-red); }
.passage-id.indirect { color: var(--indigo); }
.passage-id.historical { color: var(--lavender); }
.passage-id.unresolved { color: var(--amber); }
.passage-text { font-size: 12.5px; color: var(--ink); margin-bottom: 8px; }
.annotation { font-size: 11px; color: var(--muted); background: #fff; border: 1px solid var(--lavender); border-radius: 4px; padding: 8px 12px; margin-top: 6px; }
.annotation strong { color: var(--ink); }
.limitations { font-size: 11px; color: var(--muted); margin-top: 26px; padding-top: 14px; border-top: 1px solid var(--lavender); }
.limitations ul { margin: 6px 0 0 0; padding-left: 18px; }
.limitations li { margin: 0 0 4px 0; }
.footer { margin-top: 34px; font-size: 9.5px; color: var(--muted); text-align: center; border-top: 1px solid var(--lavender); padding-top: 12px; }
.snapshot { font-size: 11px; color: var(--muted); margin-bottom: 18px; }
.snapshot .k { font-weight: 700; color: var(--ink); }
`;

/**
 * Render the assembled annotated-manuscript data into an HTML string.
 * @param {import('../../server/reportExport.mjs').ReturnType<typeof import('../../server/reportExport.mjs').assembleAnnotatedManuscript>} data
 * @returns {string}
 */
function renderAnnotatedManuscriptHtml(data) {
  const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const passageCards = data.passages.map((p) => {
    const kindClass = p.kind === 'reference_occurrence' ? 'unresolved' :
      p.annotations.some((a) => a.reviewKind === 'indirect_evidence_review') ? 'indirect' :
      p.annotations.some((a) => a.reviewKind === 'direct_evidence_review') ? 'direct' :
      p.annotations.some((a) => a.reviewKind === 'historical_discussion') ? 'historical' :
      p.annotations.some((a) => a.reviewStatus === 'unresolved') ? 'unresolved' : '';
    const annotationsHtml = p.annotations.map((a) => `
      <div class="annotation">
        <strong>${escapeHtml(a.type.replace(/_/g, ' '))}</strong> —
        ${escapeHtml(a.message)}
        ${a.reviewStatus ? `<br/><strong>Review status:</strong> ${escapeHtml(a.reviewStatus)}` : ''}
        ${a.viaPublicationId ? `<br/><strong>Via publication:</strong> ${escapeHtml(a.viaPublicationId)}` : ''}
        ${a.viaNoticeId ? `<br/><strong>Via notice:</strong> ${escapeHtml(a.viaNoticeId)}` : ''}
        ${a.viaClaimId ? `<br/><strong>Depends on claim:</strong> ${escapeHtml(a.viaClaimId)}` : ''}
      </div>
    `).join('');
    return `
      <div class="passage ${kindClass}">
        <div class="passage-id ${kindClass}">${escapeHtml(p.kind)} · ${escapeHtml(p.id)}</div>
        <div class="passage-text">${escapeHtml(p.text ?? '(no text recorded)')}</div>
        ${annotationsHtml}
      </div>
    `;
  }).join('');

  const noticesHtml = data.notices.map((n) => `
    <li>
      <strong>${escapeHtml(n.id)} — ${escapeHtml(n.noticeType)}</strong><br/>
      Published: ${escapeHtml(n.publishedDate ?? '(not recorded)')} ·
      Verified: ${escapeHtml(String(n.verified))} ·
      Source: ${escapeHtml(n.sourceUrl ?? '(none)')}
    </li>
  `).join('');

  const decisionsHtml = Object.values(data.reviewStatuses).flatMap((rs) =>
    rs.decisions.map((d) => `
      <li>
        <strong>Decision ${escapeHtml(d.id)} — ${escapeHtml(d.outcome)}</strong><br/>
        Decided at ${escapeHtml(d.decidedAt)} · Reviewer: ${escapeHtml(d.reviewer ?? '(not recorded)')}<br/>
        ${escapeHtml(d.explanation)}
      </li>
    `)).join('');

  const proposalsHtml = Object.values(data.reviewStatuses).flatMap((rs) =>
    rs.latestProposal ? `
      <li>
        <strong>Proposal ${escapeHtml(rs.latestProposal.proposalId)} — status: ${escapeHtml(rs.latestProposal.status)}</strong><br/>
        Proposed text: ${escapeHtml(rs.latestProposal.proposedText ?? '(none)')}<br/>
        Rationale: ${escapeHtml(rs.latestProposal.rationale ?? '(none)')}
      </li>
    ` : '').join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Aftershock — Annotated Manuscript</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="page">
    <div class="brand">Aftershock<span class="period">.</span></div>
    <div class="subtitle">Annotated Manuscript — export snapshot</div>
    <hr class="rule"/>

    <div class="snapshot">
      <div><span class="k">Generated at:</span> ${escapeHtml(data.snapshot.generatedAt)}</div>
      <div><span class="k">Snapshot taken at:</span> ${escapeHtml(data.snapshot.snapshotTakenAt)}</div>
      <div><span class="k">Case id:</span> ${escapeHtml(data.snapshot.caseId)}</div>
      <div><span class="k">Format:</span> ${escapeHtml(data.snapshot.format)}</div>
      <div><span class="k">Analysis version:</span> ${escapeHtml(data.snapshot.analysisVersion)}</div>
      <div><span class="k">Export status:</span> <strong>${escapeHtml(data.snapshot.status.toUpperCase())}</strong></div>
      <div><span class="k">Seed version:</span> ${escapeHtml(String(data.snapshot.seedVersion ?? '(none — unseeded graph)'))}</div>
      ${data.manuscriptTitle ? `<div><span class="k">Manuscript:</span> ${escapeHtml(data.manuscriptTitle)}</div>` : ''}
    </div>

    <div class="integrity">
      <h2>Scientific integrity (export disclosure)</h2>
      <ul>
        <li><strong>Content label:</strong> ${escapeHtml(data.integrity.label)}</li>
        <li><strong>Verdict policy:</strong> ${escapeHtml(data.integrity.verdictPolicy)}</li>
        <li><strong>Relation-type policy:</strong> ${escapeHtml(data.integrity.relationTypePolicy)}</li>
        <li><strong>Fabricated content:</strong> ${escapeHtml(String(data.integrity.fabricatedContent))}</li>
      </ul>
    </div>

    <h2>Annotated passages</h2>
    ${passageCards || '<p style="color:var(--muted);">No passages recorded in this graph snapshot.</p>'}

    ${data.notices.length > 0 ? `
      <h2>Source notices</h2>
      <ul>${noticesHtml}</ul>
    ` : ''}

    ${decisionsHtml ? `<h2>Review decisions for this case</h2><ul>${decisionsHtml}</ul>` : ''}
    ${proposalsHtml ? `<h2>Revision proposals for this case</h2><ul>${proposalsHtml}</ul>` : ''}

    <div class="limitations">
      <h2>Limitations & coverage</h2>
      <ul>
        ${data.limitations.map((lim) => `<li>${escapeHtml(lim)}</li>`).join('')}
      </ul>
    </div>

    <div class="footer">
      Aftershock — Trace the evidence. This annotated manuscript is a snapshot at generation time; it is not re-verified after generation and old exports are not silently mutated.
    </div>
  </div>
</body>
</html>`;
}

export function createExportAnnotatedManuscriptHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter();
  const assemble = deps.assemble ?? assembleAnnotatedManuscript;
  const renderHtml = deps.renderHtml ?? renderAnnotatedManuscriptHtml;

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

      const html = renderHtml(data);

      return new Response(html, {
        status: 200,
        headers: {
          'content-type': CONTENT_TYPE,
          'content-disposition': `attachment; filename="${FILENAME}"`,
          'cache-control': 'no-store',
          'content-length': String(Buffer.byteLength(html, 'utf8')),
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

export default createExportAnnotatedManuscriptHandler();
