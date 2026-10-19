import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FindEvidencePanel, {
  EMPTY_PROVIDERS_COPY,
  FOOTER_DISCLOSURE,
} from './FindEvidencePanel';
import {
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  MAX_EVIDENCE_QUERY_CHARS,
  type EvidenceFindResult,
} from '../lib/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

const CLAIM_TEXT =
  'Agent P-9 was selected on the strength of the registry analysis we cite (Mehra et al., 2020), which we read as establishing a drug-treatment mortality signal in the target cohort.';

const CAVEATS = [
  'Candidates come from public bibliographic metadata (Crossref). Relevance ranking is the provider’s bibliographic relevance — not a statement that a paper supports the claim.',
  'Finding a publication never proves a claim; assessing support/contrast is human work done at the paper itself.',
  'Independence between candidates is not verified by this search: different DOIs can still share datasets, analyses or review trees.',
  'Full text is not fetched. Only bibliographic metadata and a DOI link are returned.',
  'This search does not modify citations, review states, or the manuscript.',
];

const PREPARE_OK: EvidenceFindResult = {
  mode: 'prepare',
  claimId: 'claim-A',
  claimText: CLAIM_TEXT,
  label: 'Claim',
  manuscriptId: 'doc-demo-manuscript',
  concern: {
    summary: 'The supporting citation use points at a publication with a verified retraction notice.',
    direction: 'direct',
  },
  suggestedQuery: 'registry analysis drug-treatment mortality cohort P-9',
  queryEditable: true,
  providers: [
    {
      id: 'crossref',
      displayName: 'Crossref',
      scopeNote: 'public bibliographic metadata',
      landingUrl: 'https://www.crossref.org',
    },
  ],
  caveats: CAVEATS,
};

type SearchPayload = Extract<EvidenceFindResult, { mode: 'search' }>;

function searchResultOf(overrides: Partial<SearchPayload> = {}): SearchPayload {
  return {
    mode: 'search',
    claimId: 'claim-A',
    claimText: CLAIM_TEXT,
    label: 'Claim',
    manuscriptId: 'doc-demo-manuscript',
    concern: PREPARE_OK.concern,
    query: 'registry analysis drug-treatment mortality cohort P-9',
    candidates: [
      {
        candidateId: 'doi:10.1016/S0140-6736(20)31180-6',
        doi: '10.1016/S0140-6736(20)31180-6',
        title:
          'Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis',
        authors: ['Mehra M.R.', 'Patel S.S.'],
        year: 2020,
        container: 'The Lancet',
        publicationType: 'journal-article',
        publisher: 'Elsevier',
        isSynthetic: false,
        retractionStatus: 'notice_present',
        evidenceRelationship: 'unverified',
        independence: 'unknown',
        fullTextAvailability: 'unknown',
        relevanceBasis:
          "Retrieved by Crossref bibliographic relevance for 'registry analysis drug-treatment mortality cohort P-9' — a metadata match only; support/contrast relationships are unverified.",
        urls: { sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31180-6' },
      },
      {
        candidateId: 'candidate-2',
        title: 'Outcome modelling after respiratory support adjustment',
        authors: [],
        year: 2021,
        publicationType: 'preprint',
        isSynthetic: false,
        retractionStatus: 'unknown',
      },
    ],
    providersStatus: [{ id: 'crossref', status: 'ok' }],
    providers: PREPARE_OK.providers,
    caveats: CAVEATS,
    searchedAt: '2026-10-19T05:00:00.000Z',
    ...overrides,
  };
}

type ImplFn = (
  claimId: string,
  opts?: { query?: string; signal?: AbortSignal },
) => Promise<EvidenceFindResult>;

type Impl = Mock<ImplFn>;

/** Mode-switching mock impl used by most tests: prepare + search both succeed. */
function stagedImpl(overrides: Partial<SearchPayload> = {}): Mock<ImplFn> {
  return vi.fn<ImplFn>((_claimId, opts) =>
    Promise.resolve(opts?.query !== undefined ? searchResultOf(overrides) : PREPARE_OK),
  );
}

describe('FindEvidencePanel — staged honest flow', () => {
  it('prepare auto-loads on open: verbatim claim text, concern chips, prefilled query, and the FULL caveats render BEFORE any search', async () => {
    const impl = vi.fn<ImplFn>((_claimId, opts) => {
      expect(opts?.query).toBeUndefined();
      return Promise.resolve(PREPARE_OK);
    });
    render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={impl} />);

    // Loading state first, honest about what is (not) happening.
    expect(screen.getByTestId('find-evidence-loading').textContent).toMatch(/no external/i);

    await waitFor(() => screen.getByTestId('find-evidence-search'));

    const claimText = screen.getByTestId('find-evidence-claim-text');
    expect(claimText.tagName).toBe('BLOCKQUOTE');
    expect(claimText.textContent).toContain(CLAIM_TEXT);
    expect(screen.getByTestId('find-evidence-concern-summary').textContent).toContain('verified retraction notice');
    expect(screen.getByTestId('find-evidence-concern-direction').textContent).toContain('relation: direct');

    const query = screen.getByTestId('find-evidence-query') as HTMLTextAreaElement;
    expect(query.value).toBe('registry analysis drug-treatment mortality cohort P-9');

    // Caveats fully rendered before the search affordance is used.
    const caveats = screen.getByTestId('find-evidence-caveats');
    for (const caveat of CAVEATS) expect(caveats.textContent).toContain(caveat);

    // No candidate card can exist from a prepare answer.
    expect(screen.queryByTestId(/find-evidence-candidate-\d+-status/)).toBeNull();

    // Footer disclosure visible, providers listed, search enabled with the valid suggested query.
    expect(screen.getByTestId('find-evidence-footer-disclosure').textContent).toBe(FOOTER_DISCLOSURE);
    expect(screen.getByTestId('find-evidence-provider-listed-crossref').textContent).toContain('Crossref');
    expect((screen.getByTestId('find-evidence-search') as HTMLButtonElement).disabled).toBe(false);
    expect(impl.mock.calls[0]![0]).toBe('claim-A');
  });

  it('search renders candidate cards with every contract field and the fixed honest status row', async () => {
    const impl = stagedImpl();
    render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={impl} />);

    await waitFor(() => screen.getByTestId('find-evidence-search'));
    fireEvent.click(screen.getByTestId('find-evidence-search'));

    await waitFor(() => screen.getByTestId('find-evidence-candidate-0'));

    const searchCall = impl.mock.calls.find(([, opts]) => opts?.query !== undefined);
    expect(searchCall![1]!.query).toBe('registry analysis drug-treatment mortality cohort P-9');

    expect(screen.getByTestId('find-evidence-searched-at').textContent).toContain('2026-10-19T05:00:00.000Z');

    expect(screen.getByTestId('find-evidence-candidate-0').textContent).toContain(
      'Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis',
    );
    expect(screen.getByTestId('find-evidence-candidate-0').textContent).toContain('Mehra M.R., Patel S.S.');
    expect(screen.getByTestId('find-evidence-candidate-0').textContent).toContain('2020');
    expect(screen.getByTestId('find-evidence-candidate-0').textContent).toContain('The Lancet');
    expect(screen.getByTestId('find-evidence-candidate-0').textContent).toContain('type: journal-article');
    expect(screen.getByTestId('find-evidence-candidate-0').textContent).toContain('Publisher: Elsevier');

    // DOI link: external, new tab, noopener.
    const doi = screen.getByTestId('find-evidence-candidate-0-doi') as HTMLAnchorElement;
    expect(doi.getAttribute('href')).toBe('https://doi.org/10.1016/S0140-6736(20)31180-6');
    expect(doi.getAttribute('target')).toBe('_blank');
    expect(doi.getAttribute('rel')).toMatch(/noopener/);

    // REAL METADATA chip (isSynthetic:false) — sage, the confirmed-real token.
    expect(screen.getByTestId('find-evidence-candidate-0-chip-real').textContent).toBe('REAL METADATA');
    expect(screen.getByTestId('find-evidence-candidate-0-chip-real').className).toContain('border-reviewed');

    // relevanceBasis verbatim.
    expect(screen.getByTestId('find-evidence-candidate-0').textContent).toContain(
      'a metadata match only; support/contrast relationships are unverified.',
    );

    // Fixed status row: constants verbatim, retraction notice on card 0 only.
    expect(screen.getByTestId('find-evidence-candidate-0-status').textContent).toContain(
      'relationship unverified · independence unknown · full text unknown · retraction notice_present',
    );
    expect(screen.getByTestId('find-evidence-candidate-0-status').textContent).toContain('Retraction notice present');

    // Card 1: missing fields stay honest, never guessed.
    expect(screen.getByTestId('find-evidence-candidate-1').textContent).toContain('No authors recorded');
    expect(screen.getByTestId('find-evidence-candidate-1').textContent).toContain('venue not recorded');
    expect(screen.getByTestId('find-evidence-candidate-1-doi-missing').textContent).toContain('No DOI link returned');
    expect(screen.getByTestId('find-evidence-candidate-1-status').textContent).toContain('retraction unknown');
    expect(screen.getByTestId('find-evidence-candidate-1-status').textContent).not.toContain('notice_present');

    // Providers status ok row rendered.
    expect(screen.getByTestId('find-evidence-provider-crossref').textContent).toContain('crossref');
    expect(screen.getByTestId('find-evidence-provider-crossref').textContent).toContain('ok');

    // No "mark as supported"-style mutation affordance anywhere (hard rule).
    expect(screen.queryByTestId(/supported/)).toBeNull();
  });

  it('empty provider result is honest, not an error: exact spec copy', async () => {
    const impl = stagedImpl({
      candidates: [],
      providersStatus: [{ id: 'crossref', status: 'empty' }],
    });
    render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={impl} />);
    await waitFor(() => screen.getByTestId('find-evidence-search'));
    fireEvent.click(screen.getByTestId('find-evidence-search'));

    const empty = await screen.findByTestId('find-evidence-empty');
    expect(empty.textContent).toContain(EMPTY_PROVIDERS_COPY);
    expect(screen.queryByTestId(/find-evidence-candidate-\d+/)).toBeNull();
    expect(screen.getByTestId('find-evidence-provider-crossref').textContent).toContain('empty');
  });

  it('provider timeout inside a 200 search reads as missing results (not an error) and names the retried attempt', async () => {
    const impl = stagedImpl({
      candidates: [],
      providersStatus: [
        { id: 'crossref', status: 'timeout', retried: true, message: 'AbortError from crossref' },
      ],
    });
    render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={impl} />);
    await waitFor(() => screen.getByTestId('find-evidence-search'));
    fireEvent.click(screen.getByTestId('find-evidence-search'));

    const row = await screen.findByTestId('find-evidence-provider-crossref');
    expect(row.textContent).toContain('timeout');
    expect(row.textContent).toMatch(/timed out/i);
    expect(row.textContent).toMatch(/missing/i); // missing, not zero
    expect(row.textContent).toContain('One retry was already attempted');
    expect(row.textContent).toContain('AbortError from crossref');
    expect(await screen.findByTestId('find-evidence-empty')).toBeTruthy();
  });

  it('enforces ≤400 chars client-side: Search disabled for an empty query and shows the over-limit hint without sending anything', async () => {
    const impl = stagedImpl();
    render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={impl} />);
    await waitFor(() => screen.getByTestId('find-evidence-search'));

    const search = screen.getByTestId('find-evidence-search') as HTMLButtonElement;
    const query = screen.getByTestId('find-evidence-query') as HTMLTextAreaElement;
    const hint = () => screen.getByTestId('find-evidence-query-hint');

    // Prepare prefill is valid → search enabled.
    expect(search.disabled).toBe(false);

    // Cleared query → disabled with a required hint.
    fireEvent.change(query, { target: { value: '' } });
    expect(search.disabled).toBe(true);
    expect(hint().textContent).toMatch(/required/i);

    // Over 400 chars → disabled, honest over-limit hint, and NO call sent.
    fireEvent.change(query, { target: { value: 'x'.repeat(MAX_EVIDENCE_QUERY_CHARS + 1) } });
    expect(search.disabled).toBe(true);
    expect(hint().textContent).toMatch(/over the 400-character limit/);
    fireEvent.click(search);
    expect(impl.mock.calls.filter(([, opts]) => opts?.query !== undefined)).toHaveLength(0);

    // Exactly 400 chars → valid again.
    fireEvent.change(query, { target: { value: 'y'.repeat(MAX_EVIDENCE_QUERY_CHARS) } });
    expect(search.disabled).toBe(false);
    fireEvent.click(search);
    await waitFor(() =>
      expect(impl.mock.calls.filter(([, opts]) => opts?.query !== undefined)).toHaveLength(1),
    );
  });

  it('the search request carries the client-trimmed query; the textarea then carries the SERVER\'s used copy', async () => {
    const impl = stagedImpl({ query: 'trimmed server query' });
    render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={impl} />);
    await waitFor(() => screen.getByTestId('find-evidence-search'));
    fireEvent.change(screen.getByTestId('find-evidence-query'), {
      target: { value: '  padded user text  ' },
    });
    fireEvent.click(screen.getByTestId('find-evidence-search'));
    await waitFor(() => screen.getByTestId('find-evidence-candidate-0'));
    // The client trims before sending (honest bound on visible characters).
    expect(impl.mock.calls.find(([, opts]) => opts?.query !== undefined)![1]!.query).toBe('padded user text');
    expect((screen.getByTestId('find-evidence-query') as HTMLTextAreaElement).value).toBe('trimmed server query');
  });

  it('closing the panel while a search is in flight aborts the request — no orphaned work', async () => {
    let abortObserved = false;
    const impl: Impl = vi.fn<ImplFn>((_claimId, opts) => {
      if (opts?.query !== undefined) {
        return new Promise((resolve) => {
          opts?.signal?.addEventListener('abort', () => {
            abortObserved = true;
            resolve(searchResultOf()); // resolves only BECAUSE of the abort; result must be ignored
          });
        });
      }
      return Promise.resolve(PREPARE_OK);
    });
    const onClose = vi.fn();
    const { rerender } = render(
      <FindEvidencePanel claimId="claim-A" open onClose={onClose} findEvidence={impl} />,
    );
    await waitFor(() => screen.getByTestId('find-evidence-search'));
    fireEvent.click(screen.getByTestId('find-evidence-search'));

    const searchCall = impl.mock.calls.find(([, opts]) => opts?.query !== undefined)!;
    const signal = searchCall[1]!.signal!;
    expect(signal.aborted).toBe(false);

    // Close = the parent flips `open`, which unmounts the panel and aborts.
    rerender(<FindEvidencePanel claimId="claim-A" open={false} onClose={onClose} findEvidence={impl} />);
    await waitFor(() => expect(signal.aborted).toBe(true));
    await waitFor(() => expect(abortObserved).toBe(true));
  });

  it('a11y contract: role=dialog, modal, labelled, Escape calls onClose; closed panel renders nothing', async () => {
    const impl = stagedImpl();
    const onClose = vi.fn();
    const { rerender } = render(
      <FindEvidencePanel claimId="claim-A" open onClose={onClose} findEvidence={impl} />,
    );
    await waitFor(() => screen.getByTestId('find-evidence-search'));

    const dialog = screen.getByTestId('find-evidence-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('find-evidence-title');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<FindEvidencePanel claimId="claim-A" open={false} onClose={onClose} findEvidence={impl} />);
    expect(screen.queryByTestId('find-evidence-dialog')).toBeNull();
  });

  it('prepare failures are typed and honest (503 graph), with a working Retry that re-runs prepare', async () => {
    let prepareCalls = 0;
    const impl: Impl = vi.fn<ImplFn>((_claimId, opts) => {
      if (opts?.query === undefined) {
        prepareCalls += 1;
        if (prepareCalls === 1) return Promise.reject(new ApiHttpError(503, 'graph unreachable'));
        return Promise.resolve(PREPARE_OK);
      }
      return Promise.resolve(searchResultOf());
    });
    render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={impl} />);

    const banner = await screen.findByTestId('find-evidence-error');
    expect(banner.textContent).toContain('HTTP 503');
    expect(banner.textContent).toMatch(/could not be prepared/i);
    expect(screen.queryByTestId('find-evidence-claim-text')).toBeNull();

    fireEvent.click(screen.getByTestId('find-evidence-retry'));
    await waitFor(() => screen.getByTestId('find-evidence-search'));
    expect(screen.getByTestId('find-evidence-claim-text')).toBeTruthy();
    expect(prepareCalls).toBe(2);
  });

  it('network and timeout failures are typed, never success-shaped', async () => {
    const network: Impl = vi.fn<ImplFn>(() => Promise.reject(new ApiNetworkError('Failed to fetch')));
    const { unmount } = render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={network} />);
    const banner = await screen.findByTestId('find-evidence-error');
    expect(banner.textContent).toMatch(/did not reach the evidence-find API/);
    expect(banner.textContent).toMatch(/nothing changed/i);
    unmount();

    const timeout: Impl = vi.fn<ImplFn>(() => Promise.reject(new ApiTimeoutError()));
    render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={timeout} />);
    const banner2 = await screen.findByTestId('find-evidence-error');
    expect(banner2.textContent).toMatch(/10 seconds \(timeout\)/);
    expect(screen.queryByTestId(/find-evidence-candidate-\d+-status/)).toBeNull();
  });

  it('search failure after a successful prepare keeps the prepared data visible and Retry re-runs the search only', async () => {
    let failSearch = true;
    const impl: Impl = vi.fn<ImplFn>((_claimId, opts) => {
      if (opts?.query !== undefined) {
        return failSearch
          ? Promise.reject(new ApiHttpError(429, 'rate limited'))
          : Promise.resolve(searchResultOf());
      }
      return Promise.resolve(PREPARE_OK);
    });
    render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={impl} />);
    await waitFor(() => screen.getByTestId('find-evidence-search'));
    fireEvent.click(screen.getByTestId('find-evidence-search'));

    const banner = await screen.findByTestId('find-evidence-error');
    expect(banner.textContent).toContain('429');
    expect(banner.textContent).toMatch(/cooldown/i);
    // The prepared claim data stays visible during a search failure (no data wipe).
    expect(screen.getByTestId('find-evidence-claim-text')).toBeTruthy();

    failSearch = false;
    fireEvent.click(screen.getByTestId('find-evidence-retry'));
    await waitFor(() => screen.getByTestId('find-evidence-candidate-0'));
    expect(screen.queryByTestId('find-evidence-error')).toBeNull();
  });
});

describe('FindEvidencePanel — optional origin context (M7 Priority B)', () => {
  it('renders zero origin UI when the prop is absent (review-queue flow stays byte-compatible)', async () => {
    const impl = stagedImpl();
    render(<FindEvidencePanel claimId="claim-A" open onClose={vi.fn()} findEvidence={impl} />);
    await waitFor(() => screen.getByTestId('find-evidence-search'));

    expect(screen.queryByTestId('find-evidence-origin')).toBeNull();
    expect(screen.queryByTestId('find-evidence-origin-label')).toBeNull();
    expect(screen.queryByTestId('find-evidence-origin-return')).toBeNull();
    expect(screen.queryByTestId('find-evidence-review-queue')).toBeNull();
  });

  it('renders "From: <label>" when origin is provided, without a return link when backHref is absent', async () => {
    const impl = stagedImpl();
    render(
      <MemoryRouter>
        <FindEvidencePanel
          claimId="claim-A"
          open
          onClose={vi.fn()}
          findEvidence={impl}
          origin={{ label: 'Results — affected claim claim-A' }}
        />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByTestId('find-evidence-search'));

    expect(screen.getByTestId('find-evidence-origin-label').textContent).toBe(
      'Results — affected claim claim-A',
    );
    expect(screen.queryByTestId('find-evidence-origin-return')).toBeNull();
    // The rest of the panel flow is unaffected by the origin header.
    expect(screen.getByTestId('find-evidence-claim-text').textContent).toContain(CLAIM_TEXT);
    expect(screen.getByTestId('find-evidence-footer-disclosure').textContent).toBe(FOOTER_DISCLOSURE);
  });

  it('renders the return link only when backHref is provided, and it closes the panel', async () => {
    const impl = stagedImpl();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <FindEvidencePanel
          claimId="claim-A"
          open
          onClose={onClose}
          findEvidence={impl}
          origin={{ label: 'Results — affected claim claim-A', backHref: '/results' }}
        />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByTestId('find-evidence-search'));

    const back = screen.getByTestId('find-evidence-origin-return') as HTMLAnchorElement;
    expect(back.getAttribute('href')).toBe('/results');
    // Keyboard reachable; activating it leaves the dialog (closes first).
    expect(back.tagName).toBe('A');
    fireEvent.click(back);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers the review-queue link for the same case, framed as viewing-only navigation', async () => {
    const impl = stagedImpl();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <FindEvidencePanel
          claimId="claim-A"
          open
          onClose={onClose}
          findEvidence={impl}
          origin={{ label: 'Results — affected claim claim-A' }}
        />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByTestId('find-evidence-search'));

    const queueLink = screen.getByTestId('find-evidence-review-queue') as HTMLAnchorElement;
    expect(queueLink.getAttribute('href')).toBe('/review-queue');
    expect(queueLink.textContent).toBe('Open review queue');
    // It must NOT read as a state-changing action, and the label is exact.
    expect(queueLink.getAttribute('aria-label')).toBe(
      'Open review queue for case claim-A (viewing only)',
    );
    fireEvent.click(queueLink);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
