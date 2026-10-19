import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KnowledgeGraphPage from './KnowledgeGraphPage';
import { stubFetchByRoute } from '../test/mockFetch';
import { buildDemoOverviewRecord } from '../test/graphFixtures';

/**
 * M7 wave-3 — graph-explorer refinements:
 *  1. node text search, honest about its scope (loaded overview slice only)
 *     and composable with the kind/provenance filters;
 *  2. edge-provenance surfacing in the selection panel, contract fields
 *     shown only where present in the payload ("not provided" otherwise);
 *  3. a sr-only synchronized node list + polite live status region.
 * All data comes from the stubbed wire payload — nothing is invented here.
 */

afterEach(() => vi.unstubAllGlobals());

function renderGraph() {
  return render(
    <MemoryRouter>
      <KnowledgeGraphPage />
    </MemoryRouter>,
  );
}

function stubDemo() {
  stubFetchByRoute((url) =>
    url.includes('graph-edges') ? { status: 200, body: buildDemoOverviewRecord() } : undefined,
  );
}

describe('KnowledgeGraphPage — M7 wave-3 search', () => {
  it('filters loaded nodes by substring and states its scope honestly', async () => {
    stubDemo();
    renderGraph();
    await screen.findByTestId('graph-canvas');

    // Labeled input, scope note always rendered.
    const input = screen.getByLabelText('Search loaded nodes') as HTMLInputElement;
    expect(screen.getByTestId('graph-search')).toBe(input);
    expect(screen.getByTestId('graph-search-scope').textContent).toContain(
      'within the currently loaded overview nodes (17)',
    );

    fireEvent.change(input, { target: { value: 'mehra' } });
    await waitFor(() => expect(screen.getByTestId('graph-node-pub-mehra-2020')).toBeTruthy());
    // 'mehra' matches the 2 Mehra publications + the retraction notice (via
    // id) and claim-A (its text cites "Mehra et al., 2020") — 4 of 17.
    expect(screen.getByTestId('graph-node-claim-A')).toBeTruthy();
    expect(screen.queryByTestId('graph-node-study-E')).toBeNull();
    // Honest count of the slice-wide match.
    expect(screen.getByTestId('graph-search-scope').textContent).toContain(
      '4 of 17 loaded nodes match',
    );
    expect(screen.getByTestId('graph-search-scope').textContent).toContain(
      'within the currently loaded overview nodes (17)',
    );

    // A query matching nothing reads as empty — no fabricated results.
    fireEvent.change(input, { target: { value: 'zzz-no-such-record' } });
    await waitFor(() => expect(screen.getByTestId('graph-filter-empty')).toBeTruthy());
    expect(screen.getByTestId('graph-filter-empty').textContent).toMatch(/filters or search/i);
    expect(screen.queryByTestId('graph-node-claim-A')).toBeNull();
    expect(screen.getByTestId('graph-node-list').textContent).toMatch(
      /no records match the current filters or search/i,
    );

    // Clearing the search restores every loaded node.
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(screen.getByTestId('graph-node-claim-A')).toBeTruthy());
  });

  it('composes with the node-kind and edge-provenance filters (both apply)', async () => {
    stubDemo();
    renderGraph();
    await screen.findByTestId('graph-canvas');

    // Search 'mehra' matches 2 Publications + 1 SourceNotice + claim-A
    // (its text cites "Mehra et al., 2020") in the loaded slice.
    fireEvent.change(screen.getByTestId('graph-search'), { target: { value: 'mehra' } });
    await waitFor(() =>
      expect(screen.getByTestId('graph-node-notice-mehra-retraction-2020-06-04')).toBeTruthy(),
    );

    // Kind filter applies on top of the search.
    fireEvent.click(screen.getByTestId('node-kind-checkbox-Publication'));
    await waitFor(() => expect(screen.queryByTestId('graph-node-pub-mehra-2020')).toBeNull());
    expect(screen.getByTestId('graph-node-notice-mehra-retraction-2020-06-04')).toBeTruthy();
    expect(screen.getByTestId('graph-node-claim-A')).toBeTruthy();
    expect(screen.queryByTestId('graph-node-claim-B')).toBeNull();

    // Empty state once the composed result set is empty.
    fireEvent.click(screen.getByTestId('node-kind-checkbox-Claim'));
    fireEvent.click(screen.getByTestId('node-kind-checkbox-SourceNotice'));
    await waitFor(() => expect(screen.getByTestId('graph-filter-empty')).toBeTruthy());

    // Re-enable kinds, then compose with the edge-provenance filter: the
    // only connection among the 4 'mehra' nodes is source_verified, so
    // unchecking it empties the connections while nodes stay visible.
    fireEvent.click(screen.getByTestId('node-kind-checkbox-Publication'));
    fireEvent.click(screen.getByTestId('node-kind-checkbox-Claim'));
    fireEvent.click(screen.getByTestId('node-kind-checkbox-SourceNotice'));
    fireEvent.click(screen.getByTestId('edge-provenance-checkbox-source_verified'));
    const edgesList = screen.getByTestId('graph-edges-list');
    await waitFor(() => expect(edgesList.textContent).toContain('Connections (0)'));
    expect(screen.getByTestId('graph-node-pub-mehra-2020')).toBeTruthy();
  });
});

describe('KnowledgeGraphPage — M7 wave-3 provenance surfacing', () => {
  it('lists related edges with their contract fields, relation types as-is', async () => {
    stubDemo();
    renderGraph();
    await screen.findByTestId('graph-node-claim-A');
    fireEvent.click(screen.getByTestId('graph-node-claim-A'));

    const panel = await screen.findByTestId('graph-selection-provenance');
    // Static legend: relation types differ in meaning, never conflated.
    const legend = screen.getByTestId('graph-relation-legend').textContent ?? '';
    expect(legend).toContain('cites ≠ discusses ≠ supports ≠ contrasts ≠ method-reuse ≠ has-status-notice');

    // Raw relation types of claim-A's connected edges, shown verbatim.
    expect(panel.textContent).toContain('CLAIM_HAS_CITATION_USE');
    expect(panel.textContent).toContain('CITATION_USE_SUPPORTS_CLAIM');
    expect(panel.textContent).toContain('CONCLUSION_DEPENDS_ON_CLAIM');
    expect(panel.textContent).toContain('← conclusion-C');

    // Present fields render their real values: provenanceKind and the
    // analysisVersion carried in the edge payload; rationale is absent
    // from this fixture, so it reads "not provided" — never invented.
    expect(screen.getAllByTestId('edge-provenance-kind').length).toBe(3);
    expect(screen.getAllByTestId('edge-provenance-kind').map((el) => el.textContent)).toContain(
      'human_confirmed',
    );
    expect(screen.getAllByTestId('edge-analysis-version').every((el) => el.textContent === 'seed-1')).toBe(true);
    expect(screen.getAllByTestId('edge-rationale').every((el) => el.textContent === 'not provided')).toBe(true);
  });

  it('shows "not provided" for every absent contract field — never fabricated values', async () => {
    // Minimal payload: one edge carrying only provenanceKind — no rationale,
    // no sourcePointer, no analysisVersion.
    stubFetchByRoute((url) =>
      url.includes('graph-edges')
        ? {
            status: 200,
            body: {
              nodes: [
                { id: 'n1', kind: 'Claim', text: 'A claim in the fixture.' },
                { id: 'n2', kind: 'Publication', title: 'A publication in the fixture.' },
              ],
              edges: [
                {
                  id: 'e1',
                  type: 'CITES',
                  fromId: 'n1',
                  toId: 'n2',
                  provenanceKind: 'observed',
                },
              ],
            },
          }
        : undefined,
    );
    renderGraph();
    await screen.findByTestId('graph-node-n1');
    fireEvent.click(screen.getByTestId('graph-node-n1'));

    const panel = await screen.findByTestId('graph-selection-provenance');
    expect(panel.textContent).toContain('CITES');
    expect(screen.getByTestId('edge-provenance-kind').textContent).toBe('observed');
    expect(screen.getByTestId('edge-rationale').textContent).toBe('not provided');
    expect(screen.getByTestId('edge-source-pointer').textContent).toBe('not provided');
    expect(screen.getByTestId('edge-analysis-version').textContent).toBe('not provided');
  });
});

describe('KnowledgeGraphPage — M7 wave-3 nonvisual representation', () => {
  it('renders a sr-only synchronized node list with keyboard-operable select buttons', async () => {
    stubDemo();
    renderGraph();
    await screen.findByTestId('graph-canvas');

    const list = screen.getByTestId('graph-node-list');
    expect(list.className).toContain('sr-only');
    // One button per filtered node (all 17 in the loaded slice).
    expect(within(list).getAllByRole('button')).toHaveLength(17);
    expect(list.textContent).toContain('claim-A');
    expect(list.textContent).toContain('Claim');

    // Selecting from the list opens the Context Inspector. The name matcher
    // anchors on the trailing "(claim-A)" because conclusion-C's label text
    // also mentions claim-A.
    fireEvent.click(within(list).getByRole('button', { name: /\(claim-A\)$/ }));
    await screen.findByTestId('context-inspector');
    expect(screen.getByTestId('inspector-id').textContent).toBe('claim-A');

    // The list stays synchronized with the search filter ('lee' matches
    // ref-lee-2020 and the two fictional candidate publications — 3 nodes;
    // claim-A's text does not contain 'lee' so its button drops out).
    fireEvent.change(screen.getByTestId('graph-search'), { target: { value: 'lee' } });
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(3));
    expect(within(list).queryByRole('button', { name: /\(claim-A\)$/ })).toBeNull();
  });

  it('announces filtered counts through a polite live region that tracks changes', async () => {
    stubDemo();
    renderGraph();
    await screen.findByTestId('graph-canvas');

    const status = screen.getByTestId('graph-status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.className).toContain('sr-only');
    expect(status.textContent).toContain('17 of 17 loaded nodes');

    // A search change updates the announcement ('mehra' → 4 of the slice).
    fireEvent.change(screen.getByTestId('graph-search'), { target: { value: 'mehra' } });
    await waitFor(() => expect(status.textContent).toContain('4 of 17 loaded nodes'));

    // A filter change updates the announcement too (Claim kind off → 15).
    fireEvent.change(screen.getByTestId('graph-search'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('node-kind-checkbox-Claim'));
    await waitFor(() => expect(status.textContent).toContain('15 of 17 loaded nodes'));
    expect(status.textContent).toContain('within the currently loaded overview nodes (17)');
  });
});
