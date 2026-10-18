/**
 * Unit tests for the GET /document-detail handler (M4). Guards + honesty:
 * GET-only, id required, real Document + versions lookup, internal `seeded`/
 * `primaryLabel` flags never surface on the wire, unknown id → honest 404,
 * bounded rate limit, 503 on backend failure.
 */

import { describe, expect, it, vi } from 'vitest';
import { createDocumentDetailHandler } from '../../netlify/functions/document-detail.mjs';
import { createRateLimiter } from '../../server/demoApi.mjs';
import { ConnectionError } from '../../server/graphClient.mjs';
import { fakeConfiguredEnv, fakeLayer, permissiveLimiter, readJson } from './_helpers.mjs';
import { m4FakeSession } from './_m4fake.mjs';

const BASE = 'http://localhost/.netlify/functions/document-detail';
const detailGet = (query = '?id=doc-1') => new Request(`${BASE}${query}`);

const DOC_ROW = {
  id: 'doc-1',
  fileName: 'notes.txt',
  format: 'txt',
  sizeBytes: 19,
  contentStored: false,
  isSynthetic: false,
  seeded: true, // internal flag — must be stripped from the wire
  primaryLabel: 'ResearchDocument', // internal flag — must be stripped
};
const VERSION_ROW = {
  id: 'ver-1',
  documentId: 'doc-1',
  label: 'Draft A',
  sourceHash: 'abc123',
  contentStored: false,
  seeded: true,
  primaryLabel: 'DocumentVersion',
};

function handlerWith(deps = {}) {
  return createDocumentDetailHandler({
    env: fakeConfiguredEnv(),
    layer: fakeLayer(m4FakeSession({ docRow: DOC_ROW, versionRows: [VERSION_ROW] })),
    limiter: permissiveLimiter(),
    ...deps,
  });
}

describe('document-detail handler — guards', () => {
  it('rejects non-GET with 405 + allow header', async () => {
    const detailOp = vi.fn();
    const handler = handlerWith({ detailOp });
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await handler(new Request(BASE, { method }));
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('GET');
    }
    expect(detailOp).not.toHaveBeenCalled();
  });

  it('400 when id is missing or oversized', async () => {
    const handler = handlerWith();
    for (const query of ['', '?id=', '?id=%20', `?id=${'x'.repeat(201)}`]) {
      const res = await handler(detailGet(query));
      expect(res.status, query).toBe(400);
      expect((await readJson(res)).error).toBe('invalid-request');
    }
  });
});

describe('document-detail handler — real lookups', () => {
  it('200 {document, versions} with internal flags stripped from the wire', async () => {
    const res = await handlerWith()(detailGet());
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.document.id).toBe('doc-1');
    expect(body.document.fileName).toBe('notes.txt');
    expect(body.document.contentStored).toBe(false);
    expect(body.document.seeded).toBeUndefined();
    expect(body.document.primaryLabel).toBeUndefined();
    expect(body.versions.length).toBe(1);
    expect(body.versions[0].id).toBe('ver-1');
    expect(body.versions[0].sourceHash).toBe('abc123');
    expect(body.versions[0].seeded).toBeUndefined();
    expect(body.versions[0].primaryLabel).toBeUndefined();
  });

  it('404 for an unknown document id — honest, no fabricated node', async () => {
    const res = await handlerWith({ layer: fakeLayer(m4FakeSession({ docRow: null })) })(detailGet('?id=unknown'));
    expect(res.status).toBe(404);
    expect((await readJson(res)).error).toBe('document-not-found');
  });

  it('serves user-imported documents too (no seeded filter on the id lookup)', async () => {
    const unseededDoc = { ...DOC_ROW, seeded: undefined, primaryLabel: undefined };
    const session = m4FakeSession({ docRow: unseededDoc, versionRows: [] });
    const res = await handlerWith({ layer: fakeLayer(session) })(detailGet());
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.versions).toEqual([]); // honest empty list, never a fabricated version
  });
});

describe('document-detail handler — rate limiting + failure honesty', () => {
  it('429 when the per-IP window budget is exhausted', async () => {
    const handler = handlerWith({
      limiter: createRateLimiter({ cooldownMs: 0, windowMs: 60_000, maxPerWindow: 1 }),
    });
    const ip = { 'x-nf-client-connection-ip': '203.0.113.4' };
    expect((await handler(new Request(`${BASE}?id=d`, { headers: ip }))).status).toBe(200);
    const second = await handler(new Request(`${BASE}?id=d`, { headers: ip }));
    expect(second.status).toBe(429);
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('503 graph-backend-unavailable when the backend cannot be reached', async () => {
    const handler = handlerWith({
      layer: { async open() { throw new ConnectionError('down'); } },
    });
    const res = await handler(detailGet());
    expect(res.status).toBe(503);
    expect((await readJson(res)).error).toBe('graph-backend-unavailable');
  });

  it('binds the session to FALKORDB_GRAPH_NAME from the env seam (no hardcoded graph)', async () => {
    const env = fakeConfiguredEnv({ FALKORDB_GRAPH_NAME: 'aftershock:demo-smoke' });
    const layer = fakeLayer(m4FakeSession({ graphName: 'aftershock:demo-smoke' }));
    const handler = createDocumentDetailHandler({ env, layer, limiter: permissiveLimiter() });
    await handler(detailGet());
    expect(layer.openedGraphs).toEqual(['aftershock:demo-smoke']);
  });
});
