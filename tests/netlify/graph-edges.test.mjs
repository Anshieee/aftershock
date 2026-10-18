/**
 * Unit tests for the GET /.netlify/functions/graph/edges handler.
 * Query-param validation (limit 1..200 default 40; nodeId 1–128 chars;
 * depth 1|2) and wire-shape honesty (edges always carry type/fromId/toId;
 * unseeded → empty; unreachable → 503, never fabricated data).
 */

import { describe, expect, it, vi } from 'vitest';
import { createGraphEdgesHandler, } from '../../netlify/functions/graph-edges.mjs';
import { EDGES_LIMIT } from '../../server/demoApi.mjs';
import { ConnectionError } from '../../server/graphClient.mjs';
import { fakeConfiguredEnv, fakeLayer, readJson, scriptedSession } from './_helpers.mjs';

const EDGES_URL = 'http://localhost/.netlify/functions/graph/edges';

function handlerWith(recordsImpl, { layer } = {}) {
  return createGraphEdgesHandler({
    env: fakeConfiguredEnv(),
    layer: layer ?? fakeLayer(scriptedSession()),
    readRecords: recordsImpl,
  });
}

describe('graph-edges handler — method guard', () => {
  it('rejects non-GET with 405 + allow header', async () => {
    const handler = handlerWith(vi.fn());
    const res = await handler(new Request(EDGES_URL, { method: 'POST' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });
});

describe('graph-edges handler — limit validation', () => {
  it('defaults to 40 and clamps nothing silently: valid bounds pass', async () => {
    const readRecords = vi.fn(async () => ({
      graphName: 'aftershock:demo-smoke',
      seedVersion: 'seed-1',
      nodes: [],
      edges: [],
      truncated: false,
    }));
    const handler = handlerWith(readRecords);

    await handler(new Request(EDGES_URL));
    expect(readRecords.mock.calls[0][1].limit).toBe(EDGES_LIMIT.default); // 40

    await handler(new Request(`${EDGES_URL}?limit=1`));
    expect(readRecords.mock.calls[1][1].limit).toBe(1);

    await handler(new Request(`${EDGES_URL}?limit=200`));
    expect(readRecords.mock.calls[2][1].limit).toBe(200);
  });

  it('400s anything outside [1..200] or non-numeric', async () => {
    const handler = handlerWith(vi.fn());
    for (const raw of ['0', '201', '-1', 'abc', '40.5', '99999999999']) {
      const res = await handler(new Request(`${EDGES_URL}?limit=${raw}`));
      expect(res.status, `limit=${raw}`).toBe(400);
      const body = await readJson(res);
      expect(body.error).toBe('invalid-param');
      expect(body.message).toContain('limit');
    }
  });
});

describe('graph-edges handler — nodeId/depth validation', () => {
  it('scopes with nodeId + depth and passes them through', async () => {
    const readRecords = vi.fn(async () => ({
      graphName: 'g', seedVersion: null, nodes: [], edges: [], truncated: false,
    }));
    const handler = handlerWith(readRecords);
    await handler(new Request(`${EDGES_URL}?nodeId=claim-A&depth=2`));
    expect(readRecords.mock.calls[0][1]).toMatchObject({ nodeId: 'claim-A', depth: 2 });
  });

  it('400s depth outside {1,2} — the only values ever interpolated into Cypher', async () => {
    const handler = handlerWith(vi.fn());
    for (const raw of ['0', '3', 'x', '2.5']) {
      const res = await handler(new Request(`${EDGES_URL}?nodeId=a&depth=${raw}`));
      expect(res.status, `depth=${raw}`).toBe(400);
      expect((await readJson(res)).message).toContain('depth must be one of 1 | 2');
    }
  });

  it('400s a nodeId outside 1–128 characters', async () => {
    const handler = handlerWith(vi.fn());
    const res = await handler(new Request(`${EDGES_URL}?nodeId=${'x'.repeat(129)}`));
    expect(res.status).toBe(400);
    expect((await readJson(res)).message).toContain('nodeId must be 1–128 characters');
  });
});

describe('graph-edges handler — honest responses', () => {
  it('unseeded graph → 200 with empty nodes/edges and no seedVersion', async () => {
    const handler = handlerWith(async () => ({
      graphName: 'aftershock:demo-smoke', seedVersion: null, nodes: [], edges: [], truncated: false,
    }));
    const res = await handler(new Request(EDGES_URL));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      graphName: 'aftershock:demo-smoke',
      seedVersion: null,
      nodes: [],
      edges: [],
    });
  });

  it('emits the wire shape verbatim: flat nodes and edges with type/fromId/toId always present', async () => {
    const nodes = [{ id: 'claim-A', kind: 'Claim', isSynthetic: false }];
    const edges = [{
      type: 'CITES', fromId: 'claim-A', toId: 'pub-mehra-2020',
      provenanceKind: 'observed', rationale: 'r', sourcePointer: 'p', reviewState: 'none',
      properties: {},
    }];
    const handler = handlerWith(async () => ({
      graphName: 'aftershock:demo-smoke', seedVersion: 'seed-1', nodes, edges, truncated: true,
    }));
    const res = await handler(new Request(EDGES_URL));
    const body = await readJson(res);
    expect(body.nodes).toEqual(nodes);
    expect(body.edges).toEqual(edges);
    expect(body.truncated).toBe(true);
    for (const edge of body.edges) {
      expect(typeof edge.type).toBe('string');
      expect(typeof edge.fromId).toBe('string');
      expect(typeof edge.toId).toBe('string');
    }
  });

  it('503 graph-backend-unavailable on backend failure — never fabricated data', async () => {
    const handler = createGraphEdgesHandler({
      env: fakeConfiguredEnv(),
      layer: { async open() { throw new ConnectionError('down'); } },
    });
    const res = await handler(new Request(EDGES_URL));
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.error).toBe('graph-backend-unavailable');
    expect(body.nodes).toBeUndefined();
  });
});
