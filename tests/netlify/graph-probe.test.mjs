/**
 * Unit tests for the GET /.netlify/functions/graph/probe handler.
 * Honesty contract: unseeded → 200 {exists:false}; unreachable/not-configured
 * → 503 error (NEVER a fabricated `exists`); GET only.
 */

import { describe, expect, it } from 'vitest';
import { createGraphProbeHandler } from '../../netlify/functions/graph-probe.mjs';
import { ConnectionError, CredentialsError } from '../../server/graphClient.mjs';
import { fakeConfiguredEnv, fakeLayer, readJson, scriptedSession } from './_helpers.mjs';

const PROBE_URL = 'http://localhost/.netlify/functions/graph/probe';

describe('graph-probe handler — method guard', () => {
  it('allows GET and rejects everything else with 405 + allow header', async () => {
    const handler = createGraphProbeHandler({ env: fakeConfiguredEnv(), layer: fakeLayer(scriptedSession({ exists: false })) });
    const get = await handler(new Request(PROBE_URL));
    expect(get.status).toBe(200);

    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const res = await handler(new Request(PROBE_URL, { method }));
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('GET');
      expect((await readJson(res)).error).toBe('method-not-allowed');
    }
  });
});

describe('graph-probe handler — truthful seeded state', () => {
  it('reports exists:false (200) for an unseeded graph — no seedVersion invented', async () => {
    const layer = fakeLayer(scriptedSession({ exists: false }));
    const handler = createGraphProbeHandler({ env: fakeConfiguredEnv(), layer });
    const res = await handler(new Request(PROBE_URL));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ exists: false });
    expect(layer.openedGraphs).toEqual(['aftershock:demo-smoke']);
  });

  it('reports exists:true with nodeCount, and seedVersion only when known', async () => {
    const layer = fakeLayer(scriptedSession({ nodeRows: [{ id: 'n1' }, { id: 'n2' }] }));
    const res = await createGraphProbeHandler({ env: fakeConfiguredEnv(), layer })(new Request(PROBE_URL));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ exists: true, nodeCount: 2, seedVersion: 'seed-1' });
  });

  it('omits seedVersion when the graph exists but carries no SeedMeta', async () => {
    const layer = fakeLayer(scriptedSession({ seedVersion: null, nodeRows: [{ id: 'n1' }] }));
    const res = await createGraphProbeHandler({ env: fakeConfiguredEnv(), layer })(new Request(PROBE_URL));
    const body = await readJson(res);
    expect(body.exists).toBe(true);
    expect(body.seedVersion).toBeUndefined();
    expect(body.nodeCount).toBe(1);
  });
});

describe('graph-probe handler — failure is never a fabricated success', () => {
  it('503 graph-backend-unavailable when the backend cannot be reached', async () => {
    const layer = { async open() { throw new ConnectionError('down'); } };
    const res = await createGraphProbeHandler({ env: fakeConfiguredEnv(), layer })(new Request(PROBE_URL));
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.error).toBe('graph-backend-unavailable');
    expect(JSON.stringify(body).includes('exists')).toBe(false);
  });

  it('503 graph-backend-not-configured when the graph-name env is missing', async () => {
    const layer = fakeLayer(scriptedSession());
    const res = await createGraphProbeHandler({ env: {}, layer })(new Request(PROBE_URL));
    expect(res.status).toBe(503);
    expect((await readJson(res)).error).toBe('graph-backend-not-configured');
    expect(layer.openedGraphs).toEqual([]);
  });

  it('503 when credentials are incomplete (CredentialsError path)', async () => {
    const layer = { async open() { throw new CredentialsError('no creds'); } };
    const res = await createGraphProbeHandler({ env: fakeConfiguredEnv(), layer })(new Request(PROBE_URL));
    expect(res.status).toBe(503);
    expect((await readJson(res)).error).toBe('graph-backend-not-configured');
  });
});
