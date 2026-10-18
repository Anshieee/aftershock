/**
 * Unit tests for the GET /.netlify/functions/health handler (M3 upgrade).
 *
 * Wire-compat: the M1 contract `{ok, service, graph, version}` shape is
 * preserved verbatim for the deployed ServiceStatusChip; `graph` stays a
 * STRING with exactly three truthful semantics:
 *   'not-configured' | "<FALKORDB_GRAPH_NAME>" (probe succeeded) | 'unreachable'.
 * No probe failure is ever rewritten into a fabricated connected/seeded state.
 */

import { describe, expect, it } from 'vitest';
import { createHealthHandler, default as defaultHandler } from '../../netlify/functions/health.mjs';
import { ConnectionError } from '../../server/graphClient.mjs';
import { fakeConfiguredEnv, fakeLayer, readJson, scriptedSession } from './_helpers.mjs';

const GRAPH_NAME = 'aftershock:demo-smoke';

describe('health handler — M1 wire shape preserved (ServiceStatusChip compat)', () => {
  it('not-configured env → the M1 body verbatim, no extras', async () => {
    const layer = fakeLayer(scriptedSession());
    const res = await createHealthHandler({ env: {}, layer })(new Request('http://localhost/h'));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      ok: true,
      service: 'aftershock-demo',
      graph: 'not-configured',
      version: '0.1.0',
    });
    expect(layer.openedGraphs).toEqual([]); // nothing was probed
  });

  it('keeps the response a JSON 200 with ok:true in every path (the chip only reads res.ok)', async () => {
    const unreachable = await createHealthHandler({
      env: fakeConfiguredEnv(),
      layer: { async open() { throw new ConnectionError('down'); } },
    })(new Request('http://localhost/h'));
    expect(unreachable.status).toBe(200);
    expect((await readJson(unreachable)).ok).toBe(true);
  });
});

describe('health handler — graph string semantics (all three, exactly)', () => {
  it('not-configured: graph name or credentials missing server-side', async () => {
    const res = await createHealthHandler({ env: { FALKORDB_GRAPH_NAME: GRAPH_NAME }, layer: fakeLayer(scriptedSession()) })(
      new Request('http://localhost/h'),
    );
    expect((await readJson(res)).graph).toBe('not-configured');
  });

  it('connected: probe succeeds → graph is the real graph name + reachable seeded state', async () => {
    const layer = fakeLayer(scriptedSession({ graphName: GRAPH_NAME, nodeRows: Array.from({ length: 16 }, (_, i) => ({ id: `n${i}` })) }));
    const res = await createHealthHandler({ env: fakeConfiguredEnv({ FALKORDB_GRAPH_NAME: GRAPH_NAME }), layer })(
      new Request('http://localhost/h'),
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      ok: true,
      service: 'aftershock-demo',
      graph: GRAPH_NAME,
      version: '0.1.0',
      graphReachable: true,
      seedState: 'seeded',
      seedVersion: 'seed-1',
      nodeCount: 16,
    });
  });

  it('unseeded variant: existing graph without SeedMeta reports seedState "unseeded"', async () => {
    const res = await createHealthHandler({
      env: fakeConfiguredEnv({ FALKORDB_GRAPH_NAME: GRAPH_NAME }),
      layer: fakeLayer(scriptedSession({ graphName: GRAPH_NAME, seedVersion: null })),
    })(new Request('http://localhost/h'));
    const body = await readJson(res);
    expect(body.graph).toBe(GRAPH_NAME);
    expect(body.seedState).toBe('unseeded');
    expect(body.seedVersion).toBeUndefined();
  });

  it('unreachable: probe failure degrades the graph string to "unreachable" + graphReachable:false — never the connected name', async () => {
    const res = await createHealthHandler({
      env: fakeConfiguredEnv({ FALKORDB_GRAPH_NAME: GRAPH_NAME }),
      layer: { async open() { throw new ConnectionError('down'); } },
    })(new Request('http://localhost/h'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.graph).toBe('unreachable');
    expect(body.graphReachable).toBe(false);
    // Nothing fabricated from the failed probe:
    expect(body.seedState).toBeUndefined();
    expect(body.seedVersion).toBeUndefined();
    expect(body.nodeCount).toBeUndefined();
  });
});

describe('health handler — no secrets in any response', () => {
  it('never includes credential-shaped material', async () => {
    const res = await createHealthHandler({
      env: fakeConfiguredEnv({ FALKORDB_GRAPH_NAME: GRAPH_NAME }),
      layer: fakeLayer(scriptedSession({ graphName: GRAPH_NAME })),
    })(new Request('http://localhost/h'));
    const text = JSON.stringify(await readJson(res)).toLowerCase();
    expect(text.includes('falkordb-host')).toBe(false);
    expect(text.includes('password')).toBe(false);
    expect(text.includes('unit-test-not-a-real-secret')).toBe(false);
    expect(text.includes('token')).toBe(false);
    expect(text.includes('secret')).toBe(false);
  });
});

describe('default handler export (module wiring)', () => {
  it('is a callable handler built from the factory', async () => {
    expect(typeof defaultHandler).toBe('function');
    // Ambient env may or may not be configured; both truthful states are valid.
    const res = await defaultHandler(new Request('http://localhost/h'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(typeof body.graph).toBe('string');
  });
});
