import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OverviewPage from './OverviewPage';
import { stubFetchByRoute } from '../test/mockFetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderOverview() {
  return render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );
}

describe('OverviewPage — seed-probe driven honest cards', () => {
  it('shows “Continue your work” with real counts when the demo graph is seeded', async () => {
    stubFetchByRoute((url) => {
      if (url.includes('health')) {
        return { status: 200, body: { ok: true, service: 'aftershock-demo', graph: 'not-configured' } };
      }
      if (url.includes('graph/probe')) {
        return {
          status: 200,
          body: { exists: true, seedVersion: 'seed-1', nodeCount: 17 },
        };
      }
      return undefined;
    });
    renderOverview();

    await waitFor(() => expect(screen.getByTestId('continue-card')).toBeTruthy());
    const summary = screen.getByTestId('continue-summary').textContent ?? '';
    expect(summary).toContain('seedVersion seed-1');
    expect(summary).toContain('17 nodes');
    expect(screen.getByRole('link', { name: 'View guided results' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Explore the Knowledge Graph' })).toBeTruthy();
    // The import-first card is not shown alongside it.
    expect(screen.queryByTestId('import-first-card')).toBeNull();
  });

  it('falls back to the import-first banner when the probe answers 404 (unseeded)', async () => {
    stubFetchByRoute((url) => {
      if (url.includes('health')) {
        return { status: 200, body: { ok: true } };
      }
      return { status: 404 };
    });
    renderOverview();

    await waitFor(() => expect(screen.getByTestId('import-first-card')).toBeTruthy());
    expect(screen.getByTestId('import-first-card').textContent).toMatch(
      /no seeded demo graph in this environment yet/i,
    );
    expect(screen.queryByTestId('continue-card')).toBeNull();
  });

  it('discloses a failed probe instead of guessing workspace state', async () => {
    stubFetchByRoute(() => {
      throw new TypeError('connection refused');
    });
    renderOverview();

    await waitFor(() => expect(screen.getByTestId('overview-probe-failure')).toBeTruthy());
    expect(screen.getByTestId('overview-probe-failure').textContent).toMatch(
      /could not reach the API/,
    );
    expect(screen.getByTestId('overview-probe-failure').textContent).toMatch(
      /status is never guessed/,
    );
    expect(screen.queryByTestId('continue-card')).toBeNull();
    expect(screen.queryByTestId('import-first-card')).toBeNull();
  });

  it('keeps the truthful service chip beside the heading', async () => {
    stubFetchByRoute((url) =>
      url.includes('health')
        ? { status: 200, body: { ok: true } }
        : { status: 200, body: { exists: false } },
    );
    renderOverview();
    await waitFor(() =>
      expect(screen.getByTestId('service-status').textContent).toMatch(/^API: online$/),
    );
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy();
  });
});
