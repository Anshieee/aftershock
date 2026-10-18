/**
 * Unit tests for the GET /analyze-status handler (M4). Guards + honesty:
 * GET-only, runId required, real lookup passthrough (findingsCount/start/
 * completion only when stored), unknown runId → honest 404, bounded rate
 * limit, 503 on backend failure.
 */

import { describe, expect, it, vi } from 'vitest';
import { createAnalyzeStatusHandler } from '../../netlify/functions/analyze-status.mjs';
import { createRateLimiter } from '../../server/demoApi.mjs';
import { ConnectionError } from '../../server/graphClient.mjs';
import { fakeConfiguredEnv, fakeLayer, permissiveLimiter, readJson } from './_helpers.mjs';
import { m4FakeSession } from './_m4fake.mjs';

const BASE = 'http://localhost/.netlify/functions/analyze-status';
const statusGet = (query = '?runId=run-1') => new Request(`${BASE}${query}`);

const RUN_ROW = {
  id: 'run-1',
  stage: 'completed',
  findingsCount: 2,
  startedAt: '2026-10-18T00:00:00.000Z',
  completedAt: '2026-10-18T00:00:01.000Z',
};

function handlerWith(deps = {}) {
  return createAnalyzeStatusHandler({
    env: fakeConfiguredEnv(),
    layer: fakeLayer(m4FakeSession({ runRow: RUN_ROW })),
    limiter: permissiveLimiter(),
    ...deps,
  });
}

describe('analyze-status handler — guards', () => {
  it('rejects non-GET with 405 + allow header', async () => {
    const statusOp = vi.fn();
    const handler = handlerWith({ statusOp });
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await handler(new Request(BASE, { method }));
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('GET');
    }
    expect(statusOp).not.toHaveBeenCalled();
  });

  it('400 when runId is missing or oversized', async () => {
    const handler = handlerWith();
    for (const query of ['', '?runId=', '?runId=%20', `?runId=${'x'.repeat(201)}`]) {
      const res = await handler(statusGet(query));
      expect(res.status, query).toBe(400);
      expect((await readJson(res)).error).toBe('invalid-request');
    }
  });
});

describe('analyze-status handler — real lookups', () => {
  it('200 {runId, stage, findingsCount, startedAt, completedAt} passthrough', async () => {
    const res = await handlerWith()(statusGet());
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      runId: 'run-1',
      stage: 'completed',
      findingsCount: 2,
      startedAt: '2026-10-18T00:00:00.000Z',
      completedAt: '2026-10-18T00:00:01.000Z',
    });
  });

  it('omits findingsCount/timestamps the run does not carry (no fabrication)', async () => {
    const session = m4FakeSession({ runRow: { id: 'run-2', stage: 'running', findingsCount: null, startedAt: '2026-10-18T00:00:00.000Z', completedAt: null } });
    const res = await handlerWith({ layer: fakeLayer(session) })(statusGet('?runId=run-2'));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ runId: 'run-2', stage: 'running', startedAt: '2026-10-18T00:00:00.000Z' });
  });

  it('404 for an unknown runId — honest, no fabricated stage', async () => {
    const res = await handlerWith({ layer: fakeLayer(m4FakeSession({ runRow: null })) })(statusGet('?runId=unknown'));
    expect(res.status).toBe(404);
    expect((await readJson(res)).error).toBe('run-not-found');
  });
});

describe('analyze-status handler — rate limiting + failure honesty', () => {
  it('429 when the per-IP window budget is exhausted', async () => {
    const handler = handlerWith({
      limiter: createRateLimiter({ cooldownMs: 0, windowMs: 60_000, maxPerWindow: 2 }),
    });
    const ip = { 'x-nf-client-connection-ip': '203.0.113.4' };
    expect((await handler(new Request(`${BASE}?runId=r`, { headers: ip }))).status).toBe(200);
    expect((await handler(new Request(`${BASE}?runId=r`, { headers: ip }))).status).toBe(200);
    const third = await handler(new Request(`${BASE}?runId=r`, { headers: ip }));
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('503 graph-backend-unavailable when the backend cannot be reached', async () => {
    const handler = handlerWith({
      layer: { async open() { throw new ConnectionError('down'); } },
    });
    const res = await handler(statusGet());
    expect(res.status).toBe(503);
    expect((await readJson(res)).error).toBe('graph-backend-unavailable');
  });

  it('binds the session to FALKORDB_GRAPH_NAME from the env seam (no hardcoded graph)', async () => {
    const env = fakeConfiguredEnv({ FALKORDB_GRAPH_NAME: 'aftershock:demo-smoke' });
    const layer = fakeLayer(m4FakeSession({ graphName: 'aftershock:demo-smoke' }));
    const handler = createAnalyzeStatusHandler({ env, layer, limiter: permissiveLimiter() });
    await handler(statusGet());
    expect(layer.openedGraphs).toEqual(['aftershock:demo-smoke']);
  });
});
