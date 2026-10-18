import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  getGraphOverview,
  type GraphEdge,
  type GraphNode,
  type GraphOverview,
} from '../lib/api';
import GraphCanvas, { GraphLegend, GraphRecordsList } from '../components/GraphCanvas';
import {
  applyGraphFilters,
  availableEdgeProvenanceKinds,
  availableNodeKinds,
  deriveFocusedPath,
  isFlaggedClaimOrConclusion,
} from '../lib/graphView';
import ContextInspector from '../components/ContextInspector';

const OVERVIEW_LIMIT = 40;

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; overview: GraphOverview }
  | { phase: 'missing'; reason: 'endpoint-missing' | 'not-implemented' }
  | { phase: 'failure'; message: string };

/**
 * Knowledge Graph — the global graph view (M2). Renders exactly the records
 * the graph API returns (live FalkorDB reads server-side; the browser never
 * touches the database). Failure states stay honest: an unavailable API or
 * an unseeded graph shows a plain truthful note, never invented structure.
 */
export default function KnowledgeGraphPage() {
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [focusActive, setFocusActive] = useState(false);
  const [selectedNodeKinds, setSelectedNodeKinds] = useState<Set<string>>(new Set());
  const [selectedEdgeProv, setSelectedEdgeProv] = useState<Set<string>>(new Set());
  const [filtersReady, setFiltersReady] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ phase: 'loading' });
    setSelected(null);

    getGraphOverview({ limit: OVERVIEW_LIMIT }, { signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.available) {
          setState({ phase: 'ready', overview: outcome.data });
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
          setState({ phase: 'failure', message: `API returned HTTP ${error.status} — no graph was read.` });
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

  const overview = state.phase === 'ready' ? state.overview : null;
  const edges: GraphEdge[] = overview?.edges ?? [];
  const nodes: GraphNode[] = overview?.nodes ?? [];

  const nodeKindsAvailable = availableNodeKinds(nodes);
  const edgeProvAvailable = availableEdgeProvenanceKinds(edges);

  // Initialize filters to "all present" once data loads.
  useEffect(() => {
    setSelectedNodeKinds(new Set(nodeKindsAvailable));
    setSelectedEdgeProv(new Set(edgeProvAvailable));
    setFiltersReady(true);
  }, [nodes.length, edges.length]);

  // Reset focus when selection changes.
  useEffect(() => {
    setFocusActive(false);
  }, [selected?.id]);

  const filtered = filtersReady
    ? applyGraphFilters(nodes, edges, {
        nodeKinds: selectedNodeKinds,
        edgeProvenance: selectedEdgeProv,
      })
    : { nodes, edges };
  const filteredNodes = filtered.nodes;
  const filteredEdges = filtered.edges;

  const focusedPath =
    focusActive && selected
      ? deriveFocusedPath(nodes, edges, selected.id)
      : null;
  const focusedNodeIds = focusedPath?.nodeIds ?? null;
  const focusedEdgeIds = focusedPath?.edgeIds ?? null;

  const flaggedSelected =
    !!selected && isFlaggedClaimOrConclusion(nodes, edges, selected.id);

  return (
    <div className="mx-auto max-w-7xl overflow-x-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">Knowledge Graph</h1>
        {overview && (
          <p className="text-xs text-ink-muted" data-testid="graph-counts">
            {overview.seedVersion ? `seed ${overview.seedVersion} · ` : ''}
            {nodes.length} nodes · {edges.length} connections returned
            {nodes.length >= OVERVIEW_LIMIT ? ' (showing the first 40 returned)' : ''}
          </p>
        )}
      </div>

      {state.phase === 'loading' && (
        <p className="mt-6 text-sm text-ink-muted" role="status" data-testid="graph-loading">
          Contacting the graph API…
        </p>
      )}

      {state.phase === 'missing' && (
        <section
          aria-labelledby="graph-missing-heading"
          className="mt-6 rounded-lg border border-ink-border bg-paper-raised p-6 md:p-8"
          data-testid="graph-missing"
        >
          <p className="mb-3 inline-flex items-center gap-2 rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text">
            Not available yet
          </p>
          <h2 id="graph-missing-heading" className="font-display text-2xl text-ink">
            {state.reason === 'not-implemented'
              ? 'Graph queries are not implemented on this build yet'
              : 'Graph queries are not available on this deployment yet'}
          </h2>
          <p className="mt-2 max-w-prose text-ink-muted">
            The knowledge-graph API did not return records, so there is nothing to draw.
            No placeholder nodes or decorative edges are shown — an empty graph reads as
            an empty graph. The query function may be missing from this deployment, or
            the demo graph is not seeded yet; seed it from the landing page, or check
            the service status in the sidebar/Overview.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded bg-brand px-4 py-2 text-sm font-medium text-white no-underline hover:bg-brand-deep"
          >
            Try guided example
          </Link>
        </section>
      )}

      {state.phase === 'failure' && (
        <section
          aria-labelledby="graph-failure-heading"
          className="mt-6 rounded-lg border border-notice-border bg-notice-surface p-6"
          data-testid="graph-failure"
        >
          <h2 id="graph-failure-heading" className="text-lg font-semibold text-notice-text">
            Graph unavailable
          </h2>
          <p className="mt-2 text-base text-ink" data-testid="graph-failure-detail">
            {state.message} Nothing is rendered in place of real records.
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-4 rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink hover:bg-paper-deep"
          >
            Retry
          </button>
        </section>
      )}

      {state.phase === 'ready' && (
        <>
          <p className="mt-2 max-w-prose text-base text-ink-muted">
            Every record below lives in the real graph store and is read live through the
            backend API (read-only from the browser). Fictional guided-demo records are
            labelled “FICTIONAL / GUIDED DEMO”; real bibliographic records are marked
            “real record”. Select any node to open the Context Inspector.
          </p>

          {nodes.length === 0 ? (
            <p className="mt-6 rounded-lg border border-ink-border bg-paper-raised p-6 text-base text-ink-muted" data-testid="graph-empty">
              The graph API answered, but returned no records. An empty graph is shown as
              empty — nothing is illustrated with placeholder structure.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
              <div className="min-w-0 space-y-4">
                <section data-testid="graph-filters" className="rounded-lg border border-ink-border bg-paper-raised p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink">Filters (client-side over returned records)</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <fieldset data-testid="node-kind-filter">
                      <legend className="text-xs font-medium text-ink">Node kind</legend>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {nodeKindsAvailable.map((kind) => (
                          <label key={kind} className="inline-flex items-center gap-1 text-xs text-ink">
                            <input
                              type="checkbox"
                              data-testid={`node-kind-checkbox-${kind}`}
                              checked={filtersReady ? selectedNodeKinds.has(kind) : true}
                              onChange={(event) => {
                                setSelectedNodeKinds((prev) => {
                                  const next = new Set(prev);
                                  if (event.target.checked) next.add(kind);
                                  else next.delete(kind);
                                  return next;
                                });
                              }}
                            />
                            {kind}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset data-testid="edge-provenance-filter">
                      <legend className="text-xs font-medium text-ink">Edge provenance</legend>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {edgeProvAvailable.map((kind) => (
                          <label key={kind} className="inline-flex items-center gap-1 text-xs text-ink">
                            <input
                              type="checkbox"
                              data-testid={`edge-provenance-checkbox-${kind}`}
                              checked={filtersReady ? selectedEdgeProv.has(kind) : true}
                              onChange={(event) => {
                                setSelectedEdgeProv((prev) => {
                                  const next = new Set(prev);
                                  if (event.target.checked) next.add(kind);
                                  else next.delete(kind);
                                  return next;
                                });
                              }}
                            />
                            {kind}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                  {filteredNodes.length === 0 && nodes.length > 0 && (
                    <p data-testid="graph-filter-empty" className="mt-2 text-xs text-ink-muted">
                      No records match the current filters. Adjust the checkboxes above — nothing
                      was removed from the underlying graph.
                    </p>
                  )}
                </section>

                {flaggedSelected && (
                  <button
                    type="button"
                    data-testid="focus-dependency-path"
                    onClick={() => setFocusActive((v) => !v)}
                    className="rounded border border-brand bg-brand-surface px-3 py-1.5 text-xs font-medium text-brand-deep hover:bg-paper-deep"
                  >
                    {focusActive ? 'Clear focused path' : 'Focus dependency path'}
                  </button>
                )}

                {focusActive && focusedNodeIds && (
                  <p className="text-xs text-ink-muted" data-testid="focused-path-note">
                    Focused path highlights {focusedNodeIds.size} record(s); other records are
                    dimmed but remain listed below.
                  </p>
                )}

                <GraphCanvas
                  nodes={filteredNodes}
                  edges={filteredEdges}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelected}
                  focusedNodeIds={focusedNodeIds}
                  focusedEdgeIds={focusedEdgeIds}
                />
                <GraphLegend />
                <hr className="border-ink-border" />
                <GraphRecordsList
                  nodes={filteredNodes}
                  edges={filteredEdges}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelected}
                  focusedNodeIds={focusedNodeIds}
                  focusedEdgeIds={focusedEdgeIds}
                />
              </div>
              <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
                <ContextInspector
                  node={selected}
                  edges={edges}
                  onClose={selected ? () => setSelected(null) : undefined}
                  focusActive={focusActive}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
