import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  DEMO_MANUSCRIPT_DOCUMENT_ID,
  exportAnnotatedManuscript,
  exportReport,
  exportRevisionPack,
  type ExportOutcome,
  getGraphOverview,
} from '../lib/api';

type ExportKind = 'report' | 'revision-pack' | 'annotated-manuscript';

type ExportPhase = 'idle' | 'generating' | 'done' | 'failure';

type CoverageLoad =
  | { phase: 'loading' }
  | { phase: 'ready'; unresolved: number; totalNodes: number }
  | { phase: 'missing' }
  | { phase: 'failure'; message: string };

interface ExportType {
  kind: ExportKind;
  label: string;
  extension: string;
  accept: string;
  description: string;
}

const EXPORT_TYPES: ExportType[] = [
  {
    kind: 'report',
    label: 'Evidence Impact Report',
    extension: 'pdf',
    accept: 'application/pdf',
    description:
      'PDF summary of flagged claims, citation roles, notice status, and review decisions for the selected case.',
  },
  {
    kind: 'revision-pack',
    label: 'Revision Pack',
    extension: 'docx',
    accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    description:
      'DOCX pack with proposed revisions and the original text they replace, ready for a human to apply externally.',
  },
  {
    kind: 'annotated-manuscript',
    label: 'Annotated Manuscript',
    extension: 'pdf',
    accept: 'application/pdf',
    description:
      'Manuscript with review annotations (flags, notices, revision markers) inserted at the cited locations.',
  },
] as const;

function fileNameFor(kind: ExportKind, caseId: string, extension: string): string {
  return `aftershock-${kind}-${caseId}.${extension}`;
}

/**
 * M6 export interface. Honest loading/error/recovery states: no placeholder
 * output is ever fabricated. If an export endpoint is not available on this
 * build, the page says so instead of simulating a file.
 */
export default function ExportPage() {
  const [reportType, setReportType] = useState<ExportKind>('report');
  const [caseId, setCaseId] = useState(DEMO_MANUSCRIPT_DOCUMENT_ID);
  const [phase, setPhase] = useState<ExportPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageLoad>({ phase: 'loading' });
  const controllerRef = useRef<AbortController | null>(null);

  const loadCoverage = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setCoverage({ phase: 'loading' });

    getGraphOverview({ limit: 200 }, { signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.available) {
          let unresolved = 0;
          for (const node of outcome.data.nodes) {
            const resolutionState = node.properties.resolutionState;
            if (node.kind === 'ReferenceOccurrence' && resolutionState === 'unresolved') {
              unresolved += 1;
            }
          }
          setCoverage({ phase: 'ready', unresolved, totalNodes: outcome.data.nodes.length });
        } else {
          setCoverage({ phase: 'missing' });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiTimeoutError) {
          setCoverage({ phase: 'failure', message: 'Coverage check timed out (10 s).' });
        } else if (error instanceof ApiNetworkError) {
          setCoverage({ phase: 'failure', message: 'Coverage check failed — network error.' });
        } else if (error instanceof ApiHttpError) {
          setCoverage({ phase: 'failure', message: `Coverage check returned HTTP ${error.status}.` });
        } else if (error instanceof ApiClientError) {
          setCoverage({ phase: 'failure', message: error.message });
        } else {
          setCoverage({ phase: 'failure', message: 'Unexpected failure while reading coverage.' });
        }
      });
  }, []);

  useEffect(() => {
    loadCoverage();
    return () => controllerRef.current?.abort();
  }, [loadCoverage]);

  const selectedType = EXPORT_TYPES.find((type) => type.kind === reportType);
  if (!selectedType) {
    throw new Error(`Unknown export type: ${reportType}`);
  }

  const handleGenerate = useCallback(async () => {
    setPhase('generating');
    setError(null);
    let outcome: ExportOutcome;
    try {
      if (reportType === 'report') {
        outcome = await exportReport(caseId, 'pdf');
      } else if (reportType === 'revision-pack') {
        outcome = await exportRevisionPack(caseId);
      } else {
        outcome = await exportAnnotatedManuscript(caseId);
      }
    } catch (error: unknown) {
      setPhase('failure');
      if (error instanceof ApiTimeoutError) {
        setError('The export did not finish within 10 seconds (timeout). Nothing was downloaded.');
      } else if (error instanceof ApiNetworkError) {
        setError('API unavailable — network error, nothing was exported.');
      } else if (error instanceof ApiHttpError) {
        setError(`API returned HTTP ${error.status}. Nothing was exported.`);
      } else if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError('Unexpected failure while exporting. Nothing was exported.');
      }
      return;
    }
    if (!outcome.available) {
      setPhase('failure');
      setError(
        outcome.reason === 'not-implemented'
          ? 'Export not available yet — this endpoint reports “not implemented” on this build.'
          : 'Export not available yet — no export endpoint answered (function missing).',
      );
      return;
    }
    const blob = outcome.data;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const downloadName = fileNameFor(reportType, caseId, selectedType.extension);
    anchor.href = url;
    anchor.download = downloadName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setPhase('done');
    setDownloadedFile(downloadName);
  }, [caseId, reportType, selectedType.extension]);

  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
    setDownloadedFile(null);
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight text-ink">Export</h1>
        <p className="text-xs text-ink-muted">
          Generate a shareable output for a case. Outputs are derived from the
          returned graph records only — nothing is simulated.
        </p>
      </div>

      {/* Scientific-integrity disclosure — synthetic demo content up front. */}
      <section
        aria-labelledby="export-disclosure-heading"
        className="mt-6 rounded-xl border border-uncertain-border bg-uncertain-surface p-6"
      >
        <h2 id="export-disclosure-heading" className="text-lg font-semibold text-uncertain-text">
          FICTIONAL / GUIDED DEMO — no scientific validation implied
        </h2>
        <p className="mt-2 max-w-prose text-base text-uncertain-text">
          This guided demo uses synthetic fixture content. Everything exported
          here is derived from synthetic records and implies no scientific
          validation, no finding, and no verdict about any real publication or
          author. Real and synthetic records are kept separate throughout
          Aftershock.
        </p>
      </section>

      {/* Review coverage — honest counts from the graph, never inferred. */}
      <section aria-labelledby="export-coverage-heading" className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-6">
        <h2 id="export-coverage-heading" className="text-lg font-semibold text-ink">Review coverage</h2>
        {coverage.phase === 'loading' && (
          <p className="mt-2 text-sm text-ink-muted" role="status">
            Checking review coverage…
          </p>
        )}
        {coverage.phase === 'ready' && (
          <>
            <p className="mt-2 text-base text-ink">
              {coverage.totalNodes} record{coverage.totalNodes === 1 ? '' : 's'} returned by the graph API,{' '}
              {coverage.unresolved} unresolved reference occurrence
              {coverage.unresolved === 1 ? '' : 's'} not treated as confirmed citations.
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Exports cover only returned records for the selected case — they
              are not a complete literature survey, and “no unresolved” never
              implies complete notice coverage.
            </p>
          </>
        )}
        {coverage.phase === 'missing' && (
          <p className="mt-2 text-base text-ink-muted">
            Review coverage could not be confirmed (graph endpoint not
            available yet). An export may still be generated, but its coverage
            is unknown.
          </p>
        )}
        {coverage.phase === 'failure' && (
          <>
            <p className="mt-2 text-base text-ink">{coverage.message}</p>
            <button
              type="button"
              onClick={loadCoverage}
              className="mt-3 rounded-lg border border-ink-border bg-paper px-4 py-2 text-sm text-ink hover:bg-paper-deep"
            >
              Retry coverage
            </button>
          </>
        )}
      </section>

      <form onSubmit={(event) => {
        event.preventDefault();
        handleGenerate();
      }}>
        <fieldset disabled={phase === 'generating'}>
          <legend className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-muted">What to export</legend>

          <div className="mt-4 space-y-3" role="radiogroup" aria-label="Export type">
            {EXPORT_TYPES.map((type) => (
              <div key={type.kind} className="flex items-start gap-3 rounded-lg border border-ink-border bg-paper-raised p-3">
                <input
                  id={`export-type-${type.kind}`}
                  type="radio"
                  name="export-type"
                  value={type.kind}
                  checked={reportType === type.kind}
                  onChange={() => setReportType(type.kind)}
                  className="mt-1 shrink-0 text-brand"
                  data-testid={`export-type-${type.kind}`}
                />
                <label htmlFor={`export-type-${type.kind}`} className="flex flex-col gap-1 cursor-pointer">
                  <p className="font-medium text-ink">
                    {type.label} <span className="text-xs text-ink-muted">({type.extension})</span>
                  </p>
                  <p className="text-sm text-ink-muted">{type.description}</p>
                </label>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <label htmlFor="export-case-id" className="block text-sm font-medium text-ink">
              Case ID
            </label>
            <select
              id="export-case-id"
              value={caseId}
              onChange={(event) => setCaseId(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-ink-border bg-paper-raised px-3 py-2 text-sm text-ink"
              data-testid="export-case-id"
            >
              <option value={DEMO_MANUSCRIPT_DOCUMENT_ID}>
                Guided demo manuscript (synthetic — FICTIONAL / GUIDED DEMO)
              </option>
            </select>
            <p className="mt-1 text-xs text-ink-muted">
              Additional imported cases appear here once a document is imported
              through Library.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={phase === 'generating'}
              data-testid="export-generate"
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-deep disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {phase === 'generating' ? 'Generating…' : `Generate ${selectedType.label}`}
            </button>
            {phase === 'failure' && (
              <button
                type="button"
                onClick={reset}
                data-testid="export-retry"
                className="rounded-lg border border-ink-border bg-paper px-5 py-2.5 text-sm font-medium text-ink hover:bg-paper-deep"
              >
                Retry
              </button>
            )}
          </div>
        </fieldset>

        {phase === 'generating' && (
          <p className="mt-4 text-sm text-ink-muted" role="status" data-testid="export-loading">
            Generating {selectedType.label}… this can take up to 10 seconds.
          </p>
        )}

        {phase === 'failure' && error && (
          <section
            aria-labelledby="export-error-heading"
            className="mt-4 rounded-xl border border-notice-border bg-notice-surface p-6"
            data-testid="export-error"
          >
            <h3 id="export-error-heading" className="text-sm font-semibold text-notice-text">
              Export failed
            </h3>
            <p className="mt-2 text-sm text-ink" data-testid="export-error-detail">
              {error}
            </p>
          </section>
        )}

        {phase === 'done' && downloadedFile && (
          <section
            className="mt-4 rounded-xl border border-reviewed bg-reviewed-surface p-6"
            data-testid="export-done"
          >
            <h3 className="text-sm font-semibold text-reviewed-text">Download started</h3>
            <p className="mt-2 text-sm text-ink">
              {downloadedFile} should have started downloading. It contains
              synthetic guided-demo content and implies no scientific
              validation.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-3 rounded-lg border border-ink-border bg-paper px-4 py-2 text-sm text-ink hover:bg-paper-deep"
            >
              Generate another export
            </button>
          </section>
        )}
      </form>

      {/* Honest limitations — never presented as capability. */}
      <section
        aria-labelledby="export-limitations-heading"
        className="mt-6 rounded-xl border border-uncertain-border bg-uncertain-surface p-6"
      >
        <h2 id="export-limitations-heading" className="text-lg font-semibold text-uncertain-text">
          Limitations
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-uncertain-text">
          <li>
            A review flag means “needs human review” — never a verdict of
            truth or falsity.
          </li>
          <li>
            Unresolved reference occurrences (e.g. “Lee et al., 2020”) are not
            treated as confirmed citations.
          </li>
          <li>
            The Revision Pack is a set of draft proposals; applying it
            externally is a human decision, not validation.
          </li>
          <li>
            Synthetic content is labeled FICTIONAL / GUIDED DEMO and is not
            real research.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-muted">
          Export history will appear in Activity once events exist (M6). No
          entries are fabricated before then.
        </p>
      </section>
    </div>
  );
}
