import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import IndependencePanel, {
  INDEPENDENCE_EMPTY_COPY,
  INDEPENDENCE_READONLY_COPY,
} from './IndependencePanel';
import { ApiHttpError, type IndependenceGroupsData, type IndependenceGroupsOutcome } from '../lib/api';
import { stubFetchByRoute } from '../test/mockFetch';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type ImplFn = (options?: { signal?: AbortSignal }) => Promise<IndependenceGroupsOutcome>;

type Impl = Mock<ImplFn>;

const CAVEAT =
  'Claims appearing in the same group share a supporting publication record. Sharing a supporting record means the claims are not independent evidence for each other — review them together at the paper itself. This alone never changes any review state.';

const LIMITATIONS = [
  'Only same-publication sharing is detected in this tier; shared datasets, analyses, or review trees are not detected (Find Evidence responses disclose the same limitation).',
  'Historical mentions never contribute to these groups; only supporting citation uses do.',
];

function readyBodyOf(overrides: Partial<IndependenceGroupsData> = {}): IndependenceGroupsData {
  return {
    graphName: 'aftershock-demo',
    seeded: true,
    seedVersion: 'seed-v3',
    summary: {
      supportingCitationUses: 3,
      publicationsSupportingClaims: 2,
      sharedGroups: 1,
    },
    groups: [
      {
        publication: {
          id: 'pub-mehra-2020',
          doi: '10.1016/j.mehra.2020',
          title: 'A retracted registry analysis',
          isSynthetic: true,
        },
        citationUseIds: ['cu-A-supporting', 'cu-B-supporting'],
        claimCount: 2,
        claims: [
          { id: 'claim-A', text: 'Agent P-9 was selected on the strength of the registry analysis.' },
          { id: 'claim-B', text: 'Mortality signal holds across subgroups.', status: 'needs_review' },
        ],
      },
    ],
    caveat: CAVEAT,
    limitations: LIMITATIONS,
    ...overrides,
  };
}

function readyOutcomeOf(data: IndependenceGroupsData) {
  return { available: true, data } as const;
}

describe('IndependencePanel — honest read-only states', () => {
  it('renders the summary, the shared group with its publication identity, claim chips, and the caveat + limitations VERBATIM', async () => {
    const impl: Impl = vi.fn<ImplFn>(() => Promise.resolve(readyOutcomeOf(readyBodyOf())));
    render(<IndependencePanel getIndependenceGroups={impl} />);

    await screen.findByTestId('independence-panel');

    // Real summary exactly as returned — zeros and ones stay visible.
    const summary = screen.getByTestId('independence-summary');
    expect(summary.textContent).toContain('3 supporting citation uses');
    expect(summary.textContent).toContain('2 publications supporting claims');
    expect(summary.textContent).toContain('1 shared group');
    expect(summary.textContent).toContain('aftershock-demo');
    expect(summary.textContent).toContain('seed seed-v3');

    // Publication identity: id, title, DOI.
    const group = screen.getByTestId('independence-group-pub-mehra-2020');
    expect(group.textContent).toContain('pub-mehra-2020');
    expect(group.textContent).toContain('A retracted registry analysis');
    expect(group.textContent).toContain('DOI 10.1016/j.mehra.2020');
    // Non-independence framing — a shared-support fact, never a verdict.
    expect(group.textContent).toContain('not independent evidence for each other');

    // Claim ids as plain chips, with fields the graph actually has.
    const chips = screen.getByTestId('independence-group-pub-mehra-2020-claims');
    expect(chips.textContent).toContain('claim-A');
    expect(chips.textContent).toContain('claim-B');
    expect(chips.textContent).toContain('needs_review');

    // Caveat and limitations shown verbatim (hard rule).
    expect(screen.getByTestId('independence-caveat').textContent).toBe(CAVEAT);
    const limitations = screen.getByTestId('independence-limitations');
    for (const limitation of LIMITATIONS) {
      expect(limitations.textContent).toContain(limitation);
    }

    // Read-only truth line present; no mutate affordance anywhere.
    expect(screen.getByTestId('independence-readonly-note').textContent).toBe(
      INDEPENDENCE_READONLY_COPY,
    );
    expect(screen.queryByTestId(/independence-(decide|flag|clear|verify)/)).toBeNull();

    // The read was issued with an abort signal and no body.
    expect(impl).toHaveBeenCalledTimes(1);
    expect(impl.mock.calls[0]![0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('labels isSynthetic === true with FICTIONAL / GUIDED DEMO, and a null flag as "not reported" (never assumed false)', async () => {
    const impl: Impl = vi.fn<ImplFn>(() =>
      Promise.resolve(
        readyOutcomeOf(
          readyBodyOf({
            groups: [
              {
                publication: { id: 'pub-synthetic', doi: undefined, title: undefined, isSynthetic: true },
                citationUseIds: ['cu-1', 'cu-2'],
                claimCount: 2,
                claims: [{ id: 'claim-1' }, { id: 'claim-2' }],
              },
              {
                publication: { id: 'pub-unflagged', doi: undefined, title: undefined, isSynthetic: null },
                citationUseIds: ['cu-3', 'cu-4'],
                claimCount: 2,
                claims: [{ id: 'claim-3' }, { id: 'claim-4' }],
              },
            ],
          }),
        ),
      ),
    );
    render(<IndependencePanel getIndependenceGroups={impl} />);

    const synthetic = await screen.findByTestId('independence-group-pub-synthetic-synthetic');
    expect(synthetic.textContent).toBe('FICTIONAL / GUIDED DEMO');
    expect(screen.getByTestId('independence-group-pub-unflagged-synthetic-unreported').textContent).toBe(
      'synthetic flag not reported',
    );
    // The unreported flag never upgrades to either chip: no FICTIONAL label
    // and no false "not synthetic" claim — the flag is genuinely not reported.
    screen.getByTestId('independence-group-pub-unflagged');
    expect(screen.queryByTestId('independence-group-pub-unflagged-synthetic')).toBeNull();
  });

  it('honest empty state (exact spec copy) when the graph answers with zero shared groups', async () => {
    const impl: Impl = vi.fn<ImplFn>(() =>
      Promise.resolve(
        readyOutcomeOf(
          readyBodyOf({
            summary: { supportingCitationUses: 2, publicationsSupportingClaims: 2, sharedGroups: 0 },
            groups: [],
          }),
        ),
      ),
    );
    render(<IndependencePanel getIndependenceGroups={impl} />);

    const empty = await screen.findByTestId('independence-empty');
    expect(empty.textContent).toBe(INDEPENDENCE_EMPTY_COPY);
    expect(screen.queryByTestId('independence-groups')).toBeNull();
    // Honest summary zeros remain visible even in the empty state.
    expect(screen.getByTestId('independence-summary').textContent).toContain('0 shared groups');
  });

  it('endpoint not wired (available: false) is an honest "not shown yet" state with a working Retry', async () => {
    let calls = 0;
    const impl: Impl = vi.fn<ImplFn>((options) => {
      calls += 1;
      if (calls === 1) return Promise.resolve({ available: false, reason: 'endpoint-missing' });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(readyOutcomeOf(readyBodyOf()));
    });
    render(<IndependencePanel getIndependenceGroups={impl} />);

    const missing = await screen.findByTestId('independence-missing');
    expect(missing.textContent).toContain('No independence endpoint answered');
    expect(missing.textContent).toContain('none are derived locally');
    expect(screen.queryByTestId('independence-empty')).toBeNull();

    // Retry re-reads — and a later real answer renders normally.
    await waitFor(() => screen.getByTestId('independence-retry'));
    fireEvent.click(screen.getByTestId('independence-retry'));
    await screen.findByTestId('independence-group-pub-mehra-2020');
    expect(calls).toBe(2);
  });

  it('HTTP 503 graph failure is a typed honest failure state; no group, claim or summary is fabricated', async () => {
    const impl: Impl = vi.fn<ImplFn>(() =>
      Promise.reject(new ApiHttpError(503, 'graph unreachable')),
    );
    render(<IndependencePanel getIndependenceGroups={impl} />);

    const failure = await screen.findByTestId('independence-failure-detail');
    expect(failure.textContent).toContain('HTTP 503');
    expect(failure.textContent).toContain('could not be read');
    expect(screen.queryByTestId('independence-groups')).toBeNull();
    expect(screen.queryByTestId('independence-empty')).toBeNull();
    expect(screen.queryByTestId('independence-summary')).toBeNull();
    // The standing read-only truth line remains even in the failure state.
    expect(screen.getByTestId('independence-readonly-note')).toBeTruthy();
    expect(screen.getByTestId('independence-retry')).toBeTruthy();
  });

  it('shows the loading state until the read resolves, and aborts the in-flight read on unmount', async () => {
    let aborted = false;
    const impl: Impl = vi.fn<ImplFn>((options) => {
      return new Promise((resolve) => {
        options?.signal?.addEventListener('abort', () => {
          aborted = true;
          // Resolves only BECAUSE of the abort; the late answer is discarded.
          resolve(readyOutcomeOf(readyBodyOf()));
        });
      });
    });
    const { unmount } = render(<IndependencePanel getIndependenceGroups={impl} />);

    const loading = screen.getByTestId('independence-loading');
    expect(loading.getAttribute('role')).toBe('status');
    expect(loading.textContent).toContain('Reading shared supporting publications');
    expect(screen.queryByTestId('independence-groups')).toBeNull();

    unmount();
    await waitFor(() => expect(aborted).toBe(true));
    // The late resolution must not have leaked a group into a detached panel.
    expect(screen.queryByTestId('independence-group-pub-mehra-2020')).toBeNull();
  });
});

describe('IndependencePanel — tolerant parse honesty (real client via stubbed fetch)', () => {
  function stubIndependenceRoute(body: unknown, status = 200) {
    stubFetchByRoute((url) => (url.includes('independence-groups') ? { status, body } : undefined));
  }

  it('malformed members drop honestly (missing publication id / non-numeric claimCount / claim without id); the well-formed group still renders with de-duplicated ids', async () => {
    stubIndependenceRoute({
      graphName: 'aftershock-demo',
      seeded: true,
      seedVersion: 'seed-v3',
      summary: { supportingCitationUses: 3, publicationsSupportingClaims: 2, sharedGroups: 1 },
      groups: [
        {
          publication: { id: 'pub-mehra-2020', doi: null, title: null, isSynthetic: false },
          citationUseIds: ['cu-A', 'cu-A', 'cu-B'],
          claimCount: 2,
          claims: [{ id: 'claim-A', text: null }, { notAnId: true }, { id: 'claim-B' }],
        },
        { publication: null, claimCount: 3, claims: [] },
        { publication: { id: 'x' } },
        'garbage',
      ],
      caveat: CAVEAT,
      limitations: LIMITATIONS,
    });
    render(<IndependencePanel />);

    // The well-formed group survives (exactly one); malformed ones drop.
    const groupsList = await screen.findByTestId('independence-groups');
    expect(groupsList.children).toHaveLength(1);
    expect(screen.getByTestId('independence-group-pub-mehra-2020')).toBeTruthy();

    // Repeated citation-use ids de-duplicate.
    expect(screen.getByTestId('independence-group-pub-mehra-2020-uses').textContent).toContain(
      'cu-A, cu-B',
    );
    // A claim with no text and no status is honest about it — never guessed.
    expect(screen.getByTestId('independence-group-pub-mehra-2020-claims').textContent).toContain(
      'claim-A',
    );
    expect(
      screen.getByTestId('independence-group-pub-mehra-2020').textContent,
    ).toContain('text/status not recorded');
    // No invented identity for the dropped groups.
    expect(screen.queryByTestId('independence-group-x')).toBeNull();
  });

  it('a missing numeric summary counter is a typed failure (never parsed as zeros) — mockFetch parity with the live contract', async () => {
    stubIndependenceRoute({
      graphName: 'aftershock-demo',
      summary: { supportingCitationUses: 1 },
      groups: [],
    });
    render(<IndependencePanel />);

    const failure = await screen.findByTestId('independence-failure-detail');
    expect(failure.textContent).toContain('missing a numeric `publicationsSupportingClaims`');
    expect(screen.queryByTestId('independence-summary')).toBeNull();
    expect(screen.queryByTestId('independence-empty')).toBeNull();
  });

  it('HTTP 404 from a missing function resolves to an honest "not available yet" missing state', async () => {
    stubIndependenceRoute({ error: 'not found' }, 404);
    render(<IndependencePanel />);

    const missing = await screen.findByTestId('independence-missing');
    expect(missing.textContent).toContain('No independence endpoint answered');
    expect(screen.queryByTestId('independence-groups')).toBeNull();
  });
});
