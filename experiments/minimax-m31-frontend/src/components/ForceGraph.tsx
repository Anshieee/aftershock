import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import type { GraphEdgeRecord, GraphNodeRecord } from '../fixtures';
import { edgeFamily } from '../fixtures';

export interface GraphNode extends GraphNodeRecord {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink extends Omit<GraphEdgeRecord, 'fromId' | 'toId'> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdgeRecord[];
  width: number;
  height: number;
  selectedId?: string | null;
  hoveredId?: string | null;
  onSelect?: (nodeId: string | null) => void;
  onHover?: (nodeId: string | null) => void;
  /** Restrict the view to the neighbourhood of this node. */
  focusId?: string | null;
  compact?: boolean;
  className?: string;
  /** 'auto' shows labels for the focused neighbourhood only. */
  labelMode?: 'auto' | 'all' | 'none';
}

const NODE_RADIUS: Record<string, number> = {
  ResearchDocument: 8,
  DocumentVersion: 6,
  Claim: 6.5,
  Conclusion: 7,
  CitationUse: 5,
  Publication: 6.5,
  SourceNotice: 8,
  ReferenceOccurrence: 5.5,
  Study: 6,
  Dataset: 6,
  EvidenceReview: 6.5,
};

const NODE_COLOR_VAR: Record<string, string> = {
  ResearchDocument: '--c-ink',
  DocumentVersion: '--c-ink-soft',
  Claim: '--c-brand',
  Conclusion: '--c-brand-deep',
  CitationUse: '--c-amber',
  Publication: '--c-sage',
  SourceNotice: '--c-notice',
  ReferenceOccurrence: '--c-uncertain',
  Study: '--c-brand-deep',
  Dataset: '--c-amber-deep',
  EvidenceReview: '--c-uncertain-deep',
};

const EDGE_COLOR_VAR: Record<string, string> = {
  support: '--c-brand',
  contrast: '--c-notice',
  historical: '--c-sage',
  method: '--c-ink-soft',
  uncertain: '--c-uncertain',
  notice: '--c-notice',
  confirmed: '--c-sage',
  structural: '--c-ink-border',
  dependency: '--c-amber',
};

const DASHED = new Set(['uncertain', 'dependency', 'structural', 'method']);

/** Deterministic pseudo-random so the layout starts identically every time. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readVar(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `rgb(${value})` : 'rgb(120 120 120)';
}

export interface ForceGraphHandle {
  fit: () => void;
  zoomBy: (factor: number) => void;
}

export const ForceGraph = forwardRef<ForceGraphHandle, Props>(function ForceGraph({
  nodes,
  edges,
  width,
  height,
  selectedId = null,
  hoveredId = null,
  onSelect,
  onHover,
  focusId = null,
  compact = false,
  className = '',
  labelMode = 'auto',
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simulationRef = useRef<Simulation<GraphNode, undefined> | null>(null);
  const transformRef = useRef({ k: 1, x: 0, y: 0 });
  const dragRef = useRef<{ node: GraphNode | null; panning: boolean; lastX: number; lastY: number }>({
    node: null,
    panning: false,
    lastX: 0,
    lastY: 0,
  });
  /** True once the reader has moved the view themselves. */
  const userMovedRef = useRef(false);
  /** True once the force layout has come to rest. */
  const settledRef = useRef(false);
  const fitToViewRef = useRef<(animate: boolean) => void>(() => {});
  const [, forceRender] = useState(0);

  const nodeList = useMemo<GraphNode[]>(() => {
    const random = mulberry32(20260311);
    const radius = Math.max(160, Math.min(width, height) * 0.42);
    return nodes.map((node) => {
      const angle = random() * Math.PI * 2;
      const distance = radius * (0.25 + random() * 0.75);
      return {
        ...node,
        x: Math.cos(angle) * distance + width / 2,
        y: Math.sin(angle) * distance + height / 2,
      };
    });
  }, [nodes, width, height]);

  const linkList = useMemo<GraphLink[]>(
    () =>
      edges.map((edge) => ({
        ...edge,
        source: edge.fromId,
        target: edge.toId,
      })),
    // `nodeList` is a dependency on purpose: d3-force rewrites link.source
    // into a node object, so the links must be rebuilt whenever the nodes
    // are — otherwise an edge would be drawn to a stale position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, nodeList],
  );

  /* ---- Simulation ---------------------------------------------------- */
  useEffect(() => {
    if (nodeList.length === 0) return undefined;
    settledRef.current = false;
    const simulation = forceSimulation<GraphNode>(nodeList)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(linkList)
          .id((node) => node.id)
          .distance((link) => {
            const family = edgeFamily(link.type);
            return family === 'structural' ? 118 : 78;
          })
          .strength(0.14),
      )
      .force('charge', forceManyBody<GraphNode>().strength(-230).distanceMax(420))
      .force('collide', forceCollide<GraphNode>((node) => (NODE_RADIUS[node.kind] ?? 6) + 17))
      .force('x', forceX<GraphNode>(width / 2).strength(0.055))
      .force('y', forceY<GraphNode>(height / 2).strength(0.075))
      .alpha(0.95)
      .alphaDecay(0.032)
      .on('tick', () => forceRender((tick) => tick + 1))
      .on('end', () => {
        settledRef.current = true;
        forceRender((tick) => tick + 1);
        // The layout has settled — frame the whole network.
        if (!userMovedRef.current) fitToViewRef.current(true);
      });

    simulationRef.current = simulation;
    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [nodeList, linkList, width, height]);

  /* ---- Fit to view --------------------------------------------------- */
  const fitToView = useCallback(
    (animate = true) => {
      const positions = nodeList.filter((node) => typeof node.x === 'number');
      if (positions.length === 0) return;
      const minX = Math.min(...positions.map((node) => node.x!));
      const maxX = Math.max(...positions.map((node) => node.x!));
      const minY = Math.min(...positions.map((node) => node.y!));
      const maxY = Math.max(...positions.map((node) => node.y!));
      const padding = compact ? 26 : 64;
      const graphWidth = Math.max(1, maxX - minX);
      const graphHeight = Math.max(1, maxY - minY);
      const k = Math.min(
        (width - padding * 2) / graphWidth,
        (height - padding * 2) / graphHeight,
        1.9,
      );
      const tx = width / 2 - ((minX + maxX) / 2) * k;
      const ty = height / 2 - ((minY + maxY) / 2) * k;
      if (!animate) {
        transformRef.current = { k, x: tx, y: ty };
        forceRender((tick) => tick + 1);
        return;
      }
      const from = { ...transformRef.current };
      const start = performance.now();
      const duration = 420;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        transformRef.current = {
          k: from.k + (k - from.k) * eased,
          x: from.x + (tx - from.x) * eased,
          y: from.y + (ty - from.y) * eased,
        };
        forceRender((tick) => tick + 1);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    [nodeList, width, height, compact],
  );

  useEffect(() => {
    fitToViewRef.current = fitToView;
  }, [fitToView]);

  useEffect(() => {
    const timer = window.setTimeout(() => fitToView(false), 200);
    // While the layout settles, keep the whole network framed — the way a
    // knowledge graph stays in view as it opens.
    const follow = window.setInterval(() => {
      if (!userMovedRef.current && !settledRef.current) fitToView(false);
    }, 320);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(follow);
    };
  }, [fitToView]);

  /* ---- Neighbourhood highlighting ------------------------------------ */
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!map.has(edge.fromId)) map.set(edge.fromId, new Set());
      if (!map.has(edge.toId)) map.set(edge.toId, new Set());
      map.get(edge.fromId)!.add(edge.toId);
      map.get(edge.toId)!.add(edge.fromId);
    }
    return map;
  }, [edges]);

  const focusSet = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    for (const id of neighbours.get(focusId) ?? []) set.add(id);
    for (const id of neighbours.get(focusId) ?? []) {
      for (const second of neighbours.get(id) ?? []) set.add(second);
    }
    return set;
  }, [focusId, neighbours]);

  const activeId = hoveredId ?? selectedId;
  const activeNeighbours = useMemo(() => {
    if (!activeId) return null;
    return new Set<string>([activeId, ...(neighbours.get(activeId) ?? [])]);
  }, [activeId, neighbours]);

  /* ---- Drawing -------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const { k, x: tx, y: ty } = transformRef.current;
    const nodeById = new Map(nodeList.map((node) => [node.id, node]));

    context.save();
    context.translate(tx, ty);
    context.scale(k, k);

    // Edges
    for (const link of linkList) {
      const source = typeof link.source === 'string' ? nodeById.get(link.source) : link.source;
      const target = typeof link.target === 'string' ? nodeById.get(link.target) : link.target;
      if (!source || !target || typeof source.x !== 'number' || typeof target.x !== 'number') continue;
      const family = edgeFamily(link.type);
      const dim =
        activeNeighbours && !(activeNeighbours.has(source.id) && activeNeighbours.has(target.id));
      const inFocus = !focusSet || (focusSet.has(source.id) && focusSet.has(target.id));
      const colour = readVar(EDGE_COLOR_VAR[family] ?? '--c-ink-border');
      context.save();
      context.strokeStyle = colour;
      context.globalAlpha = dim ? 0.14 : inFocus ? 0.88 : 0.42;
      context.lineWidth = (dim ? 0.8 : 1.2) / k;
      if (DASHED.has(family)) {
        context.setLineDash([5 / k, 4 / k]);
      }
      context.beginPath();
      context.moveTo(source.x!, source.y!);
      context.lineTo(target.x!, target.y!);
      context.stroke();
      context.restore();
    }

    // Nodes
    for (const node of nodeList) {
      if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;
      const radius = (NODE_RADIUS[node.kind] ?? 6) * (node.id === selectedId ? 1.35 : 1);
      const dim = activeNeighbours ? !activeNeighbours.has(node.id) : false;
      const inFocus = !focusSet || focusSet.has(node.id);
      const colour = readVar(NODE_COLOR_VAR[node.kind] ?? '--c-ink');
      context.save();
      context.globalAlpha = dim ? 0.16 : inFocus ? 1 : 0.3;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fillStyle = colour;
      context.fill();
      if (node.id === selectedId || node.id === hoveredId) {
        context.lineWidth = 2 / k;
        context.strokeStyle = readVar('--c-paper-raised');
        context.stroke();
      }
      if (node.isSynthetic) {
        context.globalAlpha = (dim ? 0.16 : inFocus ? 1 : 0.3) * 0.85;
        context.beginPath();
        context.arc(node.x, node.y, radius + 2.4 / k, 0, Math.PI * 2);
        context.strokeStyle = colour;
        context.lineWidth = 1 / k;
        context.setLineDash([2 / k, 2 / k]);
        context.stroke();
      }
      context.restore();
    }

    // Labels — drawn after the transform so they stay readable.
    context.restore();
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'top';
    const showNone = labelMode === 'none';
    if (!showNone) {
      const placed: Array<[number, number, number, number]> = [];
      const overlap = (
        a: [number, number, number, number],
        b: [number, number, number, number],
      ) =>
        a[0] < b[0] + b[2] &&
        a[0] + a[2] > b[0] &&
        a[1] < b[1] + b[3] &&
        a[1] + a[3] > b[1];

      const ordered = [...nodeList].sort((a, b) => {
        const rank = (node: GraphNode) =>
          node.id === selectedId ? 0 : node.id === hoveredId ? 1 : activeNeighbours?.has(node.id) ? 2 : 3;
        return rank(a) - rank(b);
      });

      for (const node of ordered) {
        if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;
        const dim = activeNeighbours ? !activeNeighbours.has(node.id) : false;
        const inFocus = !focusSet || focusSet.has(node.id);
        const emphasised = node.id === selectedId || node.id === hoveredId;
        const radius = (NODE_RADIUS[node.kind] ?? 6) * (node.id === selectedId ? 1.35 : 1);
        const maxChars = compact ? 22 : 24;
        const label =
          node.label.length > maxChars ? `${node.label.slice(0, maxChars - 1)}…` : node.label;
        const fontSize = compact ? 8.5 : 10;
        context.font = `${emphasised ? 650 : 500} ${fontSize}px "Inter Tight Variable", Inter, system-ui, sans-serif`;
        const labelX = node.x * k + tx;
        const labelY = node.y * k + ty + radius * k + 3;
        const width = context.measureText(label).width;
        const box: [number, number, number, number] = [
          labelX - width / 2 - 2,
          labelY - 1,
          width + 4,
          fontSize + 4,
        ];
        if (!emphasised && labelMode === 'auto') {
          if (placed.some((other) => overlap(box, other))) continue;
        }
        placed.push(box);

        context.fillStyle = emphasised ? readVar('--c-ink') : readVar('--c-ink-muted');
        context.globalAlpha = dim ? 0.32 : inFocus ? 0.98 : 0.6;
        if (emphasised) {
          context.save();
          context.globalAlpha = 0.92;
          context.fillStyle = readVar('--c-paper-raised');
          context.fillRect(box[0], box[1], box[2], box[3]);
          context.restore();
          context.fillStyle = readVar('--c-ink');
          context.globalAlpha = 1;
        }
        context.fillText(label, labelX, labelY);
      }
    }
    context.restore();
  }, [
    nodeList,
    linkList,
    width,
    height,
    selectedId,
    hoveredId,
    activeNeighbours,
    focusSet,
    compact,
    labelMode,
  ]);

  /* ---- Imperative controls ------------------------------------------- */
  useImperativeHandle(
    ref,
    () => ({
      fit: () => {
        userMovedRef.current = false;
        fitToView(true);
      },
      zoomBy: (factor: number) => {
        userMovedRef.current = true;
        const current = transformRef.current;
        const k = Math.min(4, Math.max(0.18, current.k * factor));
        const ratio = k / current.k;
        transformRef.current = {
          k,
          x: width / 2 - (width / 2 - current.x) * ratio,
          y: height / 2 - (height / 2 - current.y) * ratio,
        };
        forceRender((tick) => tick + 1);
      },
    }),
    [fitToView, width, height],
  );

  /* ---- Pointer interaction -------------------------------------------- */
  const nodeAt = useCallback(
    (clientX: number, clientY: number): GraphNode | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const { k, x: tx, y: ty } = transformRef.current;
      const px = (clientX - rect.left - tx) / k;
      const py = (clientY - rect.top - ty) / k;
      let best: GraphNode | null = null;
      let bestDistance = Infinity;
      for (const node of nodeList) {
        if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;
        const distance = Math.hypot(node.x - px, node.y - py);
        const threshold = (NODE_RADIUS[node.kind] ?? 6) + 6 / k;
        if (distance < threshold && distance < bestDistance) {
          best = node;
          bestDistance = distance;
        }
      }
      return best;
    },
    [nodeList],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const node = nodeAt(event.clientX, event.clientY);
    dragRef.current = {
      node,
      panning: !node,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    if (node) {
      node.fx = node.x ?? 0;
      node.fy = node.y ?? 0;
      simulationRef.current?.alphaTarget(0.22).restart();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.node) {
      userMovedRef.current = true;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { k, x: tx, y: ty } = transformRef.current;
      drag.node.fx = (event.clientX - rect.left - tx) / k;
      drag.node.fy = (event.clientY - rect.top - ty) / k;
      return;
    }
    if (drag.panning) {
      userMovedRef.current = true;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      transformRef.current = {
        ...transformRef.current,
        x: transformRef.current.x + dx,
        y: transformRef.current.y + dy,
      };
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      forceRender((tick) => tick + 1);
      return;
    }
    const hovered = nodeAt(event.clientX, event.clientY);
    onHover?.(hovered ? hovered.id : null);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    const drag = dragRef.current;
    if (drag.node) {
      drag.node.fx = null;
      drag.node.fy = null;
      simulationRef.current?.alphaTarget(0);
      onSelect?.(drag.node.id);
    } else if (drag.panning) {
      onSelect?.(null);
    }
    dragRef.current = { node: null, panning: false, lastX: 0, lastY: 0 };
  };

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    userMovedRef.current = true;
    const factor = Math.exp(-event.deltaY * 0.0016);
    const current = transformRef.current;
    const k = Math.min(4, Math.max(0.18, current.k * factor));
    const ratio = k / current.k;
    transformRef.current = {
      k,
      x: pointerX - (pointerX - current.x) * ratio,
      y: pointerY - (pointerY - current.y) * ratio,
    };
    forceRender((tick) => tick + 1);
  }, [width, height]);

  // A native, non-passive listener: React's own wheel handler is passive
  // and would refuse preventDefault, so the page would scroll instead.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        data-panning={dragRef.current.panning ? 'true' : 'false'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => onHover?.(null)}
        role="img"
        aria-label={`Evidence graph with ${nodes.length} records and ${edges.length} relationships. A full list of records follows.`}
      />
      <ul className="sr-only">
        {nodeList.map((node) => (
          <li key={node.id}>
            {node.label} — {node.kind}
            {node.isSynthetic ? ' — synthetic sample record' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
});
