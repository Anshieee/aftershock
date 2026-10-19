import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LibraryPage from './LibraryPage';
import { stubFetchByRoute } from '../test/mockFetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

const demoDocument = {
  id: 'doc-demo-manuscript',
  title: 'Data-Integrity Consequences in Respiratory Infection Care (Guided Demo Manuscript)',
  fileName: 'guided-demo-manuscript.pdf',
  format: 'pdf',
  versionId: 'ver-demo-manuscript-v1',
  isSynthetic: true,
  syntheticLabel: 'FICTIONAL / GUIDED DEMO',
};

function stubDocuments(body: unknown, status = 200) {
  return stubFetchByRoute((url) => {
    if (url.endsWith('/documents-imported')) return { status: 200, body: { documents: [] } };
    if (url.endsWith('/documents')) return { status, body };
    return undefined;
  });
}

describe('LibraryPage — real document list', () => {
  it('lists real documents with the demo-manuscript Analyze action enabled', async () => {
    stubDocuments({ documents: [demoDocument] });
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    const list = await waitFor(() => screen.getByTestId('library-list'));
    expect(list.textContent).toContain('Data-Integrity Consequences in Respiratory Infection Care');
    expect(list.textContent).toContain('guided-demo-manuscript.pdf');
    // Synthetic content is labeled everywhere.
    expect(list.textContent).toContain('FICTIONAL / GUIDED DEMO');
    expect((screen.getByTestId('analyze-doc-demo-manuscript') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows uploaded-but-contentless documents with the disclosure verbatim — and no analyze affordance', async () => {
    stubDocuments({
      documents: [
        {
          id: 'doc-user-upload',
          fileName: 'field-notes.pdf',
          format: 'pdf',
          versionId: 'ver-user-upload',
          contentStored: false,
          disclosure: 'The text content of this document is not stored in this demo build.',
        },
      ],
    });
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    const row = await waitFor(() => screen.getByTestId('library-doc-doc-user-upload'));
    expect(row.textContent).toContain('The text content of this document is not stored in this demo build.');
    expect(row.textContent).toContain('contentStored: false');
    expect(screen.queryByTestId(/^analyze-/)).toBeNull();
  });

  it('keeps the honest empty state for an empty list', async () => {
    stubDocuments({ documents: [] });
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    await waitFor(() => expect(screen.getByTestId('library-empty')).toBeTruthy());
    expect(screen.getByText(/No documents exist yet/)).toBeTruthy();
    expect(screen.queryByTestId('library-list')).toBeNull();
  });

  it('never shows the empty state when the endpoint is unavailable — unavailable is not empty', async () => {
    stubDocuments({ error: 'not found' }, 404);
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    await waitFor(() => expect(screen.getByTestId('library-unavailable')).toBeTruthy());
    expect(screen.getByTestId('library-unavailable').textContent).toContain('Nothing is simulated');
    expect(screen.queryByText(/No documents exist yet/)).toBeNull();
    expect(screen.queryByTestId('library-list')).toBeNull();
  });

  it('shows an honest failure state when the list read fails — no placeholder rows', async () => {
    stubDocuments({ error: 'graph down' }, 500);
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    await waitFor(() =>
      expect(screen.getByTestId('library-failed').textContent).toMatch(/HTTP 500/),
    );
    expect(screen.queryByTestId('library-list')).toBeNull();
    expect(screen.queryByTestId('library-empty')).toBeNull();
  });
});

describe('LibraryPage — imported documents section', () => {
  const importedDocument = {
    id: 'doc-user-1',
    fileName: 'field-notes.pdf',
    format: 'pdf',
    sizeBytes: 12345,
    importedAt: '2026-10-18T09:00:00.000Z',
    contentStored: false,
    disclosure: 'The text content of this document is not stored in this demo build.',
    isSynthetic: false,
  };

  function stubBoth(seededBody: unknown, importedBody: unknown, status = 200) {
    return stubFetchByRoute((url) => {
      if (url.endsWith('/documents')) return { status, body: seededBody };
      if (url.endsWith('/documents-imported')) return { status, body: importedBody };
      return undefined;
    });
  }

  it('lists imported user documents with file name, format, size and content-not-stored disclosure', async () => {
    stubBoth({ documents: [demoDocument] }, { documents: [importedDocument] });
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    const importedList = await waitFor(() => screen.getByTestId('library-imported-list'));
    expect(importedList.textContent).toContain('field-notes.pdf');
    expect(importedList.textContent).toContain('.pdf');
    expect(importedList.textContent).toContain('12345 bytes');
    // Real user content, not a demo fixture — isSynthetic: false.
    expect(importedList.textContent).toContain('Real user content — not a demo fixture');
    // Honest disclosure: contentStored: false, no analysis.
    expect(importedList.textContent).toContain('Analysis not available — content not stored (contentStored: false).');
    expect(importedList.textContent).toContain(
      'The text content of this document is not stored in this demo build.',
    );
    // Analyze button disabled with honest explanation — no fabricated analysis.
    const analyze = screen.getByTestId('imported-analyze-doc-user-1');
    expect((analyze as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('imported-analyze-hint-doc-user-1').textContent).toContain(
      'requires stored text content',
    );
  });

  it('discloses honest bounds when the imported cohort exceeds the server cap', async () => {
    // Server-side bound: newest 3 shown of 25 total, `truncated:true`. The UI
    // must reveal the cut instead of presenting the page as complete.
    const many = Array.from({ length: 3 }, (_, i) => ({
      ...importedDocument,
      id: `user-${i + 2}`,
      fileName: `bounded-notes-${i + 1}.txt`,
    }));
    stubBoth(
      { documents: [demoDocument] },
      { documents: many, importedTotal: 25, truncated: true },
    );
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    const importedList = await waitFor(() => screen.getByTestId('library-imported-list'));
    expect(importedList.textContent).toContain('bounded-notes-1.txt');
    const note = screen.getByTestId('library-imported-truncated');
    expect(note.textContent).toContain('Showing the newest 3 of 25 registered imports');
    expect(note.textContent).toContain('older registrations exist but are not shown');
  });

  it('renders no truncation note when the cohort fits the cap (bounded envelope absent-safe)', async () => {
    stubBoth({ documents: [demoDocument] }, { documents: [importedDocument] });
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByTestId('library-imported-list'));
    expect(screen.queryByTestId('library-imported-truncated')).toBeNull();
  });

  it('shows an honest empty state for the imported section when there are no imports', async () => {
    stubBoth({ documents: [demoDocument] }, { documents: [] });
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    await waitFor(() => expect(screen.getByTestId('library-list')).toBeTruthy());
    expect(screen.queryByTestId('library-imported-list')).toBeNull();
    expect(screen.queryByTestId('library-imported-empty')).toBeNull();
  });

  it('shows the overall empty state when both seeded and imported lists are empty', async () => {
    stubBoth({ documents: [] }, { documents: [] });
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    await waitFor(() => expect(screen.getByTestId('library-empty')).toBeTruthy());
    expect(screen.queryByTestId('library-list')).toBeNull();
    expect(screen.queryByTestId('library-imported-list')).toBeNull();
  });

  it('shows an honest failure state when the imported read fails', async () => {
    stubBoth({ documents: [demoDocument] }, { error: 'graph down' }, 500);
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    await waitFor(() =>
      expect(screen.getByTestId('library-imported-failed').textContent).toMatch(/HTTP 500/),
    );
    expect(screen.queryByTestId('library-imported-list')).toBeNull();
  });

  it('shows an honest unavailable state when the imported endpoint is not wired', async () => {
    stubBoth({ documents: [demoDocument] }, { error: 'not found' }, 404);
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    await waitFor(() =>
      expect(screen.getByTestId('library-imported-unavailable')).toBeTruthy(),
    );
    expect(screen.queryByTestId('library-imported-list')).toBeNull();
  });

  it('shows loading while both fetches are in flight', async () => {
    // Hang both fetches so the page stays in the loading phase.
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: unknown, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason));
        });
      }),
    );
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    expect(screen.getByTestId('library-loading')).toBeTruthy();
    expect(screen.queryByTestId('library-list')).toBeNull();
    expect(screen.queryByTestId('library-imported-list')).toBeNull();
  });
});

describe('LibraryPage — analyze the demo manuscript', () => {
  it('starts a real analysis run and shows the returned runId', async () => {
    const calls = stubFetchByRoute((url) => {
      if (url.endsWith('/documents')) return { status: 200, body: { documents: [demoDocument] } };
      if (url === '/.netlify/functions/analyze') return { status: 200, body: { runId: 'run-42' } };
      return undefined;
    });
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    fireEvent.click(
      await waitFor(() => {
        const button = screen.getByTestId('analyze-doc-demo-manuscript');
        expect((button as HTMLButtonElement).disabled).toBe(false);
        return button;
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('doc-analysis-doc-demo-manuscript').textContent).toContain(
        'run-42',
      ),
    );
    const analyzeCall = calls.find((entry) => entry.url === '/.netlify/functions/analyze');
    expect(analyzeCall?.init?.method).toBe('POST');
    expect(analyzeCall?.init?.body).toBe(
      JSON.stringify({ documentVersionId: 'ver-demo-manuscript-v1' }),
    );
  });

  it('shows the content-not-stored disclosure verbatim when the analysis refuses', async () => {
    stubFetchByRoute((url) => {
      if (url.endsWith('/documents')) return { status: 200, body: { documents: [demoDocument] } };
      if (url === '/.netlify/functions/analyze') {
        return {
          status: 422,
          body: {
            error: 'content-not-stored',
            disclosure: 'Version content is missing on the server.',
          },
        };
      }
      return undefined;
    });
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    fireEvent.click(await waitFor(() => screen.getByTestId('analyze-doc-demo-manuscript')));
    await waitFor(() =>
      expect(screen.getByTestId('doc-analysis-doc-demo-manuscript').textContent).toContain(
        'Version content is missing on the server.',
      ),
    );
  });

  it('shows an honest failure when the analysis API is unavailable', async () => {
    stubFetchByRoute((url) => {
      if (url.endsWith('/documents')) return { status: 200, body: { documents: [demoDocument] } };
      if (url === '/.netlify/functions/analyze') return { status: 503 };
      return undefined;
    });
    render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

    fireEvent.click(await waitFor(() => screen.getByTestId('analyze-doc-demo-manuscript')));
    await waitFor(() =>
      expect(screen.getByTestId('doc-analysis-doc-demo-manuscript').textContent).toMatch(
        /unavailable/i,
      ),
    );
  });
});
