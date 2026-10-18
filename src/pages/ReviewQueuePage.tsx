import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  getGraphOverview,
  type GraphEdge,
  type GraphOverview,
} from '../lib/api';
import { deriveDemoImpact, type AffectedItem, type DemoImpact } from '../lib/demoImpact';

type QueueLoad =
  | { phase: 'loading' }
  | { phase: 'ready'; overview: GraphOverview; impact: DemoImpact }
  | { phase: 'missing'; reason: 'endpoint-missing' | 'not-implemented' }
  | { phase: 'failure'; message: string };

/**
 * A review-queue item derived ONLY from returned graph records: a claim or
 * conclusion the real flag traversal (verified notice → supporting citation
 * use → claim → dependent conclusion) marks for evidence review, plus the
 * actual flag edge so the "why" shows the edge's own provenance text.
 *
 * `reviewed` (sage styling) is true ONLY when the node itself records a
 * human review outcome (contract §4 states `review_recorded` | `resolved`).
 * The seeded demo carries `unreviewed` everywhere, so sage never appears
 * for it — the queue never pre-marks anything as reviewed.
 */
interface ReviewItem {
  id: string;
  kind: 'claim' | 'conclusion';
  reviewKind: 'direct_evidence_review' | 'indirect_evidence_review';
  text?: string;
  viaPublicationId: string;
  viaCitationUseId?: string;
  viaClaimId?: string;
  /** The returned edge that carries the flag — provenance source for the "why". */
  flagEdge?: GraphEdge;
  reviewed: boolean;
}

const REVIEWED_NODE_STATES = new Set(['review_recorded', 'resolved']);

function nodeStatus(overview: GraphOverview, id: string): string | undefined {
  const node = overview.nodes.find((candidate) => candidate.id === id);
  const status = node?.properties['status'];
  return typeof status === 'string' && status.length > 0 ? status : undefined;
}

function findEdge(
  overview: GraphOverview,
  type: string,
  fromId: string,
  toId: string,
): GraphEdge | undefined {
  return overview.edges.find(
    (edge) => edge.type === type && edge.fromId === fromId && edge.toId === toId,
  );
}

/**
 * Same flag semantics as the results page (shared deriveDemoImpact), with
 * the flag edge attached. Never conflates relation types: only
 * CITATION_USE_SUPPORTS_CLAIM (direct) and CONCLUSION_DEPENDS_ON_CLAIM
 * (indirect) edges can flag — historical mentions and POSSIBLE_MATCH
 * candidates never join this list (DATA_CONTRACTS §7).
 */
export function deriveReviewItems(overview: GraphOverview): ReviewItem[] {
  const impact = deriveDemoImpact(overview);
  return impact.affected.map((item: AffectedItem) => ({
    id: item.id,
    kind: item.kind,
    reviewKind: item.reviewKind,
    text: item.text,
    viaPublicationId: item.viaPublicationId,
    viaCitationUseId: item.viaCitationUseId,
    viaClaimId: item.viaClaimId,
    flagEdge:
      item.kind === 'claim' && item.viaCitationUseId
        ? findEdge(overview, 'CITATION_USE_SUPPORTS_CLAIM', item.viaCitationUseId, item.id)
        : item.kind === 'conclusion' && item.viaClaimId
          ? findEdge(overview, 'CONCLUSION_DEPENDS_ON_CLAIM', item.id, item.viaClaimId)
          : undefined,
    reviewed: REVIEWED_NODE_STATES.has(nodeStatus(overview, item.id) ?? ''),
  }));
}

/**
 * Review Queue — risk-prioritized human review cases, derived client-side
 * from the real graph overview (limit 200). A flag means “needs human
 * review”, never truth or falsity (§7). Decision recording is not wired in
 * this build: the affordances below are disabled and labelled as such —
 * nothing is simulated, no case counts or decisions are invented.
 */
export default function ReviewQueuePage() {
  const [state, setState] = useState<QueueLoad>({ phase: 'loading' });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ phase: 'loading' });

    getGraphOverview({ limit: 200 }, { signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.available) {
          const impact = deriveDemoImpact(outcome.data);
          setState({ phase: 'ready', overview: outcome.data, impact });
        } else {
          setState({ phase: 'missing', reason: outcome.reason });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiTimeoutError) {
          setState({ phase: 'failure', message: 'The API did not answer within 10 seconds (timeout).' });
        } else if (error instanceof ApiNetworkError) {
          setState({ phase: 'failure', message: 'API unavailable — network error, nothing could be read.' });
        } else if (error instanceof ApiHttpError) {
          setState({ phase: 'failure', message: `API returned HTTP ${error.status}.` });
        } else if (error instanceof ApiClientError) {
          setState({ phase: 'failure', message: error.message });
        } else {
          setState({ phase: 'failure', message: 'Unexpected failure while reading the graph.' });
        }
      });
  }, []);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const items = state.phase === 'ready' ? deriveReviewItems(state.overview) : [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">Review Queue</h1>
        {state.phase === 'ready' && (
          <p className="text-xs text-ink-muted" data-testid="review-queue-counts">
            {state.overview.seedVersion ? `seed ${state.overview.seedVersion} · ` : ''}
            {items.length} flagged for review in the returned records · {state.impact.nodeCount} nodes ·{' '}
            {state.impact.edgeCount} connections returned
          </p>
        )}
      </div>

      {state.phase === 'loading' && (
        <p className="mt-6 text-sm text-ink-muted" role="status" data-testid="review-loading">
          Reading flagged items from the graph…
        </p>
      )}

      {state.phase === 'missing' && (
        <section
          aria-labelledby="review-missing-heading"
          className="mt-6 rounded-lg border border-ink-border bg-paper-raised p-6"
          data-testid="review-missing"
        >
          <h2 id="review-missing-heading" className="text-lg font-semibold text-ink">
            Review queue not available yet
          </h2>
          <p className="mt-2 max-w-prose text-base text-ink-muted">
            {state.reason === 'not-implemented'
              ? 'The graph-records endpoint reports “not implemented” on this build.'
              : 'No graph-records endpoint answered (function missing — HTTP 404 or an HTML page fallback).'}{' '}
            Either the demo graph is not seeded yet in this environment, or the query
            endpoints are not wired to the graph backend yet. Review items are derived
            only from real flagged records, so none are shown until the API answers.
          </p>
        </section>
      )}

      {state.phase === 'failure' && (
        <section
          aria-labelledby="review-failure-heading"
          className="mt-6 rounded-lg border border-notice-border bg-notice-surface p-6"
          data-testid="review-failure"
        >
          <h2 id="review-failure-heading" className="text-lg font-semibold text-notice-text">
            Review queue unavailable
          </h2>
          <p className="mt-2 text-base text-ink" data-testid="review-failure-detail">
            {state.message} Nothing is simulated in place of the real data.
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

      {state.phase === 'ready' && (
        <div className="mt-6 space-y-6">
          <p
            role="note"
            data-testid="review-attribution"
            className="rounded-lg border border-uncertain-border bg-uncertain-surface px-4 py-3 text-base text-uncertain-text"
          >
            A review flag means <strong>evidence review is needed</strong> — never a verdict
            of truth or falsity. No human review decisions exist in the returned graph yet
            (seeded records carry reviewState “unreviewed”); sage “reviewed” styling appears
            only once a real human decision is recorded, and this page never pre-marks
            anything as reviewed.
          </p>

          <section aria-labelledby="review-flagged-heading" className="rounded-lg border border-ink-border bg-paper-raised p-6">
            <h2 id="review-flagged-heading" className="text-lg font-semibold text-ink">
              Flagged for review ({items.length})
            </h2>
            {items.length === 0 ? (
              <p className="mt-2 max-w-prose text-base text-ink-muted" data-testid="review-queue-empty">
                Nothing in the returned graph is flagged for review — as far as the returned
                records show, no passage needs review. “No flag” never implies scientific
                reliability or complete notice coverage.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {items.map((item) => (
                  <li
                    key={item.id}
                    data-testid={`review-item-${item.id}`}
                    data-review-state={item.reviewed ? 'reviewed' : 'needs-review'}
                    className={
                      item.reviewed
                        ? 'rounded border border-reviewed bg-reviewed-surface p-4 text-base'
                        : 'rounded border border-review-border bg-review-surface p-4 text-base'
                    }
                  >
                    <p className={`font-medium ${item.reviewed ? 'text-reviewed-text' : 'text-review-text'}`}>
                      {item.kind === 'claim' ? 'Claim' : 'Conclusion'} “{item.id}” —{' '}
                      {item.reviewKind === 'direct_evidence_review'
                        ? 'direct evidence review (supporting role)'
                        : 'indirect evidence review (depends on a flagged claim)'}
                    </p>
                    {item.text && <p className="mt-1 text-ink">“{item.text}”</p>}

                    <div className="mt-2 text-xs text-ink-muted" data-testid={`review-item-${item.id}-why`}>
                      <p>
                        Why flagged:{' '}
                        {item.reviewKind === 'direct_evidence_review' ? (
                          <>
                            its supporting citation use{' '}
                            <span className="break-all font-mono">{item.viaCitationUseId}</span> cites
                            publication <span className="break-all font-mono">{item.viaPublicationId}</span>,
                            which carries a verified source notice in the returned graph.
                          </>
                        ) : (
                          <>
                            it depends on flagged claim{' '}
                            <span className="break-all font-mono">{item.viaClaimId}</span> via
                            CONCLUSION_DEPENDS_ON_CLAIM — inherited evidence-review obligation,
                            never automatic falsity.
                          </>
                        )}
                      </p>
                      {item.flagEdge && (
                        <p className="mt-1">
                          Flag edge <span className="font-mono">{item.flagEdge.type}</span> · provenance{' '}
                          {item.flagEdge.provenanceKind ?? 'not recorded'} · reviewState{' '}
                          {item.flagEdge.reviewState ?? 'not recorded'}
                          {item.flagEdge.sourcePointer && (
                            <>
                              {' · source '}
                              <span className="break-all font-mono">{item.flagEdge.sourcePointer}</span>
                            </>
                          )}
                          {item.flagEdge.rationale
                            ? ` — rationale: ${item.flagEdge.rationale}`
                            : ' — no rationale text was recorded on the returned edge.'}
                        </p>
                      )}
                    </div>

                    {/* Honest decision affordance: visible, disabled, truthful. */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-border pt-3">
                      <button
                        type="button"
                        disabled
                        title="Decision recording is not wired in this build — nothing is saved or sent."
                        data-testid={`review-decide-${item.id}`}
                        className="cursor-not-allowed rounded border border-ink-border bg-paper px-3 py-1.5 text-sm text-ink-muted opacity-60"
                      >
                        Record decision
                      </button>
                      <span className="text-xs text-ink-muted">
                        Decision actions arrive with the review backend — not available yet; this
                        build records nothing.
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="review-unresolved-heading" className="rounded-lg border border-ink-border bg-paper-raised p-6">
            <h2 id="review-unresolved-heading" className="text-lg font-semibold text-ink">
              Unresolved references — not review cases ({state.impact.unresolved.length})
            </h2>
            {state.impact.unresolved.length === 0 ? (
              <p className="mt-2 max-w-prose text-base text-ink-muted">
                No unresolved reference occurrences were returned.
              </p>
            ) : (
              <p className="mt-2 max-w-prose text-sm text-ink-muted">
                These are ambiguous “possible matches” awaiting human resolution. They are
                deliberately kept out of the flagged list above: candidate edges never
                propagate into claim impact, and ambiguity is not a flag.
              </p>
            )}
            <ul className="mt-3 space-y-3">
              {state.impact.unresolved.map((item) => (
                <li
                  key={item.id}
                  data-testid={`review-unresolved-${item.id}`}
                  data-review-state="unresolved"
                  className="rounded border border-uncertain-border bg-uncertain-surface p-3 text-base"
                >
                  <p className="font-medium text-uncertain-text">
                    “{item.text ?? item.id}” — unresolved ({item.resolutionState ?? 'state not recorded'})
                  </p>
                  <p className="mt-1 text-xs text-ink">
                    {item.candidateIds.length} possible candidate
                    {item.candidateIds.length === 1 ? '' : 's'} — unverified
                    {item.onlyPossibleMatches ? ', connected only by POSSIBLE_MATCH edges' : ''}
                    {item.candidateIds.length > 0 ? `: ${item.candidateIds.join(', ')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-sm text-ink-muted">
            Counts describe exactly the returned window (limit 200), not the whole graph.
            This queue lists flagged passages derived from the graph — human review cases
            (ReviewDecision records) do not exist in this build, and none are invented here.{' '}
            <Link to="/results" className="text-brand-deep underline">
              See the full guided results
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
