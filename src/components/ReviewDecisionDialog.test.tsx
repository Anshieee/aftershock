import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReviewDecisionDialog from './ReviewDecisionDialog';
import { stubFetchByRoute } from '../test/mockFetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ITEM = {
  id: 'claim-A',
  kind: 'claim' as const,
  reviewKind: 'direct_evidence_review' as const,
  text: 'Agent P-9 was selected on the strength of the registry analysis we cite (Mehra et al., 2020).',
};

const DECISION_OK = {
  decisionId: 'dec-77',
  caseId: 'claim-A',
  outcome: 'revision_needed' as const,
  explanation: 'The Mehra support is retracted; reword before relying on it.',
  reviewer: 'A. Reviewer',
  decidedAt: '2026-10-19T10:00:00.000Z',
  // Real server shape: before/after states serialized as JSON strings.
  beforeState: JSON.stringify({ reviewState: 'awaiting_review', flags: [] }),
  afterState: JSON.stringify({ reviewState: 'review_recorded', flags: ['revision_pending'] }),
};

function renderDialog(alreadyRecorded: boolean = false) {
  const onClose = vi.fn();
  const onDecisionRecorded = vi.fn();
  render(
    <ReviewDecisionDialog
      item={ITEM}
      open
      alreadyRecorded={alreadyRecorded}
      onClose={onClose}
      onDecisionRecorded={onDecisionRecorded}
    />,
  );
  return { onClose, onDecisionRecorded };
}

/** Fill the form minimally-but-meaningfully and submit. */
async function fillAndSubmit(explanation = DECISION_OK.explanation) {
  fireEvent.click(screen.getByTestId('review-decision-outcome-revision_needed'));
  fireEvent.change(screen.getByTestId('review-decision-explanation'), {
    target: { value: explanation },
  });
  fireEvent.click(screen.getByTestId('review-decision-submit'));
}

describe('ReviewDecisionDialog — validation and honest states', () => {
  it('shows the original text as an immutable blockquote and never in an editable field', () => {
    renderDialog();

    const original = screen.getByTestId('review-decision-dialog-original-text');
    expect(original.tagName).toBe('BLOCKQUOTE');
    expect(original.textContent).toContain('Agent P-9 was selected');
    expect(original.getAttribute('contenteditable')).toBeNull();

    const editables = Array.from(
      document.querySelectorAll('input, textarea'),
    ) as (HTMLInputElement | HTMLTextAreaElement)[];
    expect(editables.every((el) => !(el.value ?? '').includes('Agent P-9 was selected'))).toBe(
      true,
    );
  });

  it('requires an explanation: submit without rationale fires no request and shows the inline error', async () => {
    const calls = stubFetchByRoute(() => ({ status: 200, body: DECISION_OK }));
    renderDialog();

    fireEvent.click(screen.getByTestId('review-decision-outcome-not_affected'));
    // No rationale typed — the inline validation error is visible immediately.
    expect(screen.getByTestId('review-decision-rationale-error')).toBeTruthy();
    expect(screen.getByTestId('review-decision-rationale-error').textContent).toMatch(
      /required/i,
    );

    // Submit is disabled without a rationale: no network call can happen.
    expect((screen.getByTestId('review-decision-submit') as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByTestId('review-decision-submit'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.filter((call) => call.url.includes('review-decide'))).toHaveLength(0);

    // With a rationale the submit becomes possible.
    fireEvent.change(screen.getByTestId('review-decision-explanation'), {
      target: { value: 'The registered support was retracted.' },
    });
    expect((screen.getByTestId('review-decision-submit') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('while recording: submit is aria-busy, label switches, and the form is locked', async () => {
    let resolveFetch: ((response: Response) => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    renderDialog();
    await fillAndSubmit();

    const submit = screen.getByTestId('review-decision-submit') as HTMLButtonElement;
    await waitFor(() => expect(submit.getAttribute('aria-busy')).toBe('true'));
    expect(submit.textContent).toBe('Recording decision…');
    expect(submit.disabled).toBe(true);
    expect(
      (screen.getByTestId('review-decision-outcome-revision_needed') as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await act(async () => {
      resolveFetch!(
        new Response(JSON.stringify(DECISION_OK), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    await waitFor(() => expect(screen.getByTestId('review-decision-done')).toBeTruthy());
    await waitFor(() => expect(submit.getAttribute('aria-busy')).not.toBe('true'));
  });

  it('success: posts the payload, renders the SERVER response incl. before→after, notifies the parent once', async () => {
    const calls = stubFetchByRoute((url) =>
      url.includes('review-decide') ? { status: 200, body: DECISION_OK } : undefined,
    );
    const { onDecisionRecorded } = renderDialog();
    await fillAndSubmit();

    await waitFor(() => expect(screen.getByTestId('review-decision-done')).toBeTruthy());

    const sent = calls.filter((call) => call.url.includes('review-decide'));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toContain('/.netlify/functions/review-decide?caseId=claim-A');
    expect(sent[0]!.init!.method).toBe('POST');
    const body = JSON.parse(sent[0]!.init!.body as string);
    expect(body).toMatchObject({
      outcome: 'revision_needed',
      explanation: DECISION_OK.explanation,
    });

    const done = screen.getByTestId('review-decision-done');
    expect(done.textContent).toContain('revision_needed');
    expect(done.textContent).toContain('dec-77');
    expect(done.textContent).toContain('awaiting_review');
    expect(done.textContent).toContain('review_recorded');
    expect(done.textContent).toContain('revision_pending');
    expect(done.textContent).toMatch(/not scientific validation/i);
    expect(onDecisionRecorded).toHaveBeenCalledTimes(1);
    expect(onDecisionRecorded).toHaveBeenCalledWith(DECISION_OK);
  });

  it('already-recorded context is shown honestly and Escape closes', () => {
    const { onClose } = renderDialog(true);
    expect(screen.getByTestId('review-decision-dialog').textContent).toMatch(
      /already been recorded for this case/,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('typed failure copies are distinct and honest (400/409/429/500)', async () => {
    const cases: Array<{ status: number; match: RegExp }> = [
      { status: 400, match: /HTTP 400/ },
      { status: 409, match: /already recorded for this case/ },
      { status: 429, match: /Rate limited \(HTTP 429\).*[Ww]ait.*cooldown.*Nothing was recorded\./ },
      { status: 500, match: /unavailable \(server error\).*not recorded/ },
    ];    for (const example of cases) {
      stubFetchByRoute((url) =>
        url.includes('review-decide')
          ? { status: example.status, body: { error: 'x' } }
          : undefined,
      );
      const { unmount } = render(<ReviewDecisionDialog item={ITEM} open onClose={vi.fn()} onDecisionRecorded={vi.fn()} />);
      await fillAndSubmit();
      const banner = await screen.findByTestId('review-decision-error');
      expect(banner.textContent, `status ${example.status} copy`).toMatch(example.match);
      expect(screen.getByTestId('review-decision-retry')).toBeTruthy();
      unmount();
    }
  });

  it('timeout and network failures are typed with the retry affordance, never a fake success', async () => {
    {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }),
      );
      renderDialog();
      await fillAndSubmit();
      const banner = await screen.findByTestId('review-decision-error');
      expect(banner.textContent).toMatch(/timeout/i);
      expect(banner.textContent).toMatch(/nothing was recorded\./i);
    }

    {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        }),
      );
      const dialogHost = screen.getByTestId('review-decision-dialog');
      expect(dialogHost).toBeTruthy();
      // Same dialog is still open in failed phase; refire the submit via Retry.
      // The new stub is in place, so Retry now hits the network error path.
      fireEvent.click(screen.getByTestId('review-decision-retry'));
      // The banner is re-created between attempts; query it fresh each poll.
      await waitFor(() =>
        expect(screen.getByTestId('review-decision-error').textContent).toMatch(
          /Network error/,
        ),
      );
      expect(screen.getByTestId('review-decision-error').textContent).toMatch(
        /did not reach the review API/,
      );
    }
  });

  it('HTML-shaded 2xx reads as endpoint unavailable — no fabricated decision', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<!doctype html><html><body>spa</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );
    const { onDecisionRecorded } = renderDialog();
    await fillAndSubmit();

    const banner = await screen.findByTestId('review-decision-error');
    expect(banner.textContent).toMatch(/not available/i);
    expect(banner.textContent).toMatch(/The decision was not recorded\./);
    expect(onDecisionRecorded).not.toHaveBeenCalled();
  });
});
