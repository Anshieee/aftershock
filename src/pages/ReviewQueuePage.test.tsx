import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReviewQueuePage from './ReviewQueuePage';
import { stubFetchByRoute } from '../test/mockFetch';
import { buildDemoOverviewRecord } from '../test/graphFixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderQueue() {
  return render(
    <MemoryRouter>
      <ReviewQueuePage />
    </MemoryRouter>,
  );
}

function stubGraphRoute(status: number, body?: unknown) {
  return stubFetchByRoute((url) => {
    if (url.includes('graph-edges')) return { status, body };
    return undefined;
  });
}

describe('ReviewQueuePage — derives real flagged items from the graph', () => {
  it('lists the REAL flagged claim and conclusion with their real why-chain and provenance; claim-B is not flagged', async () => {
    stubGraphRoute(200, buildDemoOverviewRecord());
    renderQueue();

    // Honest counts from the returned payload only (17 nodes · 14 edges in fixture).
    await waitFor(() =>
      expect(screen.getByTestId('review-queue-counts').textContent).toMatch(
        /2 flagged for review in the returned records · 17 nodes · 14 connections/,
      ),
    );

    // Direct item: claim-A flagged via its real supporting citation use.
    const claimA = screen.getByTestId('review-item-claim-A');
    expect(claimA.getAttribute('data-review-state')).toBe('needs-review');
    expect(claimA.textContent).toMatch(/direct evidence review/);
    const whyA = screen.getByTestId('review-item-claim-A-why');
    expect(whyA.textContent).toContain('cu-A-supporting');
    expect(whyA.textContent).toContain('pub-mehra-2020');
    expect(whyA.textContent).toContain('CITATION_USE_SUPPORTS_CLAIM');
    // Real provenance text from the returned edge (sourcePointer, no invented rationale).
    expect(whyA.textContent).toContain('fixture://aftershock-demo-fixture-v1#cu-A-supporting');
    expect(whyA.textContent).toContain('provenance human_confirmed');
    expect(whyA.textContent).toContain('no rationale text was recorded on the returned edge');

    // Indirect item: conclusion-C inherits via the real dependency edge.
    const conclusionC = screen.getByTestId('review-item-conclusion-C');
    expect(conclusionC.textContent).toMatch(/indirect evidence review/);
    const whyC = screen.getByTestId('review-item-conclusion-C-why');
    expect(whyC.textContent).toContain('CONCLUSION_DEPENDS_ON_CLAIM');
    expect(whyC.textContent).toContain('claim-A');
    expect(whyC.textContent).toContain('never automatic falsity');

    // Historical mention of the same publication must NOT be flagged (§7.2).
    expect(screen.queryByTestId('review-item-claim-B')).toBeNull();
  });

  it('renders the edge rationale verbatim when the returned edge carries one', async () => {
    const record = buildDemoOverviewRecord() as {
      edges: Array<Record<string, unknown>>;
    };
    const edge = record.edges.find((candidate) => candidate['id'] === 'edge-cuA-supports-claimA');
    expect(edge).toBeDefined();
    edge!['rationale'] = 'Supporting role against a publication with a verified retraction notice.';
    stubGraphRoute(200, record);
    renderQueue();

    const whyA = await screen.findByTestId('review-item-claim-A-why');
    expect(whyA.textContent).toContain(
      'rationale: Supporting role against a publication with a verified retraction notice.',
    );
    // And the honest absence note is gone now that rationale exists.
    expect(whyA.textContent).not.toMatch(/no rationale text was recorded/);
  });

  it('decision actions are disabled and honestly labelled — no fake buttons, no fake decisions', async () => {
    stubGraphRoute(200, buildDemoOverviewRecord());
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    const decideA = screen.getByTestId('review-decide-claim-A') as HTMLButtonElement;
    expect(decideA.disabled).toBe(true);
    expect(decideA.title).toMatch(/nothing is saved or sent/);
    // The visible "not available yet" note is adjacent, not hidden in a tooltip only.
    expect(screen.getByTestId('review-item-claim-A').textContent).toMatch(
      /Decision actions arrive with the review backend/,
    );
    // Exactly one decision affordance per flagged item — two flagged items.
    expect(screen.getAllByTestId(/review-decide-/)).toHaveLength(2);
  });

  it('sage reviewed styling never appears for the seed (all records unreviewed)', async () => {
    stubGraphRoute(200, buildDemoOverviewRecord());
    const { container } = renderQueue();
    await screen.findByTestId('review-item-claim-A');

    expect(container.querySelector('[data-review-state="reviewed"]')).toBeNull();
    expect(container.querySelector('[class*="reviewed"]')).toBeNull();
  });

  it('unresolved references render separately in uncertain-blue, explicitly not review cases', async () => {
    stubGraphRoute(200, buildDemoOverviewRecord());
    renderQueue();
    const section = await screen.findByRole('heading', {
      name: /Unresolved references — not review cases \(1\)/,
    });
    expect(section).toBeTruthy();

    const unresolved = screen.getByTestId('review-unresolved-ref-lee-2020');
    expect(unresolved.getAttribute('data-review-state')).toBe('unresolved');
    expect(unresolved.textContent).toContain('pub-lee-2020-candidate-a, pub-lee-2020-candidate-b');
    // It must not leak into the flagged list.
    expect(screen.queryByTestId('review-item-ref-lee-2020')).toBeNull();
  });

  it('empty returned graph: honest “nothing flagged” — invents no counts or cases', async () => {
    stubGraphRoute(200, { seedVersion: 'seed-1', nodes: [], edges: [] });
    renderQueue();

    await waitFor(() =>
      expect(screen.getByTestId('review-queue-empty').textContent).toMatch(
        /Nothing in the returned graph is flagged for review/,
      ),
    );
    expect(screen.queryByTestId(/review-item-/)).toBeNull();
    expect(screen.getByTestId('review-queue-counts').textContent).toMatch(
      /0 flagged for review in the returned records · 0 nodes · 0 connections returned/,
    );
  });

  it('unseeded / API down (404): honest missing state, no fabricated queue', async () => {
    stubGraphRoute(404);
    renderQueue();

    await waitFor(() =>
      expect(screen.getByTestId('review-missing').textContent).toMatch(/not available yet/i),
    );
    expect(screen.queryByTestId('review-item-claim-A')).toBeNull();
    expect(screen.queryByTestId('review-queue-counts')).toBeNull();
  });

  it('API failure surfaces the exact failure with retry and fakes nothing', async () => {
    stubGraphRoute(500);
    renderQueue();

    await waitFor(() =>
      expect(screen.getByTestId('review-failure-detail').textContent).toMatch(/HTTP 500/),
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByTestId('review-item-claim-A')).toBeNull();
  });
});
