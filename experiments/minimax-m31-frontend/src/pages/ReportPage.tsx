import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Chip, Toggle } from '../components/ui';
import { IconDownload, IconPrint } from '../components/Icons';
import { useStore } from '../state/store';
import { findings as allFindings } from '../fixtures';
import { REPORT_SECTIONS, buildReport } from '../lib/report';
import { exportDocxReport, exportHtmlReport, printReport } from '../lib/exporters';

export default function ReportPage() {
  const { documentId = 'doc-demo-manuscript' } = useParams();
  const { state, dispatch } = useStore();
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const model = useMemo(
    () => buildReport(documentId, state.reviewDecisions, state.proposals, allFindings),
    [documentId, state.reviewDecisions, state.proposals],
  );

  const enabled = state.reportSections;
  const included = REPORT_SECTIONS.filter((section) => enabled[section.id]);

  const handleDocx = async () => {
    setExporting('docx');
    setError(null);
    try {
      await exportDocxReport(model, enabled);
    } catch {
      setError('The DOCX could not be produced in this browser. The HTML export still works.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* ---- Configuration ------------------------------------------- */}
      <aside className="w-full shrink-0 overflow-y-auto border-r border-ink-border bg-paper-deep/35 lg:w-[330px]">
        <div className="px-5 py-5">
          <p className="eyebrow">Report</p>
          <h1 className="mt-1.5 font-display text-base font-semibold leading-5 text-ink">
            Evidence impact report
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-ink-muted">
            Choose what the report contains. The preview updates as you change it.
          </p>

          <p className="eyebrow mt-6">Sections</p>
          <div className="mt-2 space-y-0.5">
            {REPORT_SECTIONS.map((section) => (
              <div key={section.id} className="border-b border-ink-border/60 py-1.5">
                <Toggle
                  checked={Boolean(enabled[section.id])}
                  onChange={() => dispatch({ type: 'toggle-report-section', section: section.id })}
                  label={section.label}
                  description={section.description}
                />
              </div>
            ))}
          </div>

          <p className="eyebrow mt-6">Export</p>
          <div className="mt-2 space-y-1.5">
            <Button
              size="sm"
              variant="primary"
              icon={<IconDownload size={13} />}
              className="w-full justify-start"
              onClick={() => exportHtmlReport(model, enabled)}
            >
              HTML — a single self-contained file
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<IconDownload size={13} />}
              className="w-full justify-start"
              onClick={handleDocx}
              disabled={exporting === 'docx'}
            >
              {exporting === 'docx' ? 'Building DOCX…' : 'DOCX — editable in Word'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<IconPrint size={13} />}
              className="w-full justify-start"
              onClick={printReport}
            >
              PDF — via your browser’s print dialogue
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-2xs leading-4 text-notice">
              {error}
            </p>
          ) : null}
          <p className="meta mt-3 leading-4">
            Exports are produced in your browser from the prepared records. Nothing is sent anywhere.
          </p>

          <div className="mt-6 border-t border-ink-border pt-4">
            <p className="text-2xs leading-4 text-ink-soft">
              This report describes evidence that needs a human decision. It does not certify any
              claim, and it never states that a claim is false.
            </p>
          </div>
        </div>
      </aside>

      {/* ---- Preview -------------------------------------------------- */}
      <div className="min-w-0 flex-1 overflow-y-auto bg-paper-deep/60 px-5 py-8 lg:px-10">
        <div className="mx-auto w-full max-w-[760px]">
          <div className="mb-4 flex items-center gap-2">
            <Chip tone="brand">Preview</Chip>
            <span className="meta">
              {included.length} of {REPORT_SECTIONS.length} sections · generated{' '}
              {new Date(model.generatedAt).toLocaleString()}
            </span>
          </div>

          <article className="print-page rounded-lg border border-ink-border bg-paper-raised px-10 py-12 shadow-page">
            <header className="border-b border-ink-border pb-6">
              <p className="eyebrow text-brand">Aftershock. — Trace the evidence</p>
              <h1 className="mt-3 text-balance font-display text-[1.6rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">
                {model.document.title}
              </h1>
              <p className="meta mt-2">
                Evidence impact report · {new Date(model.generatedAt).toLocaleString()}
              </p>
              <p className="mt-4 rounded-md border border-brand-line bg-brand-soft/50 px-3 py-2 text-xs leading-5 text-brand-deep">
                <strong className="font-semibold">Example investigation.</strong> The findings in
                this report are prepared sample data. No analysis of the document was performed and
                no service was contacted.
              </p>
            </header>

            {included.map((section) => (
              <PreviewSection key={section.id} section={section.id} model={model} />
            ))}

            <footer className="mt-10 border-t border-ink-border pt-4">
              <p className="meta leading-4">
                Prepared prototype output. A flag means a person should look at the passage — never
                that a claim is false.
              </p>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}

function PreviewSection({
  section,
  model,
}: {
  section: string;
  model: ReturnType<typeof buildReport>;
}) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 border-b border-ink-border pb-1.5 font-display text-[1.0625rem] font-semibold text-ink">
        {REPORT_SECTIONS.find((s) => s.id === section)?.label}
      </h2>

      {section === 'identity' ? (
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-[0.8125rem]">
          <dt className="text-ink-soft">File</dt>
          <dd className="text-ink">{model.document.fileName}</dd>
          <dt className="text-ink-soft">Authors</dt>
          <dd className="text-ink">{model.document.authors}</dd>
          <dt className="text-ink-soft">Venue</dt>
          <dd className="text-ink">
            {model.document.venue} · {model.document.year}
          </dd>
          <dt className="text-ink-soft">Imported</dt>
          <dd className="text-ink">{new Date(model.document.importedAt).toLocaleString()}</dd>
        </dl>
      ) : null}

      {section === 'summary' ? (
        <>
          <p className="text-[0.8125rem] leading-6 text-ink-muted">
            {model.summary.total} prepared findings · {model.summary.reviewed} reviewed ·{' '}
            {model.summary.awaitingReview} awaiting review.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            {model.summary.kinds.map((kind) => (
              <li key={kind.kind}>
                {kind.label}: <span className="text-ink">{kind.count}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {section === 'concerns' ? (
        <ol className="space-y-3">
          {model.concerns.map((finding) => (
            <li key={finding.id}>
              <p className="text-[0.8125rem] font-semibold text-ink">{finding.title}</p>
              <p className="meta mt-0.5">{finding.locationLabel}</p>
              <p className="mt-1 text-[0.8125rem] leading-6 text-ink-muted">
                {finding.plainExplanation}
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      {section === 'relationships' ? (
        <ul className="space-y-2 text-[0.8125rem] leading-6 text-ink-muted">
          {model.relationships.map((entry) => (
            <li key={entry.finding.id}>
              <span className="text-ink">{entry.finding.title}</span> — via {entry.via}:{' '}
              {entry.edges.map((edge) => edge.type).join(', ')}
            </li>
          ))}
        </ul>
      ) : null}

      {section === 'unresolved' ? (
        <ul className="space-y-2 text-[0.8125rem] leading-6 text-ink-muted">
          {model.unresolved.length === 0 ? (
            <li>No unresolved references.</li>
          ) : (
            model.unresolved.map((finding) => (
              <li key={finding.id}>
                <span className="text-ink">{finding.title}</span> — {finding.locationLabel}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {section === 'review' ? (
        <ul className="space-y-2 text-[0.8125rem] leading-6 text-ink-muted">
          {model.reviews.length === 0 ? (
            <li>No review decisions have been recorded.</li>
          ) : (
            model.reviews.map((entry) => (
              <li key={entry.finding.id}>
                <span className="text-ink">{entry.finding.title}</span> —{' '}
                <strong className="font-medium text-ink">
                  {entry.decision.outcome.replace(/_/g, ' ')}
                </strong>{' '}
                by {entry.decision.reviewer} on{' '}
                {new Date(entry.decision.decidedAt).toLocaleString()}
                {entry.decision.note ? (
                  <span className="mt-0.5 block border-l-2 border-ink-border pl-2 italic">
                    “{entry.decision.note}”
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {section === 'notices' ? (
        <ul className="space-y-2 text-[0.8125rem] leading-6 text-ink-muted">
          {model.notices.length === 0 ? (
            <li>No publication-status notices are recorded.</li>
          ) : (
            model.notices.map((notice) => (
              <li key={notice.noticeId}>
                <span className="text-ink">{notice.noticeType}</span> for {notice.publicationLabel} —
                announced {notice.publishedDate}, recorded {notice.recordedDate}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {section === 'revisions' ? (
        <ol className="space-y-3">
          {model.revisions.map((entry) => (
            <li key={entry.proposal.id}>
              <p className="text-[0.8125rem] font-semibold text-ink">{entry.finding.title}</p>
              <p className="mt-1 text-[0.8125rem] leading-6 text-ink-soft line-through decoration-notice/60">
                {entry.proposal.originalText}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-6 text-ink">{entry.proposal.proposedText}</p>
              <p className="mt-1 text-2xs leading-4 text-ink-soft">{entry.proposal.rationale}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {section === 'provenance' ? (
        <ul className="space-y-2 text-xs leading-5 text-ink-muted">
          {model.provenance.map((entry) => (
            <li key={entry.finding.id}>
              <span className="text-ink">{entry.finding.title}</span>
              <ul className="mt-0.5 space-y-0.5">
                {entry.edges.map((edge) => (
                  <li key={edge.id} className="meta">
                    {edge.type} — {edge.provenanceKind} · {edge.sourcePointer} ·{' '}
                    {edge.analysisVersion}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}

      {section === 'limitations' ? (
        <ul className="space-y-1.5 text-[0.8125rem] leading-6 text-ink-muted">
          {model.limitations.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="text-ink-soft">
                —
              </span>
              {item}
            </li>
          ))}
        </ul>
      ) : null}

      {section === 'timestamps' ? (
        <ul className="space-y-1.5 text-xs leading-5 text-ink-muted">
          {model.timestamps.map((entry) => (
            <li key={`${entry.label}-${entry.value}`}>
              <span className="text-ink">{entry.label}</span> — {entry.value}{' '}
              <em className="text-ink-soft">({entry.kind} date)</em>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
