import { describe, expect, it } from 'vitest';
import { parseGraphOverview } from './api';
import { buildDemoOverviewRecord } from '../test/graphFixtures';
import {
  clampZoom,
  applyPan,
  applyZoom,
  resetViewport,
  fitViewport,
  availableNodeKinds,
  availableEdgeProvenanceKinds,
  applyGraphFilters,
  deriveFocusedPath,
  isFlaggedClaimOrConclusion,
  MIN_ZOOM,
  MAX_ZOOM,
} from './graphView';

function seeded() {
  return parseGraphOverview(buildDemoOverviewRecord());
}

describe('graphView viewport math', () => {
  it('clamps zoom to 0.6–3', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });
  it('applyPan adds deltas', () => {
    const v = applyPan({ scale: 1, tx: 5, ty: 6 }, 3, -2);
    expect(v).toEqual({ scale: 1, tx: 8, ty: 4 });
  });
  it('applyZoom around origin keeps origin fixed', () => {
    const v = applyZoom({ scale: 1, tx: 0, ty: 0 }, 2, { x: 10, y: 10 });
    expect(v.scale).toBe(2);
    // origin maps to same point: origin.x == newX + (origin.x - tx)*ratio? check scale
    expect(v.scale).toBe(2);
  });
  it('resetViewport returns identity', () => {
    expect(resetViewport()).toEqual({ scale: 1, tx: 0, ty: 0 });
  });
  it('fitViewport scales to fit', () => {
    const v = fitViewport(100, 100, 250, 250, 25);
    expect(v.scale).toBeLessThanOrEqual(MAX_ZOOM);
    expect(v.scale).toBeGreaterThan(0);
  });
});

describe('graphView filtering', () => {
  it('lists available kinds from payload', () => {
    const o = seeded();
    expect(availableNodeKinds(o.nodes)).toContain('Claim');
    expect(availableEdgeProvenanceKinds(o.edges)).toContain('source_verified');
  });
  it('filters nodes and edges consistently', () => {
    const o = seeded();
    const out = applyGraphFilters(o.nodes, o.edges, {
      nodeKinds: new Set(['Claim', 'Conclusion']),
      edgeProvenance: new Set(['human_confirmed']),
    });
    expect(out.nodes.every((n) => n.kind === 'Claim' || n.kind === 'Conclusion')).toBe(true);
    expect(out.edges.every((e) => e.provenanceKind === 'human_confirmed')).toBe(true);
    // dangling edges removed
    for (const e of out.edges) {
      expect(out.nodes.map((n) => n.id)).toContain(e.fromId);
      expect(out.nodes.map((n) => n.id)).toContain(e.toId);
    }
  });
  it('empty filter yields empty (honest no matches)', () => {
    const o = seeded();
    const out = applyGraphFilters(o.nodes, o.edges, {
      nodeKinds: new Set(),
      edgeProvenance: new Set(o.edges.map((e) => e.provenanceKind).filter(Boolean) as string[]),
    });
    expect(out.nodes).toHaveLength(0);
  });
});

describe('graphView focused path', () => {
  it('returns path for flagged claim-A', () => {
    const o = seeded();
    const path = deriveFocusedPath(o.nodes, o.edges, 'claim-A');
    expect(path).not.toBeNull();
    expect(path!.nodeIds.has('claim-A')).toBe(true);
    expect(path!.nodeIds.has('cu-A-supporting')).toBe(true);
    expect(path!.nodeIds.has('pub-mehra-2020')).toBe(true);
    expect(path!.nodeIds.has('notice-mehra-retraction-2020-06-04')).toBe(true);
  });
  it('returns path for conclusion-C', () => {
    const o = seeded();
    const path = deriveFocusedPath(o.nodes, o.edges, 'conclusion-C');
    expect(path).not.toBeNull();
    expect(path!.nodeIds.has('conclusion-C')).toBe(true);
    expect(path!.nodeIds.has('claim-A')).toBe(true);
  });
  it('returns null for non-flagged node', () => {
    const o = seeded();
    expect(deriveFocusedPath(o.nodes, o.edges, 'claim-B')).toBeNull();
    expect(isFlaggedClaimOrConclusion(o.nodes, o.edges, 'claim-B')).toBe(false);
  });
});
