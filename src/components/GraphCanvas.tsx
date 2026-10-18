import type { ReactNode } from 'react';
import type { GraphEdge, GraphNode } from '../lib/api';

/**
 * Static, force-free layered graph (M2 Knowledge Graph first cut).
 *
 * No layout physics, no animation loops (reduced-motion respected), no heavy
 * dependencies. Nodes group into semantic layers (document → version →
 * claim/citation/publication → notices), deterministically ordered by id so
 * the same graph always renders the same picture. Every visual style has a
 * non-color equivalent: the legend names each pattern, dashed-vs-solid marks
 * uncertainty vs confirmed, and the records list below the canvas is the
 * screen-reader equivalent (handoff §2, §6).
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

function nodeLabel(node: GraphNode): string {
  const candidates = ['title', 'text', 'rawText', 'label', 'id'];
  for (const key of candidates) {
    const value = node.properties[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return node.id;
}

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
}

export default function GraphCanvas({ nodes, edges, selectedId, onSelect }: GraphCanvasProps) {
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

  return (
    <div className="overflow-x-auto rounded-lg border border-ink-border bg-paper p-3">
      <svg
        role="group"
        aria-label="Layered graph layout. Interactive records; a complete text list follows below."
        data-testid="graph-canvas"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="min-w-full"
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

        {/* Edges first so node boxes overlay the lines. */}
        {edges.map((edge, index) => {
          const from = positions.get(edge.fromId);
          const to = positions.get(edge.toId);
          const style = edgeStyleFor(edge);
          const palette = EDGE_PALETTE[style];
          if (!from || !to) return null;
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          const isUpward = y2 < y1;
          const start = { x: x1, y: isUpward ? from.y : y1 };
          const end = { x: x2, y: isUpward ? y2 + NODE_H : y2 };
          return (
            <line
              key={edge.id ?? `${edge.type}-${index}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className={`${palette.strokeClass} fill-none`}
              strokeWidth="1.5"
              strokeDasharray={palette.dash || undefined}
              markerEnd={`url(#${palette.markerId})`}
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
              const interactive = {
                role: 'button' as const,
                tabIndex: 0,
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
              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="cursor-pointer focus-visible:outline-2 focus-visible:outline-brand"
                  data-testid={`graph-node-${node.id}`}
                  {...interactive}
                >
                  <title>{`${node.kind}: ${nodeLabel(node)}`}</title>
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx="8"
                    ry="8"
                    strokeWidth={selected ? 2.5 : 1.5}
                    strokeDasharray={isSynthetic ? '4 3' : undefined}
                    className={`${nodeStrokeClass(node, selected)} fill-paper-raised`}
                  />
                  <text x={NODE_W / 2} y={15} textAnchor="middle" className="fill-ink-muted" fontSize="9">
                    {truncate(node.kind, 24)}
                  </text>
                  <text x={NODE_W / 2} y={30} textAnchor="middle" className="fill-ink" fontSize="11">
                    {truncate(nodeLabel(node), 20)}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>

      <p className="mt-2 text-xs text-ink-muted">
        Arrows point from source to target record. Dashed outlines mark fictional/demo
        entities (labelled “FICTIONAL / GUIDED DEMO” in the inspector); solid outlines mark
        real bibliographic records. Nothing here is animated, and the layout always shows
        exactly the records the server returned.
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
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
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
}

function nodeSublabel(node: GraphNode): string {
  return nodeLabel(node);
}

/**
 * The records list is the accessible equivalent of the canvas (handoff §6)
 * and doubles as the plain-HTML fallback view required by the M2 brief.
 */
export function GraphRecordsList({ nodes, edges, selectedId, onSelect }: RecordsListProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div data-testid="graph-nodes-list">
        <h3 className="text-sm font-semibold text-ink">Records ({nodes.length})</h3>
        <ul className="mt-2 space-y-1">
          {nodes.map((node) => (
            <li key={node.id}>
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
            return (
              <li
                key={edge.id ?? `${edge.type}-${index}`}
                className="rounded border border-ink-border bg-paper-raised px-3 py-2 text-xs text-ink"
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
