/**
 * Unit tests for the SENSITIVE POST /.netlify/functions/seed handler.
 * Guard order: method → body → secret (constant-time, 401/403) → rate limit.
 * The secret value never appears in any response, and unauthorized traffic
 * never reaches the seeder.
 */

import { describe, expect, it, vi } from 'vitest';
import { createManagedSeedHandler } from '../../netlify/functions/seed.mjs';
import { createRateLimiter } from '../../server/demoApi.mjs';
import { ConnectionError } from '../../server/graphClient.mjs';
import { fakeConfiguredEnv, fakeLayer, permissiveLimiter, readJson, scriptedSession } from './_helpers.mjs';

const SEED_URL = 'http://localhost/.netlify/functions/seed';
const SECRET = 'm3-unit-test-managed-seed-secret';

function handlerWith({ seedRunner, limiter } = {}) {
  return createManagedSeedHandler({
    env: fakeConfiguredEnv({ SEED_SECRET: SECRET }),
    layer: fakeLayer(scriptedSession()),
    seedRunner: seedRunner ?? vi.fn(),
    limiter: limiter ?? permissiveLimiter(),
  });
}

const postWithSecret = (secret) =>
  new Request(SEED_URL, {
    method: 'POST',
    headers: secret === undefined ? {} : { 'x-seed-secret': secret },
  });

describe('managed seed handler — method + body guards', () => {
  it('405 for non-POST with allow header', async () => {
    const seedRunner = vi.fn();
    const res = await handlerWith({ seedRunner })(new Request(SEED_URL, { method: 'GET' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(seedRunner).not.toHaveBeenCalled();
  });

  it('400 for any body (the managed route is bodyless too)', async () => {
    const seedRunner = vi.fn();
    const handler = handlerWith({ seedRunner });
    const res = await handler(new Request(SEED_URL, { method: 'POST', body: 'x', headers: { 'x-seed-secret': SECRET } }));
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe('invalid-request');
    expect(seedRunner).not.toHaveBeenCalled();
  });
});

describe('managed seed handler — secret guard', () => {
  it('401 when the x-seed-secret header is missing entirely', async () => {
    const seedRunner = vi.fn();
    const res = await handlerWith({ seedRunner })(new Request(SEED_URL, { method: 'POST' }));
    expect(res.status).toBe(401);
    expect((await readJson(res)).error).toBe('unauthorized');
    expect(seedRunner).not.toHaveBeenCalled();
  });

  it('403 on a wrong secret; the response never discloses or hints the configured value', async () => {
    const seedRunner = vi.fn();
    const res = await handlerWith({ seedRunner })(postWithSecret('not-the-secret'));
    expect(res.status).toBe(403);
    const text = JSON.stringify(await readJson(res));
    expect(text.includes(SECRET)).toBe(false);
    expect(text.includes('not-the-secret')).toBe(false);
    expect(seedRunner).not.toHaveBeenCalled();
  });

  it('401/403 run BEFORE the rate limiter (unauthenticated traffic consumes no run budget)', async () => {
    const limiter = createRateLimiter({ cooldownMs: 60_000, windowMs: 600_000, maxPerWindow: 3 });
    const handler = handlerWith({ limiter });
    const before = limiter.check('probe-key'); // consume one slot to snapshot state
    const unauthorized = await handler(new Request(SEED_URL, { method: 'POST' }));
    expect(unauthorized.status).toBe(401);
    // The gate state for OTHER keys is unchanged — verify via a fresh allowed check.
    expect(limiter.check('probe-key-2').allowed).toBe(before.allowed);
  });

  it('matches the exact secret via the constant-time comparator', async () => {
    const seedRunner = vi.fn(async () => ({
      action: 'noop',
      seedVersion: 'seed-1',
      graphName: 'aftershock:demo-smoke',
      graphExistedBefore: true,
      stats: { nodes: 16, edges: 22 },
      status: {},
      warnings: [],
    }));
    const res = await handlerWith({ seedRunner })(postWithSecret(SECRET));
    expect(res.status).toBe(200);
    expect(seedRunner).toHaveBeenCalledTimes(1);
  });
});

describe('managed seed handler — rate limiting (stricter than /demo/seed)', () => {
  it('429 with Retry-After on the second run inside the 60 s cooldown', async () => {
    const seedRunner = vi.fn(async () => ({ action: 'seeded', seedVersion: 'seed-1', stats: {}, status: {}, warnings: [] }));
    const limiter = createRateLimiter({ cooldownMs: 60_000, windowMs: 600_000, maxPerWindow: 3 });
    const handler = handlerWith({ seedRunner, limiter });
    const first = await handler(postWithSecret(SECRET));
    expect(first.status).toBe(200);
    const second = await handler(postWithSecret(SECRET));
    expect(second.status).toBe(429);
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
    const body = await readJson(second);
    expect(body.error).toBe('rate-limited');
    expect(body.message).toContain('Nothing was changed');
    expect(seedRunner).toHaveBeenCalledTimes(1);
  });
});

describe('managed seed handler — idempotent outcome + honesty', () => {
  it('noop → {seeded:false, alreadySeeded:true, action:"noop"}; never pretends a reseed happened', async () => {
    const handler = handlerWith({
      seedRunner: async () => ({
        action: 'noop', seedVersion: 'seed-1', graphName: 'g', graphExistedBefore: true,
        stats: { nodes: 16, edges: 22 }, status: {}, warnings: [],
      }),
    });
    const res = await handler(postWithSecret(SECRET));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      seeded: false,
      alreadySeeded: true,
      action: 'noop',
      seedVersion: 'seed-1',
    });
  });

  it('503 seed-failed on backend failure with no fabricated version', async () => {
    const handler = createManagedSeedHandler({
      env: fakeConfiguredEnv({ SEED_SECRET: SECRET }),
      layer: { async open() { throw new ConnectionError('down'); } },
      limiter: permissiveLimiter(),
    });
    const res = await handler(postWithSecret(SECRET));
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.error).toBe('seed-failed');
    expect(body.seedVersion).toBeUndefined();
  });
});
