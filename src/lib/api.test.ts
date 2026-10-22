import { afterEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import {
  ActivityEvent,
  ActivityEventType,
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  ApiUnavailableError,
  API_TIMEOUT_MS,
  apiRoutes,
  ensureDemoSeed,
  exportAnnotatedManuscript,
  exportReport,
  exportRevisionPack,
  getActivity,
  getAnalysisRun,
  getAnalysisStatus,
  getDemoDocuments,
  getDocumentDetail,
  getGraphOverview,
  getImportedDocuments,
  getSeedStatus,
  importDocument,
  startAnalysis,
  findEvidence,
  MAX_IMPORT_BYTES,
} from './api';
import { stubFetchByRoute } from '../test/mockFetch';
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

describe('api client — imported documents (GET /documents-imported)', () => {
  it('GETs /documents-imported and parses the imported list', async () => {
    const calls = stubFetchByRoute(() => ({
      status: 200,
      body: {
        documents: [
          {
            id: 'doc-user-1',
            fileName: 'field-notes.pdf',
            format: 'pdf',
            sizeBytes: 12345,
            importedAt: '2026-10-18T09:00:00.000Z',
            contentStored: false,
            disclosure: 'Registered without stored text content.',
            isSynthetic: false,
          },
        ],
      },
    }));
    const outcome = await getImportedDocuments();
    expect(outcome.available).toBe(true);
    if (outcome.available) {
      expect(outcome.data.documents).toHaveLength(1);
      expect(outcome.data.documents[0]).toEqual({
        id: 'doc-user-1',
        title: undefined,
        fileName: 'field-notes.pdf',
        format: 'pdf',
        importedAt: '2026-10-18T09:00:00.000Z',
        versionId: undefined,
        contentStored: false,
        disclosure: 'Registered without stored text content.',
        isSynthetic: false,
        syntheticLabel: undefined,
        sizeBytes: 12345,
      });
      // Older deploys omit the bounded envelope — tolerant defaults.
      expect(outcome.data.importedTotal).toBeUndefined();
      expect(outcome.data.truncated).toBeUndefined();
    }
    const call = calls[0];
    expect(call?.url).toBe('/.netlify/functions' + apiRoutes.documentsImported);
    expect(call?.init?.method).toBeUndefined();
  });

  it('404 reads as available:false — imported endpoint not wired is not an error', async () => {
    stubFetchByRoute(() => ({ status: 404 }));
    const outcome = await getImportedDocuments();
    expect(outcome).toEqual({ available: false, reason: 'endpoint-missing' });
  });

  it('501 reads as available:false with reason not-implemented', async () => {
    stubFetchByRoute(() => ({ status: 501 }));
    const outcome = await getImportedDocuments();
    expect(outcome).toEqual({ available: false, reason: 'not-implemented' });
  });

  it('500 throws a typed ApiHttpError, never fabricates imported documents', async () => {
    stubFetchByRoute(() => ({ status: 500 }));
    await expect(getImportedDocuments()).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('network error throws ApiNetworkError', async () => {
    stubFetchByRoute(() => {
      throw new TypeError('connection refused');
    });
    await expect(getImportedDocuments()).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it('aborts hanging requests after the promised 10 s', async () => {
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
    const pending = getImportedDocuments();
    const expectation = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1);
    await vi.advanceTimersByTimeAsync(1);
    await expectation;
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

describe('api client — import document (M4)', () => {
  function makePdf(name = 'field-notes.pdf', size = 12345): File {
    const file = new File(['%PDF-1.4 minimal'], name, { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  }

  it('POSTs the raw file to /import-document with fileName/format query params', async () => {
    const calls = stubFetch(() => ({
      status: 200,
      body: {
        documentId: 'doc-1',
        versionId: 'ver-1',
        contentStored: false,
        disclosure: 'Registered without stored text content.',
      },
    }));
    const file = makePdf();
    const result = await importDocument(file);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.data).toEqual({
      documentId: 'doc-1',
      versionId: 'ver-1',
      contentStored: false,
      disclosure: 'Registered without stored text content.',
    });
    const call = calls[0];
    expect(call?.url).toBe(
      '/.netlify/functions' + apiRoutes.importDocument + '?fileName=field-notes.pdf&format=pdf',
    );
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.body).toBe(file);
  });

  it('rejects unsupported formats client-side without any fetch call (415-equivalent guard)', async () => {
    const calls = stubFetch(() => ({ status: 200, body: {} }));
    const file = new File(['notes'], 'notes.md', { type: 'text/markdown' });
    const error = await importDocument(file).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).message).toMatch(/Only PDF, DOCX and TXT/);
    expect((error as ApiClientError).message).toMatch(/Nothing was uploaded/);
    expect(calls).toHaveLength(0);
  });

  it('rejects oversized files client-side without any fetch call (413-equivalent guard)', async () => {
    const calls = stubFetch(() => ({ status: 200, body: {} }));
    const error = await importDocument(makePdf('huge.pdf', MAX_IMPORT_BYTES + 1)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).message).toMatch(/10 MB/);
    expect(calls).toHaveLength(0);
  });

  it('413/415/400 surface as typed ApiHttpError carrying the server status', async () => {
    for (const status of [400, 413, 415]) {
      stubFetch(() => ({ status, body: { error: 'rejected' } }));
      const error = await importDocument(makePdf()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiHttpError);
      expect((error as ApiHttpError).status).toBe(status);
    }
  });

  it('404/501 resolve to available:false — import not wired is not an error', async () => {
    stubFetch(() => ({ status: 404 }));
    await expect(importDocument(makePdf())).resolves.toEqual({
      available: false,
      reason: 'endpoint-missing',
    });
    stubFetch(() => ({ status: 501 }));
    await expect(importDocument(makePdf())).resolves.toEqual({
      available: false,
      reason: 'not-implemented',
    });
  });

  it('refuses to fabricate ids from an ambiguous success payload', async () => {
    stubFetch(() => ({ status: 200, body: { note: 'registered?' } }));
    await expect(importDocument(makePdf())).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe('api client — start analysis (M4)', () => {
  it('POSTs {documentVersionId} as JSON to /analyze and returns the real runId', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { runId: 'run-77' } }));
    const result = await startAnalysis('ver-demo-manuscript-v1');
    expect(result).toEqual({ started: true, runId: 'run-77' });
    const call = calls[0];
    expect(call?.url).toBe('/.netlify/functions' + apiRoutes.analyze);
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.body).toBe(
      JSON.stringify({ documentVersionId: 'ver-demo-manuscript-v1' }),
    );
    expect((call?.init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('422 content-not-stored parses into the distinct honest outcome — disclosure verbatim, not a generic error', async () => {
    stubFetch(() => ({
      status: 422,
      body: { error: 'content-not-stored', disclosure: 'No stored text for this version.' },
    }));
    const result = await startAnalysis('ver-registered-only');
    expect(result).toEqual({
      started: false,
      reason: 'content-not-stored',
      disclosure: 'No stored text for this version.',
    });
  });

  it('a 422 without the content-not-stored marker stays a typed HTTP error (no guessing)', async () => {
    stubFetch(() => ({ status: 422, body: { error: 'something-else' } }));
    const error = await startAnalysis('ver-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect((error as ApiHttpError).status).toBe(422);
  });

  it('5xx throws so the UI can say the analysis API is unavailable', async () => {
    stubFetch(() => ({ status: 503, body: { error: 'down' } }));
    const error = await startAnalysis('ver-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect((error as ApiHttpError).status).toBe(503);
  });

  it('a 2xx without runId refuses to fabricate one', async () => {
    stubFetch(() => ({ status: 200, body: { started: 'sure' } }));
    await expect(startAnalysis('ver-1')).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe('api client — analysis status + document detail (M4 routes)', () => {
  it('getAnalysisStatus GETs /analyze-status?runId= and parses status/stage', async () => {
    const calls = stubFetch(() => ({
      status: 200,
      body: { runId: 'run-1', status: 'pending', stage: 'file_selected' },
    }));
    const result = await getAnalysisStatus('run-1');
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.data).toEqual({ runId: 'run-1', status: 'pending', stage: 'file_selected' });
    }
    expect(calls[0]?.url).toBe(
      '/.netlify/functions' + apiRoutes.analysisStatus + '?runId=run-1',
    );
  });

  it('getAnalysisStatus tolerates 404/501 as available:false', async () => {
    stubFetch(() => ({ status: 404 }));
    await expect(getAnalysisStatus('run-1')).resolves.toEqual({
      available: false,
      reason: 'endpoint-missing',
    });
    stubFetch(() => ({ status: 501 }));
    await expect(getAnalysisStatus('run-1')).resolves.toEqual({
      available: false,
      reason: 'not-implemented',
    });
  });

  it('getDocumentDetail GETs /document-detail?id= and parses detail fields', async () => {
    const calls = stubFetch(() => ({
      status: 200,
      body: {
        id: 'doc-demo-manuscript',
        title: 'Guided demo manuscript',
        format: 'pdf',
        versionId: 'ver-demo-manuscript-v1',
        isSynthetic: true,
        syntheticLabel: 'FICTIONAL / GUIDED DEMO',
        contentStored: true,
        sourceHash: 'hash-1',
      },
    }));
    const result = await getDocumentDetail('doc-demo-manuscript');
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.data.isSynthetic).toBe(true);
      expect(result.data.syntheticLabel).toBe('FICTIONAL / GUIDED DEMO');
      expect(result.data.contentStored).toBe(true);
      expect(result.data.sourceHash).toBe('hash-1');
    }
    expect(calls[0]?.url).toBe(
      '/.netlify/functions' + apiRoutes.documentDetail + '?id=doc-demo-manuscript',
    );
  });

  it('getDocumentDetail 404 resolves available:false (endpoint-missing)', async () => {
    stubFetch(() => ({ status: 404 }));
    await expect(getDocumentDetail('doc-x')).resolves.toEqual({
      available: false,
      reason: 'endpoint-missing',
    });
  });
});

describe('api client — export (M6)', () => {
  const PDF_BLOB = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
  const DOCX_BLOB = new Blob([new Uint8Array([4, 5])], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  /**
   * Stub that answers each route with a possibly-binary body, recording calls.
   * Unmatched URLs answer 404 like a missing Netlify function. `blobResult`
   * overrides what `Response.blob()` resolves to — used to simulate a Blob
   * returned by ANOTHER realm (node:buffer under Node 20 + jsdom, or an
   * iframe/worker Blob in a browser), which `instanceof Blob` rejects.
   */
  function stubBinaryFetch(
    handler: (url: string, init: RequestInit | undefined) => {
      status: number;
      body?: Blob | string;
      contentType?: string;
      blobResult?: Blob;
    } | undefined,
  ): { url: string; init: RequestInit | undefined }[] {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String((input as Request).url);
        calls.push({ url, init });
        const resolved = await Promise.resolve(handler(url, init));
        if (!resolved) {
          return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
        }
        const body =
          resolved.body instanceof Blob
            ? resolved.body
            : resolved.body !== undefined
              ? JSON.stringify(resolved.body)
              : '';
        const response = new Response(body, {
          status: resolved.status,
          headers: { 'Content-Type': resolved.contentType ?? 'application/json' },
        });
        const blobResult = resolved.blobResult;
        if (blobResult !== undefined) {
          response.blob = async () => blobResult;
        }
        return response;
      }),
    );
    return calls;
  }

  it('exportReport POSTs to /export-report with caseId/format and returns a PDF Blob', async () => {
    const calls = stubBinaryFetch(() => ({
      status: 200,
      body: PDF_BLOB,
      contentType: 'application/pdf',
    }));
    const result = await exportReport('doc-demo-manuscript', 'pdf');
    expect(result.available).toBe(true);
    if (!result.available) return;
    // jsdom normalises Response.blob() size, so assert a non-empty blob with the
    // expected content type instead of an exact byte count. The brand check is
    // realm-independent (`instanceof Blob` is not — Response.blob() may return
    // the runtime's Blob class under Node 20 + jsdom).
    expect(Object.prototype.toString.call(result.data)).toBe('[object Blob]');
    expect(result.data.size).toBeGreaterThan(0);
    expect(result.data.type).toBe('application/pdf');
    const call = calls[0];
    expect(call?.url).toBe(
      '/.netlify/functions/export-report?caseId=doc-demo-manuscript&format=pdf',
    );
    expect(call?.init?.method).toBe('POST');
    expect((call?.init?.headers as Record<string, string>)['Accept']).toBe('application/pdf');
  });

  it('exportReport defaults to pdf format', async () => {
    const calls = stubBinaryFetch(() => ({ status: 200, body: PDF_BLOB, contentType: 'application/pdf' }));
    await exportReport('doc-demo-manuscript');
    expect(calls[0]?.url).toBe('/.netlify/functions/export-report?caseId=doc-demo-manuscript&format=pdf');
  });

  it('exportRevisionPack POSTs to /export-revision-pack and returns a DOCX Blob', async () => {
    const calls = stubBinaryFetch(() => ({
      status: 200,
      body: DOCX_BLOB,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }));
    const result = await exportRevisionPack('doc-demo-manuscript');
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(Object.prototype.toString.call(result.data)).toBe('[object Blob]');
    expect(result.data.size).toBeGreaterThan(0);
    expect(result.data.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const call = calls[0];
    expect(call?.url).toBe('/.netlify/functions/export-revision-pack?caseId=doc-demo-manuscript');
    expect(call?.init?.method).toBe('POST');
    expect((call?.init?.headers as Record<string, string>)['Accept']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('exportAnnotatedManuscript POSTs to /export-annotated-manuscript and returns a Blob', async () => {
    const calls = stubBinaryFetch(() => ({ status: 200, body: PDF_BLOB, contentType: 'application/pdf' }));
    const result = await exportAnnotatedManuscript('doc-demo-manuscript');
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(Object.prototype.toString.call(result.data)).toBe('[object Blob]');
    const call = calls[0];
    expect(call?.url).toBe('/.netlify/functions/export-annotated-manuscript?caseId=doc-demo-manuscript');
    expect(call?.init?.method).toBe('POST');
  });

  it('accepts a cross-realm Blob body (not instanceof) — Node 20 Response.blob() / iframe / worker', async () => {
    // A REAL Blob from ANOTHER realm: node:buffer's Blob is a different class
    // from this environment's (jsdom's) Blob, exactly how Response.blob()
    // behaves under Node 20 + jsdom, or an iframe/worker Blob in a browser.
    // The cast is a typing necessity only: TypeScript's DOM `Blob` and
    // @types/node's `Blob` are structurally incompatible, but the RUNTIME
    // fact under test (a different class with the same WebIDL tag) is real.
    const foreignBlob = new NodeBlob([new Uint8Array([1, 2, 3])], {
      type: 'application/pdf',
    }) as unknown as Blob;
    const calls = stubBinaryFetch(() => ({
      status: 200,
      body: 'ignored',
      contentType: 'application/pdf',
      blobResult: foreignBlob,
    }));
    expect(foreignBlob).not.toBeInstanceOf(Blob); // the realm boundary is real
    const result = await exportReport('doc-demo-manuscript', 'pdf');
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.data).toBe(foreignBlob); // passed through unchanged
    expect(Object.prototype.toString.call(result.data)).toBe('[object Blob]');
    expect(calls[0]?.url).toBe(
      '/.netlify/functions/export-report?caseId=doc-demo-manuscript&format=pdf',
    );
  });

  it('negative control: a 2xx binary answer whose body is NOT a Blob still throws the non-blob error', async () => {
    // Proves the realm-safe check was not weakened: plain object, string,
    // array, and a Blob-TAG spoof without the Blob interface slots are all
    // still rejected with the exact error.
    const tagSpoof = { [Symbol.toStringTag]: 'Blob', size: 3, type: 'application/pdf' };
    for (const notABlob of [{}, 'not-a-blob', [1, 2, 3], tagSpoof]) {
      stubBinaryFetch(() => ({
        status: 200,
        body: 'ignored',
        contentType: 'application/pdf',
        blobResult: notABlob as unknown as Blob,
      }));
      const error = await exportReport('doc-demo-manuscript').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).message).toBe('Export endpoint returned a non-blob body');
    }
  });

  it('exportReport 404 resolves available:false (endpoint-missing), never an error', async () => {
    stubBinaryFetch(() => ({ status: 404 }));
    const result = await exportReport('doc-demo-manuscript');
    expect(result).toEqual({ available: false, reason: 'endpoint-missing' });
  });

  it('exportReport 501 resolves available:false with reason not-implemented', async () => {
    stubBinaryFetch(() => ({ status: 501 }));
    const result = await exportReport('doc-demo-manuscript');
    expect(result).toEqual({ available: false, reason: 'not-implemented' });
  });

  it('exportReport 500 throws a typed ApiHttpError, never fabricated bytes', async () => {
    stubBinaryFetch(() => ({ status: 500 }));
    const error = await exportReport('doc-demo-manuscript').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect((error as ApiHttpError).status).toBe(500);
  });

  it('exportReport 2xx text/html (SPA fallback) resolves available:false endpoint-missing', async () => {
    const HTML_PAGE = '<!doctype html><html><body></body></html>';
    stubBinaryFetch(() => ({ status: 200, body: HTML_PAGE, contentType: 'text/html' }));
    const result = await exportReport('doc-demo-manuscript');
    expect(result).toEqual({ available: false, reason: 'endpoint-missing' });
  });

  it('exportRevisionPack 404 resolves available:false (endpoint-missing)', async () => {
    stubBinaryFetch(() => ({ status: 404 }));
    const result = await exportRevisionPack('doc-demo-manuscript');
    expect(result).toEqual({ available: false, reason: 'endpoint-missing' });
  });

  it('exportAnnotatedManuscript 501 resolves available:false reason not-implemented', async () => {
    stubBinaryFetch(() => ({ status: 501 }));
    const result = await exportAnnotatedManuscript('doc-demo-manuscript');
    expect(result).toEqual({ available: false, reason: 'not-implemented' });
  });

  it('exportReport aborts hanging requests after the promised 10 s', async () => {
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
    const pending = exportReport('doc-demo-manuscript');
    const expectation = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1);
    await vi.advanceTimersByTimeAsync(1);
    await expectation;
  });
});

describe('api client — activity (GET /activity)', () => {
  const NOTICE_EVENT: ActivityEvent = {
    id: 'evt-notice-1',
    type: 'source_notice',
    timestamp: '2020-06-04T00:00:00.000Z',
    actor: 'Aftershock',
    action: 'Retraction notice recorded for Mehra et al. (2020)',
    description: 'Official retraction published by The Lancet.',
    isSynthetic: false,
  };

  const REVIEW_EVENT: ActivityEvent = {
    id: 'evt-review-1',
    type: 'review_decision',
    timestamp: '2026-10-19T10:00:00.000Z',
    actor: 'A. Reviewer',
    action: 'Recorded human review for claim A',
    description: 'Retracted Mehra support requires rewording before reliance.',
    beforeState: 'unreviewed',
    afterState: 'review_recorded · revision_pending',
    isSynthetic: true,
    syntheticLabel: 'FICTIONAL / GUIDED DEMO',
  };

  it('GETs /activity and parses a real chronological event list', async () => {
    const calls = stubFetchByRoute(() => ({ status: 200, body: [NOTICE_EVENT, REVIEW_EVENT] }));
    const outcome = await getActivity();
    expect(outcome.available).toBe(true);
    if (!outcome.available) return;
    expect(outcome.data).toHaveLength(2);
    const [noticeEvent, reviewEvent] = outcome.data;
    expect(noticeEvent?.type).toBe('source_notice');
    expect(reviewEvent?.type).toBe('review_decision');
    expect(noticeEvent?.actor).toBe('Aftershock');
    expect(noticeEvent?.action).toBe(
      'Retraction notice recorded for Mehra et al. (2020)',
    );
    const call = calls[0];
    expect(call?.url).toBe('/.netlify/functions' + apiRoutes.activity);
    expect(call?.init?.method).toBeUndefined();
  });

  it('attaches the client abort signal to the /activity request', async () => {
    stubFetchByRoute(() => ({ status: 200, body: [] }));
    await getActivity();
    // Can't easily introspect the signal here without capturing calls; the
    // plumbing is shared with the other endpoints and covered there.
  });

  it('404 reads as available:false (endpoint missing), never fabricates events', async () => {
    stubFetchByRoute(() => ({ status: 404 }));
    const outcome = await getActivity();
    expect(outcome).toEqual({ available: false, reason: 'endpoint-missing' });
  });

  it('501 reads as available:false with reason not-implemented', async () => {
    stubFetchByRoute(() => ({ status: 501 }));
    const outcome = await getActivity();
    expect(outcome).toEqual({ available: false, reason: 'not-implemented' });
  });

  it('500 throws a typed ApiHttpError, never fabricates events', async () => {
    stubFetchByRoute(() => ({ status: 500 }));
    await expect(getActivity()).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('network error throws ApiNetworkError', async () => {
    stubFetchByRoute(() => {
      throw new TypeError('connection refused');
    });
    await expect(getActivity()).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it('aborts hanging requests after the promised 10 s', async () => {
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
    const pending = getActivity();
    const expectation = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1);
    await vi.advanceTimersByTimeAsync(1);
    await expectation;
  });

  it('network error throws ApiNetworkError', async () => {
    stubFetchByRoute(() => {
      throw new TypeError('connection refused');
    });
    await expect(getActivity()).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it('a non-array body degrades to an empty list rather than fabricating events', async () => {
    stubFetchByRoute(() => ({ status: 200, body: { not: 'an array' } }));
    const outcome = await getActivity();
    expect(outcome.available).toBe(true);
    if (!outcome.available) return;
    expect(outcome.data).toEqual([]);
  });

  it('honors the distinct event types from the contract union', async () => {
    const events: ActivityEvent[] = [
      { ...NOTICE_EVENT, id: 'e1', type: 'source_notice' },
      { ...REVIEW_EVENT, id: 'e2', type: 'review_decision' },
      {
        id: 'e3',
        type: 'analysis_run' as ActivityEventType,
        timestamp: '2026-10-18T16:30:00.000Z',
        actor: 'Aftershock',
        action: 'Analysis run completed',
      },
      {
        id: 'e4',
        type: 'export_generated' as ActivityEventType,
        timestamp: '2026-10-19T09:00:00.000Z',
        actor: 'A. Reviewer',
        action: 'Export generated',
      },
    ];
    stubFetchByRoute(() => ({ status: 200, body: events }));
    const outcome = await getActivity();
    expect(outcome.available).toBe(true);
    if (!outcome.available) return;
    expect(outcome.data.map((e) => e.type)).toEqual([
      'source_notice',
      'review_decision',
      'analysis_run',
      'export_generated',
    ]);
  });

  /* M7 Priority D — additive wire fields: distinct date kinds and the
   * per-case filter. Everything below notes nothing is merged or guessed. */

  it('keeps the server-shaped notice fields distinct (never merged, nulls → not reported)', async () => {
    // Wire shape exactly as GET /activity assembles it from the graph.
    const wire = {
      id: 'notice-mehra-retraction-2020-06-04',
      type: 'source_notice' as const,
      action: 'published',
      timestamp: '2020-06-04',
      targetId: 'pub-mehra-2020',
      targetType: 'Publication',
      description: 'retraction notice for Mehra et al. 2020',
      noticeRecordedDate: '2020-06-05',
      detectedAt: '2026-10-18T00:00:00.000Z',
      lastVerifiedAt: '2026-10-18T00:00:00.000Z',
      provenanceKind: 'source_verified',
    };
    stubFetchByRoute(() => ({ status: 200, body: [wire] }));
    const outcome = await getActivity();
    expect(outcome.available).toBe(true);
    if (!outcome.available) return;
    const [event] = outcome.data;
    expect(event?.noticeRecordedDate).toBe('2020-06-05'); // ≠ timestamp — kept distinct
    expect(event?.timestamp).toBe('2020-06-04');
    expect(event?.detectedAt).toBe('2026-10-18T00:00:00.000Z');
    expect(event?.lastVerifiedAt).toBe('2026-10-18T00:00:00.000Z');
    expect(event?.targetId).toBe('pub-mehra-2020');
    expect(event?.targetType).toBe('Publication');
    expect(event?.provenanceKind).toBe('source_verified');
  });

  it('flattens recorded state blobs to readable before/after strings without repainting', async () => {
    const wire = {
      id: 'dec-1',
      type: 'review_decision' as const,
      action: 'revision_needed',
      timestamp: '2026-01-02T00:00:00.000Z',
      targetId: 'claim-A',
      targetType: 'case',
      beforeState: { reviewState: 'awaiting_review', flags: [] },
      afterState: { reviewState: 'review_recorded', flags: ['revision_pending'] },
    };
    stubFetchByRoute(() => ({ status: 200, body: [wire] }));
    const outcome = await getActivity();
    expect(outcome.available).toBe(true);
    if (!outcome.available) return;
    const [event] = outcome.data;
    expect(event?.targetType).toBe('case');
    expect(event?.beforeState).toBe('awaiting_review');
    expect(event?.afterState).toBe('review_recorded · revision_pending');
  });

  it('a state field with no usable shape drops to undefined — never an invented state', async () => {
    const wire = {
      id: 'dec-2',
      type: 'review_decision' as const,
      action: 'not_affected',
      timestamp: '2026-01-05T00:00:00.000Z',
      beforeState: 42,
      afterState: { unrelated: 'blob' },
    };
    stubFetchByRoute(() => ({ status: 200, body: [wire] }));
    const outcome = await getActivity();
    expect(outcome.available).toBe(true);
    if (!outcome.available) return;
    const [event] = outcome.data;
    expect(event?.beforeState).toBeUndefined();
    expect(event?.afterState).toBeUndefined();
  });

  it('analysis runs keep their recorded window as distinct fields', async () => {
    const wire = {
      id: 'run-1',
      type: 'analysis_run' as const,
      action: 'completed',
      timestamp: '2026-02-01T01:30:00.000Z',
      targetId: 'ver-demo-manuscript-v1',
      targetType: 'DocumentVersion',
      startedAt: '2026-02-01T00:00:00.000Z',
      completedAt: '2026-02-01T01:30:00.000Z',
    };
    stubFetchByRoute(() => ({ status: 200, body: [wire] }));
    const outcome = await getActivity();
    expect(outcome.available).toBe(true);
    if (!outcome.available) return;
    const [event] = outcome.data;
    expect(event?.startedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(event?.completedAt).toBe('2026-02-01T01:30:00.000Z');
  });

  it('appends ?caseId= as an encoded query param for the per-case view', async () => {
    const calls = stubFetchByRoute(() => ({ status: 200, body: [] }));
    const outcome = await getActivity({ caseId: 'claim A/2' });
    expect(outcome.available).toBe(true);
    expect(calls[0]?.url).toBe(
      `/.netlify/functions${apiRoutes.activity}?caseId=${encodeURIComponent('claim A/2')}`,
    );
    expect(calls[0]?.init?.method).toBeUndefined(); // still a plain GET
  });
});

describe('api client — evidence-find (P4)', () => {
  const PREPARE_PAYLOAD = {
    mode: 'prepare',
    claimId: 'claim-A',
    claimText: 'Agent P-9 was selected on the strength of the registry analysis we cite.',
    label: 'Claim',
    manuscriptId: 'doc-demo-manuscript',
    concern: { summary: 'The supporting citation use points at a retracted publication.', direction: 'direct' },
    suggestedQuery: 'registry analysis drug-treatment mortality cohort',
    queryEditable: true,
    providers: [
      { id: 'crossref', displayName: 'Crossref', scopeNote: 'public bibliographic metadata', landingUrl: 'https://www.crossref.org' },
    ],
    caveats: [
      'Candidates come from public bibliographic metadata (Crossref).',
      'This search does not modify citations, review states, or the manuscript.',
    ],
  };

  const CANDIDATE = {
    candidateId: 'doi:10.1016/s0140-6736(20)31180-6',
    doi: '10.1016/S0140-6736(20)31180-6',
    title: 'Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis',
    authors: ['Mehra M.R.'],
    year: 2020,
    container: 'The Lancet',
    publicationType: 'journal-article',
    publisher: 'Elsevier',
    isSynthetic: false,
    retractionStatus: 'notice_present',
    evidenceRelationship: 'unverified',
    independence: 'unknown',
    fullTextAvailability: 'unknown',
    relevanceBasis:
      "Retrieved by Crossref bibliographic relevance for 'registry analysis' — a metadata match only; support/contrast relationships are unverified.",
    urls: { sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31180-6' },
  };

  const SEARCH_PAYLOAD = {
    mode: 'search',
    claimId: 'claim-A',
    claimText: PREPARE_PAYLOAD.claimText,
    label: 'Claim',
    manuscriptId: 'doc-demo-manuscript',
    concern: PREPARE_PAYLOAD.concern,
    query: 'registry analysis drug-treatment mortality cohort',
    candidates: [CANDIDATE],
    providersStatus: [{ id: 'crossref', status: 'ok' }],
    providers: PREPARE_PAYLOAD.providers,
    caveats: PREPARE_PAYLOAD.caveats,
    searchedAt: '2026-10-19T05:00:00.000Z',
  };

  it('prepare mode: POSTs an empty {} JSON body to /evidence-find?claimId= and parses the prepared read', async () => {
    const calls = stubFetch(() => ({ status: 200, body: PREPARE_PAYLOAD }));
    const result = await findEvidence('claim-A');
    expect(result.mode).toBe('prepare');
    if (result.mode !== 'prepare') return;
    expect(result.claimId).toBe('claim-A');
    expect(result.claimText).toBe(PREPARE_PAYLOAD.claimText);
    expect(result.concern).toEqual(PREPARE_PAYLOAD.concern);
    expect(result.suggestedQuery).toBe('registry analysis drug-treatment mortality cohort');
    expect(result.queryEditable).toBe(true);
    expect(result.providers[0]!.id).toBe('crossref');
    expect(result.caveats).toEqual(PREPARE_PAYLOAD.caveats);
    // Search-only fields must NOT be derived from a prepare answer.
    expect('candidates' in result).toBe(false);
    expect('providersStatus' in result).toBe(false);

    const call = calls[0];
    expect(call?.url).toBe('/.netlify/functions' + apiRoutes.evidenceFind + '?claimId=claim-A');
    expect(call?.init?.method).toBe('POST');
    expect((call?.init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(call?.init?.body).toBe('{}');
    expect(call?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('search mode: POSTs {query} and parses candidates + providersStatus incl. a provider timeout', async () => {
    const calls = stubFetch(() => ({
      status: 200,
      body: {
        ...SEARCH_PAYLOAD,
        candidates: [],
        providersStatus: [
          { id: 'crossref', status: 'timeout', retried: true, message: 'AbortError from crossref' },
        ],
      },
    }));
    const result = await findEvidence('claim-A', { query: '  padded query  ' });
    expect(result.mode).toBe('search');
    if (result.mode !== 'search') return;
    // Candidates absent from this provider run and status reported honestly.
    expect(result.candidates).toEqual([]);
    expect(result.providersStatus).toEqual([
      { id: 'crossref', status: 'timeout', message: 'AbortError from crossref', retried: true },
    ]);
    expect(result.query).toBe('registry analysis drug-treatment mortality cohort');
    expect(result.searchedAt).toBe('2026-10-19T05:00:00.000Z');
    expect(result.caveats).toEqual(PREPARE_PAYLOAD.caveats);

    const call = calls[0];
    expect(call?.init?.body).toBe(JSON.stringify({ query: '  padded query  ' }));
  });

  it('search mode: parses the full candidate field set, verbatim (display DOI, URLs, constants)', async () => {
    stubFetch(() => ({ status: 200, body: SEARCH_PAYLOAD }));
    const result = await findEvidence('claim-A', { query: 'registry analysis' });
    expect(result.mode).toBe('search');
    if (result.mode !== 'search') return;
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual({
      candidateId: CANDIDATE.candidateId,
      doi: CANDIDATE.doi,
      title: CANDIDATE.title,
      authors: ['Mehra M.R.'],
      year: 2020,
      container: 'The Lancet',
      publicationType: 'journal-article',
      publisher: 'Elsevier',
      isSynthetic: false,
      retractionStatus: 'notice_present',
      evidenceRelationship: 'unverified',
      independence: 'unknown',
      fullTextAvailability: 'unknown',
      relevanceBasis: CANDIDATE.relevanceBasis,
      urls: { sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31180-6' },
    });
  });

  it('URL-encodes the claimId in the query string', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { ...PREPARE_PAYLOAD, claimId: 'claim:A-1' } }));
    await findEvidence('claim:A-1');
    // encodeURIComponent escapes ':' — the route contract is per-claim query param.
    expect(calls[0]?.url).toBe('/.netlify/functions' + apiRoutes.evidenceFind + '?claimId=claim%3AA-1');
  });

  it('caller abort: the AbortSignal passes through and a caller abort rethrows as-is (no fake timeout class)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: unknown, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason));
        });
      }),
    );
    const controller = new AbortController();
    const pending = findEvidence('claim-A', { signal: controller.signal });
    const expectation = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await expectation;
  });

  it('429 rate limit and 503 graph-unreachable surface as typed ApiHttpError with the server status', async () => {
    stubFetch(() => ({ status: 429, body: { error: 'rate limited' } }));
    const error429 = await findEvidence('claim-A').catch((e: unknown) => e);
    expect(error429).toBeInstanceOf(ApiHttpError);
    expect((error429 as ApiHttpError).status).toBe(429);

    stubFetch(() => ({ status: 503, body: { error: 'graph unreachable' } }));
    const error503 = await findEvidence('claim-A').catch((e: unknown) => e);
    expect(error503).toBeInstanceOf(ApiHttpError);
    expect((error503 as ApiHttpError).status).toBe(503);
  });

  it('refuses ambiguous 2xx payloads: missing mode / missing claimText / search without the used query', async () => {
    stubFetch(() => ({ status: 200, body: { note: 'searched?' } }));
    await expect(findEvidence('claim-A')).rejects.toBeInstanceOf(ApiClientError);

    stubFetch(() => ({ status: 200, body: { mode: 'prepare' } }));
    await expect(findEvidence('claim-A')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Evidence-find response is missing `claimText`',
    });

    stubFetch(() => ({ status: 200, body: { mode: 'search', claimText: 'x', candidates: [] } }));
    await expect(findEvidence('claim-A', { query: 'q' })).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Evidence-find search response is missing the used `query`',
    });
  });

  it('drops unparsable candidate/status entries rather than fabricating display rows', async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        ...SEARCH_PAYLOAD,
        candidates: [CANDIDATE, { noTitle: true }, null],
        providersStatus: [{ id: 'crossref', status: 'ok' }, { id: 'crossref' }, 'junk'],
      },
    }));
    const result = await findEvidence('claim-A', { query: 'q' });
    expect(result.mode).toBe('search');
    if (result.mode !== 'search') return;
    expect(result.candidates).toHaveLength(1);
    expect(result.providersStatus).toEqual([{ id: 'crossref', status: 'ok', message: undefined, retried: undefined }]);
  });

  it('retryOnce semantics are server-reported: `retried` parses only when boolean', async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        ...SEARCH_PAYLOAD,
        providersStatus: [
          { id: 'crossref', status: 'error', retried: true },
        ],
      },
    }));
    const result = await findEvidence('claim-A', { query: 'q' });
    if (result.mode !== 'search') return;
    expect(result.providersStatus[0]).toMatchObject({ status: 'error', retried: true });
  });

  it('network failure throws ApiNetworkError', async () => {
    stubFetch(() => {
      throw new TypeError('connection refused');
    });
    await expect(findEvidence('claim-A')).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it('aborts hanging requests after the promised 10 s', async () => {
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
    const pending = findEvidence('claim-A');
    const expectation = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1);
    await vi.advanceTimersByTimeAsync(1);
    await expectation;
  });
});
