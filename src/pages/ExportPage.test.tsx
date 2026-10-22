import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExportPage from './ExportPage';

type CallRecord = { url: string; init: RequestInit | undefined };
type RouteResult = { status: number; body: unknown; contentType?: string } | undefined;

const PDF_BLOB = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
const DOCX_BLOB = new Blob([new Uint8Array([4, 5])], {
  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

/**
 * Stub that answers each route with a possibly-binary body, recording calls.
 * Unmatched URLs answer 404 like a missing Netlify function. Handlers may be
 * async to defer a response (used to assert the honest loading state).
 */
function stubBinaryByRoute(
  handler: (url: string, init: RequestInit | undefined) => RouteResult | Promise<RouteResult>,
): CallRecord[] {
  const calls: CallRecord[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String((input as Request).url);
      calls.push({ url, init });
      const resolved = await Promise.resolve(handler(url, init));
      if (!resolved) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      const body = resolved.body instanceof Blob ? resolved.body : JSON.stringify(resolved.body);
      return new Response(body, {
        status: resolved.status,
        headers: { 'Content-Type': resolved.contentType ?? 'application/json' },
      });
    }),
  );
  return calls;
}

/**
 * Returns a `release` function that resolves a deferred response for
 * `routeMatch`, letting tests assert the loading state before completion.
 */
function stubDeferredRoute(routeMatch: string, body: Blob, contentType: string): { calls: CallRecord[]; release: () => void } {
  let release!: () => void;
  const releasePromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls = stubBinaryByRoute(async (url) => {
    if (url.includes(routeMatch)) {
      await releasePromise;
      return { status: 200, body, contentType };
    }
    return { status: 200, body: { nodes: [], edges: [] }, contentType: 'application/json' };
  });
  return { calls, release };
}

let objectURLSpy: any;
let clickSpy: any;
let createdAnchors: HTMLAnchorElement[] = [];

function setupDownloadSpies() {
  createdAnchors.length = 0;
  objectURLSpy = vi.fn(() => 'blob:mock-url');
  Object.defineProperty(URL, 'createObjectURL', {
    value: objectURLSpy,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreateElement(tag);
    if (tag === 'a') createdAnchors.push(el as HTMLAnchorElement);
    return el;
  });
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ExportPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setupDownloadSpies();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExportPage', () => {
  it('renders export type options, demo case default, and the synthetic disclosure', async () => {
    stubBinaryByRoute(() => ({ status: 200, body: { nodes: [], edges: [] }, contentType: 'application/json' }));
    renderPage();

    expect(screen.getByRole('heading', { name: /^Export$/ })).toBeTruthy();
    expect((screen.getByTestId('export-type-report') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('export-type-revision-pack') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('export-type-annotated-manuscript') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('export-case-id') as HTMLSelectElement).value).toBe('doc-demo-manuscript');
    expect(screen.getByTestId('export-generate')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /FICTIONAL \/ GUIDED DEMO/ })).toBeTruthy();
    expect(screen.getByText(/implies no scientific validation/)).toBeTruthy();

    // The Generate button is enabled (it makes an honest API call) and
    // produces no download until the endpoint answers.
    expect((screen.getByTestId('export-generate') as HTMLButtonElement).disabled).toBe(false);
    expect(objectURLSpy).not.toHaveBeenCalled();
    expect(createdAnchors).toHaveLength(0);
  });

  it('generates a PDF download through POST /export-report with an honest loading state', async () => {
    const { calls, release } = stubDeferredRoute('export-report', PDF_BLOB, 'application/pdf');
    renderPage();

    expect((screen.getByTestId('export-case-id') as HTMLSelectElement).value).toBe('doc-demo-manuscript');
    const generate = screen.getByTestId('export-generate') as HTMLButtonElement;
    expect(generate.disabled).toBe(false);
    expect(generate.textContent).toContain('Generate Evidence Impact Report');

    fireEvent.click(generate);
    expect((screen.getByTestId('export-generate') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('export-loading')).toBeTruthy();

    release();
    await waitFor(() => expect(screen.getByTestId('export-done')).toBeTruthy());

    // Realm-independent Blob check: `expect.any(Blob)` is instanceof-based and
    // rejects the runtime's Blob class under Node 20 + jsdom (Response.blob()
    // returns a node:buffer Blob) — same realm issue as the client-side check.
    expect(objectURLSpy).toHaveBeenCalledTimes(1);
    expect(Object.prototype.toString.call(objectURLSpy.mock.calls[0]![0])).toBe('[object Blob]');
    expect(createdAnchors).toHaveLength(1);
    const anchor = createdAnchors[0]!;
    expect(anchor.download).toBe('aftershock-report-doc-demo-manuscript.pdf');
    expect(anchor.getAttribute('href')).toBe('blob:mock-url');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('export-done').textContent).toContain('aftershock-report-doc-demo-manuscript.pdf');

    // Correct payload sent to the real endpoint.
    const exportCall = calls.find((c) => c.url.includes('export-report'));
    expect(exportCall?.url).toBe('/.netlify/functions/export-report?caseId=doc-demo-manuscript&format=pdf');
    expect(exportCall?.init?.method).toBe('POST');
    expect((exportCall?.init?.headers as Record<string, string>)['Accept']).toBe('application/pdf');
  });

  it('generates a DOCX Revision Pack through POST /export-revision-pack', async () => {
    const { calls, release } = stubDeferredRoute(
      'export-revision-pack',
      DOCX_BLOB,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    renderPage();

    fireEvent.click(screen.getByTestId('export-type-revision-pack') as HTMLInputElement);
    expect((screen.getByTestId('export-generate') as HTMLButtonElement).textContent).toContain(
      'Generate Revision Pack',
    );

    fireEvent.click(screen.getByTestId('export-generate'));
    release();
    await waitFor(() => expect(screen.getByTestId('export-done')).toBeTruthy());

    const anchor = createdAnchors[0]!;
    expect(anchor.download).toBe('aftershock-revision-pack-doc-demo-manuscript.docx');

    const exportCall = calls.find((c) => c.url.includes('export-revision-pack'));
    expect(exportCall?.url).toBe('/.netlify/functions/export-revision-pack?caseId=doc-demo-manuscript');
    expect(exportCall?.init?.method).toBe('POST');
  });

  it('generates an Annotated Manuscript through POST /export-annotated-manuscript', async () => {
    const { calls, release } = stubDeferredRoute('export-annotated-manuscript', PDF_BLOB, 'application/pdf');
    renderPage();

    fireEvent.click(screen.getByTestId('export-type-annotated-manuscript') as HTMLInputElement);
    fireEvent.click(screen.getByTestId('export-generate'));
    release();
    await waitFor(() => expect(screen.getByTestId('export-done')).toBeTruthy());

    const exportCall = calls.find((c) => c.url.includes('export-annotated-manuscript'));
    expect(exportCall?.url).toBe('/.netlify/functions/export-annotated-manuscript?caseId=doc-demo-manuscript');
    expect(exportCall?.init?.method).toBe('POST');
  });

  it('shows the exact failure with retry and fabricates no file', async () => {
    const calls = stubBinaryByRoute((url) => {
      if (url.includes('export-report')) return { status: 500, body: '', contentType: 'application/json' };
      return { status: 200, body: { nodes: [], edges: [] }, contentType: 'application/json' };
    });
    renderPage();

    fireEvent.click(screen.getByTestId('export-generate'));
    await waitFor(() =>
      expect(screen.getByTestId('export-error-detail').textContent).toMatch(/HTTP 500/),
    );
    expect(objectURLSpy).not.toHaveBeenCalled();
    expect(createdAnchors).toHaveLength(0);

    // Retry clears the error; generating again makes a second (still failing) call.
    fireEvent.click(screen.getByTestId('export-retry'));
    await waitFor(() => expect(screen.queryByTestId('export-error')).toBeNull());
    expect((screen.getByTestId('export-generate') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('export-generate'));
    await waitFor(() =>
      expect(screen.getByTestId('export-error-detail').textContent).toMatch(/HTTP 500/),
    );
    const exportCalls = calls.filter((c) => c.url.includes('export-report'));
    expect(exportCalls).toHaveLength(2);
  });

  it('shows honest “not available yet” when the endpoint is missing and triggers no download', async () => {
    stubBinaryByRoute((url) => {
      if (url.includes('export-report')) return { status: 404, body: '', contentType: 'application/json' };
      return { status: 200, body: { nodes: [], edges: [] }, contentType: 'application/json' };
    });
    renderPage();

    fireEvent.click(screen.getByTestId('export-generate'));
    await waitFor(() => expect(screen.getByTestId('export-error')).toBeTruthy());
    expect(screen.getByTestId('export-error-detail').textContent).toMatch(/not available yet/i);
    expect(objectURLSpy).not.toHaveBeenCalled();
    expect(createdAnchors).toHaveLength(0);
  });

  it('shows honest review coverage including unresolved counts from the graph', async () => {
    stubBinaryByRoute((url) => {
      if (url.includes('graph-edges')) {
        return {
          status: 200,
          body: {
            nodes: [
              { id: 'ref-lee-2020', kind: 'ReferenceOccurrence', resolutionState: 'unresolved' },
              { id: 'claim-A', kind: 'Claim', status: 'unreviewed' },
            ],
            edges: [],
          },
          contentType: 'application/json',
        };
      }
      return undefined;
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/2 records returned/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/1 unresolved reference occurrence/)).toBeTruthy());
  });
});
