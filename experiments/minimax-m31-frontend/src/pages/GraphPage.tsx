import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Chip, IconButton, MetaRow, Segmented } from '../components/ui';
import {
  ForceGraph,
  type ForceGraphHandle,
  type GraphNode,
} from '../components/ForceGraph';
import { IconArrowLeft, IconSearch, IconTarget, IconZoomIn, IconZoomOut } from '../components/Icons';
import { useStore } from '../state/store';
import {
  EDGE_FAMILY_MEANING,
  EDGE_LABEL,
  graphComponentForDocument,
  nodeById,
  type GraphEdgeRecord,
  type NodeKind,
} from '../fixtures';
import { formatProperty } from '../lib/findings';

const NODE_KIND_ORDER: NodeKind[] = [
  'ResearchDocument',
  'DocumentVersion',
  'Claim',
  'Conclusion',
  'CitationUse',
  'ReferenceOccurrence',
  'Publication',
  'SourceNotice',
  'Study',
  'Dataset',
  'EvidenceReview',
];

const RELATION_ORDER = Object.keys(EDGE_LABEL) as Array<keyof typeof EDGE_LABEL>;

export default function GraphPage() {
  const { documentId = 'doc-demo-manuscript' } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(state.selectedFindingId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panelWidth] = useState(248);
  const [canvasSize, setCanvasSize] = useState({ width: 820, height: 620 });
  const [labelMode, setLabelMode] = useState<'auto' | 'all' | 'none'>('auto');
  const graphRef = useRef<ForceGraphHandle | null>(null);

  const component = useMemo(() => graphComponentForDocument(documentId), [documentId]);

  const filtered = useMemo(() => {
    const query = state.graphQuery.trim().toLowerCase();
    const kinds = state.graphKinds;
    const nodes = component.nodes.filter((node) => {
      if (kinds.length > 0 && !kinds.includes(node.kind)) return false;
      if (!query) return true;
      return (
        node.label.toLowerCase().includes(query) ||
        node.id.toLowerCase().includes(query) ||
        node.kind.toLowerCase().includes(query)
      );
    });
    const ids = new Set(nodes.map((node) => node.id));
    const edges = component.edges.filter(
      (edge) => ids.has(edge.fromId) && ids.has(edge.toId),
    );
    return { nodes, edges };
  }, [component, state.graphQuery, state.graphKinds]);

  const selectedNode = selectedId ? nodeById.get(selectedId) : undefined;
  const selectedEdges = useMemo(
    () =>
      selectedId
        ? component.edges.filter((edge) => edge.fromId === selectedId || edge.toId === selectedId)
        : [],
    [component.edges, selectedId],
  );

  const neighbourNodes = useMemo(() => {
    if (!selectedId) return [];
    const ids = new Set<string>();
    for (const edge of selectedEdges) {
      ids.add(edge.fromId === selectedId ? edge.toId : edge.fromId);
    }
    return [...ids]
      .map((id) => nodeById.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
  }, [selectedEdges, selectedId]);

  const canvasRef = useMemo(() => {
    let element: HTMLDivElement | null = null;
    const observer = new ResizeObserver(() => {
      if (!element) return;
      setCanvasSize({ width: element.clientWidth, height: element.clientHeight });
    });
    return {
      attach: (node: HTMLDivElement | null) => {
        if (element) observer.unobserve(element);
        element = node;
        if (node) observer.observe(node);
      },
    };
  }, []);

  return (
    <div className="flex h-full min-h-0">
      {/* ---- Left: search and filters ------------------------------- */}
      <div
        className="hidden shrink-0 border-r border-ink-border bg-paper-deep/40 md:block"
        style={{ width: panelWidth }}
      >
        <div className="flex h-full flex-col overflow-y-auto px-3.5 py-4">
          <button
            type="button"
            onClick={() => navigate(`/i/${documentId}/read`)}
            className="inline-flex items-center gap-1.5 text-2xs font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <IconArrowLeft size={12} />
            Back to the reader
          </button>

          <p className="eyebrow mt-5">Evidence graph</p>
          <h1 className="mt-1.5 font-display text-base font-semibold leading-5 text-ink">
            {component.nodes.length} records · {component.edges.length} relationships
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-ink-muted">
            The complete network this investigation contains. Nothing is hidden behind a click.
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-md border border-ink-border bg-paper-raised px-2 py-1.5">
            <IconSearch size={13} className="text-ink-soft" />
            <input
              value={state.graphQuery}
              onChange={(event) =>
                dispatch({ type: 'set-graph-query', query: event.target.value })
              }
              placeholder="Find a record…"
              aria-label="Search the evidence graph"
              className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-soft"
            />
            {state.graphQuery ? (
              <IconButton
                label="Clear search"
                onClick={() => dispatch({ type: 'set-graph-query', query: '' })}
              >
                ×
              </IconButton>
            ) : null}
          </div>

          <div className="mt-4">
            <p className="eyebrow mb-1.5">Record kinds</p>
            <div className="flex flex-wrap gap-1">
              {NODE_KIND_ORDER.map((kind) => {
                const count = component.nodes.filter((n) => n.kind === kind).length;
                if (count === 0) return null;
                const active = state.graphKinds.includes(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => dispatch({ type: 'toggle-graph-kind', kind })}
                    className={`rounded-full border px-2 py-[2px] text-2xs transition-colors duration-150 ${
                      active
                        ? 'border-brand bg-brand text-paper-raised'
                        : 'border-ink-border bg-paper-raised text-ink-muted hover:border-ink-soft/60 hover:text-ink'
                    }`}
                  >
                    {kind.replace(/([a-z])([A-Z])/g, '$1 $2')} {count}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <p className="eyebrow mb-1.5">Relationships</p>
            <ul className="space-y-1">
              {RELATION_ORDER.map((type) => {
                const count = component.edges.filter((e) => e.type === type).length;
                if (count === 0) return null;
                return (
                  <li key={type} className="flex items-baseline gap-2 text-2xs">
                    <span className="text-ink">{EDGE_LABEL[type]}</span>
                    <span className="text-ink-soft">{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-5">
            <p className="eyebrow mb-1.5">Labels</p>
            <Segmented
              label="Label display"
              value={labelMode}
              onChange={setLabelMode}
              options={[
                { value: 'auto', label: 'Selected' },
                { value: 'all', label: 'All' },
                { value: 'none', label: 'None' },
              ]}
            />
            <p className="mt-1.5 text-2xs leading-4 text-ink-soft">
              “Selected” labels the record you pick and its neighbours, the way a knowledge graph
              stays readable.
            </p>
          </div>

          <div className="mt-5">
            <p className="eyebrow mb-1.5">Relationship key</p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {Object.entries(EDGE_FAMILY_MEANING).map(([family, meaning]) => (
                <li key={family} className="text-2xs leading-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="inline-block h-px w-4 shrink-0"
                      style={{ background: `rgb(var(--c-${family === 'structural' ? 'ink-border' : family === 'support' ? 'brand' : family === 'notice' || family === 'contrast' ? 'notice' : family === 'historical' || family === 'confirmed' ? 'sage' : family === 'method' ? 'ink-soft' : family === 'dependency' ? 'amber' : 'uncertain'}))` }}
                    />
                    <span className="text-ink">{family}</span>
                  </span>
                  <span className="mt-0.5 block pl-[22px] text-ink-soft">{meaning}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-auto pt-6">
            <p className="meta leading-4">
              Prepared sample graph. Synthetic records are drawn with a dotted ring.
            </p>
          </div>
        </div>
      </div>

      {/* ---- Canvas --------------------------------------------------- */}
      <div className="relative min-w-0 flex-1 bg-paper">
        <div ref={canvasRef.attach} className="h-full w-full">
          <ForceGraph
            ref={graphRef}
            labelMode={labelMode}
            nodes={filtered.nodes as GraphNode[]}
            edges={filtered.edges as GraphEdgeRecord[]}
            width={canvasSize.width}
            height={canvasSize.height}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={setSelectedId}
            onHover={setHoveredId}
          />
        </div>

        <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-1.5">
          <Chip tone="neutral">{filtered.nodes.length} shown</Chip>
          {filtered.nodes.length !== component.nodes.length ? (
            <Chip tone="amber">filtered</Chip>
          ) : null}
          <Chip tone="neutral">scroll to zoom · drag to pan</Chip>
        </div>

        <div className="absolute right-4 top-4 flex items-center gap-0.5 rounded-lg border border-ink-border bg-paper-raised/95 px-1 py-1 shadow-lift-2 backdrop-blur">
          <IconButton label="Zoom in" onClick={() => graphRef.current?.zoomBy(1.25)}>
            <IconZoomIn size={14} />
          </IconButton>
          <IconButton label="Zoom out" onClick={() => graphRef.current?.zoomBy(0.8)}>
            <IconZoomOut size={14} />
          </IconButton>
          <span className="mx-1 h-4 w-px bg-ink-border" />
          <Button
            size="xs"
            variant="ghost"
            icon={<IconTarget size={12} />}
            onClick={() => graphRef.current?.fit()}
          >
            Fit
          </Button>
        </div>
      </div>

      {/* ---- Right: selection inspector ------------------------------ */}
      <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-ink-border bg-paper-raised/40 xl:block">
        {selectedNode ? (
          <div className="px-4 py-4">
            <p className="eyebrow">{selectedNode.kind.replace(/([a-z])([A-Z])/g, '$1 $2')}</p>
            <h2 className="mt-1.5 font-display text-base font-semibold leading-5 text-ink">
              {selectedNode.label}
            </h2>
            <p className="meta mt-1.5 break-all">{selectedNode.id}</p>
            {selectedNode.isSynthetic ? (
              <p className="mt-2 text-2xs uppercase tracking-wide text-brand">Synthetic sample record</p>
            ) : (
              <p className="mt-2 text-2xs uppercase tracking-wide text-sage">Real publication record</p>
            )}

            <dl className="mt-4 divide-y divide-ink-border border-t border-ink-border">
              {Object.entries(selectedNode.properties)
                .filter(([key]) => key !== 'label2')
                .map(([key, value]) => (
                  <MetaRow key={key} label={key.replace(/([a-z])([A-Z])/g, '$1 $2')} mono={key === 'doi' || key === 'url'}>
                    {formatProperty(value)}
                  </MetaRow>
                ))}
            </dl>

            <p className="eyebrow mt-5">Relationships</p>
            <ul className="mt-1.5 space-y-1.5">
              {selectedEdges.map((edge) => {
                const otherId = edge.fromId === selectedId ? edge.toId : edge.fromId;
                const other = nodeById.get(otherId);
                return (
                  <li key={edge.id} className="text-xs leading-5">
                    <span className="text-ink">{EDGE_LABEL[edge.type]}</span>{' '}
                    <button
                      type="button"
                      onClick={() => setSelectedId(otherId)}
                      className="text-brand-deep underline decoration-brand-line underline-offset-2 hover:text-brand"
                    >
                      {other?.label ?? otherId}
                    </button>
                    <span className="meta ml-1">· {edge.provenanceKind}</span>
                  </li>
                );
              })}
              {selectedEdges.length === 0 ? (
                <li className="text-xs text-ink-soft">No relationships.</li>
              ) : null}
            </ul>

            {neighbourNodes.length > 0 ? (
              <p className="meta mt-4 leading-4">
                {neighbourNodes.length} directly connected record
                {neighbourNodes.length === 1 ? '' : 's'}. Every relationship of this investigation is
                already drawn on the canvas.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="px-4 py-5">
            <p className="eyebrow">Selection</p>
            <h2 className="mt-1.5 font-display text-base font-semibold text-ink">Nothing selected</h2>
            <p className="mt-1.5 text-xs leading-5 text-ink-muted">
              Click a record to see what it is and how it connects. Drag to rearrange, scroll to zoom,
              drag the background to pan.
            </p>
            <div className="mt-4 space-y-2">
              {Object.entries(EDGE_FAMILY_MEANING).slice(0, 5).map(([family, meaning]) => (
                <p key={family} className="text-2xs leading-4 text-ink-soft">
                  <span className="text-ink">{family}</span> — {meaning}
                </p>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
