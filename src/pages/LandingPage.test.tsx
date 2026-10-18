import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LandingPage from './LandingPage';
import DemoResultsPage from './DemoResultsPage';
import { stubFetchByRoute } from '../test/mockFetch';
import { buildDemoOverviewRecord } from '../test/graphFixtures';
import { apiRoutes } from '../lib/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWithRoutes(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/results" element={<DemoResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LandingPage (import-first)', () => {
  it('renders the research-workspace hero with the wired guided action', () => {
    renderWithRoutes();

    // New hero: the research question in display serif (the Aftershock.
    // wordmark stays in the header, not the hero).
    expect(
      screen.getByRole('heading', { name: 'What would you like to investigate?' }),
    ).toBeTruthy();
    expect(screen.getByTestId('hero-guided-action').textContent).toContain(
      'Explore guided investigation',
    );
    // The hero secondary and the import section both label the real picker.
    expect(screen.getAllByLabelText('Choose a document').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('heading', { name: 'Try guided example' })).toBeTruthy();
  });

  it('routes the hero action through the same guarded seed flow', async () => {
    const calls = stubFetchByRoute((url) => {
      if (url.endsWith(apiRoutes.demoSeed)) {
        return { status: 200, body: { seeded: true, alreadySeeded: false, seedVersion: 'seed-1' } };
      }
      if (url.includes('graph-probe')) {
        return { status: 200, body: { exists: true, seedVersion: 'seed-1', nodeCount: 17 } };
      }
      if (url.includes('graph-edges')) {
        return { status: 200, body: buildDemoOverviewRecord() };
      }
      return undefined;
    });

    renderWithRoutes();
    fireEvent.click(screen.getByTestId('hero-guided-action'));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /guided demo results/i })).toBeTruthy(),
    );
    const seedCall = calls.find((call) => call.url.endsWith(apiRoutes.demoSeed));
    expect(seedCall?.init?.method).toBe('POST');
    expect(seedCall?.init?.body).toBeUndefined();
  });

  it('features the 2020 hydroxychloroquine retraction with real, distinct dates', () => {
    renderWithRoutes();

    const featured = screen.getByRole('article');
    // Real facts only (docs/DATA_CONTRACTS §6): Mehra et al. 2020, The
    // Lancet; announcement 2020-06-04 distinct from record date 2020-06-05;
    // both PMIDs present. Verified status is labeled, never invented.
    expect(featured.textContent).toContain('Mehra');
    expect(featured.textContent).toContain('announced 2020-06-04');
    expect(featured.textContent).toContain('recorded 2020-06-05');
    // The two timestamps stay distinct — never merged into one date.
    expect(featured.textContent).not.toContain('2020-06-04/05');
    expect(featured.textContent).toContain('32450107');
    expect(featured.textContent).toContain('32511943');
    expect(featured.textContent).toContain('Verified real record');
    // Honesty: fictional demo manuscript vs. real record distinction kept.
    expect(featured.textContent).toContain('FICTIONAL / GUIDED DEMO');
    const resultsLink = screen.getByRole('link', { name: 'Open the guided investigation' });
    expect(resultsLink.getAttribute('href')).toBe('/results');
  });

  it('keeps the workspace shortcuts as real route links', () => {
    renderWithRoutes();
    const shortcuts = screen.getByRole('navigation', { name: 'Workspace areas' });
    expect(shortcuts.querySelector('a[href="/overview"]')).toBeTruthy();
    expect(shortcuts.querySelector('a[href="/graph"]')).toBeTruthy();
    expect(shortcuts.querySelector('a[href="/library"]')).toBeTruthy();
  });

  it('renders the primary document affordance and secondary DOI/bibliography affordances', () => {
    renderWithRoutes();

    expect(screen.getAllByLabelText('Choose a document').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('import-input')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bibliography' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Single DOI' })).toBeTruthy();
  });

  it('shows an honest not-wired-yet state after a file is chosen — no fake upload or analysis', () => {
    renderWithRoutes();
    const input = screen.getByTestId('import-input') as HTMLInputElement;

    const file = new File(['%PDF-1.4 minimal'], 'field-notes.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 12345 });
    fireEvent.change(input, { target: { files: [file] } });

    const state = screen.getByTestId('selection-state');
    expect(state.textContent).toContain('field-notes.pdf');
    expect(state.textContent).toContain('Not wired yet');
    expect(state.textContent).toContain('has not been uploaded anywhere');

    // Nothing pretends a pipeline exists.
    expect(screen.queryByText(/uploading/i)).toBeNull();
    expect(screen.queryByText(/analysis complete/i)).toBeNull();
    expect(screen.queryByText(/parsed/i)).toBeNull();
  });

  it('discloses what the guided seed does before running it', () => {
    renderWithRoutes();
    fireEvent.click(screen.getByRole('button', { name: /what does that involve/i }));
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('FICTIONAL / GUIDED DEMO');
    expect(note.textContent).toContain('idempotent');
    expect(note.textContent).toContain('synthetic');
  });
});

describe('guided example — the real seed flow', () => {
  it('contacts the guarded seed endpoint and navigates to real results on success', async () => {
    const calls = stubFetchByRoute((url) => {
      if (url.endsWith(apiRoutes.demoSeed)) {
        return { status: 200, body: { seeded: true, alreadySeeded: false, seedVersion: 'seed-1' } };
      }
      if (url.includes('graph-probe')) {
        return { status: 200, body: { exists: true, seedVersion: 'seed-1', nodeCount: 17 } };
      }
      if (url.includes('graph-edges')) {
        return { status: 200, body: buildDemoOverviewRecord() };
      }
      return undefined;
    });

    renderWithRoutes();
    fireEvent.click(screen.getByTestId('guided-seed-button'));

    // Success lands on the results view mapping the real graph payload.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /guided demo results/i })).toBeTruthy(),
    );
    expect(await screen.findByTestId('results-affected')).toBeTruthy();
    const seedCall = calls.find((call) => call.url.endsWith(apiRoutes.demoSeed));
    expect(seedCall?.init?.method).toBe('POST');
    expect(seedCall?.init?.body).toBeUndefined();
  });

  it('shows the truthful in-flight state before the API answers', async () => {
    stubFetchByRoute(() => undefined);
    // Wrap handler: hold the seed call open so the in-flight copy is visible.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (input: unknown, init?: RequestInit) =>
          new Promise<Response>(() => {
            void input;
            void init;
            /* stays pending — like a slow API */
          }),
      ),
    );

    renderWithRoutes();
    fireEvent.click(screen.getByTestId('guided-seed-button'));
    expect(screen.getByTestId('guided-seed-state').textContent).toContain('Contacting the demo API');
    expect((screen.getByTestId('guided-seed-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('API down → “API unavailable — nothing ran”; never a fabricated success', async () => {
    stubFetchByRoute(() => undefined);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('connection refused'))));

    renderWithRoutes();
    fireEvent.click(screen.getByTestId('guided-seed-button'));

    await waitFor(() =>
      expect(screen.getByTestId('guided-seed-copy').textContent).toMatch(
        /API unavailable — nothing ran/,
      ),
    );
    // User was not navigated: no results content appears.
    expect(screen.queryByRole('heading', { name: /guided demo results/i })).toBeNull();
  });

  it('429 → honest cooldown message, no navigation', async () => {
    stubFetchByRoute((url) =>
      url.endsWith(apiRoutes.demoSeed)
        ? { status: 429, body: { error: 'rate limited' } }
        : undefined,
    );

    renderWithRoutes();
    fireEvent.click(screen.getByTestId('guided-seed-button'));

    await waitFor(() =>
      expect(screen.getByTestId('guided-seed-copy').textContent).toMatch(/cooldown/i),
    );
    expect(screen.queryByRole('heading', { name: /guided demo results/i })).toBeNull();
  });

  it('404 → “not wired on this build yet — nothing ran”', async () => {
    stubFetchByRoute(() => ({ status: 404 }));

    renderWithRoutes();
    fireEvent.click(screen.getByTestId('guided-seed-button'));

    await waitFor(() =>
      expect(screen.getByTestId('guided-seed-copy').textContent).toMatch(/not wired on this build yet/i),
    );
    expect(screen.queryByRole('heading', { name: /guided demo results/i })).toBeNull();
  });
});
