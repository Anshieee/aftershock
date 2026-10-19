import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/** M7 Priority B — Find-Evidence dialog mounted from the affected rows. */
describe('DemoResultsPage — Find evidence affordance (M7 Priority B)', () => {
  const EVIDENCE_PREPARE = (claimId: string, label: 'Claim' | 'Conclusion') => ({
    mode: 'prepare',
    claimId,
    claimText: 'Demo passage text (fixture) — verbatim from the graph.',
    label,
    manuscriptId: 'doc-demo-manuscript',
    concern: {
      summary: 'The supporting citation use points at a publication with a verified retraction notice.',
      direction: 'direct',
    },
    suggestedQuery: 'registry analysis drug-treatment mortality cohort P-9',
    queryEditable: true,
    providers: [
      { id: 'crossref', displayName: 'Crossref', scopeNote: 'public bibliographic metadata' },
    ],
    caveats: ['Fixture caveat — nothing about this search mutates review state.'],
  });

  function stubRoutesWithEvidence() {
    return stubFetchByRoute((url) => {
      if (url.includes('graph-edges')) return { status: 200, body: buildDemoOverviewRecord() };
      if (url.includes('graph-probe')) {
        return { status: 200, body: { exists: true, seedVersion: 'seed-1', nodeCount: 17 } };
      }
      if (url.includes('evidence-find')) {
        const claimId = new URL(url, 'http://localhost').searchParams.get('claimId') ?? '';
        // Demo fixture: both affected passages prepare honestly.
        const isConclusion = claimId.includes('conclusion');
        return {
          status: 200,
          body: EVIDENCE_PREPARE(claimId, isConclusion ? 'Conclusion' : 'Claim'),
        };
      }
      return undefined;
    });
  }

  it('affected claim row opens the panel with claimId = item id and the origin label', async () => {
    const calls = stubRoutesWithEvidence();
    renderResults();
    await screen.findByTestId('affected-claim-A');

    fireEvent.click(screen.getByTestId('results-find-evidence-claim-A'));

    await waitFor(() => expect(screen.getByTestId('find-evidence-dialog')).toBeTruthy());
    // The dialog opened for the right case: prepare read carries it in the URL.
    const evidenceCall = calls.find((call) => call.url.includes('evidence-find'))!;
    expect(evidenceCall.url).toContain(`claimId=${encodeURIComponent('claim-A')}`);
    expect(screen.getByTestId('find-evidence-origin-label').textContent).toBe(
      'Results — affected claim claim-A',
    );
  });

  it('affected conclusion row opens the panel for that passage with its origin label', async () => {
    const calls = stubRoutesWithEvidence();
    renderResults();
    await screen.findByTestId('affected-conclusion-C');

    fireEvent.click(screen.getByTestId('results-find-evidence-conclusion-C'));

    await waitFor(() => expect(screen.getByTestId('find-evidence-dialog')).toBeTruthy());
    const evidenceCall = calls.find((call) => call.url.includes('evidence-find'))!;
    expect(evidenceCall.url).toContain(`claimId=${encodeURIComponent('conclusion-C')}`);
    expect(screen.getByTestId('find-evidence-origin-label').textContent).toBe(
      'Results — affected conclusion conclusion-C',
    );
  });

  it('the results-page mount exposes the return link and the viewing-only review-queue link; closing restores the rows untouched', async () => {
    stubRoutesWithEvidence();
    renderResults();
    await screen.findByTestId('affected-claim-A');

    fireEvent.click(screen.getByTestId('results-find-evidence-claim-A'));
    await waitFor(() => expect(screen.getByTestId('find-evidence-dialog')).toBeTruthy());

    expect((screen.getByTestId('find-evidence-origin-return') as HTMLAnchorElement).getAttribute('href')).toBe('/results');
    const queueLink = screen.getByTestId('find-evidence-review-queue') as HTMLAnchorElement;
    expect(queueLink.getAttribute('href')).toBe('/review-queue');
    expect(queueLink.textContent).toBe('Open review queue');
    expect(queueLink.getAttribute('aria-label')).toMatch(/no review state/i);

    // Closing discards the dialog; page rows are unchanged by the whole flow.
    fireEvent.click(screen.getByTestId('find-evidence-close'));
    await waitFor(() => expect(screen.queryByTestId('find-evidence-dialog')).toBeNull());
    expect(screen.getByTestId('affected-claim-A')).toBeTruthy();
    expect(screen.queryByTestId('find-evidence-origin')).toBeNull();
  });
});
