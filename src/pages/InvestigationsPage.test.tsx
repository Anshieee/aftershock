import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InvestigationsPage from './InvestigationsPage';
import { stubFetchByRoute } from '../test/mockFetch';
import { buildDemoOverviewRecord } from '../test/graphFixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderInvestigations() {
  return render(
    <MemoryRouter>
      <InvestigationsPage />
    </MemoryRouter>,
  );
}

function stubRoutes(graph: { status: number; body?: unknown }, probe?: Record<string, unknown>) {
  return stubFetchByRoute((url) => {
    if (url.includes('graph-edges')) return { status: graph.status, body: graph.body };
    if (url.includes('graph-probe') && probe) return { status: 200, body: probe };
    return undefined;
  });
}

describe('InvestigationsPage — one real investigation card from real graph data', () => {
  it('renders the seeded demo document with REAL payload counts and links to /results for detail', async () => {
    stubRoutes(
      { status: 200, body: buildDemoOverviewRecord() },
      { exists: true, seedVersion: 'seed-1', nodeCount: 17 },
    );
    renderInvestigations();

    // Exactly one investigation card for the one returned ResearchDocument
    // (card testids, excluding the per-card `-counts` elements).
    await waitFor(() =>
      expect(screen.getByTestId('investigation-doc-demo-manuscript')).toBeTruthy(),
    );
    const cards = Array.from(document.querySelectorAll('[data-testid]')).filter((element) =>
      (element.getAttribute('data-testid') ?? '').match(/^investigation-doc-(?!.*-counts$)/),
    );
    expect(cards).toHaveLength(1);

    // Real title from the payload, synthetic label in place.
    const card = screen.getByTestId('investigation-doc-demo-manuscript');
    expect(card.textContent).toContain('Data-Integrity Consequences in Respiratory Infection Care');
    expect(card.textContent).toContain('FICTIONAL / GUIDED DEMO');

    // Counts describe exactly the returned records (fixture: 1 version, 1 ref,
    // 2 claims, 1 conclusion, 2 flags = 1 direct + 1 indirect).
    const counts = screen.getByTestId('investigation-doc-demo-manuscript-counts').textContent;
    expect(counts).toContain('1 document version returned (ver-demo-manuscript-v1)');
    expect(counts).toContain('1 reference occurrence (1 unresolved)');
    expect(counts).toContain('2 claims · 1 conclusion');
    expect(counts).toContain('2 flagged for review (1 direct / 1 indirect)');
    // Flag ≠ falsity wording on the counts themselves.
    expect(counts).toMatch(/a flag means review is needed, never a verdict of truth or falsity/);

    // Header counts honest, seed info real.
    expect(screen.getByTestId('investigations-counts').textContent).toMatch(
      /17 nodes · 14 connections returned/,
    );
    expect(screen.getByTestId('investigations-seed-info').textContent).toContain('seedVersion seed-1');

    // Detail link targets the real results route.
    const resultsLink = screen.getByRole('link', { name: 'Open investigation' });
    expect(resultsLink.getAttribute('href')).toBe('/results');
    const queueLink = screen.getByRole('link', { name: 'Review Queue' });
    expect(queueLink.getAttribute('href')).toBe('/review-queue');
  });

  it('keeps the honest import hint tied to the real disclosure — nothing uploads anywhere', async () => {
    stubRoutes({ status: 200, body: buildDemoOverviewRecord() });
    renderInvestigations();
    const hint = await screen.findByTestId('investigations-import-hint');
    expect(hint.textContent).toMatch(/Import your own document to create more investigations/);
    expect(hint.textContent).toMatch(/nothing is uploaded or transmitted/);
    expect(hint.textContent).toMatch(/not implemented yet/);
    // No fake import affordance is offered.
    expect(hint.querySelectorAll('button').length).toBe(0);
  });

  it('graph endpoint missing (404): honest missing state, no fabricated cards or counts', async () => {
    stubRoutes({ status: 404 });
    renderInvestigations();

    await waitFor(() =>
      expect(screen.getByTestId('investigations-missing').textContent).toMatch(/not available yet/i),
    );
    expect(screen.queryByTestId(/investigation-doc-/)).toBeNull();
    expect(screen.queryByTestId('investigations-counts')).toBeNull();
  });

  it('graph answers but nothing is seeded (probe exists:false): honest unseeded state with guided-example path', async () => {
    stubRoutes(
      { status: 200, body: { seedVersion: 'seed-1', nodes: [], edges: [] } },
      { exists: false },
    );
    renderInvestigations();

    await waitFor(() =>
      expect(screen.getByTestId('investigations-unseeded').textContent).toMatch(
        /No demo graph is seeded in this environment yet/,
      ),
    );
    const exampleLink = screen.getByRole('link', { name: 'Try guided example' });
    expect(exampleLink.getAttribute('href')).toBe('/');
    expect(screen.queryByTestId(/investigation-doc-/)).toBeNull();
  });

  it('multiple documents returned: per-document cards carry only directly connected records, attribution note shown', async () => {
    const record = buildDemoOverviewRecord() as { nodes: Array<Record<string, unknown>> };
    record.nodes.push({
      id: 'doc-second',
      kind: 'ResearchDocument',
      createdAt: '2026-10-18T00:00:00.000Z',
      updatedAt: '2026-10-18T00:00:00.000Z',
      analysisVersion: 'seed-1',
      provenanceKind: 'observed',
      isSynthetic: true,
      syntheticLabel: 'FICTIONAL / GUIDED DEMO',
      title: 'A second (edge-less) demo document',
    });
    stubRoutes({ status: 200, body: record });
    renderInvestigations();

    await screen.findByTestId('investigation-doc-second');
    expect(screen.getByTestId('investigation-doc-second-counts').textContent).toContain(
      '0 document versions returned',
    );
    // Single-document claim/conclusion/flag counts must NOT be attached to a
    // multi-document graph — that attribution is not derivable here.
    const secondCounts = screen.getByTestId('investigation-doc-second-counts').textContent;
    expect(secondCounts).not.toMatch(/claims · /);
    expect(screen.getByTestId('investigations-multidoc-note').textContent).toMatch(
      /not attributable to a single document/,
    );
  });

  it('API failure surfaces the exact failure with retry and fakes nothing', async () => {
    stubRoutes({ status: 500 });
    renderInvestigations();

    await waitFor(() =>
      expect(screen.getByTestId('investigations-failure-detail').textContent).toMatch(/HTTP 500/),
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByTestId(/investigation-doc-/)).toBeNull();
  });
});
