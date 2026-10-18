import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportPanel from './ImportPanel';
import { stubFetchByRoute } from '../test/mockFetch';
import { MAX_IMPORT_BYTES } from '../lib/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function makePdf(name = 'field-notes.pdf', size = 12345): File {
  const file = new File(['%PDF-1.4 minimal'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function pickFile(file: File) {
  const input = screen.getByTestId('import-input');
  fireEvent.change(input, { target: { files: [file] } });
}

const IMPORT_OK = {
  documentId: 'doc-new-1',
  versionId: 'ver-new-1',
  contentStored: false,
  disclosure: 'The document was registered; its text content is not stored in this demo build.',
};

const IMPORT_DEMO_OK = {
  documentId: 'doc-demo-manuscript',
  versionId: 'ver-demo-manuscript-v1',
  contentStored: false,
  disclosure: 'Demo manuscript recognized.',
};

describe('ImportPanel — client-side guards (before any upload)', () => {
  it('rejects an unsupported format with clear copy and no fetch call', () => {
    const calls = stubFetchByRoute(() => undefined);
    render(<ImportPanel />);
    pickFile(new File(['notes'], 'notes.md', { type: 'text/markdown' }));

    const state = screen.getByTestId('selection-state');
    expect(state.textContent).toContain('Only PDF, DOCX and TXT files are accepted');
    expect(state.textContent).toContain('Nothing was uploaded');
    expect(state.textContent).toContain('nothing left the browser');
    expect(calls).toHaveLength(0);
  });

  it('rejects a file over the 10 MB limit with clear copy and no fetch call', () => {
    const calls = stubFetchByRoute(() => undefined);
    render(<ImportPanel />);
    pickFile(makePdf('huge.pdf', MAX_IMPORT_BYTES + 1));

    const state = screen.getByTestId('selection-state');
    expect(state.textContent).toContain('larger than the 10 MB limit');
    expect(state.textContent).toContain('Nothing was uploaded');
    expect(calls).toHaveLength(0);
  });

  it('does not show any success or registering state for guarded files', () => {
    stubFetchByRoute(() => undefined);
    render(<ImportPanel />);
    pickFile(makePdf('notes.docx.exe', 500));

    expect(screen.queryByTestId('import-result')).toBeNull();
    expect(screen.queryByTestId('import-registering')).toBeNull();
  });
});

describe('ImportPanel — real import flow', () => {
  it('registers a valid file via POST /import-document and shows the disclosure verbatim', async () => {
    const calls = stubFetchByRoute((url) =>
      url.startsWith('/.netlify/functions/import-document')
        ? { status: 200, body: IMPORT_OK }
        : undefined,
    );
    render(<ImportPanel />);
    pickFile(makePdf());

    const result = await waitFor(() => screen.getByTestId('import-result'));
    expect(result.textContent).toContain('field-notes.pdf');
    expect(result.textContent).toContain(IMPORT_OK.disclosure);
    expect(result.textContent).toContain('contentStored: false');

    // Analyze stays honest: disabled for a contentless, non-demo document.
    expect((screen.getByTestId('import-analyze-button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('analyze-disabled-copy').textContent).toContain(
      'enabled only for the guided demo manuscript',
    );

    const call = calls.find((entry) => entry.url.startsWith('/.netlify/functions/import-document'));
    expect(call?.init?.method).toBe('POST');
    expect(call?.url).toContain('fileName=field-notes.pdf');
    expect(call?.url).toContain('format=pdf');

    // No fake progress UI is rendered at any point.
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows the truthful registering state while the request is in flight, then the result', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((res) => {
            resolve = res;
          }),
      ),
    );
    render(<ImportPanel />);
    pickFile(makePdf());

    const inFlight = screen.getByTestId('import-registering');
    expect(inFlight.textContent).toContain('Registering document');
    expect(inFlight.textContent).toContain('No progress bar is shown');
    expect(screen.queryByRole('progressbar')).toBeNull();

    resolve(
      new Response(JSON.stringify(IMPORT_OK), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('import-result').textContent).toContain('not stored'),
    );
  });

  it('moves keyboard focus to the truthful result region when the import completes', async () => {
    stubFetchByRoute((url) =>
      url.startsWith('/.netlify/functions/import-document')
        ? { status: 200, body: IMPORT_OK }
        : undefined,
    );
    render(<ImportPanel />);
    pickFile(makePdf());

    await waitFor(() => expect(screen.getByTestId('import-result')).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByTestId('selection-state'));
  });

  it('shows an honest unavailable state when the import endpoint is missing — no fake registration', async () => {
    stubFetchByRoute(() => ({ status: 404 }));
    render(<ImportPanel />);
    pickFile(makePdf());

    await waitFor(() =>
      expect(screen.getByTestId('selection-state').textContent).toMatch(
        /not wired on this deployment yet/i,
      ),
    );
    expect(screen.getByTestId('selection-state').textContent).toContain('nothing was uploaded');
    expect(screen.queryByTestId('import-result')).toBeNull();
  });

  it('maps HTTP 413 to the typed honest too-large message', async () => {
    stubFetchByRoute((url) =>
      url.startsWith('/.netlify/functions/import-document')
        ? { status: 413, body: { error: 'payload-too-large' } }
        : undefined,
    );
    render(<ImportPanel />);
    pickFile(makePdf());

    await waitFor(() =>
      expect(screen.getByTestId('selection-state').textContent).toMatch(/HTTP 413/),
    );
    expect(screen.getByTestId('selection-state').textContent).toContain('nothing was registered');
  });
});

describe('ImportPanel — analyze flow', () => {
  it('enables Analyze for the demo-manuscript import and shows the real runId', async () => {
    const calls = stubFetchByRoute((url) => {
      if (url.startsWith('/.netlify/functions/import-document')) {
        return { status: 200, body: IMPORT_DEMO_OK };
      }
      if (url === '/.netlify/functions/analyze') {
        return { status: 200, body: { runId: 'run-9' } };
      }
      return undefined;
    });
    render(<ImportPanel />);
    pickFile(makePdf());

    fireEvent.click(
      await waitFor(() => {
        const button = screen.getByTestId('import-analyze-button');
        expect((button as HTMLButtonElement).disabled).toBe(false);
        return button;
      }),
    );

    const runId = await waitFor(() => screen.getByTestId('analysis-runid'));
    expect(runId.textContent).toBe('run-9');

    const analyzeCall = calls.find((entry) => entry.url === '/.netlify/functions/analyze');
    expect(analyzeCall?.init?.method).toBe('POST');
    expect(analyzeCall?.init?.body).toBe(
      JSON.stringify({ documentVersionId: 'ver-demo-manuscript-v1' }),
    );
  });

  it('maps the 422 content-not-stored refusal to the distinct honest outcome with disclosure verbatim', async () => {
    stubFetchByRoute((url) => {
      if (url.startsWith('/.netlify/functions/import-document')) {
        return { status: 200, body: IMPORT_DEMO_OK };
      }
      if (url === '/.netlify/functions/analyze') {
        return {
          status: 422,
          body: {
            error: 'content-not-stored',
            disclosure: 'No stored text is available for this version in this build.',
          },
        };
      }
      return undefined;
    });
    render(<ImportPanel />);
    pickFile(makePdf());
    fireEvent.click(
      await waitFor(() => {
        const button = screen.getByTestId('import-analyze-button');
        expect((button as HTMLButtonElement).disabled).toBe(false);
        return button;
      }),
    );

    const state = await waitFor(() => screen.getByTestId('analysis-content-not-stored'));
    expect(state.textContent).toContain('Analysis did not start');
    expect(state.textContent).toContain('content-not-stored');
    expect(state.textContent).toContain(
      'No stored text is available for this version in this build.',
    );
    // Not a fake start: no runId is shown.
    expect(screen.queryByTestId('analysis-runid')).toBeNull();
  });

  it('maps an analysis API failure to an honest message — no fake runId', async () => {
    stubFetchByRoute((url) => {
      if (url.startsWith('/.netlify/functions/import-document')) {
        return { status: 200, body: IMPORT_DEMO_OK };
      }
      if (url === '/.netlify/functions/analyze') {
        return { status: 503, body: { error: 'down' } };
      }
      return undefined;
    });
    render(<ImportPanel />);
    pickFile(makePdf());
    fireEvent.click(
      await waitFor(() => {
        const button = screen.getByTestId('import-analyze-button');
        expect((button as HTMLButtonElement).disabled).toBe(false);
        return button;
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('analysis-failed').textContent).toMatch(/unavailable/i),
    );
    expect(screen.queryByTestId('analysis-runid')).toBeNull();
  });

  it('shows an honest not-wired message when analysis answers 404', async () => {
    stubFetchByRoute((url) => {
      if (url.startsWith('/.netlify/functions/import-document')) {
        return { status: 200, body: IMPORT_DEMO_OK };
      }
      return { status: 404 };
    });
    render(<ImportPanel />);
    pickFile(makePdf());
    fireEvent.click(
      await waitFor(() => {
        const button = screen.getByTestId('import-analyze-button');
        expect((button as HTMLButtonElement).disabled).toBe(false);
        return button;
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('analysis-failed').textContent).toMatch(
        /not wired on this deployment yet/i,
      ),
    );
  });
});
