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
  return stubFetchByRoute((url) => (url.endsWith('/documents') ? { status, body } : undefined));
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
