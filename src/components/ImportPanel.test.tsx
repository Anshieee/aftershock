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

describe('ImportPanel — extraction disclosure (Wave 3, unverified candidates)', () => {
  /**
   * Honesty rails under test (per the Wave 3 spec + AGENTS.md):
   * detected DOIs are UNVERIFIED pattern-match output — the UI may never
   * present them as verified references, as support for anything, or as
   * stored content; the pre-existing contentStored:false disclosure stays
   * primary; and an absent/malformed extraction member (older deploys)
   * renders nothing at all.
   */

  const CAVEAT =
    'Detected by pattern matching on a bounded excerpt; unverified — presence in the file proves nothing about claim support or reference validity.';

  const IMPORT_WITH_EXTRACTION = {
    documentId: 'doc-ext-1',
    versionId: 'ver-ext-1',
    contentStored: false,
    disclosure: 'The document was registered; its text content is not stored in this build.',
    extraction: {
      attempted: true,
      format: 'txt',
      byteSelection: { scannedBytes: 128, maxBytes: 524288, truncated: false },
      dois: [
        {
          doi: '10.9999/demo-alpha',
          occurrences: 2,
          snippet: 'prior work [1] with doi 10.9999/demo-alpha recorded in the references',
        },
        { doi: '10.9999/demo-beta', occurrences: 1 },
      ],
      caveat: CAVEAT,
    },
  };

  function pickTxt() {
    pickFile(new File(['synthetic fixture text'], 'mini-fixtures.txt', { type: 'text/plain' }));
  }

  it('renders unverified candidate DOIs with the standing caveat verbatim and honest counts', async () => {
    stubFetchByRoute((url) =>
      url.startsWith('/.netlify/functions/import-document')
        ? { status: 200, body: IMPORT_WITH_EXTRACTION }
        : undefined,
    );
    render(<ImportPanel />);
    pickTxt();

    const section = await waitFor(() => screen.getByTestId('import-extraction'));
    expect(
      screen.getByTestId('import-extraction-heading').textContent,
    ).toContain('Detected in your file — unverified candidate references (2)');
    expect(screen.getByTestId('import-extraction-caveat').textContent).toBe(CAVEAT);

    const dois = screen.getAllByTestId('import-extraction-doi');
    expect(dois).toHaveLength(2);
    expect(dois[0]?.textContent).toContain('10.9999/demo-alpha');
    expect(dois[0]?.textContent).toContain('2 occurrences in the scanned excerpt');
    const alphaSnippet: string = IMPORT_WITH_EXTRACTION.extraction.dois[0]?.snippet ?? '';
    expect(dois[0]?.textContent).toContain(alphaSnippet);
    expect(dois[1]?.textContent).toContain('10.9999/demo-beta');
    expect(dois[1]?.textContent).toContain('1 occurrence in the scanned excerpt');

    // The doi.org links are plain resolver links over the detected string —
    // they must never claim more than that (no "verify"/"confirmed" copy).
    const link = screen
      .getAllByTestId('import-extraction-doi')
      .map((li) => li.querySelector('a'))
      .find((a) => (a?.href ?? '').includes('demo-alpha'));
    expect(
      link?.getAttribute('href'),
    ).toBe('https://doi.org/10.9999/demo-alpha');    expect(link?.getAttribute('rel')).toBe('noreferrer');
    expect(section.textContent).not.toMatch(/\bverified\b/i);

    // Primary disclosure stays intact above the extraction section.
    expect(screen.getByTestId('import-result').textContent).toContain('contentStored: false');
  });

  it('falls back to the fixed UI caveat when the server omits `caveat`', async () => {
    const body = {
      ...IMPORT_WITH_EXTRACTION,
      disclosure: 'Registered metadata-only.',
      extraction: {
        attempted: true,
        format: 'txt',
        dois: [{ doi: '10.9999/demo-solo', occurrences: 1 }],
      },
    };
    stubFetchByRoute((url) =>
      url.startsWith('/.netlify/functions/import-document') ? { status: 200, body } : undefined,
    );
    render(<ImportPanel />);
    pickFile(new File(['fixtures'], 'fixed-caveat.txt', { type: 'text/plain' }));

    await waitFor(() => expect(screen.getByTestId('import-extraction')).toBeTruthy());
    expect(screen.getByTestId('import-extraction-caveat').textContent).toBe(CAVEAT);
    expect(screen.getByTestId('import-extraction-heading').textContent).toContain('(1)');
  });

  it('shows the honest muted reason line for attempted:false (pdf/docx) — not an error', async () => {
    stubFetchByRoute((url) =>
      url.startsWith('/.netlify/functions/import-document')
        ? {
            status: 200,
            body: {
              ...IMPORT_OK,
              disclosure: 'Registered metadata-only.',
              extraction: {
                attempted: false,
                format: 'pdf',
                reason: 'Text extraction for PDF is not implemented in the demo tier.',
              },
            },
          }
        : undefined,
    );
    render(<ImportPanel />);
    pickFile(makePdf());

    await waitFor(() => expect(screen.getByTestId('import-extraction-skipped')).toBeTruthy());
    expect(screen.getByTestId('import-extraction-skipped').textContent).toBe(
      'Text extraction for PDF is not implemented in the demo tier.',
    );
    // No candidate section, and nothing that claims references were found.
    expect(screen.queryByTestId('import-extraction')).toBeNull();
    expect(screen.queryByTestId('import-extraction-doi')).toBeNull();
    const result = screen.getByTestId('import-result');
    expect(result.textContent).toContain('contentStored: false');
  });

  it('renders nothing when the server sends no extraction member (older-deploy tolerance)', async () => {
    stubFetchByRoute((url) =>
      url.startsWith('/.netlify/functions/import-document')
        ? { status: 200, body: IMPORT_OK }
        : undefined,
    );
    render(<ImportPanel />);
    pickFile(makePdf());

    await waitFor(() => expect(screen.getByTestId('import-result')).toBeTruthy());
    expect(screen.queryByTestId('import-extraction')).toBeNull();
    expect(screen.queryByTestId('import-extraction-skipped')).toBeNull();
    expect(screen.queryByTestId('import-extraction-doi')).toBeNull();
  });

  it('renders no section when attempted=true but the detected list is empty', async () => {
    stubFetchByRoute((url) =>
      url.startsWith('/.netlify/functions/import-document')
        ? {
            status: 200,
            body: {
              ...IMPORT_OK,
              disclosure: 'Registered metadata-only.',
              extraction: { attempted: true, format: 'txt', dois: [] },
            },
          }
        : undefined,
    );
    render(<ImportPanel />);
    pickTxt();

    await waitFor(() => expect(screen.getByTestId('import-result')).toBeTruthy());
    expect(screen.queryByTestId('import-extraction')).toBeNull();
    expect(screen.queryByTestId('import-extraction-doi')).toBeNull();
  });

  it('drops a malformed extraction member instead of guessing a state', async () => {
    const malformedBodies = [
      // attempted is not a boolean → the whole member is unusable.
      { extraction: { attempted: 'sure', dois: [{ doi: '10.9999/nope' }] } },
      // extraction is not an object at all.
      { extraction: 'attempted' },
    ];
    for (const body of malformedBodies) {
      stubFetchByRoute((url) =>
        url.startsWith('/.netlify/functions/import-document')
          ? { status: 200, body: { ...IMPORT_OK, disclosure: 'Registered metadata-only.', ...body } }
          : undefined,
      );
      const { unmount } = render(<ImportPanel />);
      pickFile(makePdf());
      await waitFor(() => expect(screen.getByTestId('import-result')).toBeTruthy());
      expect(screen.queryByTestId('import-extraction')).toBeNull();
      expect(screen.queryByTestId('import-extraction-skipped')).toBeNull();
      unmount();
    }
  });

  it('discloses the bounded truncation when the scanned excerpt was cut off', async () => {
    const body = {
      ...IMPORT_OK,
      disclosure: 'Registered metadata-only.',
      extraction: {
        attempted: true,
        format: 'txt',
        byteSelection: { scannedBytes: 524288, maxBytes: 524288, truncated: true },
        dois: [{ doi: '10.9999/demo-truncated', occurrences: 4 }],
      },
    };
    stubFetchByRoute((url) =>
      url.startsWith('/.netlify/functions/import-document') ? { status: 200, body } : undefined,
    );
    render(<ImportPanel />);
    pickFile(new File(['fixtures'], 'truncated.txt', { type: 'text/plain' }));

    await waitFor(() => expect(screen.getByTestId('import-extraction')).toBeTruthy());
    const note = screen.getByTestId('import-extraction-truncated');
    expect(note.textContent).toContain('first 524,288 bytes');
    expect(note.textContent).toContain('were not looked for');
  });
});
