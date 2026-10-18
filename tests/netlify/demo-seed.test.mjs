/**
 * Unit tests for the POST /.netlify/functions/demo/seed handler.
 * Guards and honesty rules: POST-only, bodyless, per-IP rate limit (429 with
 * Retry-After), serialized runs, and idempotency flags that trace to the real
 * seedGraph outcome — nothing is ever promoted to a fake success.
 */

import { describe, expect, it, vi } from 'vitest';
import { createDemoSeedHandler } from '../../netlify/functions/demo-seed.mjs';
import { createRateLimiter } from '../../server/demoApi.mjs';
import { ConnectionError } from '../../server/graphClient.mjs';
import { fakeConfiguredEnv, fakeLayer, permissiveLimiter, readJson, scriptedSession } from './_helpers.mjs';

const SEED_URL = 'http://localhost/.netlify/functions/demo/seed';

function seedResult(action) {
  return {
    graphName: 'aftershock:demo-smoke',
    action,
    graphExistedBefore: action === 'noop',
    seedVersion: 'seed-1',
    stats: { nodes: 16, edges: 22 },
    status: { nodeCount: 16, edgeCount: 22 },
    warnings: [],
  };
}

/** POST with no body (what the deployed client sends). */
const bodylessPost = () => new Request(SEED_URL, { method: 'POST' });

describe('demo-seed handler — method guard', () => {
  it('rejects non-POST with 405 + allow header before touching anything', async () => {
    const seedRunner = vi.fn();
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      seedRunner,
      limiter: permissiveLimiter(),
    });
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await handler(new Request(SEED_URL, { method }));
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
    expect(seedRunner).not.toHaveBeenCalled();
  });
});

describe('demo-seed handler — bodyless rejection', () => {
  it('400s when Content-Length declares a body — rejected before the body is read', async () => {
    const seedRunner = vi.fn();
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      seedRunner,
      limiter: permissiveLimiter(),
    });
    const req = /** @type {any} */ ({
      method: 'POST',
      headers: new Headers({ 'content-length': '16' }),
      text: async () => {
        throw new Error('the declared-length guard must reject before reading the body');
      },
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe('invalid-request');
    expect(seedRunner).not.toHaveBeenCalled();
  });

  it('400s when a body actually arrives (undici Requests carry no declared length)', async () => {
    const seedRunner = vi.fn();
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      seedRunner,
      limiter: permissiveLimiter(),
    });
    const req = new Request(SEED_URL, { method: 'POST', body: '{"payload":true}' });
    expect(req.headers.get('content-length')).toBeNull(); // undici: length is internal
    const res = await handler(req);
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe('invalid-request');
    expect(seedRunner).not.toHaveBeenCalled();
  });

  it('400s for chunked/buffered bodies that arrive without a declared length', async () => {
    const seedRunner = vi.fn();
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      seedRunner,
      limiter: permissiveLimiter(),
    });
    // Request-like with no content-length header but a real body stream.
    const req = /** @type {any} */ ({
      method: 'POST',
      headers: new Headers(),
      text: async () => 'x',
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(seedRunner).not.toHaveBeenCalled();
  });

  it('accepts a truly bodyless POST', async () => {
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      seedRunner: async () => seedResult('seeded'),
      limiter: permissiveLimiter(),
    });
    const res = await handler(bodylessPost());
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ seeded: true, alreadySeeded: false, seedVersion: 'seed-1' });
  });
});

describe('demo-seed handler — rate limiting (429 with Retry-After)', () => {
  it('denies the second run inside the cooldown; nothing is seeded by refused runs', async () => {
    const seedRunner = vi.fn(async () => seedResult('seeded'));
    const limiter = createRateLimiter({ cooldownMs: 30_000, windowMs: 600_000, maxPerWindow: 5 });
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      seedRunner,
      limiter,
    });
    const ip = { 'x-nf-client-connection-ip': '203.0.113.5' };

    const first = await handler(new Request(SEED_URL, { method: 'POST', headers: ip }));
    expect(first.status).toBe(200);

    const second = await handler(new Request(SEED_URL, { method: 'POST', headers: ip }));
    expect(second.status).toBe(429);
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
    const body = await readJson(second);
    expect(body.error).toBe('rate-limited');
    expect(body.message).toContain('seeded nothing');
    expect(seedRunner).toHaveBeenCalledTimes(1); // refused run never reached the seeder
  });

  it('tracks clients independently', async () => {
    const seedRunner = vi.fn(async () => seedResult('seeded'));
    const limiter = createRateLimiter({ cooldownMs: 30_000, windowMs: 600_000, maxPerWindow: 5 });
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      seedRunner,
      limiter,
    });
    const a = new Request(SEED_URL, { method: 'POST', headers: { 'x-nf-client-connection-ip': 'a' } });
    const b = new Request(SEED_URL, { method: 'POST', headers: { 'x-nf-client-connection-ip': 'b' } });
    expect((await handler(a)).status).toBe(200);
    expect((await handler(b)).status).toBe(200);
  });
});

describe('demo-seed handler — idempotency flags trace to seedGraph', () => {
  it('maps action noop to {seeded:false, alreadySeeded:true} — the client-required success shape', async () => {
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      seedRunner: async () => seedResult('noop'),
      limiter: permissiveLimiter(),
    });
    const res = await handler(bodylessPost());
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ seeded: false, alreadySeeded: true, seedVersion: 'seed-1' });
  });

  it('maps action reseeded to {seeded:true, alreadySeeded:false}', async () => {
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      seedRunner: async () => seedResult('reseeded'),
      limiter: permissiveLimiter(),
    });
    expect(await readJson(await handler(bodylessPost()))).toEqual({
      seeded: true,
      alreadySeeded: false,
      seedVersion: 'seed-1',
    });
  });

  it('serializes concurrent runs: the queued second caller surfaces the honest alreadySeeded', async () => {
    let calls = 0;
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      seedRunner: async () => {
        calls += 1;
        return seedResult(calls === 1 ? 'seeded' : 'noop');
      },
      limiter: permissiveLimiter(),
      // Two different client IPs so the limiter does not refuse the second call.
    });
    const [first, second] = await Promise.all([
      handler(new Request(SEED_URL, { method: 'POST', headers: { 'x-nf-client-connection-ip': 'a' } })),
      handler(new Request(SEED_URL, { method: 'POST', headers: { 'x-nf-client-connection-ip': 'b' } })),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await readJson(first);
    const secondBody = await readJson(second);
    // Exactly one of the two is the fresh seed; the other is the queued noop.
    expect([firstBody, secondBody]).toContainEqual({ seeded: true, alreadySeeded: false, seedVersion: 'seed-1' });
    expect([firstBody, secondBody]).toContainEqual({ seeded: false, alreadySeeded: true, seedVersion: 'seed-1' });
  });
});

describe('demo-seed handler — failure honesty', () => {
  it('503 seed-failed when the backend cannot be reached; no version advertised', async () => {
    const handler = createDemoSeedHandler({
      env: fakeConfiguredEnv(),
      layer: { async open() { throw new ConnectionError('down'); } },
      seedRunner: async () => seedResult('seeded'),
      limiter: permissiveLimiter(),
    });
    const res = await handler(bodylessPost());
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.error).toBe('seed-failed');
    expect(body.seedVersion).toBeUndefined();
  });

  it('binds the session to FALKORDB_GRAPH_NAME from the env seam (no hardcoded graph)', async () => {
    const env = fakeConfiguredEnv({ FALKORDB_GRAPH_NAME: 'aftershock:demo-smoke' });
    const layer = fakeLayer(scriptedSession({ graphName: 'aftershock:demo-smoke' }));
    const handler = createDemoSeedHandler({
      env,
      layer,
      seedRunner: async (session) => {
        expect(session.graphName).toBe('aftershock:demo-smoke');
        return seedResult('noop');
      },
      limiter: permissiveLimiter(),
    });
    await handler(bodylessPost());
    expect(layer.openedGraphs).toEqual(['aftershock:demo-smoke']);
  });
});
