import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/** graph-edges returns the demo record; /review-decide and /review-revision answer with given status/body. */
function stubQueueRoute(
  decideStatus: number,
  decideBody?: unknown,
  revisionStatus: number = 200,
  revisionBody?: unknown,
) {
  return stubFetchByRoute((url) => {
    if (url.includes('graph-edges')) return { status: 200, body: buildDemoOverviewRecord() };
    if (url.includes('review-decide')) return { status: decideStatus, body: decideBody };
    if (url.includes('review-revision'))
      return { status: revisionStatus, body: revisionBody };
    return undefined;
  });
}

const DECISION_OK = {
  decisionId: 'dec-1',
  caseId: 'claim-A',
  outcome: 'revision_needed' as const,
  explanation: 'The Mehra support is retracted; reword before relying on it.',
  reviewer: 'A. Reviewer',
  decidedAt: '2026-10-19T10:00:00.000Z',
  // Real server returns JSON.stringify({reviewState, flags}) — a JSON string,
  // not a bare state name. The dialog renders {decided.beforeState} directly,
  // so the fixture must carry a JSON string to test that rendering honestly.
  beforeState: JSON.stringify({ reviewState: 'unreviewed', flags: [] }),
  afterState: JSON.stringify({ reviewState: 'review_recorded', flags: ['revision_pending'] }),
};

const PROPOSAL_OK = {
  proposalId: 'prop-1',
  caseId: 'claim-A',
  originalText:
    'Agent P-9 was selected on the strength of the registry analysis we cite (Mehra et al., 2020), which we read as establishing a drug-treatment mortality signal in the target cohort.',
  proposedText:
    'Agent P-9 was selected based on the registry analysis we cite, pending confirmation of its findings.',
  rationale: 'Removed reliance on the retracted Mehra et al. (2020) registry analysis.',
  status: 'draft' as const,
  createdAt: '2026-10-19T10:05:00.000Z',
};

function decideCallsOf(calls: { url: string; init: RequestInit | undefined }[]) {
  return calls.filter((c) => c.url.includes('review-decide'));
}

function decideBodyOf(call: { url: string; init: RequestInit | undefined }) {
  return JSON.parse((call.init?.body as string) ?? '{}');
}

describe('ReviewQueuePage — derives real flagged items from the graph', () => {
  it('lists the REAL flagged claim and conclusion with their real why-chain and provenance; claim-B is not flagged', async () => {
    stubQueueRoute(200);
    renderQueue();

    await waitFor(() =>
      expect(screen.getByTestId('review-queue-counts').textContent).toMatch(
        /2 flagged for review in the returned records · 17 nodes · 14 connections/,
      ),
    );

    const claimA = screen.getByTestId('review-item-claim-A');
    expect(claimA.getAttribute('data-review-state')).toBe('needs-review');
    expect(claimA.textContent).toMatch(/direct evidence review/);
    const whyA = screen.getByTestId('review-item-claim-A-why');
    expect(whyA.textContent).toContain('cu-A-supporting');
    expect(whyA.textContent).toContain('pub-mehra-2020');
    expect(whyA.textContent).toContain('CITATION_USE_SUPPORTS_CLAIM');
    expect(whyA.textContent).toContain('fixture://aftershock-demo-fixture-v1#cu-A-supporting');
    expect(whyA.textContent).toContain('provenance human_confirmed');
    expect(whyA.textContent).toContain('no rationale text was recorded on the returned edge');

    const conclusionC = screen.getByTestId('review-item-conclusion-C');
    expect(conclusionC.textContent).toMatch(/indirect evidence review/);
    const whyC = screen.getByTestId('review-item-conclusion-C-why');
    expect(whyC.textContent).toContain('CONCLUSION_DEPENDS_ON_CLAIM');
    expect(whyC.textContent).toContain('claim-A');
    expect(whyC.textContent).toContain('never automatic falsity');

    expect(screen.queryByTestId('review-item-claim-B')).toBeNull();
  });

  it('renders the edge rationale verbatim when the returned edge carries one', async () => {
    const record = buildDemoOverviewRecord() as {
      edges: Array<Record<string, unknown>>;
    };
    const edge = record.edges.find((candidate) => candidate['id'] === 'edge-cuA-supports-claimA');
    expect(edge).toBeDefined();
    edge!['rationale'] = 'Supporting role against a publication with a verified retraction notice.';
    stubFetchByRoute((url) =>
      url.includes('graph-edges') ? { status: 200, body: record } : undefined,
    );
    renderQueue();

    const whyA = await screen.findByTestId('review-item-claim-A-why');
    expect(whyA.textContent).toContain(
      'rationale: Supporting role against a publication with a verified retraction notice.',
    );
    expect(whyA.textContent).not.toMatch(/no rationale text was recorded/);
  });

  it('decision actions are enabled and wired to the real review-decide API', async () => {
    stubQueueRoute(200, DECISION_OK);
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    const decideA = screen.getByTestId('review-decide-claim-A') as HTMLButtonElement;
    expect(decideA.disabled).toBe(false);
    expect(decideA.title).not.toMatch(/nothing is saved or sent/);
    expect(screen.getByTestId('review-item-claim-A').textContent).not.toMatch(
      /Decision actions arrive with the review backend/,
    );
    expect(screen.getAllByTestId(/review-decide-/)).toHaveLength(2);
  });

  it('records a decision via POST /review-decide with the correct payload', async () => {
    const calls = stubQueueRoute(200, DECISION_OK);
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-revision_needed'));
    const explanation = screen.getByTestId(
      'review-decision-explanation',
    ) as HTMLTextAreaElement;
    fireEvent.change(explanation, { target: { value: DECISION_OK.explanation } });
    fireEvent.click(screen.getByTestId('review-decision-submit'));

    await waitFor(() => expect(screen.getByTestId('review-decision-done')).toBeTruthy());

    const sent = decideCallsOf(calls);
    expect(sent).toHaveLength(1);
    const sentCall = sent[0]!;
    expect(sentCall.init!.method).toBe('POST');
    expect(sentCall.url).toContain('/review-decide?caseId=claim-A');
    const body = decideBodyOf(sentCall);
    expect(body).toMatchObject({
      outcome: 'revision_needed',
      explanation: DECISION_OK.explanation,
    });
    // Reviewer is optional — only present when the reviewer filled it in.
    expect(body.reviewer).toBeUndefined();

    // The item is now reviewed on the page (sage), no auto-navigation away.
    const item = screen.getByTestId('review-item-claim-A');
    expect(item.getAttribute('data-review-state')).toBe('reviewed');
    expect(item.className).toContain('border-reviewed');
    expect(item.className).toContain('bg-reviewed-surface');
    expect(screen.getByTestId('review-item-claim-A-decision').textContent).toContain(
      'revision_needed',
    );
    // The done panel renders the JSON-string beforeState/afterState honestly
    // (real server shape), not bare state names.
    expect(screen.getByTestId('review-decision-done').textContent).toContain(
      'review_recorded',
    );
    expect(screen.getByTestId('review-decision-done').textContent).toContain(
      'revision_pending',
    );
  });

  it('blocks submit when the explanation is missing (client validation)', async () => {
    const calls = stubQueueRoute(200, DECISION_OK);
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-not_affected'));
    // Explanation left empty: submit must not fire.
    fireEvent.click(screen.getByTestId('review-decision-submit'));
    expect(decideCallsOf(calls)).toHaveLength(0);
    expect(screen.getByTestId('review-item-claim-A').getAttribute('data-review-state')).toBe(
      'needs-review',
    );

    // With an explanation, submit works.
    const explanation = screen.getByTestId(
      'review-decision-explanation',
    ) as HTMLTextAreaElement;
    fireEvent.change(explanation, { target: { value: 'Some rationale.' } });
    fireEvent.click(screen.getByTestId('review-decision-submit'));
    await waitFor(() => expect(screen.getByTestId('review-decision-done')).toBeTruthy());
    expect(decideCallsOf(calls)).toHaveLength(1);
  });

  it('shows sage reviewed styling only after a recorded decision, never pre-marked', async () => {
    stubQueueRoute(200, DECISION_OK);
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    expect(screen.getByTestId('review-item-claim-A').getAttribute('data-review-state')).toBe(
      'needs-review',
    );
    expect(document.querySelector('[data-review-state="reviewed"]')).toBeNull();

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-evidence_updated'));
    const explanation = screen.getByTestId(
      'review-decision-explanation',
    ) as HTMLTextAreaElement;
    fireEvent.change(explanation, { target: { value: 'Rationale.' } });
    fireEvent.click(screen.getByTestId('review-decision-submit'));
    await waitFor(() => expect(screen.getByTestId('review-decision-done')).toBeTruthy());

    const item = screen.getByTestId('review-item-claim-A');
    expect(item.getAttribute('data-review-state')).toBe('reviewed');
    expect(item.className).toContain('border-reviewed');
    expect(item.className).toContain('bg-reviewed-surface');
    expect(item.className).toContain('text-reviewed-text');
  });

  it('shows sage reviewed AND amber revision pending together when outcome is revision_needed', async () => {
    stubQueueRoute(200, DECISION_OK);
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-revision_needed'));
    const explanation = screen.getByTestId(
      'review-decision-explanation',
    ) as HTMLTextAreaElement;
    fireEvent.change(explanation, { target: { value: DECISION_OK.explanation } });
    fireEvent.click(screen.getByTestId('review-decision-submit'));
    await waitFor(() => expect(screen.getByTestId('review-decision-done')).toBeTruthy());

    const item = screen.getByTestId('review-item-claim-A');
    expect(item.getAttribute('data-review-state')).toBe('reviewed');
    expect(screen.getByTestId('review-item-claim-A-revision-pending').textContent).toBe(
      'Revision pending',
    );
    // Amber pending coexists with sage reviewed.
    expect(item.className).toContain('border-reviewed');
  });

  it('keeps the original text immutable — read-only, never in an editable field', async () => {
    stubQueueRoute(200, DECISION_OK);
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));

    const original = screen.getByTestId('review-decision-dialog-original-text');
    expect(original.textContent).toContain('Agent P-9 was selected');
    expect(original.tagName).toBe('BLOCKQUOTE');
    expect(original.getAttribute('contenteditable')).toBeNull();

    const editables = Array.from(
      document.querySelectorAll('input, textarea'),
    ) as (HTMLInputElement | HTMLTextAreaElement)[];
    expect(
      editables.some((el) => el.value.includes('Agent P-9 was selected')),
    ).toBe(false);
  });

  it('revision panel shows the original text and proposed text as separate fields', async () => {
    stubQueueRoute(200, DECISION_OK, 200, PROPOSAL_OK);
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    // Record a decision (revision_needed) so the item is reviewed.
    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-revision_needed'));
    const explanation = screen.getByTestId(
      'review-decision-explanation',
    ) as HTMLTextAreaElement;
    fireEvent.change(explanation, { target: { value: DECISION_OK.explanation } });
    fireEvent.click(screen.getByTestId('review-decision-submit'));
    await waitFor(() => expect(screen.getByTestId('review-decision-done')).toBeTruthy());
    // Close the confirmation before opening the proposal panel.
    fireEvent.click(screen.getByTestId('review-decision-done-close'));

    fireEvent.click(screen.getByTestId('review-revise-claim-A'));
    await waitFor(() => expect(screen.getByTestId('revision-proposal-panel')).toBeTruthy());

    const original = screen.getByTestId('revision-proposal-original-text');
    expect(original.textContent).toContain('Agent P-9 was selected');
    expect(original.tagName).toBe('BLOCKQUOTE');

    const proposed = screen.getByTestId(
      'revision-proposal-proposed-text',
    ) as HTMLTextAreaElement;
    expect(proposed.tagName).toBe('TEXTAREA');
    expect(proposed.value).toBe('');

    // Propose a revision: draft is created, then the human Accept action appears.
    fireEvent.change(proposed, { target: { value: PROPOSAL_OK.proposedText } });
    fireEvent.click(screen.getByTestId('revision-proposal-propose'));
    await waitFor(() =>
      expect(screen.getByTestId('revision-proposal-status').textContent).toContain('Draft'),
    );
    expect(screen.getByTestId('revision-proposal-accept')).toBeTruthy();
  });

  it('unresolved references render separately in uncertain-blue, explicitly not review cases', async () => {
    stubQueueRoute(200);
    renderQueue();
    const section = await screen.findByRole('heading', {
      name: /Possible publication matches — not review cases \(1\)/,
    });
    expect(section).toBeTruthy();

    const unresolved = screen.getByTestId('review-unresolved-ref-lee-2020');
    expect(unresolved.getAttribute('data-review-state')).toBe('unresolved');
    expect(unresolved.textContent).toContain('pub-lee-2020-candidate-a, pub-lee-2020-candidate-b');
    expect(screen.queryByTestId('review-item-ref-lee-2020')).toBeNull();
  });

  it('empty returned graph: honest “nothing flagged” — invents no counts or cases', async () => {
    stubFetchByRoute((url) => {
      if (url.includes('graph-edges'))
        return { status: 200, body: { seedVersion: 'seed-1', nodes: [], edges: [] } };
      return undefined;
    });
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
    stubFetchByRoute((url) => (url.includes('graph-edges') ? { status: 404 } : undefined));
    renderQueue();

    await waitFor(() =>
      expect(screen.getByTestId('review-missing').textContent).toMatch(/not available yet/i),
    );
    expect(screen.queryByTestId('review-item-claim-A')).toBeNull();
    expect(screen.queryByTestId('review-queue-counts')).toBeNull();
  });

  it('API failure surfaces the exact failure with retry and fakes nothing', async () => {
    stubFetchByRoute((url) => (url.includes('graph-edges') ? { status: 500 } : undefined));
    renderQueue();

    await waitFor(() =>
      expect(screen.getByTestId('review-failure-detail').textContent).toMatch(/HTTP 500/),
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByTestId('review-item-claim-A')).toBeNull();
  });
});
