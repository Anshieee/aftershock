/**
 * Unit tests: envcheck diagnostic is now secret-gated (hardening wave).
 *
 * The public environment-names diagnostic is a known accepted risk from the
 * post-submission audit; this pin contract: no environment facts leave the
 * function without the same server secret /seed requires (x-seed-secret,
 * constant-time compare). Payload remains names/count/booleans only.
 *
 * No DB, no real env — injected fake env via the factory seam.
 */

import { describe, expect, it } from 'vitest';
import { createEnvcheckHandler } from '../../../netlify/functions/envcheck.mjs';

function requestWithHeaders(headers) {
  return new Request('https://aftershock-demo.netlify.app/.netlify/functions/envcheck', {
    method: 'GET',
    headers,
  });
}

const FAKE_ENV = {
  SEED_SECRET: 'test-secret-value-not-a-real-credential',
  FALKORDB_HOST: 'example.internal',
  OTHER_VAR: 'irrelevant',
};

describe('envcheck — secret-gated diagnostic', () => {
  it('401 without the header; no environment facts in the body', async () => {
    const h = createEnvcheckHandler({ env: FAKE_ENV });
    const res = await h(requestWithHeaders({}));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthorized');
    expect(JSON.stringify(body)).not.toContain('FALKORDB');
    expect(JSON.stringify(body)).not.toContain('test-secret');
  });

  it('403 with a wrong secret (constant-time compare); nothing disclosed', async () => {
    const h = createEnvcheckHandler({ env: FAKE_ENV });
    const res = await h(requestWithHeaders({ 'x-seed-secret': 'wrong' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(JSON.stringify(body)).not.toContain('test-secret');
  });

  it('200 for the correct secret — names/count/booleans only', async () => {
    const h = createEnvcheckHandler({ env: FAKE_ENV });
    const res = await h(requestWithHeaders({ 'x-seed-secret': 'test-secret-value-not-a-real-credential' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('example.internal');
    expect(body.envKeyCount).toBe(3);
    expect(body.significant.FALKORDB_HOST).toBe(true);
    expect(body.significant.FALKORDB_PASSWORD).toBe(false);
    expect(body.significant.FALKORDB_GRAPH_NAME).toBe(false);
  });
});
