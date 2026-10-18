import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  getGraphOverview,
  getSeedStatus,
} from '../lib/api';
import { deriveDemoImpact, type DemoImpact } from '../lib/demoImpact';

type GraphLoad =
  | { phase: 'loading' }
  | { phase: 'ready'; impact: DemoImpact }
  | { phase: 'missing'; reason: 'endpoint-missing' | 'not-implemented' }
  | { phase: 'failure'; message: string };

interface SeedInfo {
  exists: boolean;
  seedVersion?: string;
  nodeCount?: number;
}

/**
 * Guided-demo results, mapped entirely from real API data (contract §7):
 * verified notices, affected claims/conclusions, historical mentions that
 * are deliberately NOT flagged, unresolved references, and what remains
 * unknown. When the API is silent the page says exactly that — no number
 * is ever invented to fill a gap.
 */
export default function DemoResultsPage() {
  const navigate = useNavigate();
  const [seed, setSeed] = useState<SeedInfo | null>(null);
  const [graph, setGraph] = useState<GraphLoad>({ phase: 'loading' });
  const controllerRef = useRef<AbortController | null>(null);
  const seedCheckRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setGraph({ phase: 'loading' });

    getGraphOverview({ limit: 40 }, { signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.available) {
          setGraph({ phase: 'ready', impact: deriveDemoImpact(outcome.data) });
        } else {
          setGraph({ phase: 'missing', reason: outcome.reason });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiTimeoutError) {
          setGraph({ phase: 'failure', message: 'The API did not answer within 10 seconds (timeout).' });
        } else if (error instanceof ApiNetworkError) {
          setGraph({ phase: 'failure', message: 'API unavailable — network error, nothing could be read.' });
        } else if (error instanceof ApiHttpError) {
          setGraph({ phase: 'failure', message: `API returned HTTP ${error.status}.` });
        } else if (error instanceof ApiClientError) {
          setGraph({ phase: 'failure', message: error.message });
        } else {
          setGraph({ phase: 'failure', message: 'Unexpected failure while reading the graph.' });
        }
      });
  }, []);

  const loadSeed = useCallback(() => {
    seedCheckRef.current?.abort();
    const controller = new AbortController();
    seedCheckRef.current = controller;
    getSeedStatus({ signal: controller.signal })
      .then((status) => {
        if (!controller.signal.aborted) setSeed(status);
      })
      .catch(() => {
        // Probe optional — the graph section below carries the honest state.
        if (!controller.signal.aborted) setSeed(null);
      });
  }, []);

  useEffect(() => {
    load();
    loadSeed();
    return () => {
      controllerRef.current?.abort();
      seedCheckRef.current?.abort();
    };
  }, [load, loadSeed]);

  const impact = graph.phase === 'ready' ? graph.impact : null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">Guided demo results</h1>
        {impact && (
          <p className="text-xs text-ink-muted" data-testid="results-counts">
            {impact.seedVersion ? `seed ${impact.seedVersion} · ` : ''}
            {impact.nodeCount} nodes · {impact.edgeCount} connections returned
          </p>
        )}
      </div>

      {seed?.exists && seed.seedVersion && (
        <p className="mt-1 text-xs text-ink-muted" data-testid="seed-info">
          Demo graph present (seedVersion {seed.seedVersion}
          {typeof seed.nodeCount === 'number' ? `, ${seed.nodeCount} nodes` : ''}). Graph loss
          on the free tier is possible; reseeding is idempotent.
        </p>
      )}

      {/* Attribution banner: synthetic document content vs real source record. */}
      <p
        role="note"
        data-testid="results-attribution"
        className="mt-4 rounded-lg border border-uncertain-border bg-uncertain-surface px-4 py-3 text-base text-uncertain-text"
      >
        <strong>Fictional</strong> guided-demo manuscript: the passages, claims and citation
        uses below are invented for this demo and labelled FICTIONAL / GUIDED DEMO. The
        cited publication and its retraction record (<em>Mehra et al., The Lancet, 2020</em>)
        are real, and its notice is a verified public record. A flagged item means
        <strong> evidence review is needed</strong> — never a verdict of truth or falsity.
      </p>

      {graph.phase === 'loading' && (
        <p className="mt-6 text-sm text-ink-muted" role="status" data-testid="results-loading">
          Reading the graph…
        </p>
      )}

      {graph.phase === 'missing' && (
        <section
          aria-labelledby="results-missing-heading"
          className="mt-6 rounded-lg border border-ink-border bg-paper-raised p-6"
          data-testid="results-missing"
        >
          <h2 id="results-missing-heading" className="text-lg font-semibold text-ink">
            Graph records not available yet
          </h2>
          <p className="mt-2 max-w-prose text-base text-ink-muted">
            {graph.reason === 'not-implemented'
              ? 'The graph-records endpoint reports “not implemented” on this build.'
              : 'No graph-records endpoint answered (function missing — HTTP 404 or an HTML page fallback).'}{' '}
            Either the demo graph is not seeded yet in this environment, or the query
            endpoints are not wired to the graph backend yet. Results are derived only
            from real graph data, so none are shown until the API answers with records.
          </p>
        </section>
      )}

      {graph.phase === 'failure' && (
        <section
          aria-labelledby="results-failure-heading"
          className="mt-6 rounded-lg border border-notice-border bg-notice-surface p-6"
          data-testid="results-failure"
        >
          <h2 id="results-failure-heading" className="text-lg font-semibold text-notice-text">
            Results unavailable
          </h2>
          <p className="mt-2 text-base text-ink" data-testid="results-failure-detail">
            {stateMessage(graph)} Nothing is simulated in place of the real data.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={load}
              className="rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink hover:bg-paper-deep"
            >
              Retry
            </button>
            <Link to="/" className="rounded px-4 py-2 text-sm text-ink-muted no-underline hover:text-ink">
              Back to landing
            </Link>
          </div>
        </section>
      )}

      {graph.phase === 'ready' && impact && (
        <div className="mt-6 space-y-6">
          {/* Investigation summary header */}
          <section
            aria-labelledby="results-summary-heading"
            data-testid="investigation-summary"
            className="rounded-lg border border-ink-border bg-paper-raised p-6"
          >
            <h2 id="results-summary-heading" className="text-lg font-semibold text-ink">
              Investigation summary
            </h2>
            <p className="mt-2 text-base text-ink" data-testid="manuscript-title">
              <span className="font-medium">Manuscript:</span>{' '}
              {impact.manuscriptTitle ?? 'Title not recorded in the returned graph'}
            </p>
            <p className="mt-1 text-sm text-ink-muted" data-testid="what-was-checked">
              What was checked: whether a verified retraction of the cited publication
              (Mehra et al., 2020) affects the supporting citation uses in this
              manuscript; historical mentions and unresolved references are reported
              separately and do not propagate into claim impact.
            </p>
          </section>

          {/* (a) Verified retraction notice */}
          <section
            aria-labelledby="results-notices"
            data-testid="results-notices"
            className="rounded-lg border border-ink-border bg-paper-raised p-6"
          >
            <div data-testid="results-verified-notice">
              <h2 id="results-notices" className="text-lg font-semibold text-ink">
                Verified retraction notice ({impact.verifiedNotices.length})
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                Real public record. A notice is a formal status change, not a judgement
                on any citing document.
              </p>
            </div>
            {impact.verifiedNotices.length === 0 ? (
              <p className="mt-2 text-base text-ink-muted">
                None recorded in the returned graph. “No notice found” never implies
                scientific reliability or complete global coverage.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {impact.verifiedNotices.map((notice) => (
                  <li
                    key={notice.noticeId}
                    className="rounded border border-notice-border bg-notice-surface p-3 text-base"
                    data-testid={`notice-${notice.noticeId}`}
                  >
                    <p className="font-medium text-notice-text" data-testid="notice-type">
                      {notice.title ?? `${notice.publicationId ?? 'publication'} — notice ${notice.noticeType}`}
                    </p>
                    <dl className="mt-2 space-y-1 text-sm">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium text-ink-muted">Type</dt>
                        <dd className="text-ink" data-testid="notice-verification">
                          verified notice · {notice.noticeType}
                        </dd>
                      </div>
                      {notice.publicationId && (
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium text-ink-muted">Publication</dt>
                          <dd className="break-all font-mono text-xs text-ink">
                            {notice.publicationId}
                          </dd>
                        </div>
                      )}
                      {notice.publishedDate && (
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium text-ink-muted">Published</dt>
                          <dd className="text-ink">{notice.publishedDate}</dd>
                        </div>
                      )}
                      {notice.noticeAnnouncementDate && notice.noticeRecordedDate && (
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium text-ink-muted">Announced / recorded</dt>
                          <dd className="text-ink" data-testid="notice-dates">
                            {notice.noticeAnnouncementDate} / {notice.noticeRecordedDate}
                            <span className="ml-2 text-xs text-ink-muted">
                              (distinct timestamps kept separate)
                            </span>
                          </dd>
                        </div>
                      )}
                      {notice.sourceUrl && (
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium text-ink-muted">Source</dt>
                          <dd>
                            <a
                              href={notice.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-brand-deep underline break-all"
                            >
                              {notice.sourceUrl}
                            </a>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* (b) Direct evidence concern */}
          <section
            aria-labelledby="results-direct-heading"
            data-testid="results-direct-evidence"
            className="rounded-lg border border-ink-border bg-paper-raised p-6"
          >
            <div data-testid="results-affected">
              <h2 id="results-direct-heading" className="text-lg font-semibold text-ink">
                Direct evidence concern — Claim A (supporting citation use)
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                The claim below cites the retracted publication in a supporting role.
                Review is required; this is not a finding of falsity.
              </p>
            </div>
            {impact.affected.filter((i) => i.reviewKind === 'direct_evidence_review').length === 0 ? (
              <p className="mt-2 text-base text-ink-muted">
                No claim in the returned graph is directly supported by a citation use
                referencing a verified-notice publication.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {impact.affected
                  .filter((item) => item.reviewKind === 'direct_evidence_review')
                  .map((item) => (
                    <li
                      key={item.id}
                      className="rounded border border-review-border bg-review-surface p-3 text-base"
                      data-testid={`affected-${item.id}`}
                    >
                      <p className="font-medium text-review-text">
                        Claim “{item.id}” — direct evidence review (supporting role)
                      </p>
                      {item.text && <p className="mt-1 text-ink">“{item.text}”</p>}
                      <dl className="mt-2 space-y-1 text-xs">
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium text-ink-muted">Publication (source)</dt>
                          <dd className="break-all font-mono text-ink">
                            {item.viaPublicationId}
                          </dd>
                        </div>
                        {item.viaCitationUseId && (
                          <div className="flex flex-wrap gap-x-2">
                            <dt className="font-medium text-ink-muted">Citation use</dt>
                            <dd className="break-all font-mono text-ink">
                              {item.viaCitationUseId}
                            </dd>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium text-ink-muted">Claim</dt>
                          <dd className="break-all font-mono text-ink">{item.id}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {/* (c) Indirect dependent conclusion */}
          <section
            aria-labelledby="results-indirect-heading"
            data-testid="results-indirect-conclusion"
            className="rounded-lg border border-ink-border bg-paper-raised p-6"
          >
            <h2 id="results-indirect-heading" className="text-lg font-semibold text-ink">
              Indirect dependent conclusion — Conclusion C (depends on Claim A)
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              This conclusion inherits a review obligation from a flagged claim; it is
              not itself judged false.
            </p>
            {impact.affected.filter((i) => i.reviewKind === 'indirect_evidence_review').length === 0 ? (
              <p className="mt-2 text-base text-ink-muted">
                No conclusion in the returned graph depends on a flagged claim.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {impact.affected
                  .filter((item) => item.reviewKind === 'indirect_evidence_review')
                  .map((item) => (
                    <li
                      key={item.id}
                      className="rounded border border-review-border bg-review-surface p-3 text-base"
                      data-testid={`affected-${item.id}`}
                    >
                      <p className="font-medium text-review-text">
                        Conclusion “{item.id}” — indirect evidence review (depends on a
                        flagged claim)
                      </p>
                      {item.text && <p className="mt-1 text-ink">“{item.text}”</p>}
                      <dl className="mt-2 space-y-1 text-xs">
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium text-ink-muted">Depends on (claim)</dt>
                          <dd className="break-all font-mono text-ink">
                            {item.viaClaimId}
                          </dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium text-ink-muted">Publication (source)</dt>
                          <dd className="break-all font-mono text-ink">
                            {item.viaPublicationId}
                          </dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium text-ink-muted">Conclusion</dt>
                          <dd className="break-all font-mono text-ink">{item.id}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {/* Not affected */}
          <section
            aria-labelledby="results-historical"
            data-testid="results-historical"
            className="rounded-lg border border-ink-border bg-paper-raised p-6"
          >
            <div data-testid="results-not-affected">
              <h2 id="results-historical" className="text-lg font-semibold text-ink">
                Not affected — historical mention ({impact.historical.length})
              </h2>
            </div>
            {impact.historical.length === 0 ? (
              <p className="mt-2 text-base text-ink-muted">
                No historical-mention citation uses reference the verified-notice publication
                in the returned graph.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {impact.historical.map((item) => (
                  <li
                    key={item.id}
                    className="rounded border border-ink-border bg-paper-deep p-3 text-base"
                    data-testid={`historical-${item.id}`}
                  >
                    <p className="font-medium text-ink">Claim “{item.id}” — not flagged</p>
                    {item.text && <p className="mt-1 text-ink-muted">“{item.text}”</p>}
                    <p className="mt-1 text-xs text-ink-muted">
                      Citing a retracted record as <em>historical discussion</em> does not
                      compromise this passage; the citation role was recorded as historical
                      (MENTIONS_HISTORICALLY), not supporting.
                    </p>
                    <dl className="mt-2 space-y-1 text-xs">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium text-ink-muted">Publication (source)</dt>
                        <dd className="break-all font-mono text-ink">
                          {item.viaPublicationId}
                        </dd>
                      </div>
                      {item.viaCitationUseId && (
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium text-ink-muted">Citation use</dt>
                          <dd className="break-all font-mono text-ink">
                            {item.viaCitationUseId}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Unresolved */}
          <section
            aria-labelledby="results-unresolved"
            data-testid="results-unresolved"
            className="rounded-lg border border-ink-border bg-paper-raised p-6"
          >
            <div data-testid="results-unresolved-references">
              <h2 id="results-unresolved" className="text-lg font-semibold text-ink">
                Unresolved references ({impact.unresolved.length})
              </h2>
            </div>
            {impact.unresolved.length === 0 ? (
              <p className="mt-2 text-base text-ink-muted">
                No unresolved reference occurrences were returned.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {impact.unresolved.map((item) => (
                  <li
                    key={item.id}
                    className="rounded border border-uncertain-border bg-uncertain-surface p-3 text-base"
                    data-testid={`unresolved-${item.id}`}
                  >
                    <p className="font-medium text-uncertain-text">
                      “{item.text ?? item.id}” — unresolved ({item.resolutionState ?? 'state not recorded'})
                    </p>
                    <p className="mt-1 text-xs text-ink" data-testid={`unresolved-${item.id}-candidates`}>
                      {item.candidateIds.length} possible candidate
                      {item.candidateIds.length === 1 ? '' : 's'} — unverified
                      {item.onlyPossibleMatches ? ', connected only by POSSIBLE_MATCH edges' : ''}
                      {item.candidateIds.length > 0 ? `: ${item.candidateIds.join(', ')}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Candidate edges never propagate into claim impact; resolution requires
                      human comparison of the candidates. Lee et al. has 2 possible matches
                      and stays unresolved — never guessed.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Unknown */}
          <section
            aria-labelledby="results-unknown"
            className="rounded-lg border border-ink-border bg-paper-raised p-6"
          >
            <h2 id="results-unknown" className="text-lg font-semibold text-ink">
              What remains unknown
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-ink-muted" data-testid="results-unknown">
              <li>
                Synthetic entities in this demo: {impact.syntheticEntityCount} · real
                bibliographic records: {impact.realEntityCount}
                {impact.realEntityCount === 0 && impact.syntheticEntityCount === 0
                  ? ' (attribution data was not returned for any record)'
                  : ''}
                . Everything fictional is labelled in place, never merged with real records.
              </li>
              <li>
                No human review decisions exist yet in this build — seeded records carry
                reviewState “unreviewed”, and a flag is an ask for review, not a finding.
              </li>
              <li>
                Ambiguous references stay ambiguous until a human resolves them; possible
                matches are never converted into confirmed citations automatically.
              </li>
              <li>
                “No notice found” on any source would never mean the source is unaffected —
                notice coverage is not complete worldwide.
              </li>
            </ul>
          </section>
        </div>
      )}

      <p className="mt-6 text-sm text-ink-muted">
        Next steps:{' '}
        <Link to="/graph" className="text-brand-deep underline">
          explore the Knowledge Graph
        </Link>{' '}
        or{' '}
        <Link to="/review-queue" className="text-brand-deep underline">
          open the Review Queue
        </Link>
        . Need a different route?{' '}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-brand-deep underline"
        >
          Back to the landing page
        </button>
        .
      </p>
    </div>
  );
}

/** Narrow a GraphLoad failure to its message in JSX-safe way. */
function stateMessage(state: GraphLoad): string {
  return state.phase === 'failure' ? state.message : '';
}
