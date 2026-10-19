import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyArea from '../components/EmptyArea';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  ApiUnavailableError,
  DEMO_MANUSCRIPT_VERSION_ID,
  describeBytes,
  getDemoDocuments,
  getImportedDocuments,
  startAnalysis,
  type DocumentSummary,
} from '../lib/api';

type ListState =
  | { phase: 'loading' }
  | { phase: 'loaded'; documents: DocumentSummary[] }
  | { phase: 'unavailable' }
  | { phase: 'failed'; detail: string };

type RowAnalysis =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'started'; runId: string }
  | { phase: 'content-not-stored'; disclosure: string }
  | { phase: 'failed'; message: string };

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
      return 'The analysis API is unavailable (server error) — the run did not start.';
    }
    if (error.status === 404 || error.status === 501) {
      return 'Analysis is not wired on this deployment yet — the run did not start.';
    }
    return `API error (HTTP ${error.status}) — the run did not start.`;
  }
  if (error instanceof ApiClientError) return error.message;
  return 'The analysis could not start — nothing is simulated.';
}

function describeListError(error: unknown): string {
  if (error instanceof ApiUnavailableError) {
    return 'The library endpoint answered with a non-JSON page (likely the site fallback) instead of a document list.';
  }
  if (error instanceof ApiTimeoutError) {
    return 'The document list request timed out after 10 seconds.';
  }
  if (error instanceof ApiHttpError) {
    return `API answered with HTTP ${error.status}.`;
  }
  if (error instanceof ApiNetworkError) {
    return 'The document list request could not reach the API.';
  }
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return 'The response could not be read as a document list.';
}

export default function LibraryPage() {
  const [listState, setListState] = useState<ListState>({ phase: 'loading' });
  const [importedState, setImportedState] = useState<ListState>({ phase: 'loading' });
  const [rowAnalysis, setRowAnalysis] = useState<Record<string, RowAnalysis>>({});
  const rowAbortRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    const controller = new AbortController();
    getDemoDocuments({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.available) {
          setListState({ phase: 'loaded', documents: result.data });
        } else {
          setListState({ phase: 'unavailable' });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setListState({ phase: 'failed', detail: describeListError(error) });
      });

    // Imported (user) documents load in parallel with the seeded list. These
    // are non-seeded (contentStored: false) and never appear in /documents.
    getImportedDocuments({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.available) {
          setImportedState({ phase: 'loaded', documents: result.data });
        } else {
          setImportedState({ phase: 'unavailable' });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setImportedState({ phase: 'failed', detail: describeListError(error) });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const aborts = rowAbortRef.current;
    return () => {
      aborts.forEach((rowController) => rowController.abort());
    };
  }, []);

  const analyzeRow = (doc: DocumentSummary) => {
    if (!doc.versionId) return;
    rowAbortRef.current.get(doc.id)?.abort();
    const controller = new AbortController();
    rowAbortRef.current.set(doc.id, controller);
    setRowAnalysis((previous) => ({ ...previous, [doc.id]: { phase: 'starting' } }));

    startAnalysis(doc.versionId, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRowAnalysis((previous) => ({
          ...previous,
          [doc.id]: result.started
            ? { phase: 'started', runId: result.runId }
            : { phase: 'content-not-stored', disclosure: result.disclosure },
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRowAnalysis((previous) => ({
          ...previous,
          [doc.id]: { phase: 'failed', message: describeAnalysisError(error) },
        }));
      });
  };

  const loading = listState.phase === 'loading' || importedState.phase === 'loading';
  const seededEmpty = listState.phase === 'loaded' && listState.documents.length === 0;
  const importedEmpty = importedState.phase === 'loaded' && importedState.documents.length === 0;
  const bothEmpty = seededEmpty && importedEmpty;

  return (
    <div className="mx-auto max-w-3xl">
      {!loading && !bothEmpty && (
        <h1 className="font-display text-3xl text-ink">Library</h1>
      )}

      {loading && (
        <p className="mt-8 text-base text-ink-muted" role="status" data-testid="library-loading">
          Loading…
        </p>
      )}

      {!loading && listState.phase === 'failed' && (
        <div
          className="mt-8 rounded-lg border border-notice-border bg-notice-surface px-4 py-3 text-base text-ink"
          role="status"
          data-testid="library-failed"
        >
          <span className="block font-medium">The document list can’t be read right now.</span>
          <span className="mt-1 block text-sm text-ink-muted">{listState.detail}</span>
          <span className="mt-1 block text-sm text-ink-muted">
            No placeholder documents are shown instead — the list is never guessed.
          </span>
        </div>
      )}

      {!loading && listState.phase === 'unavailable' && (
        <div
          className="mt-8 rounded-lg border border-uncertain-border bg-uncertain-surface px-4 py-3"
          role="status"
          data-testid="library-unavailable"
        >
          <span className="block font-medium text-uncertain-text">
            The library list is not available in this deployment yet.
          </span>
          <span className="mt-1 block text-sm text-uncertain-text">
            The Library cannot claim which documents do or don’t exist, so it shows neither a
            list nor an empty state. Nothing is simulated.
          </span>
        </div>
      )}

      {!loading && listState.phase === 'loaded' && listState.documents.length > 0 && (
        <section aria-labelledby="library-list-heading" className="mt-8" data-testid="library-list">
          <h2 id="library-list-heading" className="sr-only">
            Seeded documents
          </h2>
          <ul className="space-y-4">
            {listState.documents.map((doc) => {
              const row = rowAnalysis[doc.id] ?? { phase: 'idle' as const };
              const isDemoManuscript = doc.versionId === DEMO_MANUSCRIPT_VERSION_ID;
              const contentless = doc.contentStored === false;
              return (
                <li
                  key={doc.id}
                  data-testid={`library-doc-${doc.id}`}
                  className="rounded-lg border border-ink-border bg-paper-raised p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{doc.title ?? doc.fileName ?? doc.id}</p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {[
                          doc.fileName,
                          doc.format ? `.${doc.format}` : null,
                          doc.importedAt ? `Imported ${doc.importedAt}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {doc.isSynthetic && (
                        <span className="inline-flex items-center gap-2 rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text">
                          {doc.syntheticLabel ?? 'FICTIONAL / GUIDED DEMO'}
                        </span>
                      )}
                      {isDemoManuscript && (
                        <Link
                          to="/results"
                          className="rounded border border-ink-border bg-paper px-3 py-1 text-xs text-ink no-underline hover:bg-paper-deep"
                        >
                          Open investigation
                        </Link>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-ink" data-testid={`doc-status-${doc.id}`}>
                    {isDemoManuscript
                      ? 'Guided demo manuscript — stored content is available, so analysis can run.'
                      : contentless
                        ? 'Registered without stored content (contentStored: false) — analysis cannot run on this document yet.'
                        : 'Content status not reported by the API — no analysis is offered.'}
                  </p>

                  {!isDemoManuscript && contentless && doc.disclosure && (
                    <blockquote
                      className="mt-2 border-l-2 border-review-border bg-review-surface px-3 py-2 text-sm text-review-text"
                      data-testid={`doc-disclosure-${doc.id}`}
                    >
                      {doc.disclosure}
                    </blockquote>
                  )}

                  {isDemoManuscript && doc.versionId && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => analyzeRow(doc)}
                        disabled={row.phase === 'starting'}
                        aria-busy={row.phase === 'starting'}
                        data-testid={`analyze-${doc.id}`}
                        className={
                          row.phase === 'starting'
                            ? 'cursor-progress rounded bg-brand px-4 py-2 text-sm font-medium text-white opacity-80'
                            : 'rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep'
                        }
                      >
                        {row.phase === 'starting' ? 'Starting analysis…' : 'Analyze'}
                      </button>
                      <div
                        aria-live="polite"
                        data-testid={`doc-analysis-${doc.id}`}
                        className="mt-2 min-h-5"
                      >
                        {row.phase === 'starting' && (
                          <p role="status" className="text-sm text-ink-muted">
                            Contacting the analysis endpoint…
                          </p>
                        )}
                        {row.phase === 'started' && (
                          <div role="status">
                            <p className="text-sm font-medium text-ink">
                              Analysis run started — runId:{' '}
                              <span className="font-mono">{row.runId}</span>
                            </p>
                            <p className="mt-1 text-sm text-ink-muted">
                              The runId is the real server response. Status polling and results are
                              not wired in this build yet — nothing further is simulated.
                            </p>
                          </div>
                        )}
                        {row.phase === 'content-not-stored' && (
                          <div
                            role="status"
                            className="rounded border border-uncertain-border bg-uncertain-surface px-3 py-2 text-sm text-uncertain-text"
                          >
                            <span className="block font-medium">
                              Analysis did not start — the server reports content-not-stored for this
                              version.
                            </span>
                            <span className="mt-1 block">{row.disclosure}</span>
                          </div>
                        )}
                        {row.phase === 'failed' && (
                          <div
                            role="status"
                            className="rounded border border-notice-border bg-notice-surface px-3 py-2 text-sm text-ink"
                          >
                            {row.message}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!loading && importedState.phase === 'failed' && (
        <div
          className="mt-8 rounded-lg border border-notice-border bg-notice-surface px-4 py-3 text-base text-ink"
          role="status"
          data-testid="library-imported-failed"
        >
          <span className="block font-medium">The imported documents list can’t be read right now.</span>
          <span className="mt-1 block text-sm text-ink-muted">{importedState.detail}</span>
          <span className="mt-1 block text-sm text-ink-muted">
            No imported documents are shown instead — the list is never guessed.
          </span>
        </div>
      )}

      {!loading && importedState.phase === 'unavailable' && (
        <div
          className="mt-8 rounded-lg border border-uncertain-border bg-uncertain-surface px-4 py-3"
          role="status"
          data-testid="library-imported-unavailable"
        >
          <span className="block font-medium text-uncertain-text">
            The imported documents list is not available in this deployment yet.
          </span>
          <span className="mt-1 block text-sm text-uncertain-text">
            The Library cannot claim which imported documents do or don’t exist. Nothing is
            simulated.
          </span>
        </div>
      )}

      {!loading && importedState.phase === 'loaded' && importedState.documents.length > 0 && (
        <section
          aria-labelledby="library-imported-heading"
          className="mt-8"
          data-testid="library-imported-list"
        >
          <h2 id="library-imported-heading" className="sr-only">
            Imported documents
          </h2>
          <p className="mb-3 text-sm text-ink-muted" data-testid="library-imported-note">
            User imports — real content you uploaded. These are registered without stored text
            (contentStored: false), so analysis is not available for them.
          </p>
          <ul className="space-y-4">
            {importedState.documents.map((doc) => {
              return (
                <li
                  key={doc.id}
                  data-testid={`library-imported-doc-${doc.id}`}
                  className="rounded-lg border border-ink-border bg-paper-raised p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{doc.title ?? doc.fileName ?? doc.id}</p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {[
                          doc.fileName,
                          doc.format ? `.${doc.format}` : null,
                          doc.sizeBytes ? describeBytes(doc.sizeBytes) : null,
                          doc.importedAt ? `Imported ${doc.importedAt}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className="inline-flex items-center gap-2 rounded border border-brand bg-brand-surface px-2 py-0.5 text-xs font-medium text-brand"
                        data-testid={`imported-real-${doc.id}`}
                      >
                        Real user content — not a demo fixture
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-ink" data-testid={`imported-status-${doc.id}`}>
                    Analysis not available — content not stored (contentStored: false).
                  </p>

                  {doc.disclosure && (
                    <blockquote
                      className="mt-2 border-l-2 border-notice-border bg-notice-surface px-3 py-2 text-sm text-ink"
                      data-testid={`imported-disclosure-${doc.id}`}
                    >
                      {doc.disclosure}
                    </blockquote>
                  )}

                  <div className="mt-3">
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      data-testid={`imported-analyze-${doc.id}`}
                      className="rounded border border-ink-border bg-ink-border px-4 py-2 text-sm font-medium text-ink-muted cursor-not-allowed opacity-60"
                    >
                      Analyze — content not stored
                    </button>
                    <p className="mt-1 text-sm text-ink-muted" data-testid={`imported-analyze-hint-${doc.id}`}>
                      Analysis requires stored text content. This import registered the file without
                      storing its text, so there is nothing to analyze.
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!loading && bothEmpty && (
        <div className="mt-8" data-testid="library-empty">
          <EmptyArea
            title="Library"
            note="Your imported research documents, publication records, bibliographies, references and documents versions will be listed here. No documents exist yet — the Library will never show placeholder records."
          />
        </div>
      )}
    </div>
  );
}
