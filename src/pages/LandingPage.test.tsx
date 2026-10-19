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

describe('LandingPage (Wave U1 entry experience)', () => {
  it('renders the centered editorial hero with the exact research question and subtitle — no wordmark in the hero', () => {
    renderWithRoutes();

    // One h1 only: the research question in display serif.
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'What would you like to investigate?' }),
    ).toBeTruthy();
    expect(screen.getByText('Follow the evidence. Understand what changed.')).toBeTruthy();
    // The Aftershock. wordmark stays in the sidebar, never in the hero.
    expect(screen.queryByText(/Aftershock\./)).toBeNull();
  });

  it('exposes ONE primary seed trigger in the launcher card (no duplicated CTAs, no fake extras)', () => {
    renderWithRoutes();

    // The single launcher card holds the primary flow (sr-only heading so
    // no implementation-status copy surfaces in the hero zone).
    expect(screen.getByTestId('investigation-launcher')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Start an investigation' }),
    ).toBeTruthy();
    // Single visible seed control reachable through both testids.
    expect(screen.getAllByTestId('guided-seed-button')).toHaveLength(1);
    // Legacy hero contract: the hero-guided-action hook wraps the CTA.
    expect(screen.getAllByTestId('hero-guided-action')).toHaveLength(1);
    expect(screen.getByTestId('hero-guided-action').textContent).toContain(
      'Explore guided investigation',
    );
    // No fake chat box, no fake DOI search: exactly two real actions.
    expect(screen.getAllByRole('button', { name: 'Explore guided investigation' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Choose a document' })).toHaveLength(1);
  });

  it('shows the quiet integrity line without expansion and keeps the document picker collapsed by default', () => {
    renderWithRoutes();

    // Honest synthetic-vs-real distinction visible WITHOUT expanding.
    expect(
      screen.getByText(
        /clearly labeled synthetic content \(FICTIONAL \/ GUIDED DEMO\) alongside real public records — nothing is simulated\./,
      ),
    ).toBeTruthy();
    // The document picker starts collapsed: no import panel in the DOM.
    expect(screen.queryByTestId('import-panel')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Choose a document' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    // Expanding reveals the real import flow untouched.
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('import-panel')).toBeTruthy();
    expect(screen.getAllByLabelText('Choose a document').length).toBeGreaterThanOrEqual(1);
  });

  it('runs the guarded seed flow from the primary CTA and navigates to real results on success', async () => {
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
    // Featured card links to /results — it is NOT a second seed trigger.
    const resultsLink = screen.getByRole('link', { name: 'Open the guided investigation' });
    expect(resultsLink.getAttribute('href')).toBe('/results');
  });

  it('keeps exactly three quiet, real workspace shortcuts (no duplicated summaries)', () => {
    renderWithRoutes();
    const shortcuts = screen.getByRole('navigation', { name: 'Workspace areas' });
    const links = Array.from(shortcuts.querySelectorAll('a[href]'));
    const hrefs = links.map((a) => a.getAttribute('href'));
    // Real destinations only; no /overview summary re-introduced here.
    expect(hrefs).toEqual(['library', 'review-queue', 'graph'].map((p) => `/${p}`));
  });

  it('renders the collapsed document area with the honestly disabled Bibliography/DOI row behind the toggle', () => {
    renderWithRoutes();

    // Collapsed by default: the picker and the demoted affordances only
    // exist after the outline toggle expands the document area.
    expect(screen.queryByTestId('import-panel')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bibliography' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Choose a document' }));

    expect(screen.getAllByLabelText('Choose a document').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('import-input')).toBeTruthy();
    const bibliography = screen.getByRole('button', { name: 'Bibliography' }) as HTMLButtonElement;
    const singleDoi = screen.getByRole('button', { name: 'Single DOI' }) as HTMLButtonElement;
    expect(bibliography.disabled).toBe(true);
    expect(singleDoi.disabled).toBe(true);
    // The honest scope note appears exactly once (e2e scans it page-wide).
    const notes = screen.getAllByText(/cannot detect passage-level claim dependencies/i);
    expect(notes).toHaveLength(1);
  });

  it('registers a chosen file through the real import endpoint and shows the server disclosure — no fake upload', async () => {
    const calls = stubFetchByRoute((url) =>
      url.startsWith('/.netlify/functions/import-document')
        ? {
            status: 200,
            body: {
              documentId: 'doc-registered-1',
              versionId: 'ver-registered-1',
              contentStored: false,
              disclosure:
                'The document was registered; its text content is not stored in this demo build.',
            },
          }
        : undefined,
    );
    renderWithRoutes();
    // The picker lives in the collapsible document area — expand first.
    fireEvent.click(screen.getByRole('button', { name: 'Choose a document' }));
    const input = screen.getByTestId('import-input') as HTMLInputElement;

    const file = new File(['%PDF-1.4 minimal'], 'field-notes.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 12345 });
    fireEvent.change(input, { target: { files: [file] } });

    const state = await waitFor(() => screen.getByTestId('selection-state'));
    expect(state.textContent).toContain('field-notes.pdf');
    expect(state.textContent).toContain('contentStored: false');
    expect(state.textContent).toContain('its text content is not stored in this demo build');

    // The real registration happened through the fixed import route.
    const importCall = calls.find((call) =>
      call.url.startsWith('/.netlify/functions/import-document'),
    );
    expect(importCall?.init?.method).toBe('POST');
    expect(importCall?.url).toContain('fileName=field-notes.pdf');
    expect(importCall?.url).toContain('format=pdf');

    // Nothing pretends analysis ran, content got stored, or progress is known.
    expect(screen.queryByTestId('analysis-runid')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/analysis complete/i)).toBeNull();
    expect(screen.queryByText(/parsed/i)).toBeNull();
  });

  it('discloses what the guided seed does before running it — guarded path, synthetic labeling, idempotent reseed', () => {
    renderWithRoutes();
    fireEvent.click(screen.getByRole('button', { name: /what does that involve/i }));
    const note = screen.getByRole('note');
    // The guarded, rate-limited API path is disclosed on expansion (the
    // hero zone stays implementation-free).
    expect(note.textContent).toContain('guarded, rate-limited');
    expect(note.textContent).toContain('FICTIONAL / GUIDED DEMO');
    expect(note.textContent).toContain('idempotent');
    expect(note.textContent).toContain('synthetic');
  });
});

describe('guided example — the single, honest seed flow', () => {
  it('success: contacts the guarded seed endpoint and navigates to real results', async () => {
    stubFetchByRoute((url) => {
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
  });

  it('submitting: truthful in-flight state and a disabled CTA before the API answers', async () => {
    // Hold the seed call open so the in-flight copy is visible.
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

  it('5xx → typed API error in the live state region — no results shown as a substitute', async () => {
    stubFetchByRoute((url) =>
      url.endsWith(apiRoutes.demoSeed) ? { status: 500, body: { error: 'boom' } } : undefined,
    );

    renderWithRoutes();
    fireEvent.click(screen.getByTestId('guided-seed-button'));

    await waitFor(() =>
      expect(screen.getByTestId('guided-seed-state').textContent).toMatch(/API error \(HTTP 500\)/),
    );
    expect(screen.getByTestId('guided-seed-state').textContent).toContain(
      'no results are shown as a substitute',
    );
    expect(screen.queryByRole('heading', { name: /guided demo results/i })).toBeNull();
  });

  it('ambiguous 2xx payload → rejected path: “No simulated success is shown.”', async () => {
    // A 200 that refuses to become a success (neither seeded nor
    // alreadySeeded) must end in the honest rejected state.
    stubFetchByRoute((url) =>
      url.endsWith(apiRoutes.demoSeed) ? { status: 200, body: { unexpected: true } } : undefined,
    );

    renderWithRoutes();
    fireEvent.click(screen.getByTestId('guided-seed-button'));

    await waitFor(() =>
      expect(screen.getByTestId('guided-seed-state').textContent).toContain(
        'No simulated success is shown.',
      ),
    );
    expect(screen.queryByRole('heading', { name: /guided demo results/i })).toBeNull();
  });
});
