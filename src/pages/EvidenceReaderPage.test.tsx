import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EvidenceReaderPage from './EvidenceReaderPage';
import { stubFetchByRoute } from '../test/mockFetch';
import { buildReaderOverviewRecord, cloneReaderOverviewRecord } from '../test/graphFixtures.reader';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderReader(initialEntry = '/reader') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <EvidenceReaderPage />
    </MemoryRouter>,
  );
}

function stubReaderRoutes(body: { status: number; body?: unknown }) {
  return stubFetchByRoute((url) => {
    if (url.includes('graph-edges')) return { status: body.status, body: body.body };
    if (url.includes('graph-probe')) {
      return { status: 200, body: { exists: true, seedVersion: 'seed-1', nodeCount: 17 } };
    }
    return undefined;
  });
}

async function waitReady() {
  await screen.findByTestId('reader-root');
  await screen.findByTestId('reader-manuscript-title');
}

describe('EvidenceReaderPage — read-only ordered reflow of returned passage records', () => {
  it('renders the honest basis disclosure and the fictional/real attribution', async () => {
    stubReaderRoutes({ status: 200, body: buildReaderOverviewRecord() });
    renderReader();
    await waitReady();

    const basis = screen.getByTestId('reader-basis-disclosure');
    expect(basis.textContent).toContain('recorded section/page/offset');
    expect(basis.textContent).toContain('not a reconstruction of the original document layout');
    expect(basis.textContent).toContain('No manuscript full text is stored');
    expect(basis.textContent.toLowerCase()).not.toContain('page x of y');

    const attribution = screen.getByTestId('reader-attribution');
    expect(attribution.textContent).toContain('FICTIONAL / GUIDED DEMO');
    expect(attribution.textContent).toContain('evidence review is needed');

    expect(screen.getByTestId('reader-manuscript-title').textContent).toContain(
      'Data-Integrity Consequences in Respiratory Infection Care',
    );
  });

  it('renders recorded locations from BOTH object and seed-time JSON-string forms, rendering only present pieces', async () => {
    stubReaderRoutes({ status: 200, body: buildReaderOverviewRecord() });
    renderReader();
    await waitReady();

    // Object form: page · section (no offset recorded → none rendered).
    expect(screen.getByTestId('reader-location-claim-A').textContent).toBe('page 3 · 2.1');
    // CitationUse uses the recorded excerptOffset key.
    expect(screen.getByTestId('reader-location-cu-A-supporting').textContent).toBe(
      'page 3 · 2.1 · offset 0',
    );
    // Seed-time JSON-string form (offset null dropped): page · section.
    expect(screen.getByTestId('reader-location-ref-lee-2020').textContent).toBe('page 4 · 3.2');
    // No fabricated pagination anywhere.
    expect(screen.queryByText(/page \d+ of \d+/)).toBeNull();
  });

  it('groups by recorded section and orders by recorded page then recorded offset, unlocatable last', async () => {
    stubReaderRoutes({ status: 200, body: buildReaderOverviewRecord() });
    const { container } = renderReader();
    await waitReady();

    const headingTexts = Array.from(
      container.querySelectorAll('section > h2'),
    ).map((node) => node.textContent);
    const sectionHeadings = headingTexts.filter((text) => text?.startsWith('Section'));
    expect(sectionHeadings).toEqual(['Section 2.1', 'Section 3.2', 'Section 4.1', 'Section 5.2']);

    const passageIdsInOrder = Array.from(
      container.querySelectorAll('[data-testid^="reader-passage-"]'),
    ).map((node) => node.getAttribute('data-testid'));
    expect(passageIdsInOrder).toEqual([
      'reader-passage-cu-A-supporting', // section 2.1, page 3, offset 0
      'reader-passage-claim-A',         // section 2.1, page 3
      'reader-passage-ref-lee-2020',    // JSON-string location, section 3.2 page 4
      'reader-passage-cu-B-historical', // section 4.1, page 5, offset 0
      'reader-passage-claim-B',         // section 4.1, page 5
      'reader-passage-conclusion-C',    // section 5.2, page 6
    ]);

    const unlocatedHeading = headingTexts.find((text) =>
      text?.includes('Not located in the recorded layout'),
    );
    expect(unlocatedHeading).toBeUndefined(); // every seeded record carries location here
  });

  it('groups records without usable location metadata last, assigning no invented position', async () => {
    const withoutConclusionLocation = cloneReaderOverviewRecord();
    const node = (withoutConclusionLocation.nodes as Record<string, unknown>[]).find(
      (candidate) => candidate.id === 'conclusion-C',
    );
    delete node?.['location'];
    stubReaderRoutes({ status: 200, body: withoutConclusionLocation });
    const { container } = renderReader();
    await screen.findByTestId('reader-unlocated-heading');
    expect(screen.getByTestId('reader-unlocated-heading').textContent).toBe(
      'Not located in the recorded layout',
    );
    expect(container.textContent).toContain(
      'These returned records do not carry usable location metadata',
    );
    // No fabricated location line for the unlocatable passage.
    expect(screen.queryByTestId('reader-location-conclusion-C')).toBeNull();
    const passageIds = Array.from(
      container.querySelectorAll('[data-testid^="reader-passage-"]'),
    ).map((candidate) => candidate.getAttribute('data-testid'));
    // Last of all, still rendered (never hidden), never assigned a section.
    expect(passageIds.at(-1)).toBe('reader-passage-conclusion-C');
  });

  it('flag semantics: amber review-needed on the flagged claim, indirect path on the conclusion, nothing for historical or unresolved', async () => {
    stubReaderRoutes({ status: 200, body: buildReaderOverviewRecord() });
    renderReader();
    await waitReady();

    const claimA = screen.getByTestId('reader-passage-claim-A');
    expect(within(claimA).getByTestId('reader-flag-claim-A').textContent).toBe(
      'evidence review needed',
    );
    // Each flagged passage links its Review Queue case.
    expect(within(claimA).getByTestId('reader-queue-link').getAttribute('href')).toBe(
      '/review-queue',
    );

    const conclusion = screen.getByTestId('reader-passage-conclusion-C');
    expect(conclusion.textContent).toContain('Depends on flagged claim claim-A');
    expect(conclusion.textContent).toContain('(direct evidence review)');
    expect(within(conclusion).getByTestId('reader-flag-conclusion-C')).toBeTruthy();

    // Historical mention: grouped & disclosed, NEVER flag-styled.
    const claimB = screen.getByTestId('reader-passage-claim-B');
    expect(within(claimB).queryByTestId('reader-flag-claim-B')).toBeNull();
    expect(claimB.textContent).toContain('excluded from evidence-review flags by design');
    expect(claimB.textContent).toContain('MENTIONS_HISTORICALLY');

    // Unresolved reference: honest resolution state, no flag styling.
    const lee = screen.getByTestId('reader-passage-ref-lee-2020');
    expect(within(lee).queryByTestId('reader-flag-ref-lee-2020')).toBeNull();
    expect(screen.getByTestId('reader-unresolved-ref-lee-2020').textContent).toMatch(/resolution state/i);
    expect(screen.getByTestId('reader-unresolved-ref-lee-2020').textContent).toContain(
      'unverified',
    );
    expect(lee.textContent).toContain('possible candidate');
  });

  it('sage review-recorded treatment renders ONLY from the returned record’s reviewed state', async () => {
    const reviewed = cloneReaderOverviewRecord();
    const node = (reviewed.nodes as Record<string, unknown>[]).find(
      (candidate) => candidate.id === 'claim-A',
    );
    if (node) node['reviewState'] = 'review_recorded';
    stubReaderRoutes({ status: 200, body: reviewed });
    renderReader();
    await waitReady();
    expect(screen.getByTestId('reader-reviewed-claim-A').textContent).toContain('review recorded');
    // Other passages stay un-review-styled (no invented sage states).
    expect(screen.queryByTestId('reader-reviewed-claim-B')).toBeNull();
    expect(screen.queryByTestId('reader-reviewed-conclusion-C')).toBeNull();
  });

  it('inspector labels relations precisely: supports ≠ mentions historically ≠ possible match', async () => {
    stubReaderRoutes({ status: 200, body: buildReaderOverviewRecord() });
    renderReader();
    await waitReady();

    // Citation use supports claim-A (and references the real publication).
    fireEvent.click(screen.getByTestId('reader-inspect-cu-A-supporting'));
    let inspector = screen.getByTestId('reader-inspector');
    expect(within(inspector).getByTestId('reader-inspector-id').textContent).toBe('cu-A-supporting');
    const relations = within(inspector).getByTestId('reader-inspector-relations').textContent ?? '';
    expect(relations).toContain('CITATION_USE_SUPPORTS_CLAIM');
    expect(relations).toContain('Supports claim claim-A');
    expect(relations).not.toContain('MENTIONS_HISTORICALLY');
    // Real-record badge on the referenced publication.
    const publications = inspector.textContent ?? '';
    expect(publications).toContain('Real bibliographic record (isSynthetic:false)');
    // Verified-publication notice linkage via PUBLICATION_HAS_NOTICE.
    expect(within(inspector).getByTestId('reader-inspector-notices').textContent).toContain(
      'noticeType: retraction',
    );
    expect(within(inspector).getByTestId('reader-inspector-notices').textContent).toContain(
      '2020-06-04',
    );
    expect(within(inspector).getByTestId('reader-inspector-notices').textContent).toContain(
      'https://doi.org/10.1016/S0140-6736(20)31324-6',
    );
    expect(inspector.textContent).toContain('statement about the publication record'); // never about the citing document

    fireEvent.click(screen.getByTestId('reader-inspector-close'));
    expect(screen.queryByTestId('reader-inspector')).toBeNull();

    // Historical citation use: relation labeled precisely; never conferring support.
    fireEvent.click(screen.getByTestId('reader-inspect-cu-B-historical'));
    inspector = screen.getByTestId('reader-inspector');
    const historicalRelations =
      within(inspector).getByTestId('reader-inspector-relations').textContent ?? '';
    expect(historicalRelations).toContain('MENTIONS_HISTORICALLY');
    expect(historicalRelations).toContain('historically');
    expect(historicalRelations).not.toContain('CITATION_USE_SUPPORTS_CLAIM');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('reader-inspector')).toBeNull();

    // Reference occurrence: only POSSIBLE_MATCH — labeled unverified, never a match claim.
    fireEvent.click(screen.getByTestId('reader-inspect-ref-lee-2020'));
    inspector = screen.getByTestId('reader-inspector');
    const leeRelations = within(inspector).getByTestId('reader-inspector-relations').textContent ?? '';
    expect(leeRelations).toContain('possible match — unverified (POSSIBLE_MATCH)');
    expect(leeRelations).toContain('pub-lee-2020-candidate-a');
    expect(leeRelations).toContain('pub-lee-2020-candidate-b');
    expect(leeRelations).not.toContain('OCCURRENCE_MATCHES_PUBLICATION');
  });

  it('focus deep-link: ?focus=<nodeId> highlights that passage', async () => {
    stubReaderRoutes({ status: 200, body: buildReaderOverviewRecord() });
    renderReader('/reader?focus=claim-B');
    await waitReady();
    await waitFor(() =>
      expect(
        screen.getByTestId('reader-passage-claim-B').getAttribute('data-focused'),
      ).toBe('true'),
    );
    expect(screen.getByTestId('reader-passage-claim-A').getAttribute('data-focused')).toBeNull();
  });

  it('focus deep-link via #p-<nodeId> likewise highlights', async () => {
    stubReaderRoutes({ status: 200, body: buildReaderOverviewRecord() });
    renderReader('/reader#p-conclusion-C');
    await waitReady();
    await waitFor(() =>
      expect(
        screen.getByTestId('reader-passage-conclusion-C').getAttribute('data-focused'),
      ).toBe('true'),
    );
  });

  it('focus with an unknown node id highlights nothing (honest, no invention)', async () => {
    stubReaderRoutes({ status: 200, body: buildReaderOverviewRecord() });
    renderReader('/reader?focus=not-a-record');
    await waitReady();
    const focused = screen
      .getAllByTestId(/reader-passage-/)
      .some((node: HTMLElement) => node.getAttribute('data-focused') === 'true');
    expect(focused).toBe(false);
  });

  it('when the endpoint is missing or failing, the page says so honestly', async () => {
    stubReaderRoutes({ status: 404 });
    renderReader();
    await waitFor(() =>
      expect(screen.getByTestId('reader-missing').textContent).toMatch(/not available yet/i),
    );
    expect(screen.queryByTestId('reader-passage-claim-A')).toBeNull();
    expect(screen.getAllByTestId('reader-basis-disclosure')).toHaveLength(1);
  });

  it('API failure surfaces the exact failure and offers retry, faking nothing', async () => {
    stubReaderRoutes({ status: 500 });
    renderReader();
    await waitFor(() =>
      expect(screen.getByTestId('reader-failure').textContent).toMatch(/HTTP 500/),
    );
    expect(screen.queryByTestId('reader-passage-claim-A')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
