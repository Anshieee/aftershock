import { Link } from 'react-router-dom';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityEvent,
  ActivityEventType,
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  getActivity,
} from '../lib/api';

type ActivityFeed =
  | { phase: 'loading' }
  | { phase: 'ready'; events: ActivityEvent[] }
  | { phase: 'missing'; reason: 'endpoint-missing' | 'not-implemented' }
  | { phase: 'failure'; message: string };

type TypeInfo = {
  label: string;        // human-readable event-type badge text
  timestampLabel: string; // label shown above the event time
  border: string;
  surface: string;
  text: string;
  dot: string;
};

const TYPE_INFO: Record<ActivityEventType, TypeInfo> = {
  review_decision: {
    label: 'Review decision',
    timestampLabel: 'Human review',
    border: 'border-reviewed',
    surface: 'bg-reviewed-surface',
    text: 'text-reviewed-text',
    dot: 'bg-reviewed',
  },
  source_notice: {
    label: 'Source notice',
    timestampLabel: 'Notice published',
    border: 'border-notice-border',
    surface: 'bg-notice-surface',
    text: 'text-notice-text',
    dot: 'bg-notice-text',
  },
  analysis_run: {
    label: 'Analysis run',
    timestampLabel: 'Discovered by Aftershock',
    border: 'border-brand',
    surface: 'bg-brand-surface',
    text: 'text-brand',
    dot: 'bg-brand',
  },
  export_generated: {
    label: 'Export generated',
    timestampLabel: 'Export generated',
    border: 'border-review-border',
    surface: 'bg-review-surface',
    text: 'text-review-text',
    dot: 'bg-review-text',
  },
};

function eventTimeMs(event: ActivityEvent): number {
  return Date.parse(event.timestamp);
}

function parseEventDate(timestamp: string): Date | null {
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatDateStamp(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeStamp(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Groups events by calendar date, newest group and newest event first. */
function buildDateGroups(events: ActivityEvent[]): Array<{
  label: string;
  events: ActivityEvent[];
}> {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = startOfDay(new Date(now));
  yesterday.setDate(yesterday.getDate() - 1);

  const byKey = new Map<string, { label: string; events: ActivityEvent[] }>();

  // Newest events first so groups and in-group order are newest-first.
  const ordered = [...events].sort((a, b) => eventTimeMs(b) - eventTimeMs(a));

  for (const event of ordered) {
    const date = parseEventDate(event.timestamp);
    if (!date) continue;
    const key = date.toDateString();
    let label: string;
    if (date.getTime() === today.getTime()) {
      label = 'Today';
    } else if (date.getTime() === yesterday.getTime()) {
      label = 'Yesterday';
    } else {
      label = formatDateStamp(date);
    }
    let group = byKey.get(key);
    if (!group) {
      group = { label, events: [] };
      byKey.set(key, group);
    }
    group.events.push(event);
  }

  return Array.from(byKey.values());
}

function EventItem({ event }: { event: ActivityEvent }) {
  const info = TYPE_INFO[event.type];
  const date = parseEventDate(event.timestamp);
  const timestamp = date
    ? `${formatDateStamp(date)} · ${formatTimeStamp(date)}`
    : event.timestamp || 'Time not recorded';

  return (
    <li
      data-testid={`activity-event-${event.id}`}
      className={`group rounded-lg ${info.border} ${info.surface} p-4 md:p-5`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`shrink-0 w-6 h-6 rounded-full ${info.dot}`}
            data-testid={`activity-event-${event.id}-dot`}
          />
          <div className="leading-snug">
            <p
              className={`font-semibold text-sm ${info.text}`}
              data-testid={`activity-event-${event.id}-type`}
            >
              {info.label}
            </p>
            <p className={`text-xs ${info.text}`} data-testid={`activity-event-${event.id}-timestamp-label`}>
              {info.timestampLabel}
            </p>
            <time
              className="text-sm text-ink-muted"
              dateTime={event.timestamp}
              data-testid={`activity-event-${event.id}-timestamp`}
            >
              {timestamp}
            </time>
            {event.actor && (
              <p className="mt-1 text-xs text-ink-muted" data-testid={`activity-event-${event.id}-actor`}>
                {event.actor}
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 text-base text-ink" data-testid={`activity-event-${event.id}-action`}>
        {event.action}
      </p>

      {event.description && (
        <p className="mt-1 text-sm text-ink-muted" data-testid={`activity-event-${event.id}-description`}>
          {event.description}
        </p>
      )}

      {(event.beforeState || event.afterState) && (
        <div className="mt-3 pt-2 border-t border-ink-border">
          {event.beforeState && (
            <p className="text-xs text-ink-muted" data-testid={`activity-event-${event.id}-before`}>
              <span className="font-medium">Before:</span>{' '}
              {event.beforeState}
            </p>
          )}
          {event.afterState && (
            <p className="mt-1 text-xs text-ink-muted" data-testid={`activity-event-${event.id}-after`}>
              <span className="font-medium">After:</span>{' '}
              {event.afterState}
            </p>
          )}
        </div>
      )}

      {event.isSynthetic && (
        <p
          className="mt-3 inline-flex items-center gap-1 rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text"
          data-testid={`activity-event-${event.id}-synthetic`}
        >
          {event.syntheticLabel ?? 'FICTIONAL / GUIDED DEMO'}
        </p>
      )}
    </li>
  );
}

export default function ActivityPage() {
  const [feed, setFeed] = useState<ActivityFeed>({ phase: 'loading' });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setFeed({ phase: 'loading' });

    getActivity({ signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.available) {
          setFeed({ phase: 'ready', events: outcome.data });
        } else {
          setFeed({ phase: 'missing', reason: outcome.reason });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiTimeoutError) {
          setFeed({
            phase: 'failure',
            message: 'The activity API did not answer within 10 seconds (timeout).',
          });
        } else if (error instanceof ApiNetworkError) {
          setFeed({
            phase: 'failure',
            message: 'Activity API unavailable — network error, nothing could be read.',
          });
        } else if (error instanceof ApiHttpError) {
          setFeed({ phase: 'failure', message: `Activity API returned HTTP ${error.status}.` });
        } else if (error instanceof ApiClientError) {
          setFeed({ phase: 'failure', message: error.message });
        } else {
          setFeed({
            phase: 'failure',
            message: 'Unexpected failure while reading activity events.',
          });
        }
      });
  }, []);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const events = feed.phase === 'ready' ? feed.events : [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">Activity</h1>
        {feed.phase === 'ready' && (
          <p className="text-xs text-ink-muted" data-testid="activity-counts">
            {events.length} event{events.length !== 1 ? 's' : ''} recorded
          </p>
        )}
      </div>

      {feed.phase === 'loading' && (
        <p className="mt-6 text-sm text-ink-muted" role="status" data-testid="activity-loading">
          Reading activity timeline…
        </p>
      )}

      {feed.phase === 'missing' && (
        <section
          aria-labelledby="activity-missing-heading"
          className="mt-6 rounded-lg border border-ink-border bg-paper-raised p-6"
          data-testid="activity-missing"
        >
          <h2 id="activity-missing-heading" className="text-lg font-semibold text-ink">
            Activity not available yet
          </h2>
          <p className="mt-2 max-w-prose text-base text-ink-muted">
            {feed.reason === 'not-implemented'
              ? 'The activity endpoint reports “not implemented” on this build.'
              : 'No activity endpoint answered (function missing — HTTP 404 or an HTML page fallback).'}{' '}
            Events are read only from the real /activity API, so none are shown until it answers.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={load}
              className="rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink hover:bg-paper-deep"
            >
              Retry
            </button>
            <Link to="/" className="rounded px-4 py-2 text-sm text-ink-muted no-underline hover:text-ink">
              Back to landing
            </Link>
          </div>
        </section>
      )}

      {feed.phase === 'failure' && (
        <section
          aria-labelledby="activity-failure-heading"
          className="mt-6 rounded-lg border border-notice-border bg-notice-surface p-6"
          data-testid="activity-failure"
        >
          <h2 id="activity-failure-heading" className="text-lg font-semibold text-notice-text">
            Activity unavailable
          </h2>
          <p className="mt-2 text-base text-ink" data-testid="activity-failure-detail">
            {feed.message} Nothing is simulated in place of the real data.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={load}
              className="rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink hover:bg-paper-deep"
            >
              Retry
            </button>
            <Link to="/" className="rounded px-4 py-2 text-sm text-ink-muted no-underline hover:text-ink">
              Back to landing
            </Link>
          </div>
        </section>
      )}

      {feed.phase === 'ready' && (
        <section aria-labelledby="activity-timeline-heading" className="mt-6">
          <h2 id="activity-timeline-heading" className="text-lg font-semibold text-ink">
            Activity timeline
          </h2>
          <p
            className="mt-1 max-w-prose text-sm text-ink-muted"
            data-testid="activity-attribution"
          >
            Events are read from the real activity API. Nothing here is fabricated. If no events
            appear, no activity has been recorded in this deployment yet.
          </p>

          {events.length === 0 ? (
            <p className="mt-4 max-w-prose text-base text-ink-muted" data-testid="activity-empty">
              No activity recorded yet.
            </p>
          ) : (
            <ul role="list" className="mt-4 space-y-3" data-testid="activity-list">
              {buildDateGroups(events).map((group, groupIndex) => (
                <React.Fragment key={`activity-group-${groupIndex}`}>
                  <h3
                    id={`activity-group-${groupIndex}`}
                    className="mt-3 text-xs font-semibold text-ink-muted tracking-wider"
                  >
                    {group.label}
                  </h3>
                  <ul role="list" className="mt-1 space-y-2">
                    {group.events.map((event) => (
                      <EventItem key={event.id} event={event} />
                    ))}
                  </ul>
                </React.Fragment>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
