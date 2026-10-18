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
  },
  {
    id: 'evt-notice-1',
    type: 'source_notice' as const,
    timestamp: '2020-06-04T00:00:00.000Z',
    actor: 'Aftershock',
    action: 'Retraction notice recorded for Mehra et al. (2020)',
    description: 'Official retraction published by The Lancet.',
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
      'Discovered by Aftershock',
    );
    expect(screen.getByTestId('activity-event-evt-review-1-timestamp-label').textContent).toBe(
      'Human review',
    );
    expect(screen.getByTestId('activity-event-evt-export-1-timestamp-label').textContent).toBe(
      'Export generated',
    );

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
