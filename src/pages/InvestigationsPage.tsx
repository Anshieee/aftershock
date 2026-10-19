import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEMO_MANUSCRIPT_DOCUMENT_ID,
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  getGraphOverview,
  getSeedStatus,
  type GraphNode,
  type GraphOverview,
} from '../lib/api';
import { deriveDemoImpact, type DemoImpact } from '../lib/demoImpact';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; overview: GraphOverview; impact: DemoImpact }
  | { phase: 'missing'; reason: 'endpoint-missing' | 'not-implemented' }
  | { phase: 'failure'; message: string };

interface SeedInfo {
  exists: boolean;
  seedVersion?: string;
  nodeCount?: number;
}

/**
 * One investigation card per ResearchDocument node actually returned by the
 * graph. Every count below is computed from the returned records only —
 * versions and reference occurrences are counted via the document's real
 * DOCUMENT_HAS_VERSION / DOCUMENT_HAS_REFERENCE edges. Claim, conclusion
 * and flag counts span the whole returned graph and are therefore attached
 * ONLY when a single document was returned (the seeded demo case);
 * otherwise the card says plainly that passage-level attribution is not
 * derivable from the returned edges. Nothing is ever estimated. The demo
 * manuscript card additionally links the M7 read-only Evidence Reader
 * (one affordance; no other structure change).
 */
interface InvestigationCard {
  id: string;
  title?: string;
  isSynthetic?: boolean;
  versionCount: number;
  versionIds: string[];
  referenceCount: number;
  unresolvedReferenceCount: number;
}

function toCards(overview: GraphOverview): InvestigationCard[] {
  const docs = overview.nodes.filter((node: GraphNode) => node.kind === 'ResearchDocument');
  return docs.map((doc) => {
    const versionIds: string[] = [];
    let referenceCount = 0;
    let unresolvedReferenceCount = 0;
    for (const edge of overview.edges) {
      if (edge.fromId !== doc.id) continue;
      if (edge.type === 'DOCUMENT_HAS_VERSION') versionIds.push(edge.toId);
      if (edge.type === 'DOCUMENT_HAS_REFERENCE') {
        referenceCount += 1;
        const reference = overview.nodes.find((candidate) => candidate.id === edge.toId);
        const resolutionState = reference?.properties['resolutionState'];
        if (resolutionState === 'unresolved' || resolutionState === 'deferred') {
          unresolvedReferenceCount += 1;
        }
      }
    }
    return {
      id: doc.id,
      title: typeof doc.properties['title'] === 'string' ? (doc.properties['title'] as string) : undefined,
      isSynthetic: doc.isSynthetic,
      versionCount: versionIds.length,
      versionIds,
      referenceCount,
      unresolvedReferenceCount,
    };
  });
}

/**
 * Investigations — the guided demo's real analysis surfaced as one
 * investigation per returned document: its claims/conclusions, evidence
 * flags and unresolved references, each count derived from live graph data.
 * Import for your own documents is not wired in this build, so the page
 * says exactly that instead of offering a fake affordance. When the API is
 * silent the page keeps the honest states — no numbers are invented.
 */
export default function InvestigationsPage() {
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [seed, setSeed] = useState<SeedInfo | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const seedCheckRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ phase: 'loading' });

    getGraphOverview({ limit: 200 }, { signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.available) {
          setState({ phase: 'ready', overview: outcome.data, impact: deriveDemoImpact(outcome.data) });
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

  const ready = state.phase === 'ready';
  const cards = ready ? toCards(state.overview) : [];
  const impact = ready ? state.impact : null;
  const singleDocument = cards.length === 1;
  const unseeded = ready && cards.length === 0 && seed !== null && !seed.exists;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight text-ink">Investigations</h1>
        {ready && impact && cards.length > 0 && (
          <p className="text-xs text-ink-muted" data-testid="investigations-counts">
            {state.overview.seedVersion ? `seed ${state.overview.seedVersion} · ` : ''}
            {impact.nodeCount} nodes · {impact.edgeCount} connections returned
          </p>
        )}
      </div>

      {seed?.exists && seed.seedVersion && (
        <p className="mt-1 text-xs text-ink-muted" data-testid="investigations-seed-info">
          Demo graph present (seedVersion {seed.seedVersion}
          {typeof seed.nodeCount === 'number' ? `, ${seed.nodeCount} nodes` : ''}). Graph loss
          on the free tier is possible; reseeding is idempotent.
        </p>
      )}

      {state.phase === 'loading' && (
        <p className="mt-6 text-sm text-ink-muted" role="status" data-testid="investigations-loading">
          Reading investigations from the graph…
        </p>
      )}

      {state.phase === 'missing' && (
        <section
          aria-labelledby="investigations-missing-heading"
          className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-6"
          data-testid="investigations-missing"
        >
          <h2 id="investigations-missing-heading" className="text-lg font-semibold text-ink">
            Investigations not available yet
          </h2>
          <p className="mt-2 max-w-prose text-base text-ink-muted">
            {state.reason === 'not-implemented'
              ? 'The graph-records endpoint reports “not implemented” on this build.'
              : 'No graph-records endpoint answered (function missing — HTTP 404 or an HTML page fallback).'}{' '}
            Either the demo graph is not seeded yet in this environment, or the query
            endpoints are not wired to the graph backend yet. Investigations are derived
            only from real graph data, so none are shown until the API answers.
          </p>
        </section>
      )}

      {state.phase === 'failure' && (
        <section
          aria-labelledby="investigations-failure-heading"
          className="mt-6 rounded-xl border border-notice-border bg-notice-surface p-6"
          data-testid="investigations-failure"
        >
          <h2 id="investigations-failure-heading" className="text-lg font-semibold text-notice-text">
            Investigations unavailable
          </h2>
          <p className="mt-2 text-base text-ink" data-testid="investigations-failure-detail">
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

      {ready && unseeded && (
        <section
          aria-labelledby="investigations-unseeded-heading"
          className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-6"
          data-testid="investigations-unseeded"
        >
          <h2 id="investigations-unseeded-heading" className="text-lg font-semibold text-ink">
            No demo graph is seeded in this environment yet
          </h2>
          <p className="mt-2 max-w-prose text-base text-ink-muted">
            The graph check answered, and no research documents were returned — there is
            nothing to investigate yet. The guided example seeds the synthetic demo
            through the guarded, rate-limited API (idempotent). Import for your own
            documents is not wired in this build — nothing is uploaded anywhere.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white no-underline hover:bg-brand-deep"
            >
              Try guided example
            </Link>
          </div>
        </section>
      )}

      {ready && !unseeded && cards.length === 0 && (
        <p
          className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-6 text-base text-ink-muted"
          data-testid="investigations-empty"
          role="note"
        >
          The graph answered but returned no research documents, so there is nothing to
          investigate here yet. If the graph was expected, check the seeded demo results —
          no placeholder investigations are ever shown.
        </p>
      )}

      {ready && cards.length > 0 && (
        <div className="mt-6 space-y-6">
          {!singleDocument && (
            <p
              role="note"
              data-testid="investigations-multidoc-note"
              className="rounded-xl border border-uncertain-border bg-uncertain-surface px-4 py-3 text-base text-uncertain-text"
            >
              Multiple research documents were returned. Claim, conclusion and review-flag
              counts are not attributable to a single document from the returned edges, so
              each card lists only its directly connected records — nothing is estimated.
            </p>
          )}

          <ul className="space-y-6">
            {cards.map((card) => (
              <li
                key={card.id}
                data-testid={`investigation-${card.id}`}
                className="rounded-2xl border border-ink-border bg-paper-raised p-6"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-semibold text-ink">
                    {card.title ?? 'Untitled document (title not recorded in the returned graph)'}
                  </h2>
                  {card.isSynthetic && (
                    <span className="rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text">
                      FICTIONAL / GUIDED DEMO
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm text-ink-muted" data-testid={`investigation-${card.id}-counts`}>
                  {card.versionCount} document version{card.versionCount === 1 ? '' : 's'} returned
                  {card.versionCount > 0 && (
                    <span className="break-all font-mono"> ({card.versionIds.join(', ')})</span>
                  )}
                  {' · '}
                  {card.referenceCount} reference occurrence{card.referenceCount === 1 ? '' : 's'} (
                  {card.unresolvedReferenceCount} unresolved)
                  {singleDocument && impact && (
                    <>
                      {' · '}
                      {overviewNodes(state.overview, 'Claim').length} claim
                      {overviewNodes(state.overview, 'Claim').length === 1 ? '' : 's'} ·{' '}
                      {overviewNodes(state.overview, 'Conclusion').length} conclusion
                      {overviewNodes(state.overview, 'Conclusion').length === 1 ? '' : 's'} ·{' '}
                      {impact.affected.length} flagged for review (
                      {impact.affected.filter((item) => item.reviewKind === 'direct_evidence_review').length} direct /{' '}
                      {impact.affected.filter((item) => item.reviewKind === 'indirect_evidence_review').length}{' '}
                      indirect) — a flag means review is needed, never a verdict of truth or falsity
                    </>
                  )}
                </p>

                {singleDocument && impact && (
                  <p className="mt-2 text-xs text-ink-muted">
                    Claim, conclusion and flag counts span the records returned for this
                    graph (the seeded demo contains this one document). Unresolved possible
                    matches ({impact.unresolved.length}) stay ambiguous — they are never
                    counted as evidence.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    to="/results"
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white no-underline hover:bg-brand-deep"
                  >
                    Open investigation
                  </Link>
                  <Link
                    to="/review-queue"
                    className="rounded-lg px-2 py-2 text-sm text-ink-muted no-underline hover:text-ink"
                  >
                    Review Queue
                  </Link>
                  {card.id === DEMO_MANUSCRIPT_DOCUMENT_ID && (
                    <Link
                      to="/reader"
                      data-testid={`open-evidence-reader-${card.id}`}
                      aria-label="Open the read-only evidence reader for the guided-demo manuscript"
                      className="rounded-lg px-2 py-2 text-sm text-ink-muted no-underline hover:text-ink"
                    >
                      Open evidence reader
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ready && (
        <section
          aria-labelledby="investigations-import-heading"
          className="mt-6 rounded-xl border border-ink-border bg-paper p-5"
          data-testid="investigations-import-hint"
        >
          <h2 id="investigations-import-heading" className="text-base font-semibold text-ink">
            Import your own document to create more investigations
          </h2>
          <p className="mt-2 max-w-prose text-base text-ink-muted">
            In this build nothing is uploaded or transmitted — the import pipeline is not
            implemented yet, and the import surface is not wired in this deployment. The
            guided example is the only investigation source until import is wired, and no
            investigations are ever simulated to fill the gap.
          </p>
        </section>
      )}
    </div>
  );
}

/** Real nodes of one kind in the returned graph — counts, never estimates. */
function overviewNodes(overview: GraphOverview, kind: string): GraphNode[] {
  return overview.nodes.filter((node) => node.kind === kind);
}
