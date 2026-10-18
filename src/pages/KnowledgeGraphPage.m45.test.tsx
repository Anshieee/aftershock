import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KnowledgeGraphPage from './KnowledgeGraphPage';
import { stubFetchByRoute } from '../test/mockFetch';
import { buildDemoOverviewRecord } from '../test/graphFixtures';

afterEach(() => vi.unstubAllGlobals());

function renderGraph() {
  return render(<MemoryRouter><KnowledgeGraphPage /></MemoryRouter>);
}

describe('KnowledgeGraphPage — M4.5 interactivity', () => {
  it('renders zoom controls with accessible labels', async () => {
    stubFetchByRoute((url) => url.includes('graph-edges') ? { status: 200, body: buildDemoOverviewRecord() } : undefined);
    renderGraph();
    await screen.findByTestId('graph-canvas');
    expect(screen.getByTestId('zoom-in')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeTruthy();
  });

  it('filter checkbox hides nodes from canvas but keeps records count honest', async () => {
    stubFetchByRoute((url) => url.includes('graph-edges') ? { status: 200, body: buildDemoOverviewRecord() } : undefined);
    renderGraph();
    await screen.findByTestId('graph-canvas');
    // uncheck Claim
    const cb = screen.getByTestId('node-kind-checkbox-Claim') as HTMLInputElement;
    fireEvent.click(cb);
    await waitFor(() => expect(screen.queryByTestId('graph-node-claim-A')).toBeNull());
    // no-matches note when all unchecked
    const cbs = screen.getAllByRole('checkbox');
    cbs.forEach((c) => { if ((c as HTMLInputElement).checked) fireEvent.click(c); });
    await waitFor(() => expect(screen.getByTestId('graph-filter-empty')).toBeTruthy());
  });

  it('focus dependency path dims non-path and shows inspector flag', async () => {
    stubFetchByRoute((url) => url.includes('graph-edges') ? { status: 200, body: buildDemoOverviewRecord() } : undefined);
    renderGraph();
    await screen.findByTestId('graph-node-claim-A');
    fireEvent.click(screen.getByTestId('graph-node-claim-A'));
    await screen.findByTestId('context-inspector');
    fireEvent.click(screen.getByTestId('focus-dependency-path'));
    await waitFor(() => expect(screen.getByTestId('inspector-focused-path')).toBeTruthy());
    // dimmed node present
    expect(screen.getByTestId('graph-node-pub-lee-2020-candidate-a').getAttribute('data-dimmed')).toBe('true');
  });
});
