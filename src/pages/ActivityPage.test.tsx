import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ActivityPage from './ActivityPage';
import { stubFetchByRoute } from '../test/mockFetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderActivity() {
  return render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  );
}

function stubActivityRoute(response: { status: number; body?: unknown } | undefined) {
  return stubFetchByRoute((url) =>
    url.includes('/activity') ? response : undefined,
  );
}

const EVENTS = [
  {
    id: 'evt-review-1',
    type: 'review_decision' as const,
    timestamp: '2026-10-19T10:00:00.000Z',
    actor: 'A. Reviewer',
    action: 'Recorded human review for claim A',
    description: 'Retracted Mehra support requires rewording before reliance.',
    targetId: 'claim-A',
    targetType: 'case',
    beforeState: 'unreviewed',
    afterState: 'review_recorded · revision_pending',
    isSynthetic: true,
    syntheticLabel: 'FICTIONAL / GUIDED DEMO',
  },
  {
    id: 'evt-export-1',
    type: 'export_generated' as const,
    timestamp: '2026-10-19T09:00:00.000Z',
    actor: 'A. Reviewer',
    action: 'Evidence Impact Report exported',
    description: 'PDF snapshot for case claim-A generated.',
  },
  {
    id: 'evt-analysis-1',
    type: 'analysis_run' as const,
    timestamp: '2026-10-18T16:30:00.000Z',
    actor: 'Aftershock',
    action: 'Analysis run completed for ver-demo-manuscript-v1',
    description: 'Detected the Mehra retraction notice against the imported manuscript.',
    startedAt: '2026-10-18T15:00:00.000Z',
    completedAt: '2026-10-18T16:30:00.000Z',
  },
  {
    id: 'evt-notice-1',
    type: 'source_notice' as const,
    timestamp: '2020-06-04T00:00:00.000Z',
    actor: 'Aftershock',
    action: 'Retraction notice recorded for Mehra et al. (2020)',
    description: 'Official retraction published by The Lancet.',
    noticeRecordedDate: '2020-06-05',
    detectedAt: '2026-10-18T00:00:00.000Z',
    lastVerifiedAt: '2026-10-19T08:00:00.000Z',
  },
] as const;

describe('ActivityPage — real chronological timeline from GET /activity', () => {
  it('renders real events newest-first, grouped by date, with type labels and distinct timestamp labels', async () => {
    stubActivityRoute({ status: 200, body: EVENTS });
    renderActivity();

    await waitFor(() =>
      expect(screen.getByTestId('activity-counts').textContent).toMatch(/4 events recorded/),
    );

    // Newest first: review (Oct 19 10:00) before export (Oct 19 09:00).
    const list = screen.getByTestId('activity-list');
    expect(list.textContent!.indexOf('Recorded human review for claim A')).toBeLessThan(
      list.textContent!.indexOf('Evidence Impact Report exported'),
    );

    // Distinct timestamp labels per event type.
    expect(screen.getByTestId('activity-event-evt-notice-1-timestamp-label').textContent).toBe(
      'Notice published',
    );
    expect(screen.getByTestId('activity-event-evt-analysis-1-timestamp-label').textContent).toBe(
      'Analysis completed',
    );
    expect(screen.getByTestId('activity-event-evt-review-1-timestamp-label').textContent).toBe(
      'Human review recorded',
    );
    expect(screen.getByTestId('activity-event-evt-export-1-timestamp-label').textContent).toBe(
      'Export generated',
    );

    // Every distinct server timestamp keeps its own explicit date-KIND line.
    // detectedAt labels the demo seed honestly — never scanning/discovery.
    expect(
      screen.getByTestId('activity-event-evt-notice-1-date-kind-notice-recorded').textContent,
    ).toMatch(/^PubMed\/PMC record .+/);
    expect(
      screen.getByTestId('activity-event-evt-notice-1-date-kind-detected').textContent,
    ).toMatch(/^First recorded by Aftershock \(demo seed\) .+/);
    expect(
      screen.getByTestId('activity-event-evt-notice-1-date-kind-last-verified').textContent,
    ).toMatch(/^Last verified .+/);
    expect(
      screen.getByTestId('activity-event-evt-analysis-1-date-kind-started').textContent,
    ).toMatch(/^Analysis started .+/);
    expect(screen.queryByTestId('activity-event-evt-review-1-date-kinds')).toBeNull();

    // Type badges.
    expect(screen.getByTestId('activity-event-evt-review-1-type').textContent).toBe(
      'Review decision',
    );
    expect(screen.getByTestId('activity-event-evt-notice-1-type').textContent).toBe(
      'Source notice',
    );

    // Timestamps rendered (date portion, computed the same way the component does).
    expect(list.textContent).toContain(
      new Date('2020-06-04T00:00:00.000Z').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    );
    expect(list.textContent).toContain(
      new Date('2026-10-19T10:00:00.000Z').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    );

    // Actor, action and description.
    expect(screen.getByTestId('activity-event-evt-review-1-actor').textContent).toContain(
      'A. Reviewer',
    );
    expect(screen.getByTestId('activity-event-evt-review-1-action').textContent).toContain(
      'Recorded human review for claim A',
    );
    expect(screen.getByTestId('activity-event-evt-review-1-description').textContent).toContain(
      'Retracted Mehra support requires rewording before reliance.',
    );
  });

  it('colors each event type by its brand role', async () => {
    stubActivityRoute({ status: 200, body: EVENTS });
    renderActivity();
    await waitFor(() => expect(screen.getByTestId('activity-event-evt-review-1')).toBeTruthy());

    const review = screen.getByTestId('activity-event-evt-review-1');
    expect(review.className).toContain('border-reviewed');
    expect(review.className).toContain('bg-reviewed-surface');

    const notice = screen.getByTestId('activity-event-evt-notice-1');
    expect(notice.className).toContain('border-notice-border');
    expect(notice.className).toContain('bg-notice-surface');

    const analysis = screen.getByTestId('activity-event-evt-analysis-1');
    expect(analysis.className).toContain('border-brand');
    expect(analysis.className).toContain('bg-brand-surface');

    const exportEvent = screen.getByTestId('activity-event-evt-export-1');
    expect(exportEvent.className).toContain('border-review-border');
    expect(exportEvent.className).toContain('bg-review-surface');
  });

  it('renders before/after state for review decisions', async () => {
    stubActivityRoute({ status: 200, body: [EVENTS[0]] });
    renderActivity();
    await screen.findByTestId('activity-event-evt-review-1');

    expect(screen.getByTestId('activity-event-evt-review-1-before').textContent).toContain(
      'Before: unreviewed',
    );
    expect(screen.getByTestId('activity-event-evt-review-1-after').textContent).toContain(
      'After: review_recorded · revision_pending',
    );
    expect(screen.getByTestId('activity-event-evt-review-1-case-id').textContent).toContain(
      'claim-A',
    );
  });

  it('flattens the server state blob into readable Before → After text, never repainted', async () => {
    // Public wire shape of a real review decision (object state blob).
    stubActivityRoute({
      status: 200,
      body: [
        {
          id: 'dec-1',
          type: 'review_decision',
          action: 'revision_needed',
          timestamp: '2026-10-19T10:00:00.000Z',
          targetId: 'claim-A',
          targetType: 'case',
          beforeState: { reviewState: 'awaiting_review', flags: [] },
          afterState: { reviewState: 'review_recorded', flags: ['revision_pending'] },
        },
      ],
    });
    renderActivity();
    await screen.findByTestId('activity-event-dec-1');

    expect(screen.getByTestId('activity-event-dec-1-timestamp-label').textContent).toBe(
      'Human review recorded',
    );
    expect(screen.getByTestId('activity-event-dec-1-before').textContent).toBe(
      'Before: awaiting_review',
    );
    expect(screen.getByTestId('activity-event-dec-1-after').textContent).toBe(
      'After: review_recorded · revision_pending',
    );
  });

  it('renders the FICTIONAL / GUIDED DEMO label for synthetic events', async () => {
    stubActivityRoute({ status: 200, body: [EVENTS[0]] });
    renderActivity();
    await screen.findByTestId('activity-event-evt-review-1');

    const synthetic = screen.getByTestId('activity-event-evt-review-1-synthetic');
    expect(synthetic.textContent).toContain('FICTIONAL / GUIDED DEMO');
  });

  it('groups events by date with date headings', async () => {
    stubActivityRoute({ status: 200, body: EVENTS });
    renderActivity();
    await waitFor(() => expect(screen.getByTestId('activity-list')).toBeTruthy());

    const list = screen.getByTestId('activity-list');
    // Oct 19 events share a group ("Today" or the date stamp); Oct 18 another; Jun 4 2020 another.
    expect(list.textContent).toContain(
      new Date('2026-10-19T10:00:00.000Z').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    );
    expect(list.textContent).toContain(
      new Date('2020-06-04T00:00:00.000Z').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    );
  });

  it('honest empty state: "No activity recorded yet", invents no events', async () => {
    stubActivityRoute({ status: 200, body: [] });
    renderActivity();

    await waitFor(() =>
      expect(screen.getByTestId('activity-empty').textContent).toBe('No activity recorded yet.'),
    );
    expect(screen.queryByTestId(/activity-event-/)).toBeNull();
    expect(screen.queryByTestId('activity-list')).toBeNull();
  });

  it('honest loading state while the API is in flight', async () => {
    // A never-resolving fetch keeps the page in the loading phase.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderActivity();

    expect(screen.getByTestId('activity-loading').textContent).toBe('Reading activity timeline…');
    expect(screen.queryByTestId('activity-empty')).toBeNull();
    expect(screen.queryByTestId('activity-missing')).toBeNull();
    expect(screen.queryByTestId('activity-failure')).toBeNull();
  });

  it('missing endpoint (404): honest "not available yet", no fabricated events, offers retry', async () => {
    stubActivityRoute({ status: 404 });
    renderActivity();

    await waitFor(() =>
      expect(screen.getByTestId('activity-missing').textContent).toMatch(/not available yet/i),
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByTestId(/activity-event-/)).toBeNull();
    expect(screen.queryByTestId('activity-counts')).toBeNull();
  });

  it('missing endpoint (501): honest "not available yet" with reason not-implemented', async () => {
    stubActivityRoute({ status: 501 });
    renderActivity();

    await waitFor(() =>
      expect(screen.getByTestId('activity-missing').textContent).toMatch(/not implemented/),
    );
    expect(screen.queryByTestId(/activity-event-/)).toBeNull();
  });

  it('API failure (500): shows exact failure with retry and fakes nothing', async () => {
    stubActivityRoute({ status: 500 });
    renderActivity();

    await waitFor(() =>
      expect(screen.getByTestId('activity-failure-detail').textContent).toMatch(/HTTP 500/),
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByTestId(/activity-event-/)).toBeNull();
  });

  it('retry re-fetches /activity after a failure', async () => {
    const calls = stubActivityRoute({ status: 500 });
    renderActivity();
    await waitFor(() =>
      expect(screen.getByTestId('activity-failure-detail').textContent).toMatch(/HTTP 500/),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.every((c) => c.url.includes('/activity'))).toBe(true);
  });
});

describe('ActivityPage — M7 per-case view (GET /activity?caseId=)', () => {
  it('offers "This case" only for review events; the server filter is used on selection', async () => {
    const calls = stubActivityRoute({ status: 200, body: EVENTS });
    renderActivity();
    await waitFor(() => expect(screen.getByTestId('activity-case-filter')).toBeTruthy());

    // Candidates come only from events recorded against a case.
    expect(screen.queryByTestId('activity-filter-all')).toBeTruthy();
    expect(screen.getByTestId('activity-filter-case-claim-A').textContent).toBe(
      'This case: claim-A',
    );
    expect(screen.queryByTestId('activity-filter-case-ver-demo-manuscript-v1')).toBeNull(); // not a case

    fireEvent.click(screen.getByTestId('activity-filter-case-claim-A'));
    await waitFor(() => expect(calls).toHaveLength(2));

    // Per-case refetch: server-side read-only filter as the query param.
    expect(calls[1]?.url).toBe(
      `/.netlify/functions/activity?caseId=${encodeURIComponent('claim-A')}`,
    );
    await waitFor(() =>
      expect(screen.getByTestId('activity-case-scope').textContent).toContain('claim-A'),
    );
    expect(screen.getByTestId('activity-case-scope').textContent).toMatch(
      /not recorded per case/,
    );
    // aria-pressed reflects the active filter.
    expect(
      screen.getByTestId('activity-filter-case-claim-A').getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('returns to the full timeline with "All events" (unfiltered server read)', async () => {
    const calls = stubActivityRoute({ status: 200, body: EVENTS });
    renderActivity();
    await waitFor(() => expect(screen.getByTestId('activity-case-filter')).toBeTruthy());
    fireEvent.click(screen.getByTestId('activity-filter-case-claim-A'));
    await waitFor(() => expect(calls).toHaveLength(2));
    fireEvent.click(screen.getByTestId('activity-filter-all'));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]?.url).toBe('/.netlify/functions/activity');
  });

  it('filtered per-case view without recorded events stays honest and empty', async () => {
    stubActivityRoute({ status: 200, body: EVENTS });
    renderActivity();
    await waitFor(() => expect(screen.getByTestId('activity-case-filter')).toBeTruthy());
    // The filtered read answers honestly: no decisions recorded for this case.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/activity')) {
          return Promise.resolve(
            new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.reject(new TypeError(`unexpected fetch ${url}`));
      }),
    );
    fireEvent.click(screen.getByTestId('activity-filter-case-claim-A'));
    await waitFor(() =>
      expect(screen.getByTestId('activity-empty').textContent).toBe(
        'No activity recorded for this case yet.',
      ),
    );
  });

  it('per-case view of a malformed caseId would fail server-side: the page sends the raw user value and reports the HTTP error', async () => {
    // The client never silently "fixes" input: the 400 arrives as a typed
    // error and the honest failure state is shown.
    stubFetchByRoute((url) =>
      url.includes('/activity')
        ? url.includes('caseId=')
          ? { status: 400, body: { error: 'invalid-request', message: 'bad caseId' } }
          : { status: 200, body: [EVENTS[0]] }
        : undefined,
    );
    renderActivity();
    await waitFor(() => expect(screen.getByTestId('activity-case-filter')).toBeTruthy());
    fireEvent.click(screen.getByTestId('activity-filter-case-claim-A'));
    await waitFor(() =>
      expect(screen.getByTestId('activity-failure-detail').textContent).toMatch(/HTTP 400/),
    );
  });
});
