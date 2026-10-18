import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { GraphEdge, GraphNode } from '../lib/api';
import * as GV from '../lib/graphView';
export * from '../lib/graphView';

/**
 * Static, force-free layered graph (M2 Knowledge Graph first cut).
 *
 * M4.5 adds: ctrl+wheel zoom, drag-pan on empty canvas, accessible zoom/
 * reset buttons, focused-dependency-path dimming. Static transforms only
 * (no animation); reduced-motion unaffected (nothing animates).
 */

const NODE_W = 132;
const NODE_H = 40;
const NODE_GAP_X = 28;
const LAYER_GAP_Y = 68;
const MARGIN = 24;

/** Semantic layer order (top → bottom). Kinds outside the map go last. */
const LAYER_ORDER: readonly string[] = [
  'ResearchDocument',
  'DocumentVersion',
  'Collection',
  'ReferenceOccurrence',
  'Claim',
  'CitationUse',
  'Conclusion',
  'Publication',
  'SourceNotice',
  'Study',
  'EvidenceFamily',
  'Dataset',
];

/** Edge visual classes keyed by relation type (never conflated, §2). */
export type EdgeStyle = 'support' | 'historical' | 'uncertain' | 'notice' | 'confirmed' | 'structural';

export function edgeStyleFor(edge: GraphEdge): EdgeStyle {
  switch (edge.type) {
    case 'CITATION_USE_SUPPORTS_CLAIM':
      return 'support';
    case 'MENTIONS_HISTORICALLY':
      return 'historical';
    case 'POSSIBLE_MATCH':
      return 'uncertain';
    case 'PUBLICATION_HAS_NOTICE':
      return 'notice';
    case 'OCCURRENCE_MATCHES_PUBLICATION':
      return 'confirmed';
    default:
      return 'structural';
  }
}

interface EdgePalette {
  strokeClass: string;
  fillClass: string;
  dash: string;
  label: string;
  markerId: string;
}

const EDGE_PALETTE: Record<EdgeStyle, EdgePalette> = {
  support: { strokeClass: 'stroke-review-text', fillClass: 'fill-review-text', dash: '', label: 'Direct support', markerId: 'arrow-support' },
  historical: { strokeClass: 'stroke-uncertain-text', fillClass: 'fill-uncertain-text', dash: '', label: 'Historical mention', markerId: 'arrow-historical' },
  uncertain: { strokeClass: 'stroke-uncertain-text', fillClass: 'fill-uncertain-text', dash: '6 4', label: 'Possible match — unverified', markerId: 'arrow-uncertain' },
  notice: { strokeClass: 'stroke-notice-text', fillClass: 'fill-notice-text', dash: '', label: 'Verified status notice', markerId: 'arrow-notice' },
  confirmed: { strokeClass: 'stroke-ink-muted', fillClass: 'fill-ink-muted', dash: '', label: 'Confirmed match', markerId: 'arrow-confirmed' },
  structural: { strokeClass: 'stroke-ink-border', fillClass: 'fill-ink-border', dash: '', label: 'Record provenance / structure', markerId: 'arrow-structural' },
};

const STYLE_ORDER: readonly EdgeStyle[] = [
  'support',
  'historical',
  'uncertain',
  'notice',
  'confirmed',
  'structural',
];

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function truncateMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  const side = Math.max(1, Math.floor((max - 1) / 2));
  return `${value.slice(0, side)}…${value.slice(value.length - side)}`;
}

export function nodePrimaryLabel(node: GraphNode): string {
  const candidates = ['title', 'text', 'rawText', 'label', 'id'];
  for (const key of candidates) {
    const value = node.properties[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return node.id;
}

/** Backwards-compatible alias used elsewhere. */
export const nodeLabel = nodePrimaryLabel;

function nodeStrokeClass(node: GraphNode, selected: boolean): string {
  if (selected) return 'stroke-brand-deep';
  switch (node.kind) {
    case 'SourceNotice':
      return 'stroke-notice-text';
    case 'Publication':
      return 'stroke-brand-deep';
    default:
      return 'stroke-ink-muted';
  }
}

interface Layout {
  layers: GraphNode[][];
  width: number;
  height: number;
}

function computeLayout(nodes: GraphNode[]): Layout {
  const buckets = new Map<number, GraphNode[]>();
  const rest: GraphNode[] = [];
  for (const node of nodes) {
    const layer = LAYER_ORDER.indexOf(node.kind);
    if (layer >= 0) {
      const bucket = buckets.get(layer) ?? [];
      bucket.push(node);
      buckets.set(layer, bucket);
    } else {
      rest.push(node);
    }
  }
  const usedLayers = [...buckets.keys()].sort((a, b) => a - b);
  const layers: GraphNode[][] = [];
  for (const layer of usedLayers) {
    layers.push((buckets.get(layer) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id)));
  }
  if (rest.length > 0) {
    layers.push(rest.slice().sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)));
  }
  const widest = layers.reduce((max, layer) => Math.max(max, layer.length), 1);
  const width = MARGIN * 2 + widest * NODE_W + (widest - 1) * NODE_GAP_X;
  const height = MARGIN * 2 + layers.length * NODE_H + Math.max(layers.length - 1, 0) * LAYER_GAP_Y;
  return { layers, width, height };
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (node: GraphNode) => void;
  focusedNodeIds?: Set<string> | null;
  focusedEdgeIds?: Set<string> | null;
}

export default function GraphCanvas({ nodes, edges, selectedId, onSelect, focusedNodeIds, focusedEdgeIds }: GraphCanvasProps) {
  const layout = computeLayout(nodes);

  const positions = new Map<string, { x: number; y: number }>();
  layout.layers.forEach((layer, layerIndex) => {
    const rowWidth = layer.length * NODE_W + (layer.length - 1) * NODE_GAP_X;
    const start = (layout.width - rowWidth) / 2;
    layer.forEach((node, index) => {
      positions.set(node.id, {
        x: start + index * (NODE_W + NODE_GAP_X),
        y: MARGIN + layerIndex * (NODE_H + LAYER_GAP_Y),
      });
    });
  });

  const styleClasses = new Set(edges.map((edge) => edgeStyleFor(edge)));

  // Viewport state (viewBox-based zoom/pan).
  const [vb, setVb] = useState({ x: 0, y: 0, w: layout.width, h: layout.height });
  useEffect(() => {
    setVb({ x: 0, y: 0, w: layout.width, h: layout.height });
  }, [layout.width, layout.height]);

  const svgRef = useRef<SVGSVGElement>(null);
  const panningRef = useRef<{ active: boolean; lastX: number; lastY: number } | null>(null);

  const zoom = useCallback(
    (factor: number, origin?: { x: number; y: number }) => {
      setVb((prev) => {
        const scale = prev.w > 0 ? layout.width / prev.w : 1;
        const newScale = GV.clampZoom(scale * factor);
        const newW = layout.width / newScale;
        const newH = layout.height / newScale;
        const ox = origin ? origin.x : prev.x + prev.w / 2;
        const oy = origin ? origin.y : prev.y + prev.h / 2;
        const ratio = newScale / (scale || 1);
        const newX = ox - (ox - prev.x) / ratio;
        const newY = oy - (oy - prev.y) / ratio;
        return { x: newX, y: newY, w: newW, h: newH };
      });
    },
    [layout.width, layout.height],
  );

  const reset = useCallback(() => {
    setVb({ x: 0, y: 0, w: layout.width, h: layout.height });
  }, [layout.width, layout.height]);

  // Native wheel listener (passive false) so ctrl+wheel can preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const ctm = svg.getScreenCTM();
      let origin = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
      if (ctm) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const p = pt.matrixTransform(ctm.inverse());
        origin = { x: p.x, y: p.y };
      }
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoom(factor, origin);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoom, vb.x, vb.y, vb.w, vb.h]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Only pan on empty canvas (background rect or svg root).
    const target = e.target as Element;
    if (target !== svgRef.current && target.getAttribute?.('data-bg') !== 'true') return;
    panningRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = panningRef.current;
    if (!p?.active) return;
    const svg = svgRef.current;
    if (!svg) return;
    const scaleScreen = svg.clientWidth > 0 ? svg.clientWidth / vb.w : 1;
    const dx = (e.clientX - p.lastX) / scaleScreen;
    const dy = (e.clientY - p.lastY) / scaleScreen;
    // Dragging content right => viewBox x decreases.
    setVb((prev) => ({ ...prev, x: prev.x - dx, y: prev.y - dy }));
    panningRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
  };
  const onPointerUp = () => {
    if (panningRef.current) panningRef.current.active = false;
  };

  const isDimmedNode = (id: string) =>
    !!focusedNodeIds && focusedNodeIds.size > 0 && !focusedNodeIds.has(id);
  const isDimmedEdge = (key: string) =>
    !!focusedEdgeIds && focusedEdgeIds.size > 0 && !focusedEdgeIds.has(key);

  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-ink-border bg-paper p-3 min-h-[280px] md:min-h-[420px]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="zoom-in"
          aria-label="Zoom in"
          onClick={() => zoom(1.25)}
          className="rounded border border-ink-border bg-paper-raised px-2 py-1 text-xs text-ink hover:bg-paper-deep"
        >
          +
        </button>
        <button
          type="button"
          data-testid="zoom-out"
          aria-label="Zoom out"
          onClick={() => zoom(1 / 1.25)}
          className="rounded border border-ink-border bg-paper-raised px-2 py-1 text-xs text-ink hover:bg-paper-deep"
        >
          −
        </button>
        <button
          type="button"
          data-testid="reset-view"
          aria-label="Reset view"
          onClick={reset}
          className="rounded border border-ink-border bg-paper-raised px-2 py-1 text-xs text-ink hover:bg-paper-deep"
        >
          Reset view
        </button>
        <span className="text-xs text-ink-muted" data-testid="zoom-level">
          {Math.round((layout.width / vb.w) * 100)}%
        </span>
      </div>
      <svg
        ref={svgRef}
        role="group"
        aria-label="Layered graph layout. Interactive records; a complete text list follows below."
        data-testid="graph-canvas"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMin meet"
        width="100%"
        height="auto"
        className="max-w-full h-auto touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          {STYLE_ORDER.filter((style) => styleClasses.has(style)).map((style) => (
            <marker
              key={EDGE_PALETTE[style].markerId}
              id={EDGE_PALETTE[style].markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className={EDGE_PALETTE[style].fillClass} />
            </marker>
          ))}
        </defs>

        {/* Transparent background for pan hit-target. */}
        <rect data-bg="true" x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" />

        {/* Edges first so node boxes overlay the lines. */}
        {edges.map((edge, index) => {
          const from = positions.get(edge.fromId);
          const to = positions.get(edge.toId);
          const style = edgeStyleFor(edge);
          const palette = EDGE_PALETTE[style];
          if (!from || !to) return null;
          const key = GV.edgeKey(edge, index);
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          const isUpward = y2 < y1;
          const start = { x: x1, y: isUpward ? from.y : y1 };
          const end = { x: x2, y: isUpward ? y2 + NODE_H : y2 };
          const dimmed = isDimmedEdge(key);
          return (
            <line
              key={key}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className={`${palette.strokeClass} fill-none ${dimmed ? 'opacity-30' : ''}`}
              strokeWidth="1.5"
              strokeDasharray={palette.dash || undefined}
              markerEnd={`url(#${palette.markerId})`}
              data-dimmed={dimmed}
            />
          );
        })}

        {layout.layers.map((layer, layerIndex) => (
          <g key={`layer-${layerIndex}`}>
            {layer.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;
              const selected = selectedId === node.id;
              const isSynthetic = node.isSynthetic === true;
              const hasTitleField = ['title', 'text', 'rawText', 'label'].some(
                (k) => typeof node.properties[k] === 'string' && (node.properties[k] as string).length > 0,
              );
              const rawLabel = nodePrimaryLabel(node);
              const displayLabel = hasTitleField
                ? truncate(rawLabel, 20)
                : truncateMiddle(rawLabel, 18);
              const firstNodeId = layout.layers[0]?.[0]?.id;
              const tabIndex =
                selected || (selectedId === null && node.id === firstNodeId) ? 0 : -1;
              const interactive = {
                role: 'button' as const,
                tabIndex,
                'aria-pressed': selected,
                'aria-label': `${node.kind}: ${node.id}`,
                onClick: () => onSelect(node),
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(node);
                  }
                },
              };
              const dimmed = isDimmedNode(node.id);
              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className={`cursor-pointer focus-visible:outline-2 focus-visible:outline-brand ${dimmed ? 'opacity-30' : ''}`}
                  data-testid={`graph-node-${node.id}`}
                  data-selected={selected}
                  data-dimmed={dimmed}
                  {...interactive}
                >
                  <title>{`${node.kind}: ${rawLabel}`}</title>
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx="8"
                    ry="8"
                    strokeWidth={selected ? 3 : 1.5}
                    strokeDasharray={isSynthetic ? '4 3' : undefined}
                    className={`${nodeStrokeClass(node, selected)} ${selected ? 'fill-brand-surface' : 'fill-paper-raised'}`}
                  />
                  {selected && (
                    <rect
                      x="-3"
                      y="-3"
                      width={NODE_W + 6}
                      height={NODE_H + 6}
                      rx="10"
                      ry="10"
                      className="fill-none stroke-brand"
                      strokeWidth="1.5"
                      pointerEvents="none"
                    />
                  )}
                  <text x={NODE_W / 2} y={15} textAnchor="middle" className="fill-ink-muted" fontSize="9">
                    {truncate(node.kind, 24)}
                  </text>
                  <text x={NODE_W / 2} y={30} textAnchor="middle" className="fill-ink" fontSize="11" fontWeight={selected ? 600 : 400}>
                    {displayLabel}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>

      <p className="mt-2 text-xs text-ink-muted">
        Arrows point from source to target record; node outlines carry the dashed/solid
        encoding explained in the legend. Nothing here is animated, and the layout always
        shows exactly the records the server returned. Drag empty space to pan; Ctrl+wheel
        (or the buttons above) to zoom.
      </p>
    </div>
  );
}

export function GraphLegend(): ReactNode {
  return (
    <div
      data-testid="graph-legend"
      className="rounded-lg border border-ink-border bg-paper-raised px-3 py-2 text-xs leading-5 text-ink-muted"
    >
      <p className="mb-1 font-semibold uppercase tracking-wide text-[10px] text-ink">Legend</p>
      <ul className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
        {STYLE_ORDER.map((style) => (
          <li key={style} className="flex items-center gap-2">
            <svg aria-hidden="true" width="28" height="10" viewBox="0 0 28 10">
              <line
                x1="1"
                y1="5"
                x2="27"
                y2="5"
                className={`${EDGE_PALETTE[style].strokeClass} fill-none`}
                strokeWidth="1.5"
                strokeDasharray={EDGE_PALETTE[style].dash || undefined}
              />
            </svg>
            {EDGE_PALETTE[style].label}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <svg aria-hidden="true" width="28" height="10" viewBox="0 0 28 10">
            <line x1="1" y1="5" x2="27" y2="5" className="stroke-reviewed-default fill-none" strokeWidth="2" />
          </svg>
          Human-reviewed (reserved — none recorded in this build)
        </li>
      </ul>

      {/* Node outline encodings — the legend alone explains every visual style. */}
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-ink">
        Node outlines
      </p>
      <ul className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <svg aria-hidden="true" width="28" height="12" viewBox="0 0 28 12">
            <rect
              x="1"
              y="1"
              width="26"
              height="10"
              rx="3"
              className="stroke-ink-muted fill-none"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </svg>
          Dashed outline — fictional / guided-demo entity (marked “FICTIONAL / GUIDED DEMO”)
        </li>
        <li className="flex items-center gap-2">
          <svg aria-hidden="true" width="28" height="12" viewBox="0 0 28 12">
            <rect
              x="1"
              y="1"
              width="26"
              height="10"
              rx="3"
              className="stroke-ink-muted fill-none"
              strokeWidth="1.5"
            />
          </svg>
          Solid outline — real bibliographic record
        </li>
      </ul>
      <p className="mt-1">
        Sentence equivalents of every connection are in the records list, so color is never the
        only carrier of meaning.
      </p>
    </div>
  );
}

export interface RecordsListProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (node: GraphNode) => void;
  focusedNodeIds?: Set<string> | null;
  focusedEdgeIds?: Set<string> | null;
}

function nodeSublabel(node: GraphNode): string {
  return nodePrimaryLabel(node);
}

/**
 * The records list is the accessible equivalent of the canvas (handoff §6)
 * and doubles as the plain-HTML fallback view required by the M2 brief.
 */
export function GraphRecordsList({ nodes, edges, selectedId, onSelect, focusedNodeIds, focusedEdgeIds }: RecordsListProps) {
  const isDimmedNode = (id: string) =>
    !!focusedNodeIds && focusedNodeIds.size > 0 && !focusedNodeIds.has(id);
  const isDimmedEdge = (key: string) =>
    !!focusedEdgeIds && focusedEdgeIds.size > 0 && !focusedEdgeIds.has(key);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div data-testid="graph-nodes-list">
        <h3 className="text-sm font-semibold text-ink">Records ({nodes.length})</h3>
        <ul className="mt-2 space-y-1">
          {nodes.map((node) => (
            <li key={node.id} className={isDimmedNode(node.id) ? 'opacity-40' : ''} data-dimmed={isDimmedNode(node.id)}>
              <button
                type="button"
                onClick={() => onSelect(node)}
                aria-pressed={selectedId === node.id}
                className={`w-full rounded border px-3 py-2 text-left text-xs no-underline ${
                  selectedId === node.id
                    ? 'border-brand bg-brand-surface text-ink'
                    : 'border-ink-border bg-paper-raised text-ink hover:bg-paper-deep'
                }`}
              >
                <span className="font-mono text-[11px] text-ink-muted">{node.kind}</span>
                <span className="mx-1 text-ink-border">·</span>
                <span className="break-all">{node.id}</span>
                <span className="block text-ink-muted">{nodeSublabel(node)}</span>
                <span className="block">
                  {node.provenanceKind ? `${node.provenanceKind}` : 'provenance not recorded'}
                  {' · '}
                  {node.isSynthetic === true
                    ? 'FICTIONAL / GUIDED DEMO'
                    : node.isSynthetic === false
                      ? 'real record'
                      : 'synthetic status not recorded'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div data-testid="graph-edges-list">
        <h3 className="text-sm font-semibold text-ink">Connections ({edges.length})</h3>
        <ul className="mt-2 space-y-1">
          {edges.map((edge, index) => {
            const style = EDGE_PALETTE[edgeStyleFor(edge)];
            const key = GV.edgeKey(edge, index);
            const dimmed = isDimmedEdge(key);
            return (
              <li
                key={key}
                className={`rounded border border-ink-border bg-paper-raised px-3 py-2 text-xs text-ink ${dimmed ? 'opacity-40' : ''}`}
                data-dimmed={dimmed}
              >
                <span className="font-mono text-[11px] text-ink-muted">{edge.type}</span>
                <span className="block">
                  <span className="break-all">{edge.fromId}</span>
                  <span aria-hidden="true"> → </span>
                  <span className="break-all">{edge.toId}</span>
                </span>
                <span className="block text-ink-muted">
                  <span className={`inline-block h-2 w-4 align-middle ${style.strokeClass}`} />
                  <span className="ml-1">{style.label}</span>
                  {edge.provenanceKind ? ` · provenance: ${edge.provenanceKind}` : ''}
                  {edge.reviewState ? ` · review state: ${edge.reviewState}` : ''}
                </span>
                {edge.rationale && <span className="mt-1 block text-ink-muted">{edge.rationale}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
