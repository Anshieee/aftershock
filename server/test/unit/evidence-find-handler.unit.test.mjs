/**
 * Unit tests: P4 evidence-find handler (netlify/functions/evidence-find.mjs).
 *
 * Handler seam (per server/demoApi.mjs + netlify/functions/review-decide.mjs):
 * tests pass a fake `layer`, scripted `findContext` op, scripted `search` op
 * and (for the end-to-end provider seam) a fake `fetchFn` consumed by the real
 * searchCrossref. All provider payloads here are SYNTHETIC test data living
 * only in this file. No real DB, no real provider, no credentials.
 */

import { describe, expect, it } from 'vitest';
import {
  createEvidenceFindHandler,
} from '../../../netlify/functions/evidence-find.mjs';
import { createRateLimiter } from '../../demoApi.mjs';
import { ConnectionError, CredentialsError } from '../../graphClient.mjs';

const CONTEXT = {
  claimId: 'claim-A',
  claimText: 'Agent P-9 … relies on the synthetic guided-demo citation (Mehra et al., 2020).',
  label: 'Claim',
  direction: 'direct',
  documentVersionId: 'ver-demo-manuscript-v1',
  manuscriptId: 'doc-demo-manuscript',
  concern: { summary: 'Stored linkage test committed', direction: 'direct' },
  hasNoticeLinkage: true,
};

const SEARCH_OK = { id: 'scW' };

/** Test env: graph name present unless a test deliberately overrides it. */
const ENV = { FALKORDB_GRAPH_NAME: 'test-graph' };

/** Lenient limiter so the 2 per-request checks don't trip the 30 s IP cooldown. */
const LENIENT = createRateLimiter({ cooldownMs: 0, windowMs: 600_000, maxPerWindow: 10_000 });

/** @param {string} bodyText @param {string} url @param {Record<string,string>} [headers] */
function requestOf(bodyText, url, headers = {}) {
  return new Request(url, {
    method: 'POST',
    headers,
    ...(bodyText !== undefined ? { body: bodyText } : {}),
  });
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/* -------------------------------------------------------------- *
 * Prepare mode
 * -------------------------------------------------------------- */

describe('evidence-find handler — prepare mode', () => {
  const deps = {
    env: ENV,
    // Lenient limiter for non-rate-limit tests: handler makes 2 checks/request
    // (per-IP + per-claim); the DEFAULT 30 s IP cooldown would 429 them.
    limiter: createRateLimiter({ cooldownMs: 0, windowMs: 600_000, maxPerWindow: 10_000 }),
    layer: { open: async () => ({ close: async () => {} }), },
    findContext: async () => CONTEXT,
  };

  it('returns the exact prepare payload on an empty body', async () => {
    const handler = createEvidenceFindHandler(deps);
    const res = await handler(requestOf(undefined, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      mode: 'prepare',
      claimId: 'claim-A',
      claimText: CONTEXT.claimText,
      label: 'Claim',
      manuscriptId: 'doc-demo-manuscript',
      concern: CONTEXT.concern,
      suggestedQuery: 'Agent P-9 … relies on the synthetic guided-demo citation (Mehra et al., 2020).',
      queryEditable: true,
      providers: [
        { id: 'crossref', displayName: 'Crossref', scopeNote: 'public bibliographic metadata', landingUrl: 'https://www.crossref.org' },
      ],
      caveats: expect.any(Array),
    });
    expect(body.caveats).toHaveLength(5);
    // suggestedQuery strips the stored "Agent"? No — only Claim/Passage prefixes are
    // stripped; the stored text above has none, so it passes through capped/trimmed.
  });

  it('404 when no Claim/Conclusion node exists', async () => {
    const handler = createEvidenceFindHandler({ ...deps, findContext: async () => null });
    const res = await handler(requestOf(undefined, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('claim-not-found');
  });

  it('503 graph-backend-unavailable when the layer cannot connect', async () => {
    const handler = createEvidenceFindHandler({
    env: ENV,
      layer: { open: async () => { throw new ConnectionError('graph is down'); } },
      findContext: async () => CONTEXT,
    });
    const res = await handler(requestOf(undefined, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('graph-backend-unavailable');
    expect(body.message).toContain('no fabricated data');
  });

  it('503 graph-backend-not-configured without FALKORDB_GRAPH_NAME', async () => {
    const handler = createEvidenceFindHandler({
      env: {},
      layer: { open: async () => ({ close: async () => {} }), },
      findContext: async () => CONTEXT,
    });
    const res = await handler(requestOf(undefined, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('graph-backend-not-configured');
  });

  it('400 for an invalid claimId charset', async () => {
    const handler = createEvidenceFindHandler(deps);
    const res = await handler(requestOf(undefined, 'https://f.test/.netlify/functions/evidence-find?claimId=not%20ok%2Fpath'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid-request');
  });

  it('400 when graph ops surface a domain validation error', async () => {
    const handler = createEvidenceFindHandler({
    env: ENV,
      layer: { open: async () => ({ close: async () => {} }) },
      findContext: async () => {
        const err = new Error('bad shape');
        err.name = 'EvidenceValidationError';
        err.status = 400;
        throw err;
      },
    });
    const res = await handler(requestOf(undefined, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect(res.status).toBe(400);
  });

  it('405 on GET and advertises POST', async () => {
    const handler = createEvidenceFindHandler(deps);
    const res = await handler(new Request('https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('400 on malformed JSON and non-object bodies', async () => {
    const handler = createEvidenceFindHandler(deps);
    for (const bad of ['{ junk', '[1,2]', '"string"', 'null']) {
      const res = await handler(requestOf(bad, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid-request');
    }
  });

  it('launder-side check: `{}` stays prepare mode (no provider call, search seam unused)', async () => {
    let searchCalled = false;
    const handler = createEvidenceFindHandler({ ...deps, search: async () => { searchCalled = true; } });
    const res = await handler(requestOf('{}', 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect((await res.json()).mode).toBe('prepare');
    expect(searchCalled).toBe(false);
  });
});

/* -------------------------------------------------------------- *
 * Search mode
 * -------------------------------------------------------------- */

const SEARCH_BODY = JSON.stringify({ query: '  registry analysis  ' });

describe('evidence-find handler — search mode', () => {
  const okSearch = async (q) => (q === 'registry analysis' ? { status: 'ok', candidates: [SEARCH_OK] } : { status: 'empty', candidates: [] });

  it('returns prepare fields PLUS candidates/providersStatus/query/searchedAt, without suggestedQuery', async () => {
    const handler = createEvidenceFindHandler({ env: ENV, layer: { open: async () => ({ close: async () => {} }) }, findContext: async () => CONTEXT, search: okSearch, limiter: LENIENT });
    const res = await handler(requestOf(SEARCH_BODY, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('search');
    expect(body.query).toBe('registry analysis'); // trimmed, the query actually used
    expect(body.candidates).toEqual([SEARCH_OK]);
    expect(body.providersStatus).toEqual([{ id: 'crossref', status: 'ok' }]);
    expect(body.claimText).toBe(CONTEXT.claimText);
    expect(body.manuscriptId).toBe('doc-demo-manuscript');
    expect(body.suggestedQuery).toBeUndefined();
    expect(body.searchedAt).toMatch(ISO_RE);
    expect(body.caveats).toHaveLength(5);
  });

  it('validates the query: empty / whitespace-only / type / over 400 → 400', async () => {
    const handler = createEvidenceFindHandler({ env: ENV, layer: { open: async () => ({ close: async () => {} }) }, findContext: async () => CONTEXT, search: okSearch, limiter: LENIENT });
    for (const bad of [{ query: '' }, { query: '   ' }, { query: 7 }, { query: 'q'.repeat(401) }, { query: '\u0001\u0002' }]) {
      const res = await handler(requestOf(JSON.stringify(bad), 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid-request');
    }
  });

  it('strips control characters and echoes exactly what was searched', async () => {
    let used;
    const handler = createEvidenceFindHandler({
    env: ENV,
      layer: { open: async () => ({ close: async () => {} }) },
      findContext: async () => CONTEXT,
      search: async (q) => { used = q; return { status: 'empty', candidates: [] }; },
    });
    const res = await handler(requestOf(
      JSON.stringify({ query: 'regi\u0001stry' }),
      'https://f.test/.netlify/functions/evidence-find?claimId=claim-A',
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe('registry');
    expect(used).toBe('registry');
    expect(body.providersStatus).toEqual([{ id: 'crossref', status: 'empty' }]);
    expect(body.candidates).toEqual([]);
  });

  it('(end-to-end provider seam) fetchFn HTTP 500 → HTTP 200, providersStatus error, no retry, no fabricated candidates', async () => {
    const handler = createEvidenceFindHandler({
    env: ENV,
      layer: { open: async () => ({ close: async () => {} }) },
      findContext: async () => CONTEXT,
      fetchFn: async () => new Response(JSON.stringify({ status: 'error' }), { status: 500 }),
      searchTimeoutMs: 500,
    });
    const res = await handler(requestOf(
      JSON.stringify({ query: 'registry analysis' }),
      'https://f.test/.netlify/functions/evidence-find?claimId=claim-A',
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providersStatus[0].status).toBe('error');
    expect(body.providersStatus[0].retried).toBeUndefined();
    expect(body.providersStatus[0].message).toContain('HTTP 500');
    expect(body.candidates).toEqual([]);
  });

  it('(end-to-end provider seam) hanging fetchFn → HTTP 200, providersStatus timeout with retried:true', async () => {
    const handler = createEvidenceFindHandler({
    env: ENV,
      layer: { open: async () => ({ close: async () => {} }) },
      findContext: async () => CONTEXT,
      searchTimeoutMs: 40,
      fetchFn: async (_url, opts = {}) => new Promise((resolve, reject) => {
        const signal = opts.signal;
        const onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (signal?.aborted) { onAbort(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    });
    const res = await handler(requestOf(
      JSON.stringify({ query: 'registry analysis' }),
      'https://f.test/.netlify/functions/evidence-find?claimId=claim-A',
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providersStatus).toEqual([{
      id: 'crossref',
      status: 'timeout',
      message: expect.any(String),
      retried: true,
    }]);
    expect(body.candidates).toEqual([]);
  });

  it('graph failure during search mode → 503 (honest, not provider error style)', async () => {
    const handler = createEvidenceFindHandler({
    env: ENV,
      layer: { open: async () => { throw new ConnectionError('down'); } },
      findContext: async () => CONTEXT,
      search: async () => ({ status: 'ok', candidates: [SEARCH_OK] }),
    });
    const res = await handler(requestOf(SEARCH_BODY, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('graph-backend-unavailable');
  });

  it('missing graph name in search mode → 503 graph-backend-not-configured', async () => {
    const handler = createEvidenceFindHandler({
    env: ENV,
      env: {},
      layer: { open: async () => ({ close: async () => {} }) },
      findContext: async () => CONTEXT,
    });
    const res = await handler(requestOf(SEARCH_BODY, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('graph-backend-not-configured');
  });

  it('does a per-IP rate-limit gate on every IP key and returns honest retry-after', async () => {
    const limiter = createRateLimiter({ cooldownMs: 30_000, windowMs: 600_000, maxPerWindow: 10 });
    const handler = createEvidenceFindHandler({
    env: ENV,
      layer: { open: async () => ({ close: async () => {} }) },
      findContext: async () => CONTEXT,
      search: okSearch,
      limiter,
    });
    const make = () => requestOf(SEARCH_BODY, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A',
      { 'x-forwarded-for': '203.0.113.7' });
    const res1 = await handler(make());
    expect(res1.status).toBe(200);
    const res2 = await handler(make());
    expect(res2.status).toBe(429);
    expect(Number(res2.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    const body = await res2.json();
    expect(body.error).toBe('rate-limited');
    expect(body.message).toContain('nothing was searched');
  });

  it('rate-limits per claim too (same in-memory limiter, mirrored review-decide style)', async () => {
    const limiter = createRateLimiter({ cooldownMs: 30_000, windowMs: 600_000, maxPerWindow: 10 });
    const handler = createEvidenceFindHandler({
    env: ENV,
      layer: { open: async () => ({ close: async () => {} }) },
      findContext: async () => CONTEXT,
      search: okSearch,
      limiter,
    });
    const otherClaim = requestOf(SEARCH_BODY, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-B');
    const resOther = await handler(otherClaim);
    expect(resOther.status).toBe(200); // other claim unaffected by self-claim budget
    const resAgain = await handler(requestOf(SEARCH_BODY, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-B'));
    expect(resAgain.status).toBe(429);
  });

  it('wall-clock budget is honored: claims through the graph deadline when slow', async () => {
    const started = Date.now();
    const handler = createEvidenceFindHandler({
    env: ENV,
      layer: { open: async () => ({
        close: async () => {},
        async roQuery() { return new Promise(() => {}); }, // hangs; withSession deadline fires
      }) },
      findContext: async (session) => session.roQuery('MATCH (c) … $claimId'),
    });
    const res = await handler(requestOf(undefined, 'https://f.test/.netlify/functions/evidence-find?claimId=claim-A'));
    expect(res.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(9_000);
  });
});
