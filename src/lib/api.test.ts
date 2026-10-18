import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  ApiUnavailableError,
  API_TIMEOUT_MS,
  apiRoutes,
  ensureDemoSeed,
  getAnalysisRun,
  getDemoDocuments,
  getGraphOverview,
  getSeedStatus,
} from './api';
import { buildDemoOverviewRecord } from '../test/graphFixtures';

type RouteHandler = (url: string, init: RequestInit | undefined) => {
  status: number;
  body?: unknown;
} | undefined;

interface CallRecord {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(handler: RouteHandler): CallRecord[] {
  const calls: CallRecord[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String((input as Request).url);
      calls.push({ url, init });
      const resolved = handler(url, init);
      if (!resolved) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      return new Response(
        resolved.body === undefined ? 'no body' : JSON.stringify(resolved.body),
        { status: resolved.status, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('api client — seed status', () => {
  it('maps a 200 probe to { exists: true, seedVersion, nodeCount }', async () => {
    stubFetch(() => ({ status: 200, body: { exists: true, seedVersion: 'seed-1', nodeCount: 17 } }));
    const status = await getSeedStatus();
    expect(status).toEqual({ exists: true, seedVersion: 'seed-1', nodeCount: 17 });
  });

  it('treats a 404 probe as exists:false — per the M2 contract note', async () => {
    stubFetch(() => ({ status: 404 }));
    const status = await getSeedStatus();
    expect(status).toEqual({ exists: false });
  });

  it('fails loudly (not exists:false) when the probe answers 500', async () => {
    stubFetch(() => ({ status: 500, body: { error: 'graph down' } }));
    await expect(getSeedStatus()).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('surfaces a network error instead of pretending a check happened', async () => {
    stubFetch(() => {
      throw new TypeError('connection refused');
    });
    await expect(getSeedStatus()).rejects.toBeInstanceOf(ApiNetworkError);
  });
});

describe('api client — demo seed', () => {
  it('POSTs bodyless to the demo-seed route and returns the server verdict', async () => {
    const calls = stubFetch(() => ({
      status: 200,
      body: { seeded: true, alreadySeeded: false, seedVersion: 'seed-1' },
    }));
    const result = await ensureDemoSeed();
    expect(result).toEqual({ seeded: true, alreadySeeded: false, seedVersion: 'seed-1' });
    const call = calls[0];
    expect(call?.url).toBe('/.netlify/functions' + apiRoutes.demoSeed);
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.body).toBeUndefined();
  });

  it('accepts an alreadySeeded success as a success', async () => {
    stubFetch(() => ({ status: 200, body: { seeded: false, alreadySeeded: true, seedVersion: 'seed-1' } }));
    const result = await ensureDemoSeed();
    expect(result).toEqual({ seeded: false, alreadySeeded: true, seedVersion: 'seed-1' });
  });

  it('refuses to fabricate success from an ambiguous payload', async () => {
    stubFetch(() => ({ status: 200, body: { note: 'maybe seeded?' } }));
    await expect(ensureDemoSeed()).rejects.toBeInstanceOf(ApiClientError);
  });

  it('429 stays a typed HTTP error so the UI can honestly show cooldown', async () => {
    stubFetch(() => ({ status: 429, body: { error: 'rate limited' } }));
    const error = await ensureDemoSeed().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect((error as ApiHttpError).status).toBe(429);
  });
});

describe('api client — graph overview', () => {
  it('parses nodes and edges with provenance from a real payload', async () => {
    const record = buildDemoOverviewRecord();
    stubFetch(() => ({ status: 200, body: record }));
    const outcome = await getGraphOverview({ limit: 40 });
    expect(outcome.available).toBe(true);
    if (!outcome.available) return;
    expect(outcome.data.nodes.map((node) => node.id)).toContain('claim-A');
    expect(outcome.data.nodes.map((node) => node.id)).toContain('meta-seed-version');
    const edgeTypes = new Set(outcome.data.edges.map((edge) => edge.type));
    for (const type of [
      'CITATION_USE_SUPPORTS_CLAIM',
      'MENTIONS_HISTORICALLY',
      'POSSIBLE_MATCH',
      'PUBLICATION_HAS_NOTICE',
    ]) {
      expect(edgeTypes.has(type)).toBe(true);
    }
  });

  it('forwards limit/nodeId/depth query params on GET /graph-edges', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { nodes: [], edges: [] } }));
    await getGraphOverview({ limit: 40 });
    await getGraphOverview({ nodeId: 'pub-mehra-2020', depth: 2 });
    expect(calls[0]?.url).toBe('/.netlify/functions/graph-edges?limit=40');
    expect(calls[1]?.url).toBe('/.netlify/functions/graph-edges?nodeId=pub-mehra-2020&depth=2');
  });

  it('404 reads as available:false (endpoint missing), never as fake success', async () => {
    stubFetch(() => ({ status: 404 }));
    const outcome = await getGraphOverview({ limit: 40 });
    expect(outcome).toEqual({ available: false, reason: 'endpoint-missing' });
  });

  it('501 reads as available:false with reason not-implemented', async () => {
    stubFetch(() => ({ status: 501 }));
    const outcome = await getGraphOverview({ limit: 40 });
    expect(outcome).toEqual({ available: false, reason: 'not-implemented' });
  });

  it('5xx throws so the UI can say the API is down', async () => {
    stubFetch(() => ({ status: 500 }));
    await expect(getGraphOverview({ limit: 40 })).rejects.toBeInstanceOf(ApiHttpError);
  });
});

describe('api client — endpoints landing later tolerate 404/501', () => {
  it('documents 404 → available:false (not an error)', async () => {
    stubFetch(() => ({ status: 404 }));
    const outcome = await getDemoDocuments();
    expect(outcome).toEqual({ available: false, reason: 'endpoint-missing' });
  });

  it('documents 200 → parsed list', async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        documents: [
          {
            id: 'doc-demo-manuscript',
            title: 'Data-Integrity Consequences in Respiratory Infection Care (Guided Demo Manuscript)',
            fileName: 'guided-demo-manuscript.pdf',
            format: 'pdf',
          },
        ],
      },
    }));
    const outcome = await getDemoDocuments();
    expect(outcome.available).toBe(true);
    if (outcome.available) {
      expect(outcome.data[0]?.id).toBe('doc-demo-manuscript');
    }
  });

  it('analysis status 501 → available:false (not an error)', async () => {
    stubFetch(() => ({ status: 501 }));
    const outcome = await getAnalysisRun('run-123');
    expect(outcome).toEqual({ available: false, reason: 'not-implemented' });
  });
});

describe('api client — truthful timeouts', () => {
  it('aborts hanging requests after the promised 10 s and says so', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: unknown, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason));
        });
      }),
    );
    const pending = getSeedStatus();
    const expectation = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError);
    // Just before the budget the request is still in flight.
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1);
    // Past the budget it must abort, not hang forever.
    await vi.advanceTimersByTimeAsync(1);
    await expectation;
  });

  it('attaches an abort signal to every outgoing request', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { exists: false } }));
    await getSeedStatus();
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('api client — 2xx non-JSON shading classifies as endpoint-missing', () => {
  /**
   * Raw-body stub (no JSON.stringify): simulates the deployed reality where
   * a missing function is shaded by the M1-era `/* → /index.html` fallback,
   * which answers 200 with a text/html document. Proven live in production.
   */
  function stubRawFetch(
    handler: (url: string) => { status: number; body: string; contentType: string } | undefined,
  ): CallRecord[] {
    const calls: CallRecord[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String((input as Request).url);
        calls.push({ url, init });
        const resolved = handler(url);
        if (!resolved) {
          return new Response(JSON.stringify({ error: 'not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(resolved.body, {
          status: resolved.status,
          headers: { 'Content-Type': resolved.contentType },
        });
      }),
    );
    return calls;
  }

  const HTML_PAGE = '<!doctype html><html><body><div id="root"></div></body></html>';
  const htmlRoute = () => ({ status: 200, body: HTML_PAGE, contentType: 'text/html' });

  it('probe: a 200 text/html body throws ApiUnavailableError and never claims exists:false', async () => {
    stubRawFetch(htmlRoute);
    const error = await getSeedStatus().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiUnavailableError);
    expect((error as ApiUnavailableError).name).toBe('ApiUnavailableError');
    expect((error as ApiUnavailableError).message).toBe(
      'Overview API is not available in this deployment (function missing) — seed status unknown.',
    );
  });

  it('graph-edges: a 200 text/html body resolves available:false (endpoint-missing), not an error', async () => {
    stubRawFetch(htmlRoute);
    await expect(getGraphOverview({ limit: 40 })).resolves.toEqual({
      available: false,
      reason: 'endpoint-missing',
    });
  });

  it('documents: a 200 text/html body resolves available:false (endpoint-missing)', async () => {
    stubRawFetch(htmlRoute);
    await expect(getDemoDocuments()).resolves.toEqual({
      available: false,
      reason: 'endpoint-missing',
    });
  });

  it('analysis status: a 200 text/html body resolves available:false (endpoint-missing)', async () => {
    stubRawFetch(htmlRoute);
    await expect(getAnalysisRun('run-123')).resolves.toEqual({
      available: false,
      reason: 'endpoint-missing',
    });
  });

  it('demo seed POST: a 200 text/html body classifies endpoint-missing — never a seeded success', async () => {
    stubRawFetch(htmlRoute);
    const error = await ensureDemoSeed().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiUnavailableError);
    expect((error as ApiUnavailableError).message).toMatch(/function missing/);
    expect((error as ApiUnavailableError).message).toMatch(/nothing ran/);
  });

  it('genuinely malformed JSON with an application/json content-type keeps the generic client error', async () => {
    stubRawFetch(() => ({
      status: 200,
      body: '{"exists": true, "seedVersion": "seed-1", "nodeCount": 17 // truncated comment',
      contentType: 'application/json',
    }));
    const error = await getSeedStatus().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).not.toBeInstanceOf(ApiUnavailableError);
    expect((error as ApiClientError).message).toBe(
      'API returned a non-JSON body with a success status',
    );
  });

  it('a JSON answer sent under a non-JSON content-type (e.g. text/plain) still parses when valid', async () => {
    // Truthfulness constraint: classification is about the BODY failing to
    // parse, never a reason to discard a valid JSON payload.
    stubRawFetch(() => ({
      status: 200,
      body: JSON.stringify({ exists: false }),
      contentType: 'text/plain',
    }));
    await expect(getSeedStatus()).resolves.toEqual({ exists: false });
  });
});
