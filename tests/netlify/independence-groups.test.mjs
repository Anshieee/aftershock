/**
 * Unit tests for the GET /.netlify/functions/independence-groups handler
 * (Wave 4 read-only independence groups).
 *
 * Honesty contract mirrored from the activity/evidence-find handler suites:
 * GET only (405 otherwise); unseeded/missing graph → 200 all-zero summary +
 * empty groups (nothing fabricated); read failure → 503 never a fabricated
 * list; per-IP rate limit via createRateLimiter's activity-equivalent budget
 * (no new budget is invented); no route/limit behavior deviates from the
 * activity read-handler shape.
 *
 * Seam (per server/demoApi.mjs + tests/netlify/_helpers.mjs): fake layer +
 * scripted `compute` op so no test touches a real DB and no ESM is stubbed.
 */

import { describe, expect, it } from 'vitest';
import { createIndependenceGroupsHandler } from '../../netlify/functions/independence-groups.mjs';
import { ConnectionError, CredentialsError } from '../../server/graphClient.mjs';
import { INDEPENDENCE_CAVEAT } from '../../server/independence.mjs';
import { createRateLimiter } from '../../server/demoApi.mjs';
import { fakeConfiguredEnv, fakeLayer, readJson } from './_helpers.mjs';

const URL_INDEPENDENCE = 'http://localhost/.netlify/functions/independence-groups';

/** Minimal op payload (exactly the contracted wire shape, one shared group). */
const PAYLOAD = {
  graphName: 'aftershock:demo-smoke',
  seeded: true,
  seedVersion: 'seed-1',
  summary: { supportingCitationUses: 2, publicationsSupportingClaims: 1, sharedGroups: 1 },
  groups: [
    {
      publication: {
        id: 'pub-mehra-2020',
        doi: '10.1016/S0140-6736(20)31180-6',
        title: 'Mehra et al. 2020',
        isSynthetic: false,
      },
      citationUseIds: ['cu-A-supporting', 'cu-Z-supporting'],
      claimCount: 2,
      claims: [
        { id: 'claim-A', text: null, status: null },
        { id: 'claim-Z', text: null, status: null },
      ],
    },
  ],
  caveat: INDEPENDENCE_CAVEAT,
  limitations: [
    'Only same-publication sharing is detected in this tier; shared datasets, analyses, or review trees are not detected (Find Evidence responses disclose the same limitation).',
    'Historical mentions never contribute to these groups; only supporting citation uses do.',
  ],
};

describe('independence-groups handler — method guard', () => {
  it('rejects non-GET with 405 + allow header', async () => {
    const handler = createIndependenceGroupsHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer({ graphName: 'g', async graphExists() { return true; }, async close() {}, async roQuery() { return { data: [] }; } }),
    });
    const res = await handler(new Request(URL_INDEPENDENCE, { method: 'POST' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });
});

describe('independence-groups handler — honest body', () => {
  it('200 → the full read-only payload verbatim (groups + zeros-visible summary)', async () => {
    const handler = createIndependenceGroupsHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer({ graphName: 'g', async graphExists() { return true; }, async close() {}, async roQuery() { return { data: [] }; } }),
      compute: async () => PAYLOAD,
    });
    const res = await handler(new Request(URL_INDEPENDENCE));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await readJson(res)).toEqual(PAYLOAD);
  });

  it('no support links at all → 200 all-zero summary + empty groups (op-provided, not mapped)', async () => {
    const zeros = {
      graphName: 'g',
      seeded: false,
      seedVersion: null,
      summary: { supportingCitationUses: 0, publicationsSupportingClaims: 0, sharedGroups: 0 },
      groups: [],
      caveat: INDEPENDENCE_CAVEAT,
      limitations: [],
    };
    const handler = createIndependenceGroupsHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer({ graphName: 'g', async graphExists() { return false; }, async close() {}, async roQuery() { return { data: [] }; } }),
      compute: async () => zeros,
    });
    const res = await handler(new Request(URL_INDEPENDENCE));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual(zeros);
  });
});

describe('independence-groups handler — failure mapping (errorBodyFor rails)', () => {
  it('503 graph-backend-unavailable on a connection failure — never fabricated groups', async () => {
    const handler = createIndependenceGroupsHandler({
      env: fakeConfiguredEnv(),
      layer: { async open() { throw new ConnectionError('down'); } },
    });
    const res = await handler(new Request(URL_INDEPENDENCE));
    expect(res.status).toBe(503);
    expect((await readJson(res)).error).toBe('graph-backend-unavailable');
  });

  it('503 graph-backend-not-configured without FALKORDB_GRAPH_NAME', async () => {
    const handler = createIndependenceGroupsHandler({
      env: {},
      layer: { async open() { throw new CredentialsError('nope'); } },
    });
    const res = await handler(new Request(URL_INDEPENDENCE));
    expect(res.status).toBe(503);
    expect((await readJson(res)).error).toBe('graph-backend-not-configured');
  });

  it('503 graph-backend-unavailable when the read op itself fails', async () => {
    const handler = createIndependenceGroupsHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer({ graphName: 'g', async graphExists() { return true; }, async close() {}, async roQuery() { return { data: [] }; } }),
      compute: async () => { throw new ConnectionError('read exploded'); },
    });
    const res = await handler(new Request(URL_INDEPENDENCE));
    expect(res.status).toBe(503);
    expect((await readJson(res)).error).toBe('graph-backend-unavailable');
  });
});

describe('independence-groups handler — per-IP rate limit (activity budget)', () => {
  it('429 + retry-after on the second back-to-back call, and the graph is not opened for the refused call', async () => {
    const limiter = createRateLimiter(); // SAME default budget as activity: 30 s cooldown
    const opens = [];
    const handler = createIndependenceGroupsHandler({
      env: fakeConfiguredEnv(),
      layer: { async open(graphName) { opens.push(graphName); return { graphName, async graphExists() { return true; }, async close() {}, async roQuery() { return { data: [] }; } }; } },
      limiter,
    });
    const first = await handler(new Request(URL_INDEPENDENCE, { headers: { 'x-forwarded-for': '203.0.113.7' } }));
    expect(first.status).toBe(200);
    const second = await handler(new Request(URL_INDEPENDENCE, { headers: { 'x-forwarded-for': '203.0.113.7' } }));
    expect(second.status).toBe(429);
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await readJson(second)).error).toBe('rate-limited');
    expect(opens).toHaveLength(1);
  });
});
