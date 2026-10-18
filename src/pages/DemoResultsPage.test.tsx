import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DemoResultsPage from './DemoResultsPage';
import { stubFetchByRoute } from '../test/mockFetch';
import { buildDemoOverviewRecord } from '../test/graphFixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderResults() {
  return render(
    <MemoryRouter>
      <DemoResultsPage />
    </MemoryRouter>,
  );
}

function stubGraphRoute(body: { status: number; body?: unknown }) {
  return stubFetchByRoute((url) => {
    if (url.includes('graph-edges')) return { status: body.status, body: body.body };
    if (url.includes('graph-probe')) {
      return { status: 200, body: { exists: true, seedVersion: 'seed-1', nodeCount: 17 } };
    }
    return undefined;
  });
}

describe('DemoResultsPage — maps real graph data', () => {
  it('renders seeded metadata, notice dates, affected chain, historical safety and unresolved refs', async () => {
    stubGraphRoute({ status: 200, body: buildDemoOverviewRecord() });
    renderResults();

    // Seed identity + honest returned counts.
    await waitFor(() =>
      expect(screen.getByTestId('results-counts').textContent).toMatch(/17 nodes · 14 connections/),
    );
    expect(screen.getByTestId('seed-info').textContent).toContain('seedVersion seed-1');

    // Verified notice with distinct announcement vs record dates.
    expect(screen.getByTestId('notice-type').textContent).toContain('Retraction');
    const dates = screen.getByTestId('notice-dates').textContent;
    expect(dates).toContain('2020-06-04');
    expect(dates).toContain('2020-06-05');

    // Affected: direct Claim A + indirect Conclusion C.
    expect(screen.getByTestId('affected-claim-A').textContent).toMatch(/direct evidence review/);
    expect(screen.getByTestId('affected-conclusion-C').textContent).toMatch(
      /indirect evidence review/,
    );
    // A flag is never a verdict.
    expect(screen.getByTestId('results-attribution').textContent).toMatch(
      /evidence review is needed/,
    );

    // Historical claim B stays unflagged, with the reason spelled out.
    const historical = screen.getByTestId('historical-claim-B');
    expect(historical.textContent).toMatch(/not flagged/);
    expect(historical.textContent).toMatch(/historical discussion/);

    // Unresolved Lee et al.: two possible candidates, nothing more.
    const unresolved = screen.getByTestId('unresolved-ref-lee-2020');
    expect(unresolved.textContent).toMatch(/unresolved/);
    expect(unresolved.textContent).toContain('POSSIBLE_MATCH');
    expect(
      screen.getByTestId('unresolved-ref-lee-2020-candidates').textContent,
    ).toContain('pub-lee-2020-candidate-a, pub-lee-2020-candidate-b');

    // Unknowns include the no-review-recorded honesty.
    expect(screen.getByTestId('results-unknown').textContent).toMatch(/No human review decisions exist yet/);
  });

  it('attributions are labelled: fictional demo content vs real records', async () => {
    stubGraphRoute({ status: 200, body: buildDemoOverviewRecord() });
    renderResults();
    await screen.findByTestId('results-affected');
    // Synthetic claims are quoted with demo text; Mehra notice is real & verified.
    expect(screen.getByTestId('affected-claim-A').textContent).toContain('Agent P-9');
  });

  it('when graph records are unavailable, states it honestly and invents nothing', async () => {
    stubGraphRoute({ status: 404 });
    renderResults();

    await waitFor(() =>
      expect(screen.getByTestId('results-missing').textContent).toMatch(/not available yet/i),
    );
    // No fabricated numbers, no seeded-looking sections.
    expect(screen.queryByTestId('results-counts')).toBeNull();
    expect(screen.queryByTestId('affected-claim-A')).toBeNull();
    const missing = screen.queryByTestId('results-missing');
    expect(missing?.textContent).toMatch(/HTTP 404/);
  });

  it('API failure surfaces the exact failure, offers retry, fakes nothing', async () => {
    stubGraphRoute({ status: 500 });
    renderResults();
    await waitFor(() =>
      expect(screen.getByTestId('results-failure').textContent).toMatch(/HTTP 500/),
    );
    expect(screen.queryByRole('heading', { name: /needs human review/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
