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

/* ------------------------------------------------------------------ *
 * P0 review-queue UX wave — server-state-first rendering, audit
 * history from the real /activity feed, typed decision errors, and
 * evidence-path links.
 * ------------------------------------------------------------------ */

/** A review_decision event exactly as the typed client hands it to pages. */
const REVIEW_HISTORY_EVENT = {
  id: 'review-evt-9',
  type: 'review_decision' as const,
  timestamp: '2026-10-19T12:00:00.000Z',
  actor: 'A. Reviewer',
  action: 'more_evidence_needed',
  description: 'Deployment verification: recording a real decision against the seeded demo case to confirm the write path.',
  beforeState: 'awaiting_review',
  afterState: 'review_recorded',
  isSynthetic: true,
  syntheticLabel: 'FICTIONAL / GUIDED DEMO',
};

/** Production-shaped record: server writes the M5 case state into reviewState + reviewFlags. */
function recordWithServerReviewState(flags: string[] = ['further_investigation']): Record<string, unknown> {
  const record = buildDemoOverviewRecord() as {
    nodes: Array<Record<string, unknown>>;
  };
  const claimA = record.nodes.find((node) => node['id'] === 'claim-A');
  expect(claimA).toBeDefined();
  claimA!['reviewState'] = 'review_recorded';
  claimA!['reviewFlags'] = flags;
  return record;
}

function stubMutableQueue(options: {
  firstOverview: unknown;
  thenOverview?: unknown;
  activityResponses?: Array<{ status: number; body?: unknown }>;
  decideStatus?: number;
  decideBody?: unknown;
}) {
  let edgesCalls = 0;
  let activityCalls = 0;
  const calls = stubFetchByRoute((url) => {
    if (url.includes('graph-edges')) {
      edgesCalls += 1;
      return {
        status: 200,
        body: edgesCalls === 1 ? options.firstOverview : (options.thenOverview ?? options.firstOverview),
      };
    }
    if (url.includes('/activity')) {
      const response = options.activityResponses?.[activityCalls] ?? {
        status: 200,
        body: [REVIEW_HISTORY_EVENT],
      };
      activityCalls += 1;
      // Past the scripted list the endpoint keeps answering with the last body.
      return response;
    }
    if (url.includes('review-decide')) {
      return { status: options.decideStatus ?? 200, body: options.decideBody ?? DECISION_OK };
    }
    if (url.includes('review-revision')) {
      return { status: 200, body: PROPOSAL_OK };
    }
    return undefined;
  });
  return { calls, edgesCalls: () => edgesCalls, activityCalls: () => activityCalls };
}

describe('ReviewQueuePage — sage styling derives from SERVER state, never a local guess', () => {
  it('a returned record carrying reviewState review_recorded + reviewFlags shows sage and the amber further-investigation badge on first load, with no session decision', async () => {
    stubFetchByRoute((url) => {
      if (url.includes('graph-edges'))
        return { status: 200, body: recordWithServerReviewState(['further_investigation']) };
      if (url.includes('/activity')) return { status: 200, body: [] };
      return undefined;
    });
    renderQueue();

    const item = await screen.findByTestId('review-item-claim-A');
    expect(item.getAttribute('data-review-state')).toBe('reviewed');
    expect(item.className).toContain('border-reviewed');
    expect(item.getAttribute('data-review-state')).toBe('reviewed');
    const badge = screen.getByTestId('review-item-claim-A-investigation-pending');
    expect(badge.textContent).toBe('Further investigation pending');
    expect(badge.className).toContain('border-uncertain-border');
    // No dialog decision, no invented decision line.
    expect(screen.queryByTestId('review-item-claim-A-decision')).toBeNull();
    expect(document.querySelector('[data-testid="review-item-claim-A"]')!.textContent).not.toMatch(
      /Decision recorded:/,
    );

    // The dependent conclusion-C inherits the obligation: the flag on claim-A
    // does NOT clear its indirect review (no automatic clearing upstream→down).
    const conclusionC = screen.getByTestId('review-item-conclusion-C');
    expect(conclusionC.getAttribute('data-review-state')).toBe('needs-review');
    expect(conclusionC.className).not.toContain('border-reviewed');
  });

  it('revision_pending in returned reviewFlags shows the amber Revision pending badge from server state', async () => {
    stubFetchByRoute((url) => {
      if (url.includes('graph-edges'))
        return { status: 200, body: recordWithServerReviewState(['revision_pending']) };
      if (url.includes('/activity')) return { status: 200, body: [] };
      return undefined;
    });
    renderQueue();

    await screen.findByTestId('review-item-claim-A');
    expect(screen.getByTestId('review-item-claim-A-revision-pending').textContent).toBe(
      'Revision pending',
    );
  });
});

describe('ReviewQueuePage — decision success: server response reflected + background refresh + audit refetch', () => {
  it('records a decision, refetches the graph (server state) and the /activity feed, keeps the dialog open, and renders the audit entry', async () => {
    const stub = stubMutableQueue({
      firstOverview: buildDemoOverviewRecord(),
      thenOverview: recordWithServerReviewState(['revision_pending']),
      activityResponses: [
        { status: 200, body: [] },
        { status: 200, body: [REVIEW_HISTORY_EVENT] },
      ],
      decideStatus: 200,
      decideBody: DECISION_OK,
    });
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    // Initial history read happened (empty first).
    await waitFor(() => expect(stub.activityCalls()).toBe(1));

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-revision_needed'));
    fireEvent.change(screen.getByTestId('review-decision-explanation'), {
      target: { value: DECISION_OK.explanation },
    });
    fireEvent.click(screen.getByTestId('review-decision-submit'));

    await waitFor(() => expect(screen.getByTestId('review-decision-done')).toBeTruthy());

    // Server state refetch + cache-busted audit refetch happened.
    await waitFor(() => expect(stub.edgesCalls()).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(stub.activityCalls()).toBe(2));

    // The dialog confirmation survives the background refresh.
    expect(screen.getByTestId('review-decision-done')).toBeTruthy();

    // Refresh note is visible and server-derived: the refreshed record now
    // carries reviewState review_recorded server-side.
    const note = await screen.findByTestId('review-queue-refresh-note');
    expect(note.textContent).toMatch(/Server state refreshed at/);

    // The item is reviewed (session decision + server reviewState agree).
    expect(screen.getByTestId('review-item-claim-A').getAttribute('data-review-state')).toBe(
      'reviewed',
    );
    expect(screen.getByTestId('review-item-claim-A-revision-pending').textContent).toBe(
      'Revision pending',
    );

    // The audit entry appears from the refetched feed, with the REAL recorded
    // outcome (the server's action string), actor, and description.
    const entry = await screen.findByTestId('review-history-entry-review-evt-9');
    expect(entry).toBeTruthy();
    expect(
      screen.getByTestId('review-history-entry-review-evt-9-action').textContent,
    ).toContain('more_evidence_needed');
    expect(
      screen.getByTestId('review-history-entry-review-evt-9-actor').textContent,
    ).toContain('A. Reviewer');
    expect(
      screen.getByTestId('review-history-entry-review-evt-9-description').textContent,
    ).toContain('Deployment verification');
    // String before/after states in the event are displayed.
    expect(
      screen.getByTestId('review-history-entry-review-evt-9-before').textContent,
    ).toContain('awaiting_review');
    expect(
      screen.getByTestId('review-history-entry-review-evt-9-after').textContent,
    ).toContain('review_recorded');
    expect(
      screen.getByTestId('review-history-entry-review-evt-9-synthetic').textContent,
    ).toContain('FICTIONAL / GUIDED DEMO');
    // Open panels survive: still no wipe of the open revision panel id state (dialog closed manually only).
  });

  it('open dialogs/panels stay intact while the background server refresh lands', async () => {
    const stub = stubMutableQueue({
      firstOverview: buildDemoOverviewRecord(),
      thenOverview: recordWithServerReviewState([]),
      activityResponses: [{ status: 200, body: [] }],
      decideStatus: 200,
      decideBody: DECISION_OK,
    });
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    // Record a decision to trigger the background refresh.
    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-evidence_updated'));
    fireEvent.change(screen.getByTestId('review-decision-explanation'), {
      target: { value: 'The supporting basis was corrected upstream.' },
    });
    fireEvent.click(screen.getByTestId('review-decision-submit'));
    await waitFor(() => expect(stub.edgesCalls()).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByTestId('review-decision-done')).toBeTruthy());

    // Now open the revision panel while the refresh has landed: selection state stable.
    fireEvent.click(screen.getByTestId('review-decision-done-close'));
    fireEvent.click(screen.getByTestId('review-revise-claim-A'));
    await waitFor(() => expect(screen.getByTestId('revision-proposal-panel')).toBeTruthy());

    // Re-open the decision dialog: it must not have been killed by the refresh.
    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    expect(screen.getByTestId('review-decision-dialog')).toBeTruthy();
  });
});

describe('ReviewQueuePage — typed decision failures with honest recovery', () => {
  /**
   * Stubs fetch so the queue itself loads normally while the review-decide
   * call fails in a specific typed way (route-selective — a blank failure
   * stub would break the page's own overview/history fetches, which are not
   * under test here).
   */
  function stubDecisionFailure(kind: 'timeout' | 'network' | 'html') {
    const record = buildDemoOverviewRecord();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = typeof input === 'string' ? input : String((input as Request).url);
        if (url.includes('graph-edges'))
          return new Response(JSON.stringify(record), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        if (url.includes('/activity'))
          return new Response(JSON.stringify([REVIEW_HISTORY_EVENT]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        if (url.includes('review-decide') || url.includes('review-revision')) {
          if (kind === 'timeout') throw new DOMException('The operation was aborted.', 'AbortError');
          if (kind === 'network') throw new TypeError('Failed to fetch');
          return new Response('<!doctype html><html><body>spa</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }),
    );
  }

  it('429 shows cooldown copy (wait, then retry) and never marks the item reviewed', async () => {
    stubMutableQueue({
      firstOverview: buildDemoOverviewRecord(),
      activityResponses: [{ status: 200, body: [] }],
      decideStatus: 429,
      decideBody: { error: 'rate limited' },
    });
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-revision_needed'));
    fireEvent.change(screen.getByTestId('review-decision-explanation'), {
      target: { value: DECISION_OK.explanation },
    });
    fireEvent.click(screen.getByTestId('review-decision-submit'));

    const banner = await screen.findByTestId('review-decision-error');
    expect(banner.textContent).toMatch(/429/);
    expect(banner.textContent).toMatch(/[Ww]ait/);
    expect(banner.textContent).toMatch(/cooldown/i);
    expect(banner.textContent).toMatch(/Nothing was recorded\./);
    expect(screen.getByTestId('review-decision-retry')).toBeTruthy();
    expect(
      screen.getByTestId('review-item-claim-A').getAttribute('data-review-state'),
    ).toBe('needs-review');
  });

  it('timeout is typed: the copy names the timeout and the retry affordance exists', async () => {
    stubDecisionFailure('timeout');
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-revision_needed'));
    fireEvent.change(screen.getByTestId('review-decision-explanation'), {
      target: { value: DECISION_OK.explanation },
    });
    fireEvent.click(screen.getByTestId('review-decision-submit'));

    const banner = await screen.findByTestId('review-decision-error');
    expect(banner.textContent).toMatch(/timeout/i);
    expect(banner.textContent).toMatch(/nothing was recorded\./i);
    expect(screen.getByTestId('review-decision-retry')).toBeTruthy();
  });

  it('network failure is typed: the copy says the request did not reach the API', async () => {
    stubDecisionFailure('network');
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-more_evidence_needed'));
    fireEvent.change(screen.getByTestId('review-decision-explanation'), {
      target: { value: DECISION_OK.explanation },
    });
    fireEvent.click(screen.getByTestId('review-decision-submit'));

    const banner = await screen.findByTestId('review-decision-error');
    expect(banner.textContent).toMatch(/Network error/);
    expect(banner.textContent).toMatch(/did not reach/);
  });

  it('HTML-shaded 2xx is typed as unavailable, never a fake success', async () => {
    stubDecisionFailure('html');
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-not_affected'));
    fireEvent.change(screen.getByTestId('review-decision-explanation'), {
      target: { value: DECISION_OK.explanation },
    });
    fireEvent.click(screen.getByTestId('review-decision-submit'));

    const banner = await screen.findByTestId('review-decision-error');
    expect(banner.textContent).toMatch(/not available/i);
    expect(banner.textContent).toMatch(/The decision was not recorded\./);
    expect(
      screen.getByTestId('review-item-claim-A').getAttribute('data-review-state'),
    ).toBe('needs-review');
  });
});

describe('ReviewQueuePage — evidence-path connection and links', () => {
  it('each flagged item exposes its evidence path as chips plus Inspect/Results links', async () => {
    stubQueueRoute(200);
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    const whyA = screen.getByTestId('review-item-claim-A-why');
    expect(screen.getByTestId('review-item-claim-A-chip-citation-use').textContent).toContain(
      'cu-A-supporting',
    );
    expect(screen.getByTestId('review-item-claim-A-chip-publication').textContent).toContain(
      'pub-mehra-2020',
    );
    expect(whyA.textContent).toContain('cu-A-supporting');

    const inspect = screen.getByTestId('review-item-claim-A-inspect') as HTMLAnchorElement;
    expect(inspect.getAttribute('href')).toBe('/graph');
    expect(inspect.textContent).toContain('Inspect evidence path');

    const results = screen.getByTestId('review-item-claim-A-results') as HTMLAnchorElement;
    expect(results.getAttribute('href')).toBe('/results');

    const whyC = screen.getByTestId('review-item-conclusion-C-why');
    expect(screen.getByTestId('review-item-conclusion-C-chip-claim').textContent).toContain('claim-A');
    expect(whyC.textContent).toContain('claim-A');
    expect(screen.getByTestId('review-item-conclusion-C-inspect')).toBeTruthy();
  });
});

describe('ReviewQueuePage — Review history honest states (real /activity feed)', () => {
  it('shows only review_decision events; other event types never masquerade as decisions', async () => {
    stubFetchByRoute((url) => {
      if (url.includes('graph-edges')) return { status: 200, body: buildDemoOverviewRecord() };
      if (url.includes('/activity'))
        return {
          status: 200,
          body: [
            REVIEW_HISTORY_EVENT,
            {
              id: 'evt-analysis-x',
              type: 'analysis_run' as const,
              timestamp: '2026-10-19T00:23:54.762Z',
              actor: 'Aftershock',
              action: 'completed',
              description: 'Analysis run for document version',
            },
          ],
        };
      return undefined;
    });
    renderQueue();

    await screen.findByTestId('review-history-entry-review-evt-9');
    const section = screen.getByTestId('review-history');
    expect(section.textContent).toContain('Review history (1');
    expect(section.textContent).not.toContain('Analysis run for document version');
  });

  it('empty decision history stays honest when the feed answers with no review events', async () => {
    stubFetchByRoute((url) => {
      if (url.includes('graph-edges')) return { status: 200, body: buildDemoOverviewRecord() };
      if (url.includes('/activity')) return { status: 200, body: [] };
      return undefined;
    });
    renderQueue();

    const empty = await screen.findByTestId('review-history-empty');
    expect(empty.textContent).toMatch(/No review decisions have been recorded yet/);
  });

  it('missing activity endpoint keeps the queue usable and says history is not available', async () => {
    stubFetchByRoute((url) => {
      if (url.includes('graph-edges')) return { status: 200, body: buildDemoOverviewRecord() };
      if (url.includes('/activity')) return { status: 404 };
      return undefined;
    });
    renderQueue();

    const missing = await screen.findByTestId('review-history-missing');
    expect(missing.textContent).toMatch(/until the real feed answers/i);
    // The flagged list still renders.
    expect(screen.getByTestId('review-item-claim-A')).toBeTruthy();
  });

  it('history failure shows the typed error + retry that refetches the feed', async () => {
    const stub = stubMutableQueue({
      firstOverview: buildDemoOverviewRecord(),
      activityResponses: [{ status: 500 }, { status: 200, body: [REVIEW_HISTORY_EVENT] }],
    });
    renderQueue();

    await waitFor(() =>
      expect(screen.getByTestId('review-history-detail').textContent).toMatch(/HTTP 500/),
    );
    expect(stub.activityCalls()).toBe(1);

    fireEvent.click(screen.getByTestId('review-history-retry'));
    await screen.findByTestId('review-history-entry-review-evt-9');
    expect(stub.activityCalls()).toBe(2);
  });

  it('a failed post-decision audit refetch keeps the displayed entries and discloses the staleness', async () => {
    const stub = stubMutableQueue({
      firstOverview: buildDemoOverviewRecord(),
      activityResponses: [
        { status: 200, body: [REVIEW_HISTORY_EVENT] },
        { status: 500 },
      ],
      decideStatus: 200,
      decideBody: DECISION_OK,
    });
    renderQueue();
    await screen.findByTestId('review-history-entry-review-evt-9');

    fireEvent.click(screen.getByTestId('review-decide-claim-A'));
    fireEvent.click(screen.getByTestId('review-decision-outcome-revision_needed'));
    fireEvent.change(screen.getByTestId('review-decision-explanation'), {
      target: { value: DECISION_OK.explanation },
    });
    fireEvent.click(screen.getByTestId('review-decision-submit'));

    await waitFor(() => expect(stub.activityCalls()).toBe(2));
    // Honest staleness disclosure, instead of silently showing old data.
    await waitFor(() =>
      expect(
        screen.getByTestId('review-history-refresh-failed').textContent,
      ).toMatch(/last successful read/),
    );
    // The previously-displayed real events stay visible, labeled as stale.
    expect(screen.getByTestId('review-history-entry-review-evt-9')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * P4 — Find Evidence affordance (per-case dialog, read-only). The
 * panel itself is covered in FindEvidencePanel.test.tsx; these tests
 * verify the PAGE wiring: trigger, prepared-data rendering, close, and
 * — the hard rule — case state is untouched by any search.
 * ------------------------------------------------------------------ */

const EVIDENCE_CLAIM_TEXT =
  'Agent P-9 was selected on the strength of the registry analysis we cite (Mehra et al., 2020), which we read as establishing a drug-treatment mortality signal in the target cohort.';

function evidencePreparePayload(claimId = 'claim-A') {
  return {
    mode: 'prepare' as const,
    claimId,
    claimText: EVIDENCE_CLAIM_TEXT,
    label: 'Claim',
    manuscriptId: 'doc-demo-manuscript',
    concern: {
      summary: 'The supporting citation use points at a publication with a verified retraction notice.',
      direction: 'direct' as const,
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
    caveats: [
      'Candidates come from public bibliographic metadata (Crossref). Relevance ranking is the provider’s bibliographic relevance — not a statement that a paper supports the claim.',
      'This search does not modify citations, review states, or the manuscript.',
    ],
  };
}

function evidenceSearchPayload(query: string, candidates: unknown[] = [], providersStatus: unknown[] = []) {
  const prepare = evidencePreparePayload();
  return {
    mode: 'search' as const,
    claimId: 'claim-A',
    claimText: EVIDENCE_CLAIM_TEXT,
    label: 'Claim',
    manuscriptId: 'doc-demo-manuscript',
    concern: prepare.concern,
    query,
    candidates,
    providersStatus,
    providers: prepare.providers,
    caveats: prepare.caveats,
    searchedAt: '2026-10-19T05:00:00.000Z',
  };
}

const EVIDENCE_CANDIDATES = [
  {
    candidateId: 'doi:10.1016/s0140-6736(20)31180-6',
    doi: '10.1016/S0140-6736(20)31180-6',
    title:
      'Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis',
    authors: ['Mehra M.R.'],
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
      "Retrieved by Crossref bibliographic relevance for 'registry analysis' — a metadata match only; support/contrast relationships are unverified.",
    urls: { sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31180-6' },
  },
];

describe('ReviewQueuePage — P4 Find Evidence wiring (read-only, no case mutation)', () => {
  /** Queue loads normally; /evidence-find answers by request mode (`failureStatus` fails only SEARCH). */
  function stubQueueWithEvidenceFind(options: { failureStatus?: number } = {}) {
    return stubFetchByRoute((url, init) => {
      if (url.includes('graph-edges')) return { status: 200, body: buildDemoOverviewRecord() };
      if (url.includes('/activity')) return { status: 200, body: [REVIEW_HISTORY_EVENT] };
      if (url.includes('evidence-find')) {
        const body = JSON.parse((init?.body as string) ?? '{}');
        if (typeof body.query === 'string') {
          if (options.failureStatus) return { status: options.failureStatus, body: { error: 'down' } };
          return {
            status: 200,
            body: evidenceSearchPayload(body.query, EVIDENCE_CANDIDATES, [
              { id: 'crossref', status: 'ok' },
            ]),
          };
        }
        return { status: 200, body: evidencePreparePayload() };
      }
      return undefined;
    });
  }

  it('per-case Find Evidence affordance opens the dialog with the prepared claim data (prep auto-loaded, mode prepare body)', async () => {
    const calls = stubQueueWithEvidenceFind();
    renderQueue();
    const item = await screen.findByTestId('review-item-claim-A');

    const trigger = screen.getByTestId('find-evidence-claim-A');
    expect(trigger.getAttribute('aria-label')).toBe('Find evidence for claim-A');
    fireEvent.click(trigger);

    const dialog = await screen.findByTestId('find-evidence-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');

    const evidenceCalls = calls.filter((call) => call.url.includes('evidence-find'));
    expect(evidenceCalls).toHaveLength(1);
    expect(evidenceCalls[0]!.init!.method).toBe('POST');
    expect(evidenceCalls[0]!.url).toContain('/evidence-find?claimId=claim-A');
    // OPEN fires exactly one prepare request: empty {} body, NO query.
    expect(evidenceCalls[0]!.init!.body).toBe('{}');

    await screen.findByTestId('find-evidence-caveats');
    const claimText = screen.getByTestId('find-evidence-claim-text');
    expect(claimText.textContent).toContain(EVIDENCE_CLAIM_TEXT);
    expect(screen.getByTestId('find-evidence-concern-summary').textContent).toContain(
      'verified retraction notice',
    );
    const query = screen.getByTestId('find-evidence-query') as HTMLTextAreaElement;
    expect(query.value).toBe('registry analysis drug-treatment mortality cohort P-9');

    // The queue itself is unchanged by opening the panel.
    expect(item.getAttribute('data-review-state')).toBe('needs-review');
    expect(screen.queryByTestId('review-item-claim-A-decision')).toBeNull();
  });

  it('search from the page runs the real POST with the edited query, shows candidate cards, and leaves case state untouched', async () => {
    const calls = stubQueueWithEvidenceFind();
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('find-evidence-claim-A'));
    await screen.findByTestId('find-evidence-caveats');

    fireEvent.change(screen.getByTestId('find-evidence-query'), {
      target: { value: '  registry analysis  ' },
    });
    fireEvent.click(screen.getByTestId('find-evidence-search'));

    const card = await screen.findByTestId('find-evidence-candidate-0');
    expect(card.textContent).toContain('REAL METADATA');
    expect(card.textContent).toContain('relationship unverified · independence unknown · full text unknown');
    expect(screen.getByTestId('find-evidence-provider-crossref').textContent).toContain('ok');

    const searchCalls = calls.filter(
      (call) => call.url.includes('evidence-find') && typeof call.init?.body === 'string' && (call.init.body as string).includes('query'),
    );
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]!.init!.body).toBe(JSON.stringify({ query: 'registry analysis' }));

    // HARD RULE: the case is not mutated by any search — no decide/revision
    // calls, no reviewed styling, no decision line, no invented state.
    const allCalls = calls;
    expect(allCalls.filter((call) => call.url.includes('review-decide'))).toHaveLength(0);
    expect(allCalls.filter((call) => call.url.includes('review-revision'))).toHaveLength(0);
    expect(screen.getByTestId('review-item-claim-A').getAttribute('data-review-state')).toBe('needs-review');
    expect(document.querySelector('[data-review-state="reviewed"]')).toBeNull();
    expect(screen.queryByTestId('review-item-claim-A-decision')).toBeNull();
    // The panel carries no mutation affordance at all.
    expect(screen.queryByTestId(/supported/)).toBeNull();
  });

  it('Escape closes the panel', async () => {
    stubQueueWithEvidenceFind();
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('find-evidence-claim-A'));
    await screen.findByTestId('find-evidence-dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('find-evidence-dialog')).toBeNull();
  });

  it('typed search/prepare failure (503) stays honest and case state remains untouched', async () => {
    stubQueueWithEvidenceFind({ failureStatus: 503 });
    renderQueue();
    await screen.findByTestId('review-item-claim-A');

    fireEvent.click(screen.getByTestId('find-evidence-claim-A'));
    // Prepare succeeds (status omitted → prepare answered normally).
    await screen.findByTestId('find-evidence-caveats');
    fireEvent.click(screen.getByTestId('find-evidence-search'));

    const banner = await screen.findByTestId('find-evidence-error');
    expect(banner.textContent).toContain('503');
    expect(banner.textContent).toMatch(/graph/i);
    expect(screen.queryByTestId(/find-evidence-candidate-\d+-status/)).toBeNull();
    expect(screen.getByTestId('review-item-claim-A').getAttribute('data-review-state')).toBe('needs-review');
  });
});

