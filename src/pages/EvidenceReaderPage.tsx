import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  DEMO_MANUSCRIPT_DOCUMENT_ID,
  getGraphOverview,
  getSeedStatus,
  type GraphNode,
  type GraphOverview,
} from '../lib/api';
import { deriveDemoImpact, orderRecordedEntries, type DemoImpact, type ReaderOrderedEntry } from '../lib/demoImpact';

/**
 * M7 Priority A — read-only Evidence Reader.
 *
 * Shows the guided-demo manuscript as an ordered reflow of the passage
 * records the graph actually returned (Claim / Conclusion / CitationUse /
 * ReferenceOccurrence). Hard rules honored:
 *
 * - The manuscript full text is NOT stored anywhere — everything shown is
 *   a passage record from the returned graph, labelled as such. Pages,
 *   sections and offsets render ONLY when the returned record carries
 *   them; records without usable location metadata are grouped last with
 *   an honest label and never assigned invented positions.
 * - Read-only: no state modification, no graph writes, no review actions.
 * - A flag means "evidence review needed" — never a verdict. The sage
 *   "review recorded" chip renders ONLY from a reviewed state the
 *   returned record itself carries. Historical mentions are excluded
 *   from flags by design (MENTIONS_HISTORICALLY), disclosed in place.
 * - Relation types are never conflated: supports / mentions historically
 *   / possible match are labeled exactly what the edges record.
 */

type ReaderLoad =
  | { phase: 'loading' }
  | { phase: 'ready'; overview: GraphOverview }
  | { phase: 'missing'; reason: 'endpoint-missing' | 'not-implemented' }
  | { phase: 'failure'; message: string };

interface SeedInfo {
  exists: boolean;
  seedVersion?: string;
  nodeCount?: number;
}

const PASSAGE_KINDS = new Set(['Claim', 'Conclusion', 'CitationUse', 'ReferenceOccurrence']);

/** Genuinely recorded review states — the ONLY source of sage styling. */
const REVIEWED_NODE_STATES = new Set(['review_recorded', 'resolved']);

interface PassageInfo {
  id: string;
  node: GraphNode;
  kindLabel: string;
  bodyText?: string;
  role?: string;
  resolutionState?: string;
  /** Direct review concern via a supporting citation use. */
  directFlag: boolean;
  /** Indirect review concern: this conclusion depends on a flagged claim. */
  indirectViaClaimId?: string;
  /** Recorded historical mention — never flag-styled. */
  historicalMention: boolean;
  unresolved: boolean;
  candidateIds: string[];
  reviewedState?: string;
}

function firstText(node: GraphNode, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = node.properties[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** Forms the per-passage recorded location line ("page 4 · 2.1 · offset 12"). */
function formatRecordedLocation(entry: ReaderOrderedEntry<PassageInfo>): string | undefined {
  if (!entry.located) return undefined;
  const pieces: string[] = [];
  if (typeof entry.page === 'number') pieces.push(`page ${entry.page}`);
  if (entry.section !== undefined) pieces.push(entry.section);
  if (typeof entry.offset === 'number') pieces.push(`offset ${entry.offset}`);
  if (pieces.length === 0 && entry.rawLocation) return entry.rawLocation;
  return pieces.length > 0 ? pieces.join(' · ') : undefined;
}

/** Derives reader passages + review semantics from the returned records. */
export function buildReaderPassages(overview: GraphOverview) {
  const impact = deriveDemoImpact(overview);
  const directById = new Map(impact.affected.filter((i) => i.reviewKind === 'direct_evidence_review').map((i) => [i.id, i]));
  const indirectById = new Map(impact.affected.filter((i) => i.reviewKind === 'indirect_evidence_review').map((i) => [i.id, i]));
  const historicalIds = new Set(impact.historical.map((i) => i.id));
  const unresolvedById = new Map(impact.unresolved.map((i) => [i.id, i]));

  const passages: PassageInfo[] = overview.nodes
    .filter((node) => PASSAGE_KINDS.has(node.kind))
    .map((node) => {
      const reviewStateValue = node.properties['reviewState'];
      const statusValue = node.properties['status'];
      const reviewedState =
        (typeof reviewStateValue === 'string' && reviewStateValue) ||
        (typeof statusValue === 'string' ? statusValue : undefined);
      const resolutionStateValue = node.properties['resolutionState'];
      const unresolvedRecord = unresolvedById.get(node.id);
      const kindLabels: Record<string, string> = {
        Claim: 'Claim',
        Conclusion: 'Conclusion',
        CitationUse: 'Citation use',
        ReferenceOccurrence: 'Reference occurrence',
      };
      // Per-kind recorded text key: Claim/Conclusion store `text`,
      // CitationUse stores `excerpt`, ReferenceOccurrence stores `rawText`.
      const textKeys: Record<string, string[]> = {
        Claim: ['text'],
        Conclusion: ['text'],
        CitationUse: ['excerpt'],
        ReferenceOccurrence: ['rawText'],
      };
      return {
        id: node.id,
        node,
        kindLabel: kindLabels[node.kind] ?? node.kind,
        bodyText: firstText(node, textKeys[node.kind] ?? ['text', 'excerpt', 'rawText']),
        role: firstText(node, ['role']),
        resolutionState: typeof resolutionStateValue === 'string' ? resolutionStateValue : undefined,
        directFlag: node.kind === 'Claim' && directById.has(node.id),
        indirectViaClaimId: indirectById.get(node.id)?.viaClaimId,
        historicalMention: historicalIds.has(node.id),
        unresolved: unresolvedRecord !== undefined,
        candidateIds: unresolvedRecord?.candidateIds ?? [],
        reviewedState:
          (typeof reviewStateValue === 'string' && REVIEWED_NODE_STATES.has(reviewStateValue)) ||
          (typeof statusValue === 'string' && REVIEWED_NODE_STATES.has(statusValue))
            ? (reviewedState ?? undefined)
            : undefined,
      };
    });
  return { impact, passages };
}

/** Publication records reachable from one passage via the returned edges. */
function publicationsForPassage(
  overview: GraphOverview,
  node: GraphNode,
): Array<{ publication: GraphNode; relationLabel: string }> {
  const nodeById = new Map(overview.nodes.map((candidate) => [candidate.id, candidate]));
  const results: Array<{ publication: GraphNode; relationLabel: string }> = [];
  for (const edge of overview.edges) {
    if (node.kind === 'CitationUse') {
      if (edge.type === 'CITATION_USE_REFERENCES_PUBLICATION' && edge.fromId === node.id) {
        const publication = nodeById.get(edge.toId);
        if (publication) {
          results.push({ publication, relationLabel: 'cited publication (CITATION_USE_REFERENCES_PUBLICATION)' });
        }
      }
    } else if (node.kind === 'ReferenceOccurrence') {
      if (edge.type === 'POSSIBLE_MATCH' && edge.fromId === node.id) {
        const publication = nodeById.get(edge.toId);
        if (publication) {
          results.push({ publication, relationLabel: 'possible match — unverified (POSSIBLE_MATCH)' });
        }
      } else if (edge.type === 'OCCURRENCE_MATCHES_PUBLICATION' && edge.fromId === node.id) {
        const publication = nodeById.get(edge.toId);
        if (publication) {
          results.push({ publication, relationLabel: 'occurrence matches publication (recorded match edge)' });
        }
      }
    }
  }
  return results;
}

/** Verified publication notices linked by PUBLICATION_HAS_NOTICE edges. */
interface NoticeSummary {
  noticeId: string;
  noticeType: string;
  verified: boolean;
  publishedDate?: string;
  sourceUrl?: string;
}

function noticesForPublication(overview: GraphOverview, publicationId: string): NoticeSummary[] {
  const nodeById = new Map(overview.nodes.map((candidate) => [candidate.id, candidate]));
  const notices: NoticeSummary[] = [];
  for (const edge of overview.edges) {
    if (edge.type !== 'PUBLICATION_HAS_NOTICE' || edge.fromId !== publicationId) continue;
    const notice = nodeById.get(edge.toId);
    if (!notice || notice.kind !== 'SourceNotice') continue;
    const verified = notice.properties['verified'] === true;
    notices.push({
      noticeId: notice.id,
      noticeType: String(notice.properties['noticeType'] ?? 'type not recorded'),
      verified,
      publishedDate: firstText(notice, ['publishedDate']),
      sourceUrl: firstText(notice, ['sourceUrl']),
    });
  }
  return notices;
}

export default function EvidenceReaderPage() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [seed, setSeed] = useState<SeedInfo | null>(null);
  const [graph, setGraph] = useState<ReaderLoad>({ phase: 'loading' });
  const [selected, setSelected] = useState<PassageInfo | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const seedCheckRef = useRef<AbortController | null>(null);
  const focusAppliedRef = useRef<string | null>(null);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setGraph({ phase: 'loading' });

    getGraphOverview({ limit: 200 }, { signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.available) {
          setGraph({ phase: 'ready', overview: outcome.data });
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
        // Probe optional — the reader below carries the honest state.
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

  const ready = graph.phase === 'ready';
  const { impact, passages } = useMemo(
    () => (ready ? buildReaderPassages(graph.overview) : { impact: null, passages: [] }),
    [ready, graph],
  );

  const orderedPassages = useMemo(() => {
    if (!ready) return [];
    return orderRecordedEntries<PassageInfo>(
      passages,
      (passage) => passage.id,
      (passage) => passage.node.properties['location'],
    );
  }, [ready, passages]);

  const manuscriptNode = ready
    ? graph.overview.nodes.find((node) => node.kind === 'ResearchDocument')
    : undefined;
  const manuscriptTitle = manuscriptNode ? firstText(manuscriptNode, ['title']) : undefined;

  // Focus deep-link: ?focus=<nodeId> or #p-<nodeId> scrolls to and briefly
  // highlights that passage once the reader data has answered. Honors
  // prefers-reduced-motion; applied once per data load.
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(routeLocation.search);
    let focusId = params.get('focus');
    if (!focusId && routeLocation.hash.startsWith('#p-')) {
      focusId = routeLocation.hash.slice(3);
    }
    if (!focusId) return;
    // Only highlight a passage the reader actually rendered.
    if (!orderedPassages.some((entry) => entry.id === focusId)) return;
    if (focusAppliedRef.current === focusId) return;
    focusAppliedRef.current = focusId;
    const element = document.getElementById(`p-${focusId}`);
    if (!element) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // jsdom does not implement scrollIntoView — focus highlighting still
    // applies; the real browser scrolls here.
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
    setFocusTarget(focusId);
    const timer = window.setTimeout(() => setFocusTarget(null), reduceMotion ? 1200 : 1600);
    return () => window.clearTimeout(timer);
  }, [ready, routeLocation, orderedPassages]);

  // Back affordance: in-session browser history when one exists
  // (React Router keeps an idx on history.state), else /investigations.
  const historyIndex =
    typeof window !== 'undefined' && typeof window.history === 'object' && window.history.state
      ? (window.history.state as { idx?: unknown }).idx
      : undefined;
  const inSession = typeof historyIndex === 'number' && historyIndex > 0;

  const closeInspector = useCallback(() => setSelected(null), []);

  if (!ready) {
    return (
      <div className="mx-auto max-w-4xl" data-testid="reader-root">
        <ReaderHeader
          manuscriptTitle={undefined}
          documentId={DEMO_MANUSCRIPT_DOCUMENT_ID}
          inSession={inSession}
          navigateBack={() => navigate(-1)}
        />
        <ReaderBasisDisclosure impact={null} />
        {graph.phase === 'loading' && (
          <p className="mt-6 text-sm text-ink-muted" role="status" data-testid="reader-loading">
            Reading the manuscript records…
          </p>
        )}
        {graph.phase === 'missing' && (
          <section
            aria-labelledby="reader-missing-heading"
            className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-6"
            data-testid="reader-missing"
          >
            <h2 id="reader-missing-heading" className="text-lg font-semibold text-ink">
              Manuscript records not available yet
            </h2>
            <p className="mt-2 max-w-prose text-base text-ink-muted">
              {graph.reason === 'not-implemented'
                ? 'The graph-records endpoint reports “not implemented” on this build.'
                : 'No graph-records endpoint answered (function missing — HTTP 404 or an HTML page fallback).'}{' '}
              The reader shows only real returned passage records, so none are shown until
              the API answers. Nothing is reconstructed in the meantime.
            </p>
          </section>
        )}
        {graph.phase === 'failure' && (
          <section
            aria-labelledby="reader-failure-heading"
            className="mt-6 rounded-xl border border-notice-border bg-notice-surface p-6"
            data-testid="reader-failure"
          >
            <h2 id="reader-failure-heading" className="text-lg font-semibold text-notice-text">
              Manuscript records unavailable
            </h2>
            <p className="mt-2 max-w-prose text-base text-ink" data-testid="reader-failure-detail">
              {graph.message} Nothing is simulated in place of the real records.
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
      </div>
    );
  }

  /* Ready: derive the ordered section groups and the unlocatable group. */
  const locatedEntries = orderedPassages.filter((entry) => entry.located);
  const unlocatedEntries = orderedPassages.filter((entry) => !entry.located);
  const sectionGroups: Array<{ section: string; entries: ReaderOrderedEntry<PassageInfo>[] }> = [];
  for (const entry of locatedEntries) {
    const section = entry.section ?? '';
    const existing = sectionGroups.find((group) => group.section === section);
    if (existing) existing.entries.push(entry);
    else sectionGroups.push({ section, entries: [entry] });
  }

  const syntheticCount = passages.filter((passage) => passage.node.isSynthetic === true).length;
  const realCount = passages.filter((passage) => passage.node.isSynthetic === false).length;

  return (
    <div className="mx-auto max-w-4xl" data-testid="reader-root">
      <ReaderHeader
        manuscriptTitle={manuscriptTitle ?? 'Title not recorded in the returned graph'}
        documentId={DEMO_MANUSCRIPT_DOCUMENT_ID}
        seedVersion={impact?.seedVersion}
        inSession={inSession}
        navigateBack={() => navigate(-1)}
      />

      {/* Honest basis disclosure — ordering basis + what the reader is not. */}
      <ReaderBasisDisclosure impact={impact} />

      {/* Synthetic/real attribution — “FICTIONAL / GUIDED DEMO” on the synthetic content. */}
      <p
        role="note"
        data-testid="reader-attribution"
        className="mt-4 rounded-xl border border-uncertain-border bg-uncertain-surface px-5 py-3 text-base text-uncertain-text"
      >
        <strong>Fictional</strong> guided-demo manuscript: the synthetic passages below
        ({syntheticCount} passage record{syntheticCount === 1 ? '' : 's'} in the returned graph)
        are labelled FICTIONAL / GUIDED DEMO in place. Real bibliographic records ({realCount})
        carry their isSynthetic:false badge in the passage inspector. Both counts describe
        records in the returned graph, not only the passages shown here; non-passage
        records (such as publications) carry their own labels in the inspector. A flagged
        passage means <strong>evidence review is needed</strong> — never a verdict of
        truth or falsity.
      </p>

      {seed?.exists && seed.seedVersion && (
        <p className="mt-2 text-xs text-ink-muted" data-testid="reader-seed-info">
          Demo graph present (seedVersion {seed.seedVersion}). Graph loss on the free tier is
          possible; reseeding is idempotent.
        </p>
      )}

      {impact && impact.verifiedNotices.length === 0 && (
        <p className="mt-2 text-xs text-ink-muted" role="note">
          No verified publication notice was returned for this manuscript's citations —
          nothing here is treated as affected by an invented notice.
        </p>
      )}

      <div className="mt-6 space-y-8">
        {sectionGroups.map((group) => (
          <section
            key={group.section || 'recorded-no-section'}
            aria-labelledby={`reader-section-${group.section || 'recorded-no-section'}`}
          >
            <h2
              id={`reader-section-${group.section || 'recorded-no-section'}`}
              className="font-display text-xl font-semibold tracking-tight text-ink"
            >
              {group.section !== ''
                ? `Section ${group.section}`
                : 'Page/offset recordings without a recorded section'}
            </h2>
            <ul className="mt-3 space-y-3">
              {group.entries.map((entry) => (
                <PassageRow
                  key={entry.id}
                  entry={entry}
                  highlighted={focusTarget === entry.id}
                  onInspect={() => setSelected(entry.item)}
                  selected={selected?.id === entry.item.id}
                />
              ))}
            </ul>
          </section>
        ))}

        {unlocatedEntries.length > 0 && (
          <section aria-labelledby="reader-unlocated-heading">
            <h2
              id="reader-unlocated-heading"
              data-testid="reader-unlocated-heading"
              className="font-display text-xl font-semibold tracking-tight text-ink"
            >
              Not located in the recorded layout
            </h2>
            <p className="mt-1 max-w-prose text-sm text-ink-muted">
              These returned records do not carry usable location metadata, so no position
              is assigned to them — none is invented here.
            </p>
            <ul className="mt-3 space-y-3">
              {unlocatedEntries.map((entry) => (
                <PassageRow
                  key={entry.id}
                  entry={entry}
                  highlighted={focusTarget === entry.id}
                  onInspect={() => setSelected(entry.item)}
                  selected={selected?.id === entry.item.id}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      {passages.every((passage) => passage.node.isSynthetic === undefined) && (
        <p className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-5 text-sm text-ink-muted">
          The returned records do not carry synthetic/real attribution, so none is assumed:
          no chip is rendered and no record is presented as either demo or real.
        </p>
      )}

      <PassageInspector
        passage={selected}
        overview={ready ? graph.overview : undefined}
        onClose={closeInspector}
      />
    </div>
  );
}

/**
 * Honest basis disclosure — present in every phase, so the reader's
 * nature is stated even while/loading/failing. The returned counts are
 * rendered only from real data (never zeros standing in for unknowns).
 */
function ReaderBasisDisclosure({ impact }: { impact: DemoImpact | null }) {
  return (
    <div
      role="note"
      data-testid="reader-basis-disclosure"
      className="mt-4 rounded-xl border border-ink-border bg-paper-raised p-5"
    >
      <p className="max-w-prose text-base text-ink">
        This reader is a reflow of the passage records returned by the graph, ordered from
        the recorded section/page/offset metadata — <strong>not a reconstruction of the
        original document layout</strong>.
      </p>
      <p className="mt-2 max-w-prose text-sm text-ink-muted">
        No manuscript full text is stored in this demo, so the reader shows exactly the
        recorded passages
        {impact ? ` (${impact.nodeCount} nodes · ${impact.edgeCount} connections returned)` : ''}
        {impact ? ' (the returned graph may be truncated — the reader shows only what was returned)' : ''}.
        Each location renders only the pieces the record itself carries, and no overall
        pagination is invented. Records without usable location metadata are grouped last as{' '}
        <em>“Not located in the recorded layout”</em>, unpositioned.
      </p>
    </div>
  );
}

function ReaderHeader({
  manuscriptTitle,
  documentId,
  seedVersion,
  inSession,
  navigateBack,
}: {
  manuscriptTitle?: string;
  documentId: string;
  seedVersion?: string;
  inSession: boolean;
  navigateBack: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight text-ink">Evidence Reader</h1>
        {inSession ? (
          <button
            type="button"
            onClick={navigateBack}
            data-testid="reader-back"
            aria-label="Back to the previous page"
            className="rounded-lg border border-ink-border bg-paper px-3 py-1.5 text-sm text-ink hover:bg-paper-deep"
          >
            Back
          </button>
        ) : (
          <Link
            to="/investigations"
            data-testid="reader-back-investigations"
            className="text-sm text-ink-muted no-underline hover:text-ink"
          >
            Return to Investigations
          </Link>
        )}
      </div>
      <p className="mt-2 text-base text-ink" data-testid="reader-manuscript-title">
        <span className="font-medium">Manuscript:</span>{' '}
        {manuscriptTitle ?? 'Title not recorded in the returned graph'}{' '}
        <span data-testid="reader-manuscript-id" className="ml-2 break-all font-mono text-xs text-ink-muted">
          ({documentId})
        </span>
        {seedVersion ? (
          <span className="ml-2 text-xs text-ink-muted">seed {seedVersion}</span>
        ) : null}
      </p>
    </div>
  );
}

/** One passage row in the reflow — id anchors `p-<nodeId>` for deep links. */
function PassageRow({
  entry,
  highlighted,
  onInspect,
  selected,
}: {
  entry: ReaderOrderedEntry<PassageInfo>;
  highlighted: boolean;
  onInspect: () => void;
  selected: boolean;
}) {
  const passage = entry.item;
  const flagged = passage.directFlag || passage.indirectViaClaimId !== undefined;
  const locationLine = formatRecordedLocation(entry);
  const baseClasses =
    'rounded-xl border p-4 md:p-5 transition-none';
  const stateClasses = flagged
    ? 'border-review-border bg-review-surface'
    : passage.unresolved
      ? 'border-uncertain-border bg-uncertain-surface'
      : passage.historicalMention
        ? 'border-ink-border bg-paper-deep'
        : 'border-ink-border bg-paper-raised';
  return (
    <li>
      <article
        id={`p-${passage.id}`}
        data-testid={`reader-passage-${passage.id}`}
        data-focused={highlighted ? 'true' : undefined}
        className={`${baseClasses} ${stateClasses} ${
          highlighted ? 'ring-2 ring-brand-surface ring-offset-2 ring-offset-paper' : ''
        }`}
        aria-label={`${passage.kindLabel} ${passage.id}${
          locationLine ? `, recorded location ${locationLine}` : ''
        }${flagged ? ', evidence review needed' : ''}`}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {passage.kindLabel}
          </h3>
          {locationLine && (
            <p className="font-mono text-xs text-ink-muted" data-testid={`reader-location-${passage.id}`}>
              {locationLine}
            </p>
          )}
          {flagged && (
            <span
              data-testid={`reader-flag-${passage.id}`}
              className="inline-flex items-center rounded border border-review-border bg-review-surface px-2 py-0.5 text-xs font-medium text-review-text"
            >
              evidence review needed
            </span>
          )}
          {passage.reviewedState && (
            <span
              data-testid={`reader-reviewed-${passage.id}`}
              className="inline-flex items-center rounded border border-reviewed bg-reviewed-surface px-2 py-0.5 text-xs font-medium text-reviewed-text"
            >
              review recorded ({passage.reviewedState}) — the returned record carries this state
            </span>
          )}
        </div>

        {passage.indirectViaClaimId ? (
          <p className="mt-2 text-sm text-review-text" data-testid={`reader-indirect-${passage.id}`}>
            Depends on flagged claim <span className="font-mono">{passage.indirectViaClaimId}</span>{' '}
            (direct evidence review) — this conclusion inherits the review obligation, it is
            not judged in itself.
          </p>
        ) : null}

        {passage.bodyText && <p className="mt-2 font-display text-lg leading-snug text-ink">“{passage.bodyText}”</p>}
        {!passage.bodyText && (
          <p className="mt-2 text-sm text-ink-muted">
            No passage text was returned by this record — by id only. None is invented here.
          </p>
        )}
        {passage.role && (
          <p className="mt-1 text-xs text-ink-muted">
            Recorded citation role: {passage.role}
          </p>
        )}
        {passage.unresolved && (
          <p className="mt-1 text-xs text-uncertain-text" data-testid={`reader-unresolved-${passage.id}`}>
            Resolution state: {passage.resolutionState ?? 'not resolved in the returned records'} —
            not yet matched to a confirmed publication record; possible matches remain
            unverified.{' '}
            {passage.candidateIds.length > 0
              ? `${passage.candidateIds.length} possible candidate${passage.candidateIds.length === 1 ? '' : 's'} returned: ${passage.candidateIds.join(', ')}.`
              : ''}
          </p>
        )}
        {passage.historicalMention && !flagged && (
          <p className="mt-2 text-xs text-ink-muted" data-testid={`reader-historical-${passage.id}`}>
            Recorded as a historical mention (MENTIONS_HISTORICALLY) of the same publication —
            excluded from evidence-review flags by design. This passage is not flagged.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {flagged && (
            <Link
              to="/review-queue"
              data-testid="reader-queue-link"
              aria-label={`Track the review state of ${passage.kindLabel} ${passage.id} in the Review Queue`}
              className="text-sm text-brand-deep underline"
            >
              Track review in Review Queue
            </Link>
          )}
          <button
            type="button"
            onClick={onInspect}
            data-testid={`reader-inspect-${passage.id}`}
            aria-label={`Inspect relation records for ${passage.kindLabel} ${passage.id}`}
            aria-expanded={selected}
            aria-controls="reader-inspector"
            className="rounded-lg border border-ink-border bg-paper px-3 py-1.5 text-sm text-ink hover:bg-paper-deep"
          >
            Inspect relations
          </button>
          {selected && (
            <span className="text-xs text-ink-muted" data-testid={`reader-inspecting-${passage.id}`}>
              inspecting below
            </span>
          )}
        </div>
      </article>
    </li>
  );
}

/**
 * Read-only passage inspector — reuses the ContextInspector interaction
 * patterns (Escape closes; shows exactly what the returned graph states,
 * nothing inferred). Relation labels stay precise:
 * supports / mentions historically / possible match — never conflated.
 */
function PassageInspector({
  passage,
  overview,
  onClose,
}: {
  passage: PassageInfo | null;
  overview?: GraphOverview;
  onClose: () => void;
}) {
  // Stable Escape handler: onClose lives in a ref so the keydown effect is
  // registered once per mount, not re-registered every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Move focus into the inspector when it opens (once per opened passage).
  const inspectorRef = useRef<HTMLElement | null>(null);
  const focusedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!passage) {
      focusedForRef.current = null;
      return;
    }
    if (focusedForRef.current === passage.id) return;
    focusedForRef.current = passage.id;
    const element = inspectorRef.current;
    if (!element) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // jsdom does not implement scrollIntoView — focus still moves here.
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    element.focus({ preventScroll: true });
  }, [passage]);

  if (!passage || !overview) return null;

  const relations: Array<{ label: string; detail?: string }> = [];
  const publicationRefs = publicationsForPassage(overview, passage.node);

  if (passage.node.kind === 'CitationUse') {
    const supports = overview.edges.find(
      (edge) => edge.type === 'CITATION_USE_SUPPORTS_CLAIM' && edge.fromId === passage.id,
    );
    const mentions = overview.edges.find(
      (edge) => edge.type === 'MENTIONS_HISTORICALLY' && edge.fromId === passage.id,
    );
    if (supports) {
      relations.push({
        label: 'Recorded relation: supports claim (CITATION_USE_SUPPORTS_CLAIM)',
        detail: `Supports claim ${supports.toId} — supporting is the precise recorded relation; nothing more is inferred.`,
      });
    }
    if (mentions) {
      relations.push({
        label: 'Recorded relation: mentions claim historically (MENTIONS_HISTORICALLY)',
        detail: `Mentions claim ${mentions.toId} historically — historical mentions never become evidence-review flags.`,
      });
    }
    if (!supports && !mentions) {
      relations.push({
        label: 'no supporting or historical-mention relation recorded for this citation use in the returned edges.',
      });
    }
  } else if (passage.node.kind === 'ReferenceOccurrence') {
    const possible = overview.edges.filter(
      (edge) => edge.type === 'POSSIBLE_MATCH' && edge.fromId === passage.id,
    );
    const confirmed = overview.edges.find(
      (edge) => edge.type === 'OCCURRENCE_MATCHES_PUBLICATION' && edge.fromId === passage.id,
    );
    if (confirmed) {
      relations.push({
        label: 'Recorded relation: occurrence matches publication (OCCURRENCE_MATCHES_PUBLICATION)',
        detail: `Matched publication ${confirmed.toId} — a recorded match edge, listed separately from possible matches.`,
      });
    }
    for (const edge of possible) {
      relations.push({
        label: 'Recorded relation: possible match — unverified (POSSIBLE_MATCH)',
        detail: `Possible candidate ${edge.toId} — unverified; candidate edges never propagate into claim impact.`,
      });
    }
    if (!confirmed && possible.length === 0) {
      relations.push({ label: 'no publication relation recorded for this reference occurrence in the returned edges.' });
    }
  } else if (passage.node.kind === 'Conclusion') {
    const dependsOn = overview.edges.filter(
      (edge) => edge.type === 'CONCLUSION_DEPENDS_ON_CLAIM' && edge.fromId === passage.id,
    );
    for (const edge of dependsOn) {
      relations.push({
        label: 'Recorded relation: depends on claim (CONCLUSION_DEPENDS_ON_CLAIM)',
        detail: `Depends on claim ${edge.toId}.`,
      });
    }
    if (dependsOn.length === 0) {
      relations.push({ label: 'no claim dependency recorded for this conclusion in the returned edges.' });
    }
  } else if (passage.node.kind === 'Claim') {
    const citationUses = overview.edges.filter(
      (edge) => edge.type === 'CLAIM_HAS_CITATION_USE' && edge.fromId === passage.id,
    );
    for (const edge of citationUses) {
      relations.push({
        label: 'Recorded relation: carries citation use (CLAIM_HAS_CITATION_USE)',
        detail: `Citation use ${edge.toId}.`,
      });
    }
    if (citationUses.length === 0) {
      relations.push({ label: 'no citation use recorded for this claim in the returned edges.' });
    }
  }

  const noticeLinks = publicationRefs.flatMap((reference) =>
    noticesForPublication(overview, reference.publication.id).map((notice) => ({
      publicationId: reference.publication.id,
      notice,
    })),
  );

  return (
    <aside
      id="reader-inspector"
      data-testid="reader-inspector"
      aria-labelledby="reader-inspector-heading"
      tabIndex={-1}
      ref={inspectorRef}
      className="rounded-xl border border-brand-surface bg-paper-raised p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="reader-inspector-heading" className="text-base font-semibold text-ink">
          Passage inspector — read-only
        </h2>
        <button
          type="button"
          onClick={onClose}
          data-testid="reader-inspector-close"
          aria-label="Close the passage inspector"
          className="rounded border border-ink-border px-2 py-0.5 text-xs text-ink hover:bg-paper-deep"
        >
          Close
        </button>
      </div>

      <dl className="mt-3 space-y-2 text-sm" data-testid="reader-inspector-record">
        <div>
          <dt className="font-medium text-ink-muted">Record id</dt>
          <dd className="break-all font-mono text-xs text-ink" data-testid="reader-inspector-id">
            {passage.id}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Type</dt>
          <dd className="text-ink" data-testid="reader-inspector-type">
            {passage.node.kind}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Provenance</dt>
          <dd className="text-ink">
            {passage.node.provenanceKind ?? 'not recorded'}{' '}
            <span className="text-ink-muted">— where this record and its classification originate</span>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Record attribution</dt>
          <dd className="text-ink">
            {passage.node.isSynthetic === true ? (
              <span
                className="inline-flex items-center rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text"
                data-testid={`reader-inspector-synthetic-${passage.id}`}
              >
                FICTIONAL / GUIDED DEMO
              </span>
            ) : passage.node.isSynthetic === false ? (
              <span
                className="inline-flex items-center rounded border border-ink-border bg-paper-deep px-2 py-0.5 text-xs font-medium text-ink"
                data-testid={`reader-inspector-real-${passage.id}`}
              >
                Real bibliographic record (isSynthetic:false)
              </span>
            ) : (
              <span className="text-ink-muted">not recorded</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Recorded relations ({relations.length}) — labeled exactly as the edges record them
        </h3>
        <ul className="mt-2 space-y-2" data-testid="reader-inspector-relations">
          {relations.map((relation, index) => (
            <li key={index} className="text-xs leading-5 text-ink">
              <p data-testid={`reader-inspector-relation-${index}`} className="text-ink">
                {relation.label}
              </p>
              {relation.detail && <p className="text-ink-muted">{relation.detail}</p>}
            </li>
          ))}
        </ul>
      </div>

      {publicationRefs.length > 0 && (
        <div className="mt-4 border-t border-ink-border pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Referenced publication records ({publicationRefs.length})
          </h3>
          <ul className="mt-2 space-y-3" data-testid="reader-inspector-publications">
            {publicationRefs.map((reference, index) => (
              <li key={`${reference.publication.id}-${index}`} className="text-xs text-ink">
                <p>
                  <span className="break-all font-mono">{reference.publication.id}</span>
                  {' — '}
                  {reference.relationLabel}
                </p>
                {firstText(reference.publication, ['title']) && (
                  <p className="text-ink-muted">“{firstText(reference.publication, ['title'])}”</p>
                )}
                {reference.publication.isSynthetic === true && (
                  <span className="mt-1 inline-flex items-center rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text">
                    FICTIONAL / GUIDED DEMO
                  </span>
                )}
                {reference.publication.isSynthetic === false && (
                  <span
                    className="mt-1 inline-flex items-center rounded border border-ink-border bg-paper-deep px-2 py-0.5 text-xs font-medium text-ink"
                    data-testid={`reader-inspector-publication-real-${index}`}
                  >
                    Real bibliographic record (isSynthetic:false)
                  </span>
                )}
                {reference.publication.isSynthetic === undefined && (
                  <span className="mt-1 inline-flex items-center rounded border border-ink-border bg-paper px-2 py-0.5 text-xs text-ink-muted">
                    synthetic flag not reported
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {noticeLinks.length > 0 && (
        <div className="mt-4 border-t border-notice-border pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Publication notice linkages ({noticeLinks.length})
          </h3>
          <ul className="mt-2 space-y-3" data-testid="reader-inspector-notices">
            {noticeLinks.map(({ publicationId, notice }, index) => (
              <li key={`${notice.noticeId}-${index}`} className="text-xs text-ink">
                <p data-testid={`reader-inspector-notice-${index}`}>
                  <span className="font-mono">{publicationId}</span> → PUBLICATION_HAS_NOTICE →{' '}
                  <span className="font-mono">{notice.noticeId}</span>
                </p>
                <p className="text-ink">
                  noticeType: {notice.noticeType}
                  {notice.verified ? (
                    <span className="ml-2 font-medium text-review-text">verified notice</span>
                  ) : (
                    <span className="ml-2 text-ink-muted">not marked verified</span>
                  )}
                </p>
                {notice.publishedDate && <p className="text-ink">Published: {notice.publishedDate}</p>}
                {notice.sourceUrl && (
                  <p>
                    <a href={notice.sourceUrl} target="_blank" rel="noreferrer" className="break-all text-brand-deep underline">
                      {notice.sourceUrl}
                    </a>
                  </p>
                )}
                <p className="text-ink-muted">
                  A notice is a formal status change of the publication — a statement about the
                  publication record, not about any citing document.
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-muted">
        This inspector is read-only: it shows what the returned graph records state — nothing
        is inferred, nothing is modified.
      </p>
    </aside>
  );
}
