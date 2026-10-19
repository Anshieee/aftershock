import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  getActivity,
  getGraphOverview,
  type ActivityEvent,
  type GraphEdge,
  type GraphOverview,
  type ReviewDecisionResult,
  type ReviewOutcome,
} from '../lib/api';
import { deriveDemoImpact, type AffectedItem, type DemoImpact } from '../lib/demoImpact';
import ReviewDecisionDialog from '../components/ReviewDecisionDialog';
import RevisionProposalPanel from '../components/RevisionProposalPanel';
import FindEvidencePanel from '../components/FindEvidencePanel';
import IndependencePanel from '../components/IndependencePanel';

type QueueLoad =
  | { phase: 'loading' }
  | { phase: 'ready'; overview: GraphOverview; impact: DemoImpact }
  | { phase: 'missing'; reason: 'endpoint-missing' | 'not-implemented' }
  | { phase: 'failure'; message: string };

type HistoryLoad =
  | { phase: 'idle' } // history loads once the queue itself is ready
  | { phase: 'loading' }
  | { phase: 'ready'; events: ActivityEvent[] }
  | { phase: 'missing'; reason: 'endpoint-missing' | 'not-implemented' }
  | { phase: 'failure'; message: string };

export interface ReviewItem {
  id: string;
  kind: 'claim' | 'conclusion';
  reviewKind: 'direct_evidence_review' | 'indirect_evidence_review';
  text?: string;
  viaPublicationId: string;
  viaCitationUseId?: string;
  viaClaimId?: string;
  flagEdge?: GraphEdge;
  /** Server-truth: the returned record itself carries a recorded review state. */
  reviewed: boolean;
  /** Server-recorded case review state, when the returned payload carries one. */
  reviewState?: string;
  /** Follow-up flags returned with the record (e.g. revision_pending / further_investigation). */
  serverFlags: string[];
}

/**
 * Genuinely recorded review states — the ONLY source of the sage “reviewed”
 * presentation. The server exposes them as the node's reviewState property
 * (M5 state machine: awaiting_review → review_recorded; terminal resolved)
 * or on the legacy status property the fixture/seeders carry. A flag alone
 * never marks anything reviewed — and never implies validation.
 */
const REVIEWED_NODE_STATES = new Set(['review_recorded', 'resolved']);

function nodePropertyValue(overview: GraphOverview, id: string, key: string): string | undefined {
  const node = overview.nodes.find((candidate) => candidate.id === id);
  const value = node?.properties[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function nodePropertyFlags(overview: GraphOverview, id: string, key: string): string[] {
  const node = overview.nodes.find((candidate) => candidate.id === id);
  const value = node?.properties[key];
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((entry): entry is string => typeof entry === 'string')));
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

export function deriveReviewItems(overview: GraphOverview): ReviewItem[] {
  const impact = deriveDemoImpact(overview);
  return impact.affected.map((item: AffectedItem) => {
    // Server-state-first (presentation only — no derivation logic changes):
    // both the legacy `status` property and the M5 `reviewState`/`reviewFlags`
    // properties are read straight from the returned node record. Production
    // writes the M5 case state into `reviewState`, older seeds carry `status`.
    const statusValue = nodePropertyValue(overview, item.id, 'status');
    const reviewState = nodePropertyValue(overview, item.id, 'reviewState');
    const serverFlags = nodePropertyFlags(overview, item.id, 'reviewFlags');
    const reviewed =
      REVIEWED_NODE_STATES.has(statusValue ?? '') || REVIEWED_NODE_STATES.has(reviewState ?? '');
    return {
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
      reviewed,
      reviewState,
      serverFlags,
    };
  });
}

/**
 * Follow-up flags per recorded outcome — mirrors the server state machine
 * (contract §4: revision_needed→revision_pending,
 * more_evidence_needed→further_investigation, not_affected/evidence_updated
 * → review_recorded without flags). Used ONLY to label the item until the
 * refreshed server state arrives; the server response (afterState.flags)
 * takes precedence when it parses.
 */
const SESSION_FOLLOWUP: Record<ReviewOutcome, string[]> = {
  revision_needed: ['revision_pending'],
  more_evidence_needed: ['further_investigation'],
  not_affected: [],
  evidence_updated: [],
};

function returnedFlagsOf(decision: ReviewDecisionResult): string[] {
  // The real server returns beforeState/afterState as JSON strings. Parse
  // defensively: only well-formed string arrays of flags are trusted.
  try {
    const parsed: unknown = JSON.parse(decision.afterState);
    const flags = (parsed as { flags?: unknown } | null)?.flags;
    if (Array.isArray(flags)) {
      return flags.filter((flag): flag is string => typeof flag === 'string');
    }
  } catch {
    // Non-JSON afterState — fall through to the documented contract mapping.
  }
  return SESSION_FOLLOWUP[decision.outcome];
}

function formatEventTimestamp(timestamp: string): string {
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return timestamp || 'Time not recorded';
  return new Date(ms).toLocaleString();
}

function idChip(label: string, value: string | undefined, testId: string): ReactNode {
  if (!value) return null;
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1 rounded border border-ink-border bg-paper px-1.5 py-0.5 text-xs"
    >
      <span className="text-ink-muted">{label}</span>
      <span className="break-all font-mono text-ink">{value}</span>
    </span>
  );
}

function describeApiFailure(error: unknown, noun: string): string {
  if (error instanceof ApiTimeoutError) {
    return `The ${noun} did not answer within 10 seconds (timeout).`;
  }
  if (error instanceof ApiNetworkError) {
    return `${noun} unavailable — network error, nothing could be read.`;
  }
  if (error instanceof ApiHttpError) {
    return `${noun} returned HTTP ${error.status}.`;
  }
  if (error instanceof ApiClientError) return error.message;
  return `Unexpected failure while reading the ${noun}.`;
}

export default function ReviewQueuePage() {
  const [searchParams] = useSearchParams();
  /**
   * M7 wave-2 — `?case=<caseId>` deep-link (arrives from the reader and other
   * surfaces). When present, the matching queue card is scrolled into view and
   * briefly highlighted (focus-ring + a "Requested case" text label — never a
   * color-only cue). When the requested id is absent from the returned queue,
   * an honest note says so and nothing is fabricated.
   */
  const requestedCaseId = searchParams.get('case');
  const [state, setState] = useState<QueueLoad>({ phase: 'loading' });
  const controllerRef = useRef<AbortController | null>(null);
  /** Human decisions recorded this session, keyed by case/item id. */
  const [decisions, setDecisions] = useState<Record<string, ReviewDecisionResult>>({});
  const [openDialogId, setOpenDialogId] = useState<string | null>(null);
  const [openRevisionId, setOpenRevisionId] = useState<string | null>(null);
  /** P4 — the case whose "Find evidence" panel is open (read-only search; never mutates the case). */
  const [openEvidenceId, setOpenEvidenceId] = useState<string | null>(null);
  /** Whether the requested-case highlight window is active (one apply per param value). */
  const [caseHighlightActive, setCaseHighlightActive] = useState(false);
  const requestAnchorRef = useRef<HTMLLIElement | null>(null);
  const requestAppliedRef = useRef<string | null>(null);
  /** Highlight-window timer — armed once, cleared only on unmount (effect
   * re-runs must not cancel a pending window). */
  const highlightTimerRef = useRef<number | null>(null);

  /** Background server-state refresh — never wipes dialogs or selection. */
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const refreshRef = useRef<AbortController | null>(null);

  /** Real audit feed (GET /activity), read then refetched after decisions. */
  const [history, setHistory] = useState<HistoryLoad>({ phase: 'idle' });
  const [historyRefreshFailed, setHistoryRefreshFailed] = useState(false);
  const historyRef = useRef<AbortController | null>(null);
  const historyFiredRef = useRef(false);

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
        setState({ phase: 'failure', message: describeApiFailure(error, 'graph API') });
      });
  }, []);

  /**
   * Background refetch of the server graph state. Replaces ONLY the ready
   * payload — dialogs, recorded decisions and open panels survive untouched.
   * The returned record (reviewState/reviewFlags/status properties), not any
   * local guess, feeds the next render.
   */
  const refreshOverview = useCallback(() => {
    refreshRef.current?.abort();
    const controller = new AbortController();
    refreshRef.current = controller;
    setRefreshing(true);
    getGraphOverview({ limit: 200 }, { signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        setRefreshing(false);
        if (outcome.available) {
          setState((prev) =>
            prev.phase === 'ready'
              ? { phase: 'ready', overview: outcome.data, impact: deriveDemoImpact(outcome.data) }
              : prev,
          );
          setRefreshedAt(new Date().toLocaleTimeString());
          setRefreshFailed(false);
        } else {
          // Server no longer answers with records; keep the last good read
          // honestly and say so — never show the panel as if refreshed.
          setRefreshFailed(true);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRefreshing(false);
        setRefreshFailed(true);
      });
  }, []);

  const loadHistory = useCallback(() => {
    historyRef.current?.abort();
    const controller = new AbortController();
    historyRef.current = controller;
    setHistory((prev) => (prev.phase === 'ready' ? prev : { phase: 'loading' }));

    getActivity({ signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.available) {
          setHistory({ phase: 'ready', events: outcome.data });
          setHistoryRefreshFailed(false);
        } else {
          // Refetch over an already-displayed feed: keep the last successful
          // read honestly and mark the staleness — never paper it over.
          setHistory((prev) =>
            prev.phase === 'ready' ? prev : { phase: 'missing', reason: outcome.reason },
          );
          setHistoryRefreshFailed(true);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = describeApiFailure(error, 'activity feed');
        setHistory((prev) => (prev.phase === 'ready' ? prev : { phase: 'failure', message }));
        setHistoryRefreshFailed(true);
      });
  }, []);

  useEffect(() => {
    load();
    return () => {
      controllerRef.current?.abort();
      refreshRef.current?.abort();
      historyRef.current?.abort();
    };
  }, [load]);

  // The audit feed loads once the queue is ready (and after decisions below).
  useEffect(() => {
    if (state.phase === 'ready' && !historyFiredRef.current) {
      historyFiredRef.current = true;
      loadHistory();
    }
  }, [state.phase, loadHistory]);

  const items = state.phase === 'ready' ? deriveReviewItems(state.overview) : [];

  /**
   * `?case=<caseId>` — once the queue is ready and the requested case is
   * actually present in the returned queue, scroll its card into view
   * (reduced motion scrolls with `behavior: 'auto'`) and run a brief
   * highlight window. Applied once per param value; the never-fabricated
   * "Requested case" label itself stays while the param names this card.
   */
  useEffect(() => {
    if (state.phase !== 'ready' || !requestedCaseId) return;
    const present = items.some((item) => item.id === requestedCaseId);
    if (!present) return;
    if (requestAppliedRef.current === requestedCaseId) return;
    requestAppliedRef.current = requestedCaseId;
    const element = requestAnchorRef.current;
    if (!element) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // jsdom does not implement scrollIntoView — the highlight still applies;
    // the real browser scrolls here.
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
    setCaseHighlightActive(true);
    highlightTimerRef.current = window.setTimeout(
      () => setCaseHighlightActive(false),
      reduceMotion ? 1200 : 2000,
    );
  }, [state.phase, requestedCaseId, items]);

  // The highlight timer is armed once per requested id; only unmount cancels it.
  useEffect(
    () => () => {
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  function itemReview(item: ReviewItem) {
    const decision = decisions[item.id];
    const sessionFlags = decision ? returnedFlagsOf(decision) : [];
    const pendingFlags = Array.from(new Set([...item.serverFlags, ...sessionFlags]));
    return {
      decision,
      /** A decision was genuinely recorded server-side this session… */
      decisionRecorded: Boolean(decision),
      /** …and sage styling ALSO follows the refreshed server record alone. */
      reviewed: item.reviewed || Boolean(decision),
      revisionPending: pendingFlags.includes('revision_pending'),
      investigationPending: pendingFlags.includes('further_investigation'),
    };
  }

  function handleDecisionRecorded(item: ReviewItem, decision: ReviewDecisionResult) {
    setDecisions((prev) => ({ ...prev, [item.id]: decision }));
    // Cache-busted refetches after a real decision: server graph state + the
    // real /activity audit feed. Background only — no dialog is disturbed.
    refreshOverview();
    historyFiredRef.current = true;
    loadHistory();
  }

  const historyCount =
    history.phase === 'ready' ? history.events.filter((event) => event.type === 'review_decision').length : null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Evidence review workspace
          </p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-ink">Review Queue</h1>
        </div>
        {state.phase === 'ready' && (
          <div className="flex flex-col items-end gap-1">
            <p className="text-xs text-ink-muted" data-testid="review-queue-counts">
              {state.overview.seedVersion ? `seed ${state.overview.seedVersion} · ` : ''}
              {items.length} flagged for review in the returned records · {state.impact.nodeCount} nodes ·{' '}
              {state.impact.edgeCount} connections returned
            </p>
            {(refreshing || refreshedAt || refreshFailed) && (
              <p className="text-xs text-ink-muted" data-testid="review-queue-refresh-note">
                {refreshing
                  ? 'Refreshing server state…'
                  : refreshFailed
                    ? 'Background refresh failed — showing the last successful server read; decisions recorded this session still stand.'
                    : `Server state refreshed at ${refreshedAt}.`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* W4 — read-only independence groups: informs review, never flips a state. */}
      <IndependencePanel />

      {state.phase === 'loading' && (
        <p className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-6 text-sm text-ink-muted" role="status" data-testid="review-loading">
          Reading flagged items from the graph…
        </p>
      )}

      {state.phase === 'missing' && (
        <section
          aria-labelledby="review-missing-heading"
          className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-6"
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
          className="mt-6 rounded-xl border border-notice-border bg-notice-surface p-6"
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
              className="rounded-lg border border-ink-border bg-paper px-4 py-2 text-sm text-ink hover:bg-paper-deep"
            >
              Retry
            </button>
            <Link to="/" className="rounded-lg px-4 py-2 text-sm text-ink-muted no-underline hover:text-ink">
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
            className="rounded-xl border border-uncertain-border bg-uncertain-surface px-4 py-3 text-base text-uncertain-text"
          >
            A review flag means <strong>evidence review is needed</strong> — never a verdict
            of truth or falsity. Sage “reviewed” styling appears only when the returned
            record carries a recorded review state (the M5 case states, e.g.
            review_recorded) or a human decision recorded through the decision dialog in
            this session — it is never pre-applied, and a decision is human judgement,
            not scientific validation of the claim. When the outcome is “revision
            needed”, sage “reviewed” and an amber “Revision pending” badge show together
            until a human accepts the revision; “more evidence needed” shows “Further
            investigation pending”. A decision recorded on a flagged claim never
            automatically clears an inherited concern on a dependent conclusion.
          </p>

          {requestedCaseId && !items.some((item) => item.id === requestedCaseId) && (
            <p
              role="note"
              data-testid="queue-case-missing"
              className="rounded-xl border border-uncertain-border bg-paper-raised px-4 py-3 text-base text-ink"
            >
              Case <span className="break-all font-mono">{requestedCaseId}</span> is not in the
              currently returned review queue (it may have no flag, or the request may be stale).
            </p>
          )}

          <section aria-labelledby="review-flagged-heading" className="rounded-xl border border-ink-border bg-paper-raised p-6">
            <h2 id="review-flagged-heading" className="text-lg font-semibold text-ink">
              Flagged for review ({items.length})
            </h2>
            {items.length === 0 ? (
              <p className="mt-2 max-w-prose text-base text-ink-muted" data-testid="review-queue-empty">
                Nothing in the returned graph is flagged for review — as far as the returned
                records show, nothing needs review here. There is nothing to review in the
                returned records right now. “No flag” never implies scientific
                reliability or complete notice coverage.
              </p>
            ) : (
              <ul className="mt-3 space-y-4">
                {items.map((item) => {
                  const { decision, decisionRecorded, reviewed, revisionPending, investigationPending } =
                    itemReview(item);
                  const isRequested = requestedCaseId === item.id;
                  return (
                    <li
                      key={item.id}
                      ref={isRequested ? requestAnchorRef : undefined}
                      data-testid={`review-item-${item.id}`}
                      data-review-state={reviewed ? 'reviewed' : 'needs-review'}
                      className={
                        (reviewed
                          ? 'rounded-xl border border-reviewed bg-reviewed-surface p-4 text-base text-reviewed-text'
                          : 'rounded-xl border border-review-border bg-review-surface p-4 text-base') +
                        (isRequested && caseHighlightActive
                          ? ' ring-2 ring-brand-surface ring-offset-2 ring-offset-paper'
                          : '')
                      }
                    >
                      <header className="flex flex-wrap items-baseline justify-between gap-2">
                        <p
                          className={
                            reviewed ? 'font-medium text-reviewed-text' : 'font-medium text-review-text'
                          }
                        >
                          {item.kind === 'claim' ? 'Claim' : 'Conclusion'}{' '}
                          <span className="break-all font-mono">{item.id}</span> —{' '}
                          {item.reviewKind === 'direct_evidence_review'
                            ? 'direct evidence review (supporting role)'
                            : 'indirect evidence review (depends on a flagged claim)'}
                        </p>
                        <span
                          className={
                            reviewed
                              ? 'inline-flex shrink-0 items-center rounded border border-reviewed bg-reviewed-surface px-2 py-0.5 text-xs font-medium text-reviewed-text'
                              : 'inline-flex shrink-0 items-center rounded border border-review-border bg-review-surface px-2 py-0.5 text-xs font-medium text-review-text'
                          }
                        >
                          {reviewed ? 'Review recorded' : 'Needs review'}
                        </span>
                        {isRequested && (
                          <span
                            data-testid="queue-case-anchor"
                            className="inline-flex shrink-0 items-center rounded border border-brand bg-brand-surface px-2 py-0.5 text-xs font-medium text-brand-deep"
                          >
                            Requested case
                          </span>
                        )}
                        {decisionRecorded && !item.reviewed && (
                          <p className="w-full text-xs text-ink-muted" data-testid={`review-item-${item.id}-server-note`}>
                            After the server refresh, the returned record does not yet carry a recorded
                            review state for this case; the decision shown below is kept from this
                            session and is visible in the audit feed. Persistence on the free-tier
                            graph is best-effort.
                          </p>
                        )}
                        {reviewed && revisionPending && (
                          <span
                            className="inline-flex shrink-0 items-center rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text"
                            data-testid={`review-item-${item.id}-revision-pending`}
                          >
                            Revision pending
                          </span>
                        )}
                        {reviewed && investigationPending && (
                          <span
                            className="inline-flex shrink-0 items-center rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text"
                            data-testid={`review-item-${item.id}-investigation-pending`}
                          >
                            Further investigation pending
                          </span>
                        )}
                      </header>

                      {item.text && (
                        <blockquote className="mt-2 border-l-2 border-ink-border pl-3 text-ink">
                          “{item.text}”
                        </blockquote>
                      )}

                      <div
                        className="mt-3 text-xs text-ink-muted"
                        data-testid={`review-item-${item.id}-why`}
                      >
                        <p className="font-medium text-ink">Why flagged</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {item.reviewKind === 'direct_evidence_review'
                            ? idChip('supporting citation use', item.viaCitationUseId, `review-item-${item.id}-chip-citation-use`)
                            : idChip('depends on claim', item.viaClaimId, `review-item-${item.id}-chip-claim`)}
                          {idChip('publication with verified notice', item.viaPublicationId, `review-item-${item.id}-chip-publication`)}
                        </div>
                        <p className="mt-2">
                          {item.reviewKind === 'direct_evidence_review' ? (
                            <>
                              its supporting citation use <span className="break-all font-mono">{item.viaCitationUseId}</span> cites
                              publication <span className="break-all font-mono">{item.viaPublicationId}</span>,
                              which carries a verified source notice in the returned graph.
                            </>
                          ) : (
                            <>
                              it depends on flagged claim <span className="break-all font-mono">{item.viaClaimId}</span> via
                              CONCLUSION_DEPENDS_ON_CLAIM — inherited evidence-review obligation,
                              never automatic falsity.
                            </>
                          )}
                        </p>
                        {item.flagEdge && (
                          <footer className="mt-2 border-t border-ink-border pt-2">
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
                          </footer>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <Link
                            to="/graph"
                            className="text-brand-deep underline hover:text-brand"
                            data-testid={`review-item-${item.id}-inspect`}
                          >
                            Inspect evidence path in the graph
                          </Link>
                          <Link
                            to="/results"
                            className="text-brand-deep underline hover:text-brand"
                            data-testid={`review-item-${item.id}-results`}
                          >
                            See this in the guided results
                          </Link>
                        </div>
                      </div>

                      {/* Decision affordance — wired to the real review-decide API. */}
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-border pt-3">
                        <button
                          type="button"
                          onClick={() => setOpenDialogId(item.id)}
                          data-testid={`review-decide-${item.id}`}
                          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-deep"
                        >
                          {decisionRecorded ? 'Record another decision' : 'Record decision'}
                        </button>
                        {/* P4 Find-Evidence affordance — an honest read-only
                            external-metadata search for this case. It opens a
                            dialog and performs NO write of any kind; case
                            state below only ever derives from the server. */}
                        <button
                          type="button"
                          onClick={() => setOpenEvidenceId(item.id)}
                          data-testid={`find-evidence-${item.id}`}
                          aria-label={`Find evidence for ${item.id}`}
                          className="rounded-lg border border-ink-border bg-paper px-3 py-1.5 text-sm text-ink hover:bg-paper-deep"
                        >
                          Find evidence
                        </button>
                        {decision && (
                            <p
                              className="text-xs text-ink-muted"
                              data-testid={`review-item-${item.id}-decision`}
                            >
                              Decision recorded: {decision.outcome}{' · '}
                              {decision.decidedAt}{decision.reviewer ? ` by ${decision.reviewer}` : ''}.
                              The full server response is in the decision dialog and the audit feed.
                            </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpenRevisionId(item.id)}
                          data-testid={`review-revise-${item.id}`}
                          disabled={!reviewed}
                          className={
                            'rounded-lg border border-ink-border bg-paper px-3 py-1.5 text-sm text-ink hover:bg-paper-deep disabled:opacity-60 disabled:cursor-not-allowed'
                          }
                        >
                          {openRevisionId === item.id ? 'Hide proposal' : 'Propose revision'}
                        </button>
                      </div>

                      {openDialogId === item.id && (
                        <ReviewDecisionDialog
                          item={item}
                          open
                          alreadyRecorded={Boolean(decision)}
                          onClose={() => setOpenDialogId(null)}
                          onDecisionRecorded={(decided) => handleDecisionRecorded(item, decided)}
                        />
                      )}
                      {openRevisionId === item.id && (
                        <RevisionProposalPanel
                          caseId={item.id}
                          originalText={item.text ?? ''}
                          kindLabel={item.kind === 'claim' ? 'claim' : 'conclusion'}
                          onAccepted={() => {
                            // Acceptance is user-reported, not scientific validation.
                            setOpenRevisionId(null);
                          }}
                        />
                      )}
                      {openEvidenceId === item.id && (
                        <FindEvidencePanel
                          claimId={item.id}
                          open
                          onClose={() => setOpenEvidenceId(null)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="review-history-heading"
            className="rounded-xl border border-ink-border bg-paper-raised p-6"
            data-testid="review-history"
          >
            <h2 id="review-history-heading" className="text-lg font-semibold text-ink">
              Review history ({historyCount ?? '—'})
            </h2>
            <p className="mt-1 max-w-prose text-sm text-ink-muted" data-testid="review-history-scope">
              Read live from the real /activity feed, filtered to review_decision events —
              actor, outcome, time, rationale, and state transition exactly as recorded.
              These events describe cases in the synthetic guided-demo graph (records
              marked FICTIONAL / GUIDED DEMO); persistence on the free-tier graph is
              best-effort and nothing here is invented or cached.
            </p>

            {(history.phase === 'idle' || history.phase === 'loading') && (
              <p className="mt-3 text-sm text-ink-muted" role="status" data-testid="review-history-loading">
                Reading review history from the real activity feed…
              </p>
            )}

            {history.phase === 'missing' && (
              <p className="mt-3 max-w-prose text-sm text-ink-muted" data-testid="review-history-missing">
                {history.reason === 'not-implemented'
                  ? 'The activity endpoint reports “not implemented” on this build.'
                  : 'No activity endpoint answered (function missing — HTTP 404 or an HTML page fallback).'}{' '}
                No review history can be shown until the real feed answers.
              </p>
            )}

            {history.phase === 'failure' && (
              <div className="mt-3" data-testid="review-history-failure">
                <p className="max-w-prose text-sm text-notice-text" data-testid="review-history-detail">
                  {history.message} No review events are simulated in its place.
                </p>
                <button
                  type="button"
                  onClick={loadHistory}
                  data-testid="review-history-retry"
                  className="mt-2 rounded-lg border border-ink-border bg-paper px-3 py-1.5 text-sm text-ink hover:bg-paper-deep"
                >
                  Retry history
                </button>
              </div>
            )}

            {history.phase === 'ready' && historyRefreshFailed && (
              <div className="mt-3 rounded-lg border border-notice-border bg-notice-surface px-3 py-2 text-xs text-notice-text">
                <p data-testid="review-history-refresh-failed">
                  The audit refetch did not complete — the entries shown here are from
                  the last successful read of the feed, not live data.
                </p>
                <button
                  type="button"
                  onClick={loadHistory}
                  data-testid="review-history-retry"
                  className="mt-2 inline rounded-lg border border-notice-border bg-notice-surface px-2 py-1 text-xs font-medium text-notice-text hover:bg-notice-border"
                >
                  Retry history
                </button>
              </div>
            )}

            {history.phase === 'ready' && historyCount === 0 && (
              <p className="mt-3 max-w-prose text-sm text-ink-muted" data-testid="review-history-empty">
                No review decisions have been recorded yet — when someone records one
                through the decision dialog, it appears here, straight from the activity
                feed.
              </p>
            )}

            {history.phase === 'ready' && historyCount !== null && historyCount > 0 && (
              <div className="mt-3 space-y-3">
                {history.events
                  .filter((event) => event.type === 'review_decision')
                  .map((event) => (
                    <div
                      key={event.id}
                      data-testid={`review-history-entry-${event.id}`}
                      className="rounded-xl border border-reviewed bg-paper p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium text-ink" data-testid={`review-history-entry-${event.id}-action`}>
                          Outcome recorded: <span className="break-all font-mono">{event.action}</span>
                        </p>
                        <p className="text-xs text-ink-muted" data-testid={`review-history-entry-${event.id}-timestamp`}>
                          {formatEventTimestamp(event.timestamp)}
                        </p>
                      </div>
                      <p className="mt-1 text-ink" data-testid={`review-history-entry-${event.id}-actor`}>
                        Recorded by {event.actor ?? 'actor not recorded in the returned event'} — a human
                        decision, not scientific validation.
                      </p>
                      {event.description && (
                        <p
                          className="mt-1 text-ink-muted"
                          data-testid={`review-history-entry-${event.id}-description`}
                        >
                          {event.description}
                        </p>
                      )}
                      {(event.beforeState || event.afterState) && (
                        <p className="mt-2 text-xs text-ink-muted">
                          <span data-testid={`review-history-entry-${event.id}-before`}>
                            Before: {event.beforeState ?? 'not recorded in this event'}
                          </span>
                          {' → '}
                          <span data-testid={`review-history-entry-${event.id}-after`}>
                            After: {event.afterState ?? 'not recorded in this event'}
                          </span>
                        </p>
                      )}
                      {event.isSynthetic && (
                        <p
                          className="mt-2 inline-flex items-center rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text"
                          data-testid={`review-history-entry-${event.id}-synthetic`}
                        >
                          {event.syntheticLabel ?? 'FICTIONAL / GUIDED DEMO'}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section
            aria-labelledby="review-unresolved-heading"
            className="rounded-xl border border-uncertain-border bg-uncertain-surface p-6"
          >
            <h2 id="review-unresolved-heading" className="text-lg font-semibold text-uncertain-text">
              Possible publication matches — not review cases ({state.impact.unresolved.length})
            </h2>
            {state.impact.unresolved.length === 0 ? (
              <p className="mt-2 max-w-prose text-base text-uncertain-text">
                No unresolved reference occurrences were returned.
              </p>
            ) : (
              <p className="mt-2 max-w-prose text-sm text-uncertain-text">
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
                  className="rounded-xl border border-uncertain-border bg-paper-raised p-3 text-base"
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
            Flagged items link back to their evidence path in the graph and to the guided
            results above. Human decisions are recorded through the real review API
            (ReviewDecision records) and the audit feed comes from the real /activity
            endpoint; the disposable free-tier graph persists them best-effort, and none
            are invented.{' '}
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
