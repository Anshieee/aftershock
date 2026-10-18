import { useEffect, useRef, useState } from 'react';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  ApiUnavailableError,
  DEMO_MANUSCRIPT_VERSION_ID,
  MAX_IMPORT_BYTES,
  importDocument,
  importFormatOf,
  startAnalysis,
  type ImportDocumentInfo,
} from '../lib/api';

function describeSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${bytes} bytes`;
}

function describeType(file: File): string {
  if (file.type) return file.type;
  const extIndex = file.name.lastIndexOf('.');
  if (extIndex === -1) return 'unknown format';
  return `.${file.name.slice(extIndex + 1)}`;
}

const acceptAttributeValue =
  '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

const analyzeDisabledClass =
  'cursor-not-allowed rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink-muted';

const analyzeEnabledClass =
  'rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep' +
  ' disabled:cursor-progress disabled:opacity-80';

type ImportFlow =
  | { phase: 'idle' }
  /** Client-side guard fired BEFORE any upload — nothing left the browser. */
  | { phase: 'guard-rejected'; message: string }
  | { phase: 'registering'; fileName: string; descriptor: string }
  | { phase: 'registered'; fileName: string; descriptor: string; info: ImportDocumentInfo }
  | { phase: 'unavailable' }
  | { phase: 'failed'; message: string };

type AnalysisFlow =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'started'; runId: string }
  | { phase: 'content-not-stored'; disclosure: string }
  | { phase: 'failed'; message: string };

/** Client-side guards, applied BEFORE any byte leaves the browser. */
function guardImportFile(file: File): string | null {
  if (!importFormatOf(file.name, file.type)) {
    return 'Only PDF, DOCX and TXT files are accepted. Nothing was uploaded.';
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return `This file is larger than the 10 MB limit (${describeSize(file.size)}). Nothing was uploaded.`;
  }
  return null;
}

function describeImportError(error: unknown): string {
  if (
    error instanceof ApiTimeoutError ||
    error instanceof ApiNetworkError ||
    error instanceof ApiUnavailableError
  ) {
    return 'The import endpoint could not be reached (network error or 10 s timeout) — nothing was registered.';
  }
  if (error instanceof ApiHttpError) {
    if (error.status === 413) {
      return 'The import endpoint rejected the file as too large (HTTP 413) — nothing was registered.';
    }
    if (error.status === 415) {
      return 'The import endpoint rejected the file format (HTTP 415) — nothing was registered.';
    }
    if (error.status === 400) {
      return 'The import endpoint rejected the request as malformed (HTTP 400) — nothing was registered.';
    }
    return `API error (HTTP ${error.status}) — nothing was registered.`;
  }
  if (error instanceof ApiClientError) return error.message;
  return 'The import could not be completed — nothing was registered.';
}

function describeAnalysisError(error: unknown): string {
  if (
    error instanceof ApiTimeoutError ||
    error instanceof ApiNetworkError ||
    error instanceof ApiUnavailableError
  ) {
    return 'The analysis API is unavailable — the run did not start. Nothing is simulated.';
  }
  if (error instanceof ApiHttpError) {
    if (error.status >= 500) {
      return 'The analysis API is unavailable (server error) — the run did not start. Nothing is simulated.';
    }
    if (error.status === 404 || error.status === 501) {
      return 'Analysis is not wired on this deployment yet — the run did not start.';
    }
    return `API error (HTTP ${error.status}) — the run did not start.`;
  }
  if (error instanceof ApiClientError) return error.message;
  return 'The analysis could not start — nothing is simulated.';
}

/**
 * The real M4 import flow (replaces the M2 "not wired yet" stub):
 *
 * 1. Client-side guards (PDF/DOCX/TXT, ≤10 MB) reject before any request.
 * 2. `importDocument` registers the file with truthful in-flight copy —
 *    "Registering document…", never a fake progress bar.
 * 3. The server disclosure (contentStored: false) is shown verbatim, and
 *    Analyze is enabled only for the guided demo manuscript version — the
 *    one version whose content exists in this build.
 * 4. Analysis start maps every answer to a typed honest outcome: a real
 *    runId, the verbatim content-not-stored disclosure, or a failure.
 */
export default function ImportPanel() {
  const [importFlow, setImportFlow] = useState<ImportFlow>({ phase: 'idle' });
  const [analysisFlow, setAnalysisFlow] = useState<AnalysisFlow>({ phase: 'idle' });
  const importAbortRef = useRef<AbortController | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const importStatusRef = useRef<HTMLDivElement | null>(null);
  const analysisStatusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const importAbort = importAbortRef;
    const analysisAbort = analysisAbortRef;
    return () => {
      importAbort.current?.abort();
      analysisAbort.current?.abort();
    };
  }, []);

  // Focus management after completion: terminal phases (success or failure)
  // move keyboard focus to the truthful result region so screen-reader and
  // keyboard users land on the outcome, not back on the picker.
  useEffect(() => {
    if (
      importFlow.phase === 'registered' ||
      importFlow.phase === 'guard-rejected' ||
      importFlow.phase === 'unavailable' ||
      importFlow.phase === 'failed'
    ) {
      importStatusRef.current?.focus();
    }
  }, [importFlow]);
  useEffect(() => {
    if (
      analysisFlow.phase === 'started' ||
      analysisFlow.phase === 'content-not-stored' ||
      analysisFlow.phase === 'failed'
    ) {
      analysisStatusRef.current?.focus();
    }
  }, [analysisFlow]);

  const onPicked = (file: File | null) => {
    if (!file) return;

    const guardMessage = guardImportFile(file);
    if (guardMessage) {
      // Rejected before any network request — no fetch call happens here.
      importAbortRef.current?.abort();
      setAnalysisFlow({ phase: 'idle' });
      setImportFlow({ phase: 'guard-rejected', message: guardMessage });
      return;
    }

    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;
    const descriptor = `${describeSize(file.size)}, ${describeType(file)}`;
    setAnalysisFlow({ phase: 'idle' });
    setImportFlow({ phase: 'registering', fileName: file.name, descriptor });

    importDocument(file, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.available) {
          setImportFlow({
            phase: 'registered',
            fileName: file.name,
            descriptor,
            info: result.data,
          });
        } else {
          setImportFlow({ phase: 'unavailable' });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setImportFlow({ phase: 'failed', message: describeImportError(error) });
      });
  };

  const beginAnalysis = () => {
    if (importFlow.phase !== 'registered') return;
    const versionId = importFlow.info.versionId;
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setAnalysisFlow({ phase: 'starting' });

    startAnalysis(versionId, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.started) {
          setAnalysisFlow({ phase: 'started', runId: result.runId });
        } else {
          // Distinct honest outcome — the server's disclosure, verbatim.
          setAnalysisFlow({ phase: 'content-not-stored', disclosure: result.disclosure });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAnalysisFlow({ phase: 'failed', message: describeAnalysisError(error) });
      });
  };

  const registered = importFlow.phase === 'registered' ? importFlow : null;
  const isDemoManuscript = registered?.info.versionId === DEMO_MANUSCRIPT_VERSION_ID;
  const analyzeEnabled = Boolean(registered && isDemoManuscript && analysisFlow.phase !== 'starting');

  return (
    <div data-testid="import-panel">
      {/* Primary affordance: native file picker, keyboard + screen-reader
          reachable. The peer-focus-visible ring lights the styled label when
          the (visually hidden) input receives keyboard focus. */}
      <input
        id="import-input"
        type="file"
        className="peer sr-only"
        accept={acceptAttributeValue}
        data-testid="import-input"
        onChange={(e) => onPicked(e.target.files?.[0] ?? null)}
      />
      <label
        htmlFor="import-input"
        className="peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 mt-4 flex cursor-pointer items-center justify-center rounded-lg bg-brand px-6 py-3 text-center font-medium text-white hover:bg-brand-deep"
      >
        Choose a document
      </label>

      <p className="mt-4 text-sm leading-6 text-ink-muted">
        Accepted formats: PDF, DOCX and TXT, up to 10 MB. The file is sent once
        to register a document record; in this build the text content is not
        kept afterwards (contentStored: false), and analysis is available only
        for the guided demo manuscript. Failures are reported as failures —
        nothing is simulated.
      </p>
      <p className="mt-3 text-sm leading-6 text-ink-muted">
        Privacy note: this guided-demo deployment runs on a disposable
        free-tier graph without TLS or durable storage. Do not import private,
        unpublished or sensitive manuscripts — use fictional test files or the
        guided demo instead.
      </p>

      <div
        aria-live="polite"
        data-testid="selection-state"
        ref={importStatusRef}
        tabIndex={-1}
        className="mt-4 min-h-5 rounded outline-none"
      >
        {importFlow.phase === 'registering' && (
          <div role="status" data-testid="import-registering" className="text-sm text-ink-muted">
            <p className="font-medium text-ink">
              Registering document — {importFlow.fileName} ({importFlow.descriptor})…
            </p>
            <p className="mt-1">
              A real request to the import endpoint is in flight. No progress
              bar is shown: the client cannot honestly measure upload progress.
            </p>
          </div>
        )}
        {importFlow.phase === 'guard-rejected' && (
          <div
            role="status"
            data-testid="import-guard-rejection"
            className="rounded border border-notice-border bg-notice-surface px-3 py-2 text-sm text-ink"
          >
            <p className="font-medium">{importFlow.message}</p>
            <p className="mt-1">
              The file was rejected before any network request — nothing left
              the browser.
            </p>
          </div>
        )}
        {registered && (
          <div role="status" data-testid="import-result" className="text-sm">
            <p className="font-medium text-ink">
              Registered: {registered.fileName} ({registered.descriptor}).
            </p>
            <p className="mt-1 text-ink-muted">
              Document record {registered.info.documentId}, version{' '}
              {registered.info.versionId}. Content stored:{' '}
              {registered.info.contentStored ? 'yes' : 'no'} —{' '}
              {registered.info.contentStored
                ? 'the server reports stored content.'
                : 'the text content is NOT stored in this build (contentStored: false).'}
            </p>
            {registered.info.disclosure && (
              <blockquote className="mt-2 border-l-2 border-review-border bg-review-surface px-3 py-2 text-review-text">
                {registered.info.disclosure}
              </blockquote>
            )}
          </div>
        )}
        {importFlow.phase === 'unavailable' && (
          <div
            role="status"
            data-testid="import-unavailable"
            className="rounded border border-uncertain-border bg-uncertain-surface px-3 py-2 text-sm text-uncertain-text"
          >
            Document import is not wired on this deployment yet — nothing was
            uploaded. No simulated registration is shown.
          </div>
        )}
        {importFlow.phase === 'failed' && (
          <div
            role="status"
            data-testid="import-failed"
            className="rounded border border-notice-border bg-notice-surface px-3 py-2 text-sm text-ink"
          >
            {importFlow.message} No simulated success is shown.
          </div>
        )}
      </div>

      {registered && (
        <div className="mt-5 border-t border-ink-border pt-4">
          <button
            type="button"
            onClick={beginAnalysis}
            disabled={!analyzeEnabled}
            aria-busy={analysisFlow.phase === 'starting'}
            data-testid="import-analyze-button"
            className={
              analyzeEnabled ? analyzeEnabledClass : analyzeDisabledClass
            }
          >
            {analysisFlow.phase === 'starting' ? 'Starting analysis…' : 'Analyze document'}
          </button>
          {!isDemoManuscript && (
            <p className="mt-2 max-w-prose text-sm text-ink-muted" data-testid="analyze-disabled-copy">
              Analyze is enabled only for the guided demo manuscript in this
              build: this document was registered with contentStored: false (no
              stored text), so analysis would honestly refuse. The button stays
              disabled rather than pretending.
            </p>
          )}
          {isDemoManuscript && (
            <p className="mt-2 max-w-prose text-sm text-ink-muted">
              This registered version is the guided demo manuscript (FICTIONAL /
              GUIDED DEMO) — the one version with stored content in this build,
              so analysis can start.
            </p>
          )}

          <div
            aria-live="polite"
            data-testid="import-analysis-state"
            ref={analysisStatusRef}
            tabIndex={-1}
            className="mt-3 min-h-5 rounded outline-none"
          >
            {analysisFlow.phase === 'starting' && (
              <p role="status" className="text-sm text-ink-muted">
                Contacting the analysis endpoint — starting the run…
              </p>
            )}
            {analysisFlow.phase === 'started' && (
              <div role="status" data-testid="analysis-started">
                <p className="text-sm font-medium text-ink">
                  Analysis run started — runId:{' '}
                  <span data-testid="analysis-runid" className="font-mono">
                    {analysisFlow.runId}
                  </span>
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  The runId above is the real server response. Progress and
                  results are not wired in this build yet — nothing further is
                  simulated here.
                </p>
              </div>
            )}
            {analysisFlow.phase === 'content-not-stored' && (
              <div
                role="status"
                data-testid="analysis-content-not-stored"
                className="rounded border border-uncertain-border bg-uncertain-surface px-3 py-2"
              >
                <p className="text-sm font-medium text-uncertain-text">
                  Analysis did not start — the server reports this version has
                  no stored content (content-not-stored).
                </p>
                <blockquote className="mt-1 border-l-2 border-uncertain-border pl-3 text-sm text-uncertain-text">
                  {analysisFlow.disclosure}
                </blockquote>
              </div>
            )}
            {analysisFlow.phase === 'failed' && (
              <div
                role="status"
                data-testid="analysis-failed"
                className="rounded border border-notice-border bg-notice-surface px-3 py-2 text-sm text-ink"
              >
                {analysisFlow.message}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
