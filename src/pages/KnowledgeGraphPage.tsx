import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import GraphCanvas, { GraphLegend, GraphRecordsList, nodePrimaryLabel } from '../components/GraphCanvas';
import {
  applyGraphFilters,
  availableEdgeProvenanceKinds,
  availableNodeKinds,
  deriveFocusedPath,
} from '../lib/graphView';
import ContextInspector from '../components/ContextInspector';

const OVERVIEW_LIMIT = 40;

/**
 * Client-side text search over the LOADED overview slice only: case-
 * insensitive substring over the node id, kind, and primary label fields
 * (title/text/rawText/label — same candidates `nodePrimaryLabel` uses).
 * This is not a full-graph index; the page fetches a capped overview and
 * the search sees only what loaded.
 */
function nodeMatchesQuery(node: GraphNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${node.id} ${node.kind} ${nodePrimaryLabel(node)}`.toLowerCase().includes(q);
}

/**
 * `analysisVersion` reaches the browser inside `edge.properties` (the wire's
 * extra top-level edge fields land there after parsing in api.ts). Absent
 * stays absent — the provenance panel shows "not provided", never an
 * invented version.
 */
function edgeAnalysisVersion(edge: GraphEdge): string | undefined {
  const value = edge.properties?.analysisVersion;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

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
  const [searchQuery, setSearchQuery] = useState('');
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
          // Initialize client-side filters to "all present" in the SAME batch
          // as the ready state, so the first commit that shows the canvas
          // already has initialized filters. Previously this happened in a
          // separate effect that ran one tick later; a filter change made in
          // that window was clobbered by the initializer (test flake, and a
          // real if brief race for users).
          const kinds = new Set(availableNodeKinds(outcome.data.nodes));
          const provs = new Set(availableEdgeProvenanceKinds(outcome.data.edges));
          setState({ phase: 'ready', overview: outcome.data });
          setSelectedNodeKinds(kinds);
          setSelectedEdgeProv(provs);
          setFiltersReady(true);
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

  const nodeKindsAvailable = useMemo(() => availableNodeKinds(nodes), [nodes]);
  const edgeProvAvailable = useMemo(() => availableEdgeProvenanceKinds(edges), [edges]);

  // Filter initialization happens in load()'s success handler (same batch as
  // the ready state), so no separate effect is needed here.

  // Reset focus when selection changes.
  useEffect(() => {
    setFocusActive(false);
  }, [selected?.id]);

  // Search runs first, then the kind/provenance filters — both must apply.
  // Memoized: these sets were recomputed on every render; the win is limited
  // to the loaded overview slice (capped at OVERVIEW_LIMIT records).
  const searchMatchedNodes = useMemo(
    () => nodes.filter((node) => nodeMatchesQuery(node, searchQuery)),
    [nodes, searchQuery],
  );
  const filtered = useMemo(
    () =>
      filtersReady
        ? applyGraphFilters(searchMatchedNodes, edges, {
            nodeKinds: selectedNodeKinds,
            edgeProvenance: selectedEdgeProv,
          })
        : { nodes: searchMatchedNodes, edges },
    [searchMatchedNodes, edges, filtersReady, selectedNodeKinds, selectedEdgeProv],
  );
  const filteredNodes = filtered.nodes;
  const filteredEdges = filtered.edges;

  const derivedPath = useMemo(
    () => deriveFocusedPath(nodes, edges, selected?.id ?? null),
    [nodes, edges, selected?.id],
  );
  const focusedPath = focusActive ? derivedPath : null;
  const focusedNodeIds = focusedPath?.nodeIds ?? null;
  const focusedEdgeIds = focusedPath?.edgeIds ?? null;

  const flaggedSelected = derivedPath !== null;

  // Connected edges of the selection — all payload edges (not view-filtered),
  // matching the Context Inspector, so provenance stays complete.
  const connectedEdges = useMemo(
    () => (selected ? edges.filter((edge) => edge.fromId === selected.id || edge.toId === selected.id) : []),
    [edges, selected],
  );

  return (
    <div className="mx-auto max-w-7xl overflow-x-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight text-ink">Knowledge Graph</h1>
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
          className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-6 md:p-8"
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
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white no-underline hover:bg-brand-deep"
          >
            Try guided example
          </Link>
        </section>
      )}

      {state.phase === 'failure' && (
        <section
          aria-labelledby="graph-failure-heading"
          className="mt-6 rounded-xl border border-notice-border bg-notice-surface p-6"
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
            className="mt-4 rounded-lg border border-ink-border bg-paper px-4 py-2 text-sm text-ink hover:bg-paper-deep"
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
            <p className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-6 text-base text-ink-muted" data-testid="graph-empty">
              The graph API answered, but returned no records. An empty graph is shown as
              empty — nothing is illustrated with placeholder structure.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
              <div className="min-w-0 space-y-4">
                <section data-testid="graph-filters" className="rounded-xl border border-ink-border bg-paper-raised p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Filters (client-side over returned records)</p>
                  <div className="mb-3">
                    <label htmlFor="graph-search-input" className="text-xs font-medium text-ink">
                      Search loaded nodes
                    </label>
                    <input
                      id="graph-search-input"
                      data-testid="graph-search"
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      aria-describedby="graph-search-scope-note"
                      placeholder="Substring match on id, kind, or label…"
                      className="mt-1 w-full rounded-lg border border-ink-border bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
                    />
                    <p id="graph-search-scope-note" data-testid="graph-search-scope" className="mt-1 text-xs text-ink-muted">
                      {searchQuery.trim()
                        ? `${searchMatchedNodes.length} of ${nodes.length} loaded nodes match. `
                        : 'Matches are counted '}
                      The search applies within the currently loaded overview nodes ({nodes.length}) — only
                      the overview slice this page fetched (capped at {OVERVIEW_LIMIT} records), not a
                      full-graph index.
                    </p>
                  </div>
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
                  <div role="status" aria-live="polite" className="sr-only" data-testid="graph-status">
                    {filteredNodes.length} of {nodes.length} loaded nodes and {filteredEdges.length} of{' '}
                    {edges.length} connections shown after filters
                    {searchQuery.trim() ? ' and search' : ''}. Filters and search apply within the
                    currently loaded overview nodes ({nodes.length}).
                  </div>
                  {filteredNodes.length === 0 && nodes.length > 0 && (
                    <p data-testid="graph-filter-empty" className="mt-2 text-xs text-ink-muted">
                      No records match the current filters or search. Adjust the checkboxes or clear
                      the search above — nothing was removed from the underlying graph.
                    </p>
                  )}
                </section>

                {/* Nonvisual synchronized representation of the FILTERED nodes:
                    a screen-reader list with keyboard-operable select buttons,
                    revealed on keyboard focus (sr-only + focus-within). */}
                <div
                  data-testid="graph-node-list"
                  className="sr-only focus-within:not-sr-only focus-within:my-2 focus-within:rounded-xl focus-within:border focus-within:border-ink-border focus-within:bg-paper-raised focus-within:p-3"
                >
                  {/* Not a heading: the loaded page's heading stream starts
                      at the h1 and a nested h3 here would skip a level
                      (axe heading-order). A plain label tied to the list
                      keeps the same accessible meaning. */}
                  <p id="graph-node-list-label" className="text-sm font-semibold text-ink">
                    Filtered nodes ({filteredNodes.length})
                  </p>
                  {filteredNodes.length === 0 ? (
                    <p className="mt-1 text-xs text-ink-muted">
                      No records match the current filters or search.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1" aria-labelledby="graph-node-list-label">
                      {filteredNodes.map((node) => (
                        <li key={node.id} className="text-xs text-ink">
                          <button
                            type="button"
                            onClick={() => setSelected(node)}
                            aria-pressed={selected?.id === node.id}
                            className="rounded border border-ink-border px-2 py-1 text-left"
                          >
                            {nodePrimaryLabel(node)} — {node.kind} ({node.id})
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {flaggedSelected && (
                  <button
                    type="button"
                    data-testid="focus-dependency-path"
                    onClick={() => setFocusActive((v) => !v)}
                    className="rounded-lg border border-brand bg-brand-surface px-3 py-1.5 text-xs font-medium text-brand-deep hover:bg-paper-deep"
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
                {/* M7 wave-3 — provenance surfacing for the selection. Lists
                    the contract fields of its related edges exactly as the
                    payload carries them; absent fields say "not provided" —
                    nothing is inferred or invented. */}
                {selected && (
                  <section
                    data-testid="graph-selection-provenance"
                    aria-label="Edge provenance for the selected record"
                    className="mt-4 rounded-lg border border-ink-border bg-paper-raised p-4 md:p-5"
                  >
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Edge provenance ({connectedEdges.length})
                    </h3>
                    <p className="mt-1 text-xs text-ink-muted" data-testid="graph-relation-legend">
                      Relation types differ in meaning — cites ≠ discusses ≠ supports ≠ contrasts ≠
                      method-reuse ≠ has-status-notice. Each relation is listed below exactly as
                      recorded, never reworded.
                    </p>
                    {connectedEdges.length === 0 ? (
                      <p className="mt-2 text-xs text-ink-muted">
                        No connected edges among the records this view returned.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-3">
                        {connectedEdges.map((edge, index) => (
                          <li
                            key={edge.id ?? `${edge.type}-${index}`}
                            className="border-t border-ink-border pt-2 text-xs first:border-t-0 first:pt-0"
                          >
                            <span className="font-mono text-[11px] text-ink-muted">{edge.type}</span>
                            <span className="mx-1 text-ink-border">·</span>
                            <span className="break-all text-ink">
                              {edge.fromId === selected.id ? `→ ${edge.toId}` : `← ${edge.fromId}`}
                            </span>
                            <dl className="mt-1 grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-0.5">
                              <dt className="font-medium text-ink-muted">Provenance kind</dt>
                              <dd className="text-ink" data-testid="edge-provenance-kind">
                                {edge.provenanceKind ?? 'not provided'}
                              </dd>
                              <dt className="font-medium text-ink-muted">Rationale</dt>
                              <dd className="break-words text-ink" data-testid="edge-rationale">
                                {edge.rationale ?? 'not provided'}
                              </dd>
                              <dt className="font-medium text-ink-muted">Source pointer</dt>
                              <dd className="break-all text-ink" data-testid="edge-source-pointer">
                                {edge.sourcePointer ?? 'not provided'}
                              </dd>
                              <dt className="font-medium text-ink-muted">Analysis version</dt>
                              <dd className="text-ink" data-testid="edge-analysis-version">
                                {edgeAnalysisVersion(edge) ?? 'not provided'}
                              </dd>
                            </dl>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
