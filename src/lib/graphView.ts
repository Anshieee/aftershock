/**
 * Pure view helpers for the Knowledge Graph canvas (M4.5).
 *
 * Kept free of React/DOM so they can be unit-tested in isolation:
 *  - viewport math (zoom/pan/clamp/fit)
 *  - client-side filtering over already-returned records
 *  - focused-dependency-path derivation from the returned payload
 *
 * Nothing here invents records; every output is a subset/transform of input.
 */
import type { GraphEdge, GraphNode, GraphOverview } from './api';
import { deriveDemoImpact } from './demoImpact';

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 3;

export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export function clampZoom(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function createViewport(): Viewport {
  return { scale: 1, tx: 0, ty: 0 };
}

export function applyPan(viewport: Viewport, dx: number, dy: number): Viewport {
  return { scale: viewport.scale, tx: viewport.tx + dx, ty: viewport.ty + dy };
}

export function applyZoom(
  viewport: Viewport,
  factor: number,
  origin?: { x: number; y: number },
): Viewport {
  const newScale = clampZoom(viewport.scale * factor);
  if (!origin) return { scale: newScale, tx: viewport.tx, ty: viewport.ty };
  const ratio = newScale / (viewport.scale || 1);
  return {
    scale: newScale,
    tx: origin.x - (origin.x - viewport.tx) * ratio,
    ty: origin.y - (origin.y - viewport.ty) * ratio,
  };
}

export function resetViewport(): Viewport {
  return createViewport();
}

export function fitViewport(
  contentWidth: number,
  contentHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 24,
): Viewport {
  if (
    contentWidth <= 0 ||
    contentHeight <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    return createViewport();
  }
  const scale = clampZoom(
    Math.min(
      (containerWidth - padding * 2) / contentWidth,
      (containerHeight - padding * 2) / contentHeight,
    ),
  );
  const tx = (containerWidth - contentWidth * scale) / 2;
  const ty = (containerHeight - contentHeight * scale) / 2;
  return { scale, tx, ty };
}

export function zoomInFactor(): number {
  return 1.25;
}
export function zoomOutFactor(): number {
  return 1 / 1.25;
}

// ---------------- filtering ----------------

export type NodeKindFilter = Set<string> | readonly string[] | string[] | null | undefined;
export type EdgeProvenanceFilter = Set<string> | readonly string[] | string[] | null | undefined;

export interface GraphFilters {
  nodeKinds?: NodeKindFilter;
  edgeProvenance?: EdgeProvenanceFilter;
}

function toSet(value: NodeKindFilter | EdgeProvenanceFilter): Set<string> | null {
  if (value == null) return null;
  if (value instanceof Set) return new Set(value);
  return new Set(value as Iterable<string>);
}

export function availableNodeKinds(nodes: GraphNode[]): string[] {
  return [...new Set(nodes.map((node) => node.kind))].sort();
}

export function availableEdgeProvenanceKinds(edges: GraphEdge[]): string[] {
  return [...new Set(edges.map((edge) => edge.provenanceKind).filter((v): v is string => typeof v === 'string'))].sort();
}

export function filterNodes(nodes: GraphNode[], allowed: NodeKindFilter): GraphNode[] {
  const set = toSet(allowed);
  if (set === null) return nodes.slice();
  return nodes.filter((node) => set.has(node.kind));
}

export function filterEdges(
  edges: GraphEdge[],
  allowedProvenance: EdgeProvenanceFilter,
  allowedNodeIds?: Set<string> | readonly string[] | null,
): GraphEdge[] {
  const set = toSet(allowedProvenance);
  let out = edges.slice();
  if (set !== null) {
    out = out.filter(
      (edge) => typeof edge.provenanceKind === 'string' && set.has(edge.provenanceKind),
    );
  }
  if (allowedNodeIds) {
    const ids =
      allowedNodeIds instanceof Set
        ? allowedNodeIds
        : new Set(allowedNodeIds as Iterable<string>);
    out = out.filter((edge) => ids.has(edge.fromId) && ids.has(edge.toId));
  }
  return out;
}

export function applyGraphFilters(
  nodes: GraphNode[],
  edges: GraphEdge[],
  filters: GraphFilters = {},
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const filteredNodes = filterNodes(nodes, filters.nodeKinds);
  const nodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = filterEdges(edges, filters.edgeProvenance, nodeIds);
  return { nodes: filteredNodes, edges: filteredEdges };
}

// ---------------- focused path ----------------

export function edgeKey(edge: GraphEdge, index: number): string {
  return edge.id ?? `${edge.type}-${index}`;
}

function findEdgeIndex(
  edges: GraphEdge[],
  type: string,
  fromId: string,
  toId: string,
): number {
  return edges.findIndex(
    (edge) => edge.type === type && edge.fromId === fromId && edge.toId === toId,
  );
}

function addEdgeByKey(
  edges: GraphEdge[],
  set: Set<string>,
  type: string,
  fromId: string,
  toId: string,
): void {
  const idx = findEdgeIndex(edges, type, fromId, toId);
  if (idx >= 0) {
    const e = edges[idx];
    if (e) set.add(edgeKey(e, idx));
  }
}

export function deriveFocusedPath(
  nodes: GraphNode[],
  edges: GraphEdge[],
  selectedId: string | null,
): { nodeIds: Set<string>; edgeIds: Set<string> } | null {
  if (!selectedId) return null;
  const overview = { nodes, edges, seedVersion: undefined } as GraphOverview;
  const impact = deriveDemoImpact(overview);
  const affected = impact.affected.find((item) => item.id === selectedId);
  if (!affected) return null;

  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  let claimId = affected.id;
  if (affected.kind === 'conclusion' && affected.viaClaimId) {
    nodeIds.add(affected.id);
    nodeIds.add(affected.viaClaimId);
    claimId = affected.viaClaimId;
    addEdgeByKey(edges, edgeIds, 'CONCLUSION_DEPENDS_ON_CLAIM', affected.id, claimId);
  } else {
    nodeIds.add(claimId);
  }

  const claimItem =
    affected.kind === 'claim'
      ? affected
      : impact.affected.find((item) => item.id === claimId && item.kind === 'claim');

  const citationUseId = claimItem?.viaCitationUseId;
  const publicationId = claimItem?.viaPublicationId ?? affected.viaPublicationId;

  if (citationUseId) {
    nodeIds.add(citationUseId);
    addEdgeByKey(edges, edgeIds, 'CLAIM_HAS_CITATION_USE', claimId, citationUseId);
    addEdgeByKey(edges, edgeIds, 'CITATION_USE_SUPPORTS_CLAIM', citationUseId, claimId);
  }
  if (publicationId) {
    nodeIds.add(publicationId);
    if (citationUseId) {
      addEdgeByKey(edges, edgeIds, 'CITATION_USE_REFERENCES_PUBLICATION', citationUseId, publicationId);
    }
  }
  if (publicationId) {
    const noticeIdx = edges.findIndex(
      (edge) => edge.type === 'PUBLICATION_HAS_NOTICE' && edge.fromId === publicationId,
    );
    if (noticeIdx >= 0) {
      const noticeEdge = edges[noticeIdx];
      if (noticeEdge) {
        edgeIds.add(edgeKey(noticeEdge, noticeIdx));
        nodeIds.add(noticeEdge.toId);
      }
    }
  }

  return { nodeIds, edgeIds };
}

export function isFlaggedClaimOrConclusion(
  nodes: GraphNode[],
  edges: GraphEdge[],
  selectedId: string | null,
): boolean {
  return deriveFocusedPath(nodes, edges, selectedId) !== null;
}
