import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  ApiUnavailableError,
  MAX_EVIDENCE_QUERY_CHARS,
  findEvidence as realFindEvidence,
  type EvidenceCandidate,
  type EvidenceFindResult,
} from '../lib/api';

/**
 * P4 Find-Evidence dialog (contract: docs/DATA_CONTRACTS §5, design of
 * record /tmp/opencode/p4-spec.md).
 *
 * Honest flow, in order:
 *  1. OPEN → the prepare read runs automatically ({ } body): the verbatim
 *     claim text, the concern summary/direction, the editable suggested
 *     query and the FULL caveats list render BEFORE any search happens.
 *  2. Search → one provider call (`{ query }`); candidates ≤ 8 metadata
 *     cards with a fixed honest status row; empty provider results are
 *     honest ("not proof that no evidence exists"), never an error.
 *  3. Errors are typed and never bluff success; provider outages arrive
 *     inside the 200 search payload (providersStatus) and read as such.
 *
 * Hard rule: nothing here mutates review cases, citations, or the
 * manuscript — there is no "mark as supported" affordance anywhere.
 */

type EvidenceFlow =
  | { phase: 'preparing' }
  | { phase: 'prepared'; result: EvidenceFindResult }
  | { phase: 'searching'; query: string; previous: EvidenceFindResult | null }
  | { phase: 'searched'; result: EvidenceFindResult }
  | { phase: 'prepare-failed'; message: string }
  | { phase: 'search-failed'; message: string; query: string; previous: EvidenceFindResult | null };

/**
 * Origin context (M7 Priority B): where this dialog was opened from when it
 * was NOT opened from the review queue itself. Purely descriptive — it never
 * changes what the panel does, what it searches, or any review state.
 * Declared here (not in api.ts); it is a UI-only concern with no wire shape.
 */
export interface FindEvidenceOrigin {
  /** Where the dialog came from, e.g. "Results — affected claim claim-A". */
  label: string;
  /** Optional route back to that origin, rendered as "Return to origin". */
  backHref?: string;
}

interface FindEvidencePanelProps {
  claimId: string;
  open: boolean;
  onClose: () => void;
  /**
   * Injectable implementation for tests; defaults to the real typed client.
   * Signature mirrors `findEvidence` from ../lib/api exactly.
   */
  findEvidence?: (
    claimId: string,
    opts?: { query?: string; signal?: AbortSignal },
  ) => Promise<EvidenceFindResult>;
  /**
   * OPTIONAL, backward-compatible origin context. When absent the panel
   * renders exactly as before (review-queue usage is untouched).
   */
  origin?: FindEvidenceOrigin;
}

/**
 * Typed error copy — every failure names what happened and what did NOT
 * change. ApiHttpError must be checked BEFORE the generic ApiClientError
 * branch (it extends it).
 */
function describeEvidenceError(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return 'The evidence-find API did not answer within 10 seconds (timeout) — nothing was searched and nothing changed. Try again.';
  }
  if (error instanceof ApiNetworkError) {
    return 'Network error — the request did not reach the evidence-find API. Nothing was searched and nothing changed.';
  }
  if (error instanceof ApiUnavailableError) {
    return `${error.message} Nothing was searched.`;
  }
  if (error instanceof ApiHttpError) {
    if (error.status === 400) {
      return 'The request was rejected as malformed (HTTP 400) — check the query text (1–400 visible characters) and try again.';
    }
    if (error.status === 404) {
      return 'The claim was not found in the graph (HTTP 404 claim-not-found) — nothing was searched.';
    }
    if (error.status === 429) {
      return 'Rate limited (HTTP 429) — the search endpoint allows only a few searches per short interval. Wait for the cooldown to pass, then try again. Nothing was searched.';
    }
    if (error.status === 503) {
      return 'The graph is unreachable (HTTP 503) — the claim could not be prepared. Try again when the graph answers.';
    }
    if (error.status >= 500) {
      return 'The evidence-find API is unavailable (server error) — nothing was searched.';
    }
    return `The evidence-find API returned HTTP ${error.status} — nothing was searched.`;
  }
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return 'The search could not be completed — nothing changed.';
}

/** The exact honesty copy of the empty-provider-result state (spec-fixed). */
export const EMPTY_PROVIDERS_COPY =
  'No records returned for this query — provider search coverage only; an empty result is not proof that no evidence exists.';

/** Footer disclosure — always visible while the panel is open (spec-fixed). */
export const FOOTER_DISCLOSURE =
  'This search does not modify citations, review states, or the manuscript. Hosted demo search runs against public bibliographic metadata (Crossref).';

export default function FindEvidencePanel({
  claimId,
  open,
  onClose,
  findEvidence,
  origin,
}: FindEvidencePanelProps) {
  const call = findEvidence ?? realFindEvidence;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<Element | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [flow, setFlow] = useState<EvidenceFlow>({ phase: 'preparing' });
  const [query, setQuery] = useState('');

  /**
   * The prepared/searched context still true about this claim: it stays
   * visible during an in-flight or failed SEARCH (the claim text, concern
   * and caveats did not change), while the previous candidate LIST goes
   * quiet — its cards never masquerade as answering the new query.
   */
  const shown =
    flow.phase === 'prepared' || flow.phase === 'searched'
      ? flow.result
      : flow.phase === 'searching' || flow.phase === 'search-failed'
        ? flow.previous
        : null;
  // Candidate cards + provider run rows render ONLY for a search-mode answer
  // actually held right now — never for the previous read under a new query.
  const searchResult =
    flow.phase === 'searched' && shown !== null && shown.mode === 'search' ? shown : null;
  const busy = flow.phase === 'preparing' || flow.phase === 'searching';

  /** Runs one prepare read (open / retry). */
  const runPrepare = useCallback(
    (signal: AbortSignal) => {
      call(claimId, { signal })
        .then((result) => {
          if (signal.aborted) return;
          if (result.mode !== 'prepare') {
            // Contract violation — never reinterpret a search answer as the
            // prepared read (suggested query would be a guess).
            setFlow({
              phase: 'prepare-failed',
              message:
                'The prepare endpoint returned a search-mode answer unexpectedly — nothing is shown rather than guessed.',
            });
            return;
          }
          setQuery(typeof result.suggestedQuery === 'string' ? result.suggestedQuery : '');
          setFlow({ phase: 'prepared', result });
        })
        .catch((error: unknown) => {
          if (signal.aborted) return;
          setFlow({ phase: 'prepare-failed', message: describeEvidenceError(error) });
        });
    },
    [call, claimId],
  );

  // Open lifecycle: reset, capture the triggering focus, start the prepare
  // read immediately (auto-load on open), and restore focus on close.
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      setFlow({ phase: 'preparing' });
      setQuery('');
      const controller = new AbortController();
      abortRef.current = controller;
      runPrepare(controller.signal);
      dialogRef.current?.focus();
    } else if (triggerRef.current && document.contains(triggerRef.current)) {
      (triggerRef.current as HTMLElement).focus?.();
      triggerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, claimId]);

  useEffect(() => {
    if (open) return () => abortRef.current?.abort();
  }, [open]);

  // Escape closes — same accessible-dialog convention as the review dialogs.
  useEffect(() => {
    if (!open) return;
    const keyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', keyDown);
    return () => document.removeEventListener('keydown', keyDown);
  }, [open, onClose]);

  const runSearch = useCallback(
    (searchQuery: string, signal: AbortSignal, previous: EvidenceFindResult | null) => {
      call(claimId, { query: searchQuery, signal })
        .then((result) => {
          if (signal.aborted) return;
          if (result.mode !== 'search') {
            setFlow({
              phase: 'search-failed',
              query: searchQuery,
              previous,
              message:
                'The search endpoint returned a prepare-mode answer unexpectedly — no results are invented.',
            });
            return;
          }
          // The truth of what was searched is the server's trimmed copy.
          setQuery(result.query);
          setFlow({ phase: 'searched', result });
        })
        .catch((error: unknown) => {
          if (signal.aborted) return;
          setFlow({
            phase: 'search-failed',
            message: describeEvidenceError(error),
            query: searchQuery,
            previous,
          });
        });
    },
    [call, claimId],
  );

  const queryText = query.trim();
  const queryTooLong = queryText.length > MAX_EVIDENCE_QUERY_CHARS;
  const queryEmpty = queryText.length === 0;
  const queryValid = !queryEmpty && !queryTooLong;

  const submitSearch = useCallback(() => {
    if (!queryValid || busy) return;
    const previous =
      flow.phase === 'prepared' || flow.phase === 'searched' ? flow.result : null;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFlow({ phase: 'searching', query: queryText, previous });
    runSearch(queryText, controller.signal, previous);
  }, [busy, flow, queryValid, queryText, runSearch]);

  const retry = useCallback(() => {
    if (flow.phase === 'prepare-failed') {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setFlow({ phase: 'preparing' });
      runPrepare(controller.signal);
      return;
    }
    if (flow.phase === 'search-failed' && flow.query.trim()) {
      // Retry re-runs ONLY the failed search, with the same query, keeping
      // the still-true prepared context visible underneath.
      const previous = flow.previous;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setFlow({ phase: 'searching', query: flow.query, previous });
      runSearch(flow.query, controller.signal, previous);
    }
  }, [flow, runPrepare, runSearch]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop: dismisses on click (sibling of the dialog, never its parent). */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-sm"
      />
      {/* Mobile-safe scroller: the panel itself stays within the viewport. */}
      <div
        className="fixed inset-0 z-50 overflow-y-auto"
        data-testid="find-evidence-overlay"
      >
        <div className="mx-auto my-4 w-full max-w-2xl px-3 sm:px-4" onClick={(e) => e.stopPropagation()}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="find-evidence-title"
            aria-busy={busy}
            tabIndex={-1}
            data-testid="find-evidence-dialog"
            className="rounded-lg border border-ink-border bg-paper-raised p-5 text-ink shadow-xl focus:outline-none"
          >
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h2 id="find-evidence-title" className="text-lg font-semibold text-ink">
                Find evidence — {claimId}
              </h2>
              <button
                type="button"
                onClick={onClose}
                data-testid="find-evidence-close"
                className="rounded border border-ink-border bg-paper px-2 py-1 text-sm text-ink hover:bg-paper-deep"
              >
                Close
              </button>
            </div>
            {/* M7 Priority B — origin context row. Renders ONLY when the panel
                was opened with origin context (never from the review queue:
                the default flow stays byte-compatible). Navigation-only links:
                they leave the dialog, they never touch any review state. */}
            {origin && (
              <div
                data-testid="find-evidence-origin"
                className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded border border-ink-border bg-paper-deep px-3 py-2 text-xs"
              >
                <p className="text-ink">
                  <span className="font-medium text-ink-muted">From: </span>
                  <span data-testid="find-evidence-origin-label">{origin.label}</span>
                </p>
                {origin.backHref && (
                  <a
                    href={origin.backHref}
                    onClick={onClose}
                    data-testid="find-evidence-origin-return"
                    aria-label={`Return to origin (${origin.label})`}
                    className="text-brand-deep underline hover:text-brand"
                  >
                    Return to origin
                  </a>
                )}
                {/* Same case exists in the review queue (claimId = caseId).
                    Read-only navigation — implies no state change of any kind.
                    One transition: the Link closes the dialog and routes via
                    the router (no page reload hop). */}
                <Link
                  to="/review-queue"
                  onClick={onClose}
                  data-testid="find-evidence-review-queue"
                  aria-label={`Open review queue for case ${claimId} (viewing only)`}
                  className="text-brand-deep underline hover:text-brand"
                >
                  Open review queue
                </Link>
              </div>
            )}
            <p className="mb-3 text-xs text-ink-muted">
              External bibliographic search — read-only and exploratory. Results are
              metadata candidates only, not assessed support.
            </p>

            {flow.phase === 'preparing' && (
              <p role="status" data-testid="find-evidence-loading" className="text-sm text-ink-muted">
                Reading the claim and building a suggested query — no external
                search happens in this step, so nothing is arriving from Crossref yet.
              </p>
            )}
            {flow.phase === 'searching' && (
              <p role="status" data-testid="find-evidence-loading" className="text-sm text-ink-muted">
                Searching provider bibliographic metadata for “{flow.query}” — the
                real request is in flight and nothing is simulated while it runs.
              </p>
            )}

            {(flow.phase === 'prepare-failed' || flow.phase === 'search-failed') && (
              <div
                role="alert"
                data-testid="find-evidence-error"
                className="rounded border border-notice-border bg-notice-surface px-3 py-3 text-sm text-notice-text"
              >
                <p className="font-medium">{flow.message}</p>
                <button
                  type="button"
                  onClick={retry}
                  data-testid="find-evidence-retry"
                  className="mt-2 inline rounded border border-notice-text bg-notice-surface px-2 py-1 text-xs font-medium text-notice-text hover:bg-notice-surface-deep"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Prepared or searched data (the two honest loaded states). */}
            {shown && (
              <>
                {/* Verbatim claim text — read-only, exactly as the server returned it. */}
                <div className="mb-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted mb-1">
                    {shown.label === 'Conclusion' ? 'Conclusion' : 'Claim'} text — verbatim from the graph, immutable
                  </p>
                  <blockquote
                    data-testid="find-evidence-claim-text"
                    className="rounded border border-ink-border bg-paper-deep py-2 pl-3 text-sm italic text-ink"
                  >
                    “{shown.claimText}”
                  </blockquote>
                </div>

                <div className="mb-3 rounded border border-review-border bg-review-surface px-3 py-2 text-sm text-review-text">
                  <p data-testid="find-evidence-concern-summary" className="font-medium">
                    {shown.concern.summary || 'No concern summary was returned for this claim.'}
                  </p>
                  <span
                    data-testid="find-evidence-concern-direction"
                    className="mt-1 inline-flex items-center rounded border border-ink-border bg-paper px-2 py-0.5 text-xs font-medium text-ink"
                  >
                    relation: {shown.concern.direction}
                    {shown.concern.direction === 'unknown' ? ' — not assessed by this search' : ''}
                  </span>
                </div>

                {/* Providers available on this deployment. */}
                {shown.providers.length > 0 && (
                  <div className="mb-3 text-xs text-ink-muted">
                    <p className="font-medium text-ink">Searchable providers</p>
                    <ul className="mt-1 list-disc pl-4" data-testid="find-evidence-providers">
                      {shown.providers.map((provider) => (
                        <li key={provider.id} data-testid={`find-evidence-provider-listed-${provider.id}`}>
                          {provider.landingUrl ? (
                            <a
                              href={provider.landingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-deep underline hover:text-brand"
                            >
                              {provider.displayName}
                            </a>
                          ) : (
                            provider.displayName
                          )}
                          {provider.scopeNote ? ` — ${provider.scopeNote}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* FULL caveats, before any search output — contract-fixed strings. */}
                <div className="mb-3 rounded border border-ink-border bg-paper px-3 py-2">
                  <p className="text-xs font-medium text-ink">Before you search — what this can and cannot tell you</p>
                  {shown.caveats.length > 0 ? (
                    <ul data-testid="find-evidence-caveats" className="mt-1 list-disc pl-4 text-xs text-ink-muted">
                      {shown.caveats.map((caveat) => (
                        <li key={caveat}>{caveat}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-ink-muted">
                      The endpoint returned no caveats — this is a contract violation, and no
                      assumptions are made in their place.
                    </p>
                  )}
                </div>

                {/* Query editor — prefilled with the server's suggested query. */}
                <div className="mb-3">
                  <label htmlFor="find-evidence-query" className="text-sm font-medium text-ink block mb-1">
                    Search query
                  </label>
                  <textarea
                    id="find-evidence-query"
                    data-testid="find-evidence-query"
                    value={query}
                    rows={3}
                    disabled={busy}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded border border-ink-border bg-paper-raised px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-offset-1 focus:outline-brand disabled:opacity-60"
                    placeholder="Bibliographic search terms…"
                  />
                  <p
                    data-testid="find-evidence-query-hint"
                    className={'mt-1 text-xs ' + (queryEmpty || queryTooLong ? 'text-notice-text' : 'text-ink-muted')}
                  >
                    {query.length}/{MAX_EVIDENCE_QUERY_CHARS} characters
                    {queryEmpty
                      ? ' — a non-empty query is required before searching.'
                      : queryTooLong
                        ? ' — over the 400-character limit; shorten the query to search.'
                        : '.'}
                  </p>
                  <button
                    type="button"
                    onClick={submitSearch}
                    disabled={!queryValid || busy}
                    aria-busy={flow.phase === 'searching'}
                    data-testid="find-evidence-search"
                    className="mt-1 rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Search provider metadata
                  </button>
                </div>

                {/* Search results — only a search-mode answer can render here. */}
                {searchResult && (
                  <div data-testid="find-evidence-results">
                    {searchResult.searchedAt && (
                      <p className="text-xs text-ink-muted mb-2" data-testid="find-evidence-searched-at">
                        Searched at <span className="font-mono">{searchResult.searchedAt}</span>.
                      </p>
                    )}

                    {/* Honest per-provider run status — provider outage is not an error. */}
                    <div data-testid="find-evidence-providers-status" className="mb-3 space-y-1 text-xs text-ink">
                      {searchResult.providersStatus.length === 0 ? (
                        <p>No provider run status was returned — the coverage of this search is not reported.</p>
                      ) : (
                        searchResult.providersStatus.map((status) => (
                          <p key={status.id} data-testid={`find-evidence-provider-${status.id}`}>
                            <span className="font-mono">{status.id}</span> · <span className="font-medium">{status.status}</span> —{' '}
                            {status.status === 'ok' ? (
                              'records were returned.'
                            ) : status.status === 'empty' ? (
                              EMPTY_PROVIDERS_COPY
                            ) : status.status === 'timeout' ? (
                              'the provider timed out, so its results are missing from this search (missing, not zero).'
                                + (status.retried ? ' One retry was already attempted.' : '')
                                + (status.message ? ` ${status.message}` : '')
                            ) : (
                              'the provider returned an error, so its results may be partial.'
                                + (status.retried ? ' One retry was already attempted.' : '')
                                + (status.message ? ` ${status.message}` : '')
                            )}
                          </p>
                        ))
                      )}
                    </div>

                    {searchResult.candidates.length === 0 ? (
                      <p
                        data-testid="find-evidence-empty"
                        className="rounded border border-ink-border bg-paper px-3 py-2 text-sm text-ink-muted"
                      >
                        No candidate records to display
                        {searchResult.providersStatus.some((s) => s.status === 'empty')
                          ? ' — ' + EMPTY_PROVIDERS_COPY
                          : ' — the providers that failed or timed out are named above; their missing results are not zero.'}
                      </p>
                    ) : (
                      <ul className="space-y-3" data-testid="find-evidence-candidates">
                        {searchResult.candidates.map((candidate, index) => (
                          <CandidateCard key={candidate.candidateId} candidate={candidate} index={index} />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Footer disclosure — always visible while the panel is open. */}
            <p
              data-testid="find-evidence-footer-disclosure"
              className="mt-4 border-t border-ink-border pt-3 text-xs text-ink-muted"
            >
              {FOOTER_DISCLOSURE}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function CandidateCard({ candidate, index }: { candidate: EvidenceCandidate; index: number }) {
  return (
    <li>
      <article
        data-testid={`find-evidence-candidate-${index}`}
        className="rounded border border-ink-border bg-paper p-3 text-sm text-ink"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-medium text-ink">{candidate.title}</h4>
          {candidate.isSynthetic === false && (
            <span
              data-testid={`find-evidence-candidate-${index}-chip-real`}
              className="inline-flex shrink-0 items-center rounded border border-reviewed bg-reviewed-surface px-2 py-0.5 text-xs font-medium text-reviewed-text"
            >
              REAL METADATA
            </span>
          )}
          {candidate.isSynthetic === true && (
            <span
              data-testid={`find-evidence-candidate-${index}-chip-synthetic`}
              className="inline-flex shrink-0 items-center rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text"
            >
              FICTIONAL / GUIDED DEMO
            </span>
          )}
          {candidate.isSynthetic === undefined && (
            <span
              data-testid={`find-evidence-candidate-${index}-chip-unlabeled`}
              className="inline-flex shrink-0 items-center rounded border border-ink-border bg-paper px-2 py-0.5 text-xs text-ink-muted"
            >
              synthetic flag not reported
            </span>
          )}
        </header>
        <p className="mt-1 text-sm text-ink">
          {candidate.authors.length > 0 ? candidate.authors.join(', ') : 'No authors recorded'}
          {' · '}
          {candidate.year !== undefined ? candidate.year : 'year not recorded'}
          {' · '}
          {candidate.container ?? 'venue not recorded'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="inline-flex items-center rounded border border-ink-border bg-paper-raised px-2 py-0.5 text-ink-muted">
            type: {candidate.publicationType ?? 'not recorded'}
          </span>
          {candidate.publisher && (
            <span className="text-ink-muted">Publisher: {candidate.publisher}</span>
          )}
          {candidate.urls?.sourceUrl ? (
            <a
              data-testid={`find-evidence-candidate-${index}-doi`}
              href={candidate.urls.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-deep underline hover:text-brand"
            >
              DOI: {candidate.doi ?? candidate.urls.sourceUrl}
            </a>
          ) : (
            <span data-testid={`find-evidence-candidate-${index}-doi-missing`} className="text-ink-muted">
              No DOI link returned
            </span>
          )}
        </div>
        {candidate.relevanceBasis && (
          <p className="mt-1 text-xs text-ink-muted">{candidate.relevanceBasis}</p>
        )}
        {/* Fixed honest status row — constants in v1, never upgraded by the UI. */}
        <p
          data-testid={`find-evidence-candidate-${index}-status`}
          className="mt-2 border-t border-ink-border pt-2 text-xs text-ink"
        >
          relationship <span className="font-mono">{candidate.evidenceRelationship ?? 'unverified'}</span> ·
          independence <span className="font-mono">{candidate.independence ?? 'unknown'}</span> ·
          full text <span className="font-mono">{candidate.fullTextAvailability ?? 'unknown'}</span> ·
          retraction <span className="font-mono">{candidate.retractionStatus}</span>
          {candidate.retractionStatus === 'notice_present' && (
            <span className="ml-2 inline-flex items-center rounded border border-notice-border bg-notice-surface px-2 py-0.5 text-xs font-medium text-notice-text">
              Retraction notice present on the provider record
            </span>
          )}
        </p>
      </article>
    </li>
  );
}
