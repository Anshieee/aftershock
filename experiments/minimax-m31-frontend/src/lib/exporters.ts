import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { ReportModel } from './report';
import { REPORT_SECTIONS } from './report';
import { PROTOTYPE_NOTICE } from '../components/PrototypeNotice';

/**
 * Client-side report exports.
 *
 * HTML and DOCX are produced for real, in the browser, from the prepared
 * records. PDF is produced through the browser's own print dialogue with a
 * print stylesheet — a genuine PDF, produced by a real renderer, rather than
 * a fake download.
 */

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function stamp(value: string): string {
  return value.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

function includedSections(enabled: Record<string, boolean>) {
  return REPORT_SECTIONS.filter((section) => enabled[section.id]);
}

/* ------------------------------------------------------------------ *
 * HTML
 * ------------------------------------------------------------------ */

export function buildReportHtml(model: ReportModel, enabled: Record<string, boolean>): string {
  const sections = includedSections(enabled);
  const parts: string[] = [];

  parts.push(
    `<header><p class="kicker">Aftershock. — Trace the evidence</p><h1>${escapeHtml(
      model.document.title,
    )}</h1><p class="sub">Evidence impact report · generated ${escapeHtml(
      new Date(model.generatedAt).toLocaleString(),
    )}</p><p class="notice"><strong>Example investigation.</strong> The findings in this report are prepared sample data. No analysis of the document was performed and no service was contacted.</p></header>`,
  );

  for (const section of sections) {
    parts.push(`<section><h2>${escapeHtml(section.label)}</h2>`);
    switch (section.id) {
      case 'identity':
        parts.push(
          `<dl><dt>File</dt><dd>${escapeHtml(model.document.fileName)}</dd><dt>Authors</dt><dd>${escapeHtml(
            model.document.authors,
          )}</dd><dt>Venue</dt><dd>${escapeHtml(model.document.venue)} · ${model.document.year}</dd><dt>Imported</dt><dd>${escapeHtml(
            new Date(model.document.importedAt).toLocaleString(),
          )}</dd></dl>`,
        );
        break;
      case 'summary':
        parts.push(
          `<p>${model.summary.total} prepared findings · ${model.summary.reviewed} reviewed · ${model.summary.awaitingReview} awaiting review.</p><ul>${model.summary.kinds
            .map((kind) => `<li>${escapeHtml(kind.label)}: ${kind.count}</li>`)
            .join('')}</ul>`,
        );
        break;
      case 'concerns':
        parts.push(
          `<ol>${model.concerns
            .map(
              (finding) =>
                `<li><strong>${escapeHtml(finding.title)}</strong> <em>${escapeHtml(
                  finding.locationLabel,
                )}</em><p>${escapeHtml(finding.plainExplanation)}</p></li>`,
            )
            .join('')}</ol>`,
        );
        break;
      case 'relationships':
        parts.push(
          `<ol>${model.relationships
            .map(
              (entry) =>
                `<li>${escapeHtml(entry.finding.title)} — via ${escapeHtml(entry.via)}: ${entry.edges
                  .map((edge) => escapeHtml(edge.type))
                  .join(', ')}</li>`,
            )
            .join('')}</ol>`,
        );
        break;
      case 'unresolved':
        parts.push(
          model.unresolved.length === 0
            ? '<p>No unresolved references.</p>'
            : `<ul>${model.unresolved
                .map((finding) => `<li>${escapeHtml(finding.title)} — ${escapeHtml(finding.locationLabel)}</li>`)
                .join('')}</ul>`,
        );
        break;
      case 'review':
        parts.push(
          model.reviews.length === 0
            ? '<p>No review decisions have been recorded.</p>'
            : `<ul>${model.reviews
                .map(
                  (entry) =>
                    `<li>${escapeHtml(entry.finding.title)} — <strong>${escapeHtml(
                      entry.decision.outcome.replace(/_/g, ' '),
                    )}</strong> by ${escapeHtml(entry.decision.reviewer)} on ${escapeHtml(
                      new Date(entry.decision.decidedAt).toLocaleString(),
                    )}${entry.decision.note ? `<p>${escapeHtml(entry.decision.note)}</p>` : ''}</li>`,
                )
                .join('')}</ul>`,
        );
        break;
      case 'notices':
        parts.push(
          model.notices.length === 0
            ? '<p>No publication-status notices are recorded.</p>'
            : `<ul>${model.notices
                .map(
                  (notice) =>
                    `<li>${escapeHtml(notice.noticeType)} for ${escapeHtml(
                      notice.publicationLabel,
                    )} — announced ${escapeHtml(notice.publishedDate)}, recorded ${escapeHtml(
                      notice.recordedDate,
                    )}</li>`,
                )
                .join('')}</ul>`,
        );
        break;
      case 'revisions':
        parts.push(
          model.revisions.length === 0
            ? '<p>No revision proposals have been prepared.</p>'
            : `<ol>${model.revisions
                .map(
                  (entry) =>
                    `<li><strong>${escapeHtml(entry.finding.title)}</strong><p><em>Original:</em> ${escapeHtml(
                      entry.proposal.originalText,
                    )}</p><p><em>Suggested:</em> ${escapeHtml(entry.proposal.proposedText)}</p><p>${escapeHtml(
                      entry.proposal.rationale,
                    )}</p></li>`,
                )
                .join('')}</ol>`,
        );
        break;
      case 'provenance':
        parts.push(
          `<ul>${model.provenance
            .map(
              (entry) =>
                `<li>${escapeHtml(entry.finding.title)}<ul>${entry.edges
                  .map(
                    (edge) =>
                      `<li>${escapeHtml(edge.type)} — ${escapeHtml(
                        edge.provenanceKind,
                      )} · ${escapeHtml(edge.sourcePointer)} · ${escapeHtml(edge.analysisVersion)}</li>`,
                  )
                  .join('')}</ul></li>`,
            )
            .join('')}</ul>`,
        );
        break;
      case 'limitations':
        parts.push(`<ul>${model.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
        break;
      case 'timestamps':
        parts.push(
          `<ul>${model.timestamps
            .map(
              (entry) =>
                `<li><strong>${escapeHtml(entry.label)}</strong> — ${escapeHtml(
                  entry.value,
                )} <em>(${escapeHtml(entry.kind)} date)</em></li>`,
            )
            .join('')}</ul>`,
        );
        break;
      default:
        break;
    }
    parts.push('</section>');
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Evidence impact report — ${escapeHtml(
    model.document.title,
  )}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #23222e; background: #fff; max-width: 46rem; margin: 0 auto; padding: 3rem 2rem 5rem; line-height: 1.6; }
  .kicker { font-family: Inter, system-ui, sans-serif; font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase; color: #5a5183; margin: 0 0 1rem; }
  h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 0.5rem; }
  .sub { font-family: Inter, system-ui, sans-serif; font-size: 0.8rem; color: #5c5a69; margin: 0 0 1rem; }
  .notice { font-family: Inter, system-ui, sans-serif; font-size: 0.78rem; background: #f7f2e8; border-left: 3px solid #5a5183; padding: 0.7rem 0.9rem; color: #44424f; }
  .proto { font-family: Inter, system-ui, sans-serif; font-size: 0.72rem; color: #6b6878; margin: 0.6rem 0 0; }
  section { margin-top: 2.4rem; }
  h2 { font-size: 1.15rem; border-bottom: 1px solid #ded5c4; padding-bottom: 0.4rem; margin: 0 0 0.9rem; }
  ul, ol { padding-left: 1.2rem; }
  li { margin-bottom: 0.5rem; }
  li p { margin: 0.3rem 0 0.2rem; font-size: 0.92rem; }
  dl { display: grid; grid-template-columns: 8rem 1fr; gap: 0.25rem 1rem; font-size: 0.92rem; }
  dt { color: #5c5a69; }
  dd { margin: 0; }
  em { color: #5c5a69; }
</style></head><body>${parts.join('\n')}</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportHtmlReport(
  model: ReportModel,
  enabled: Record<string, boolean>,
): void {
  const html = buildReportHtml(model, enabled);
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `aftershock-report-${stamp(model.generatedAt)}.html`);
}

/* ------------------------------------------------------------------ *
 * DOCX
 * ------------------------------------------------------------------ */

export async function exportDocxReport(
  model: ReportModel,
  enabled: Record<string, boolean>,
): Promise<void> {
  const sections = includedSections(enabled);
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Aftershock. — Trace the evidence', bold: true, size: 18 }),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: model.document.title, bold: true, size: 32 })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Evidence impact report · generated ${new Date(model.generatedAt).toLocaleString()}`,
          size: 18,
          color: '5C5A69',
        }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Example investigation. The findings in this report are prepared sample data. No analysis of the document was performed and no service was contacted.',
          italics: true,
          size: 18,
        }),
      ],
      spacing: { after: 240 },
    }),
  );

  const heading = (text: string) =>
    new Paragraph({
      text,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 280, after: 120 },
    });

  const body = (text: string) =>
    new Paragraph({ children: [new TextRun({ text, size: 20 })], spacing: { after: 100 } });

  for (const section of sections) {
    children.push(heading(section.label));
    switch (section.id) {
      case 'identity':
        children.push(body(`File: ${model.document.fileName}`));
        children.push(body(`Authors: ${model.document.authors}`));
        children.push(body(`Venue: ${model.document.venue} · ${model.document.year}`));
        children.push(
          body(`Imported: ${new Date(model.document.importedAt).toLocaleString()}`),
        );
        break;
      case 'summary':
        children.push(
          body(
            `${model.summary.total} prepared findings · ${model.summary.reviewed} reviewed · ${model.summary.awaitingReview} awaiting review.`,
          ),
        );
        for (const kind of model.summary.kinds) {
          children.push(body(`• ${kind.label}: ${kind.count}`));
        }
        break;
      case 'concerns':
        for (const finding of model.concerns) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${finding.title} `, bold: true, size: 20 }),
                new TextRun({ text: `(${finding.locationLabel})`, italics: true, size: 18, color: '5C5A69' }),
              ],
              spacing: { before: 120 },
            }),
          );
          children.push(body(finding.plainExplanation));
        }
        break;
      case 'relationships':
        for (const entry of model.relationships) {
          children.push(
            body(
              `${entry.finding.title} — via ${entry.via}: ${entry.edges
                .map((edge) => edge.type)
                .join(', ')}`,
            ),
          );
        }
        break;
      case 'unresolved':
        children.push(
          body(
            model.unresolved.length === 0
              ? 'No unresolved references.'
              : model.unresolved
                  .map((finding) => `${finding.title} — ${finding.locationLabel}`)
                  .join('\n'),
          ),
        );
        break;
      case 'review':
        children.push(
          body(
            model.reviews.length === 0
              ? 'No review decisions have been recorded.'
              : model.reviews
                  .map(
                    (entry) =>
                      `${entry.finding.title} — ${entry.decision.outcome.replace(/_/g, ' ')} by ${
                        entry.decision.reviewer
                      } on ${new Date(entry.decision.decidedAt).toLocaleString()}`,
                  )
                  .join('\n'),
          ),
        );
        break;
      case 'notices':
        children.push(
          body(
            model.notices.length === 0
              ? 'No publication-status notices are recorded.'
              : model.notices
                  .map(
                    (notice) =>
                      `${notice.noticeType} for ${notice.publicationLabel} — announced ${notice.publishedDate}, recorded ${notice.recordedDate}`,
                  )
                  .join('\n'),
          ),
        );
        break;
      case 'revisions':
        for (const entry of model.revisions) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: entry.finding.title, bold: true, size: 20 })],
              spacing: { before: 120 },
            }),
          );
          children.push(body(`Original: ${entry.proposal.originalText}`));
          children.push(body(`Suggested: ${entry.proposal.proposedText}`));
          children.push(body(entry.proposal.rationale));
        }
        break;
      case 'provenance':
        for (const entry of model.provenance) {
          children.push(body(entry.finding.title));
          for (const edge of entry.edges) {
            children.push(
              body(
                `  ${edge.type} — ${edge.provenanceKind} · ${edge.sourcePointer} · ${edge.analysisVersion}`,
              ),
            );
          }
        }
        break;
      case 'limitations':
        for (const item of model.limitations) {
          children.push(body(`• ${item}`));
        }
        break;
      case 'timestamps':
        for (const entry of model.timestamps) {
          children.push(body(`${entry.label} — ${entry.value} (${entry.kind} date)`));
        }
        break;
      default:
        break;
    }
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Aftershock. — Trace the evidence. Prepared prototype output.',
          size: 16,
          color: '8B8794',
        }),
      ],
      spacing: { before: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: PROTOTYPE_NOTICE, size: 16, color: '8B8794' })],
      spacing: { before: 60 },
    }),
  );

  const doc = new Document({
    creator: 'Aftershock. prototype',
    title: `Evidence impact report — ${model.document.title}`,
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `aftershock-report-${stamp(model.generatedAt)}.docx`);
}

/* ------------------------------------------------------------------ *
 * PDF — through the browser's own print pipeline
 * ------------------------------------------------------------------ */

export function printReport(): void {
  window.print();
}
