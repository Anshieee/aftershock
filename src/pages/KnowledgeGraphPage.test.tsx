import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KnowledgeGraphPage from './KnowledgeGraphPage';
import { stubFetchByRoute } from '../test/mockFetch';
import { buildDemoOverviewRecord } from '../test/graphFixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderGraph() {
  return render(
    <MemoryRouter>
      <KnowledgeGraphPage />
    </MemoryRouter>,
  );
}

describe('KnowledgeGraphPage — renders exactly the records the API returned', () => {
  it('draws the layered canvas, legend, records list and counts', async () => {
    stubFetchByRoute((url) =>
      url.includes('graph/edges') ? { status: 200, body: buildDemoOverviewRecord() } : undefined,
    );
    renderGraph();

    // Honest count line reflects the payload and the 40-record cap.
    await waitFor(() =>
      expect(screen.getByTestId('graph-counts').textContent).toMatch(
        /seed seed-1 · 17 nodes · 14 connections returned/,
      ),
    );

    // Canvas has interactive real nodes...
    const canvas = screen.getByTestId('graph-canvas');
    expect(canvas).toBeTruthy();
    expect(screen.getByTestId('graph-node-claim-A')).toBeTruthy();
    expect(screen.getByTestId('graph-node-pub-mehra-2020')).toBeTruthy();

    // Legend covers every relation family incl. the sage-reviewed reserve,
    // plus the node outline encodings (dashed fictional vs solid real).
    const legend = screen.getByTestId('graph-legend').textContent ?? '';
    expect(legend).toContain('Direct support');
    expect(legend).toContain('Historical mention');
    expect(legend).toContain('Possible match — unverified');
    expect(legend).toContain('Verified status notice');
    expect(legend).toContain('Human-reviewed');
    expect(legend).toContain('Node outlines');
    expect(legend).toContain('Dashed outline');
    expect(legend).toContain('fictional / guided-demo entity');
    expect(legend).toContain('FICTIONAL / GUIDED DEMO');
    expect(legend).toContain('Solid outline');
    expect(legend).toContain('real bibliographic record');

    // Text-accurate records list is present (screen-reader equivalent).
    expect(screen.getByTestId('graph-edges-list').textContent).toContain(
      'CITATION_USE_SUPPORTS_CLAIM',
    );
    expect(screen.getByTestId('graph-nodes-list').textContent).toContain('ref-lee-2020');
    expect(screen.getByTestId('graph-nodes-list').textContent).toContain('FICTIONAL / GUIDED DEMO');
  });

  it('selecting a node opens the shared Context Inspector with provenance details', async () => {
    stubFetchByRoute((url) =>
      url.includes('graph/edges') ? { status: 200, body: buildDemoOverviewRecord() } : undefined,
    );
    renderGraph();
    await screen.findByTestId('graph-node-claim-A');

    fireEvent.click(screen.getByTestId('graph-node-claim-A'));
    const inspector = await screen.findByTestId('context-inspector');
    expect(screen.getByTestId('inspector-id').textContent).toBe('claim-A');
    expect(inspector.textContent).toMatch(/Type\s*Claim/);
    expect(inspector.textContent).toMatch(/Provenance\s*observed/);
    expect(inspector.textContent).toContain('FICTIONAL / GUIDED DEMO');
    // Synthetic records use the neutral-uncertain annotation color — never
    // the review-amber reserved for "needs human review" requests.
    const syntheticNote = screen.getByTestId('inspector-synthetic');
    expect(syntheticNote.className).toContain('text-uncertain-text');
    expect(syntheticNote.className).not.toContain('text-review-');
    // Connected edges are shown with relation type + provenance.
    expect(inspector.textContent).toContain('CONCLUSION_DEPENDS_ON_CLAIM');
  });

  it('a 404 graph API shows an honest missing state — zero decorative fake nodes', async () => {
    stubFetchByRoute(() => ({ status: 404 }));
    renderGraph();

    await waitFor(() => expect(screen.getByTestId('graph-missing')).toBeTruthy());
    expect(screen.queryByTestId('graph-canvas')).toBeNull();
    expect(screen.getByTestId('graph-missing').textContent).toMatch(/not seeded yet|not implemented/i);
    expect(screen.getByTestId('graph-missing').textContent).toMatch(
      /placeholder nodes or decorative edges/i,
    );
  });

  it('a 500 surfaces the exact status with nothing drawn in its place', async () => {
    stubFetchByRoute(() => ({ status: 500 }));
    renderGraph();
    await waitFor(() =>
      expect(screen.getByTestId('graph-failure-detail').textContent).toMatch(/HTTP 500/),
    );
    expect(screen.queryByTestId('graph-canvas')).toBeNull();
    expect(screen.queryByTestId('graph-nodes-list')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('an empty-but-healthy payload reads as empty — never illustrated', async () => {
    stubFetchByRoute((url) =>
      url.includes('graph/edges') ? { status: 200, body: { nodes: [], edges: [] } } : undefined,
    );
    renderGraph();
    await waitFor(() =>
      expect(screen.getByTestId('graph-empty').textContent).toMatch(/returned no records/),
    );
    expect(screen.queryAllByRole('button', { name: /node/i })).toHaveLength(0);
  });
});
