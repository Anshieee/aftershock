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
    timestampLabel: 'Human review recorded',
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
    // The event timestamp is the recorded run window's end (completedAt when
    // the run finished, else startedAt) — a recorded execution time, never
    // a "discovery"/scanning claim.
    timestampLabel: 'Analysis',
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

/**
 * One explicitly labeled date KIND line per distinct server timestamp (M7
 * Priority D). The label verbatim names WHICH date it is — publication
 * announcement, indexing-system record, first recorded by Aftershock (demo
 * seed — never "discovery"/scanning), verification, analysis window. Kinds
 * are never merged: every distinct timestamp gets its own labeled line, in
 * the event's own color role.
 */
type DateKind = {
  /** Long label rendered before the formatted date. */
  label: string;
  /** Slug used for the per-line test id. */
  kind: string;
  /** Raw timestamp value from this event. */
  timestamp: string | null | undefined;
};

/**
 * Additional date-kind lines for a source_notice event — the notice's OTHER
 * recorded timestamps beyond the primary (official publication) date. A kind
 * absent from the server response is simply not shown; never guessed, never
 * implied, and never merged into another kind's line.
 */
function extraDateKindsOf(event: ActivityEvent): DateKind[] {
  if (event.type !== 'source_notice') return [];
  const kinds: DateKind[] = [];
  if (event.noticeRecordedDate) {
    kinds.push({ label: 'PubMed/PMC record', kind: 'notice-recorded', timestamp: event.noticeRecordedDate });
  }
  // In the demo graph detectedAt equals the seed timestamp for every
  // recorded notice, so the label says so — never scanning/discovery.
  if (event.detectedAt) {
    kinds.push({ label: 'First recorded by Aftershock (demo seed)', kind: 'detected', timestamp: event.detectedAt });
  }
  if (event.lastVerifiedAt) {
    kinds.push({ label: 'Last verified', kind: 'last-verified', timestamp: event.lastVerifiedAt });
  }
  return kinds;
}

/**
 * Analysis-run date kinds: the event's primary time is one end of the
 * recorded run window (completedAt when the run finished, else startedAt);
 * when BOTH ends are recorded, the other end gets its own labeled line so
 * the window stays visible rather than being collapsed into one date.
 */
function extraRunDateKindsOf(event: ActivityEvent): DateKind[] {
  if (event.type !== 'analysis_run') return [];
  if (event.completedAt && event.startedAt) {
    return [{ label: 'Analysis started', kind: 'started', timestamp: event.startedAt }];
  }
  return [];
}

function allExtraDateKindsOf(event: ActivityEvent): DateKind[] {
  return extraDateKindsOf(event).concat(extraRunDateKindsOf(event));
}

/** Format one date-kind line's value; an unparseable server value is shown verbatim. */
function formatDateLine(timestamp: string | null | undefined): string {
  if (!timestamp) return 'not recorded';
  const date = parseEventDate(timestamp);
  return date ? `${formatDateStamp(date)} · ${formatTimeStamp(date)}` : timestamp;
}

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

/**
 * Timestamp-label for the event's primary (timeline-position) time. Kind is
 * always explicit: an analysis run's timestamp comes from its recorded run
 * window (completedAt when finished, else startedAt) — never a discovery or
 * scanning date. The export_generated type never occurs in server output
 * today (no server export event is assembled); it stays honest if it ever
 * appears.
 */
function primaryTimestampLabel(event: ActivityEvent): string {
  const info = TYPE_INFO[event.type];
  if (event.type === 'analysis_run') {
    return event.completedAt ? 'Analysis completed' : event.startedAt ? 'Analysis started' : info.timestampLabel;
  }
  return info.timestampLabel;
}

function EventItem({ event }: { event: ActivityEvent }) {
  const info = TYPE_INFO[event.type];
  const date = parseEventDate(event.timestamp);
  const timestamp = date
    ? `${formatDateStamp(date)} · ${formatTimeStamp(date)}`
    : event.timestamp || 'Time not recorded';
  const kindList = allExtraDateKindsOf(event);

  return (
    <li
      data-testid={`activity-event-${event.id}`}
      className={`group rounded-xl ${info.border} ${info.surface} p-4 md:p-5`}
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
              {primaryTimestampLabel(event)}
            </p>
            <time
              className="text-sm text-ink-muted"
              dateTime={event.timestamp}
              data-testid={`activity-event-${event.id}-timestamp`}
            >
              {timestamp}
            </time>
            {kindList.length > 0 && (
              <div
                className="mt-1 space-y-0.5"
                data-testid={`activity-event-${event.id}-date-kinds`}
              >
                {kindList.map(({ label, kind, timestamp }) => (
                  <p
                    key={kind}
                    className="text-xs text-ink-muted"
                    data-testid={`activity-event-${event.id}-date-kind-${kind}`}
                  >
                    {label} {formatDateLine(timestamp)}
                  </p>
                ))}
              </div>
            )}
            {event.actor && (
              <p className="mt-1 text-xs text-ink-muted" data-testid={`activity-event-${event.id}-actor`}>
                {event.actor}
              </p>
            )}
            {event.type === 'review_decision' && event.targetId && (
              <p className="mt-1 text-xs" data-testid={`activity-event-${event.id}-case-id`}>
                <span className="text-ink-muted">Case: </span>
                <span className="break-all font-mono text-ink">{event.targetId}</span>
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
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 border-t border-ink-border text-xs">
          {event.beforeState && (
            <p className="text-ink-muted" data-testid={`activity-event-${event.id}-before`}>
              <span className="font-medium">Before:</span> {event.beforeState}
            </p>
          )}
          {event.beforeState && event.afterState && (
            <span aria-hidden="true" className="text-ink-muted">→</span>
          )}
          {event.afterState && (
            <p className="text-ink-muted" data-testid={`activity-event-${event.id}-after`}>
              <span className="font-medium">After:</span> {event.afterState}
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
  /** M7 Priority D — per-case view. null = whole timeline (server reads every type). */
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  /** Case ids known from the last unfiltered load (selection candidates). */
  const [knownCaseIds, setKnownCaseIds] = useState<string[]>([]);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback((caseId: string | null) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setFeed({ phase: 'loading' });

    getActivity(caseId ? { caseId, signal: controller.signal } : { signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.available) {
          setFeed({ phase: 'ready', events: outcome.data });
          if (!caseId) {
            // Candidates for the per-case view come from review_decision
            // events' recorded targetId/targetType — same-publication
            // notices and analysis runs are never case-scoped records, so
            // they do not contribute candidates.
            const cases = Array.from(
              new Set(
                outcome.data
                  .filter((event) => event.targetType === 'case' && event.targetId)
                  .map((event) => event.targetId as string),
              ),
            );
            setKnownCaseIds(cases);
          }
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
    load(selectedCaseId);
    return () => controllerRef.current?.abort();
  }, [load, selectedCaseId]);

  const events = feed.phase === 'ready' ? feed.events : [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight text-ink">Activity</h1>
        {feed.phase === 'ready' && (
          <p className="text-xs text-ink-muted" data-testid="activity-counts">
            {events.length} event{events.length !== 1 ? 's' : ''} recorded
          </p>
        )}
      </div>

      {knownCaseIds.length > 0 && (
        <div
          className="mt-2 flex flex-wrap items-center gap-2"
          data-testid="activity-case-filter"
        >
          <span className="text-xs uppercase tracking-wide text-ink-muted">View</span>
          <button
            type="button"
            onClick={() => setSelectedCaseId(null)}
            aria-pressed={selectedCaseId === null}
            data-testid="activity-filter-all"
            className={selectedCaseId === null
              ? 'rounded-full border border-ink-border bg-ink px-3 py-1 text-xs text-paper'
              : 'rounded-full border border-ink-border bg-paper px-3 py-1 text-xs text-ink-muted hover:bg-paper-deep'}
          >
            All events
          </button>
          {knownCaseIds.map((caseId) => (
            <button
              key={caseId}
              type="button"
              onClick={() => setSelectedCaseId(caseId)}
              aria-pressed={selectedCaseId === caseId}
              data-testid={`activity-filter-case-${caseId}`}
              className={selectedCaseId === caseId
                ? 'rounded-full border border-reviewed bg-reviewed px-3 py-1 text-xs font-mono text-paper'
                : 'rounded-full border border-reviewed bg-reviewed-surface px-3 py-1 font-mono text-xs text-reviewed-text hover:bg-review-surface'}
            >
              This case: {caseId}
            </button>
          ))}
        </div>
      )}

      {selectedCaseId !== null && feed.phase === 'ready' && (
        <p className="mt-2 max-w-prose text-xs text-ink-muted" data-testid="activity-case-scope">
          Per-case view: only review events recorded against{' '}
          <span className="break-all font-mono">{selectedCaseId}</span> are shown. Publication
          notices and analysis runs are not recorded per case, so a case view never lists them.
        </p>
      )}

      {feed.phase === 'loading' && (
        <p className="mt-6 text-sm text-ink-muted" role="status" data-testid="activity-loading">
          Reading activity timeline…
        </p>
      )}

      {feed.phase === 'missing' && (
        <section
          aria-labelledby="activity-missing-heading"
          className="mt-6 rounded-xl border border-ink-border bg-paper-raised p-6"
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
              onClick={() => load(selectedCaseId)}
              className="rounded-lg border border-ink-border bg-paper px-4 py-2 text-sm text-ink hover:bg-paper-deep"
            >
              Retry
            </button>
            <Link to="/" className="rounded-lg px-4 py-2 text-sm text-ink-muted no-underline hover:text-ink">
              Back to landing
            </Link>
          </div>
        </section>
      )}

      {feed.phase === 'failure' && (
        <section
          aria-labelledby="activity-failure-heading"
          className="mt-6 rounded-xl border border-notice-border bg-notice-surface p-6"
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
              onClick={() => load(selectedCaseId)}
              className="rounded-lg border border-ink-border bg-paper px-4 py-2 text-sm text-ink hover:bg-paper-deep"
            >
              Retry
            </button>
            <Link to="/" className="rounded-lg px-4 py-2 text-sm text-ink-muted no-underline hover:text-ink">
              Back to landing
            </Link>
          </div>
        </section>
      )}

      {feed.phase === 'ready' && (
        <section aria-labelledby="activity-timeline-heading" className="mt-6">
          <h2 id="activity-timeline-heading" className="text-lg font-semibold text-ink">
            {selectedCaseId !== null ? `Activity for this case` : 'Activity timeline'}
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
              {selectedCaseId !== null
                ? 'No activity recorded for this case yet.'
                : 'No activity recorded yet.'}
            </p>
          ) : (
            <ul role="list" className="mt-4 space-y-3" data-testid="activity-list">
              {buildDateGroups(events).map((group, groupIndex) => (
                <React.Fragment key={`activity-group-${groupIndex}`}>
                  <h3
                    id={`activity-group-${groupIndex}`}
                    className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted"
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
