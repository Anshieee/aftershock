import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RevisionProposalPanel from './RevisionProposalPanel';
import { stubFetchByRoute } from '../test/mockFetch';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ORIGINAL =
  'Agent P-9 was selected on the strength of the registry analysis we cite (Mehra et al., 2020), which we read as establishing a drug-treatment mortality signal in the target cohort.';

const PROPOSAL_OK = {
  proposalId: 'prop-1',
  caseId: 'claim-A',
  originalText: ORIGINAL,
  proposedText:
    'Agent P-9 was selected based on the registry analysis we cite, pending confirmation of its findings.',
  rationale: 'Removed reliance on the retracted Mehra et al. (2020) registry analysis.',
  status: 'draft' as const,
  createdAt: '2026-10-19T10:05:00.000Z',
};

function stubPanel(status: number, body: unknown) {
  return stubFetchByRoute((url) => {
    if (url.includes('review-revision')) return { status, body };
    return undefined;
  });
}

function renderPanel(props: Partial<{ originalText: string; kindLabel: string }> = {}) {
  const onAccepted = vi.fn();
  render(
    <RevisionProposalPanel
      caseId="claim-A"
      originalText={props.originalText ?? ORIGINAL}
      kindLabel={props.kindLabel ?? 'claim'}
      onAccepted={onAccepted}
    />,
  );
  return { onAccepted };
}

function typeProposed(text = PROPOSAL_OK.proposedText) {
  fireEvent.change(screen.getByTestId('revision-proposal-proposed-text'), {
    target: { value: text },
  });
}

describe('RevisionProposalPanel — draft flow with immutable original', () => {
  it('original (immutable blockquote) vs proposed (empty textarea); propose needs text', () => {
    renderPanel();

    const original = screen.getByTestId('revision-proposal-original-text');
    expect(original.tagName).toBe('BLOCKQUOTE');
    expect(original.textContent).toContain('Agent P-9 was selected');

    const proposed = screen.getByTestId(
      'revision-proposal-proposed-text',
    ) as HTMLTextAreaElement;
    expect(proposed.tagName).toBe('TEXTAREA');
    expect(proposed.value).toBe('');

    expect(screen.getByTestId('revision-proposal-status').textContent).toBe('Not proposed');
    const propose = screen.getByTestId('revision-proposal-propose') as HTMLButtonElement;
    expect(propose.disabled).toBe(true);
    expect(screen.getByText(/never edits the original passage/)).toBeTruthy();
  });

  it('empty original renders the honest no-text note, still read-only', () => {
    renderPanel({ originalText: '' });
    expect(screen.getByTestId('revision-proposal-original-text').textContent).toBe(
      'No text recorded on the returned record.',
    );
  });

  it('propose creates a real draft via POST, then accept is an explicit human step', async () => {
    const calls = stubPanel(200, PROPOSAL_OK);
    const { onAccepted } = renderPanel();
    typeProposed();
    fireEvent.change(screen.getByTestId('revision-proposal-rationale'), {
      target: { value: PROPOSAL_OK.rationale },
    });
    fireEvent.click(screen.getByTestId('revision-proposal-propose'));

    await waitFor(() =>
      expect(screen.getByTestId('revision-proposal-status').textContent).toContain('Draft'),
    );

    const sent = calls.filter((call) => call.url.includes('review-revision'));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.init!.method).toBe('POST');
    expect(sent[0]!.url).toContain('/.netlify/functions/review-revision?caseId=claim-A');
    const body = JSON.parse(sent[0]!.init!.body as string);
    expect(body).toMatchObject({
      proposedText: PROPOSAL_OK.proposedText,
      rationale: PROPOSAL_OK.rationale,
    });

    // The server's returned proposal is echoed, including its draft status.
    const detail = document.body.textContent ?? '';
    expect(detail).toContain('prop-1');
    expect(detail).toContain('draft');

    // Copy is offered; accept is the explicit human step and is reported.
    expect(screen.getByTestId('revision-proposal-copy')).toBeTruthy();
    fireEvent.click(screen.getByTestId('revision-proposal-accept'));
    expect(screen.getByTestId('revision-proposal-status').textContent).toContain('Accepted');
    expect(screen.getByText(/user-reported/)).toBeTruthy();
    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(onAccepted).toHaveBeenCalledWith(PROPOSAL_OK);
  });

  it('copy copies the proposed text and says copy ≠ applied', async () => {
    stubPanel(200, PROPOSAL_OK);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderPanel();
    typeProposed();
    fireEvent.click(screen.getByTestId('revision-proposal-propose'));
    await waitFor(() =>
      expect(screen.getByTestId('revision-proposal-status').textContent).toContain('Draft'),
    );

    fireEvent.click(screen.getByTestId('revision-proposal-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(PROPOSAL_OK.proposedText));
    expect(screen.getByTestId('revision-proposal-copy').textContent).toBe('Copied!');
  });

  it('while proposing: aria-busy on the propose button and locked inputs', async () => {
    let resolvePropose: ((response: Response) => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolvePropose = resolve;
          }),
      ),
    );
    renderPanel();
    typeProposed();
    fireEvent.click(screen.getByTestId('revision-proposal-propose'));

    const propose = screen.getByTestId('revision-proposal-propose') as HTMLButtonElement;
    await waitFor(() => expect(propose.getAttribute('aria-busy')).toBe('true'));
    expect(propose.disabled).toBe(true);
    expect(
      (screen.getByTestId('revision-proposal-proposed-text') as HTMLTextAreaElement).disabled,
    ).toBe(true);

    await act(async () => {
      resolvePropose!(
        new Response(JSON.stringify(PROPOSAL_OK), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('revision-proposal-status').textContent).toContain('Draft'),
    );
  });

  it('typed failure copies are distinct (400/429/500) with a retry affordance', async () => {
    const cases: Array<{ status: number; match: RegExp }> = [
      { status: 400, match: /HTTP 400/ },
      { status: 429, match: /Rate limited \(HTTP 429\).*[Ww]ait.*cooldown.*no proposal was created\./i },
      { status: 500, match: /unavailable \(server error\).*no proposal was created\./i },
    ];
    for (const example of cases) {
      stubPanel(example.status, { error: 'x' });
      const { unmount } = render(
        <RevisionProposalPanel caseId="claim-A" originalText={ORIGINAL} />,
      );
      typeProposed('Some replacement wording.');
      fireEvent.click(screen.getByTestId('revision-proposal-propose'));
      const banner = await screen.findByTestId('revision-proposal-error');
      expect(banner.textContent, `status ${example.status} copy`).toMatch(example.match);
      expect(screen.getByTestId('revision-proposal-retry')).toBeTruthy();
      unmount();
    }
  });

  it('timeout and network failures are typed, honest, and retryable', async () => {
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new DOMException('The operation was aborted.', 'AbortError');
        throw new TypeError('Failed to fetch');
      }),
    );
    render(
      <RevisionProposalPanel caseId="claim-A" originalText={ORIGINAL} />,
    );
    typeProposed('Replacement text.');

    fireEvent.click(screen.getByTestId('revision-proposal-propose'));
    const banner = await screen.findByTestId('revision-proposal-error');
    expect(banner.textContent).toMatch(/timeout/i);
    expect(banner.textContent).toMatch(/no proposal was created\./i);

    // Retry hits the network-failure path — both typed, both honest.
    await waitFor(() => expect(attempts).toBe(1));
    fireEvent.click(screen.getByTestId('revision-proposal-retry'));
    await waitFor(() => expect(attempts).toBe(2));
    // The banner is re-created between attempts; query it fresh each poll.
    await waitFor(() =>
      expect(screen.getByTestId('revision-proposal-error').textContent).toMatch(
        /Network error/,
      ),
    );
  });
});
