import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  getIndependenceGroups as realGetIndependenceGroups,
  type IndependenceGroup,
  type IndependenceGroupsData,
  type IndependenceGroupsOutcome,
} from '../lib/api';

/**
 * W4 — Independence groups panel (read-only; design of record:
 * /tmp/opencode/wave4-spec.md §Frontend files).
 *
 * Mounted ABOVE the review cases list on the review queue. It informs
 * review: two claims sharing a supporting publication record are NOT
 * independent evidence for each other, so the reviewer should examine them
 * together at the paper itself.
 *
 * Hard rules this panel encodes:
 * - READ-ONLY. There is no write affordance anywhere; the panel never
 *   flips a review state and never labels a claim verified or disproven.
 * - The server's caveat and limitations strings are rendered VERBATIM.
 * - Honest states everywhere: loading, empty (sharedGroups = 0), endpoint
 *   not available, and typed failure with a Retry. Nothing is simulated.
 * - A publication with `isSynthetic === true` carries the
 *   FICTIONAL / GUIDED DEMO label; a null flag is labeled "not reported",
 *   never assumed false.
 */

type PanelLoad =
  | { phase: 'loading' }
  | { phase: 'ready'; data: IndependenceGroupsData }
  | { phase: 'missing'; reason: 'endpoint-missing' | 'not-implemented' }
  | { phase: 'failure'; message: string };

/**
 * The exact honest empty-state copy (spec-fixed): a real zero is a real
 * result — never read as a guarantee of independence.
 */
export const INDEPENDENCE_EMPTY_COPY =
  'No shared supporting publication among visible claims — honest result, never a guarantee of independence.';

/** Fixed footer truth line: this panel informs review; it never decides it. */
export const INDEPENDENCE_READONLY_COPY =
  'This panel is read-only. Sharing a supporting publication never flips a review state and never presents any claim as upheld or rejected — review decisions remain human work through the decision dialog.';

interface IndependencePanelProps {
  /**
   * Injectable implementation for tests; defaults to the real typed client.
   * Signature mirrors `getIndependenceGroups` from ../lib/api exactly.
   */
  getIndependenceGroups?: (
    options?: { signal?: AbortSignal },
  ) => Promise<IndependenceGroupsOutcome>;
}

/**
 * Typed error copy — mirrors the review-queue honest failure descriptions.
 * ApiHttpError must be checked BEFORE the generic ApiClientError branch.
 */
function describeIndependenceError(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return 'The independence-groups API did not answer within 10 seconds (timeout) — nothing was read and nothing changed.';
  }
  if (error instanceof ApiNetworkError) {
    return 'Network error — the request did not reach the independence-groups API. Nothing was read and nothing changed.';
  }
  if (error instanceof ApiHttpError) {
    if (error.status === 429) {
      return 'Rate limited (HTTP 429) — the independence endpoint allows only a few reads per short interval. Wait for the cooldown to pass, then retry.';
    }
    if (error.status === 503) {
      return 'The graph is unreachable (HTTP 503) — shared supporting publications could not be read. Try again when the graph answers.';
    }
    return `The independence-groups API returned HTTP ${error.status} — nothing was read.`;
  }
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return 'Unexpected failure while reading the independence groups. Nothing is simulated in place of the real data.';
}

export default function IndependencePanel({
  getIndependenceGroups,
}: IndependencePanelProps) {
  const call = getIndependenceGroups ?? realGetIndependenceGroups;
  const controllerRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<PanelLoad>({ phase: 'loading' });

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ phase: 'loading' });

    call({ signal: controller.signal })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.available) {
          setState({ phase: 'ready', data: outcome.data });
        } else {
          setState({ phase: 'missing', reason: outcome.reason });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ phase: 'failure', message: describeIndependenceError(error) });
      });
  }, [call]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const data = state.phase === 'ready' ? state.data : null;
  const groups = data?.groups ?? [];

  return (
    <section
      aria-labelledby="independence-panel-heading"
      data-testid="independence-panel"
      className="rounded-lg border border-ink-border bg-paper-raised p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="independence-panel-heading" className="text-lg font-semibold text-ink">
          Independence groups — shared supporting publications
        </h2>
        {data && (
          <p className="text-xs text-ink-muted" data-testid="independence-summary">
            {data.graphName ? <span className="font-mono">{data.graphName}</span> : null}
            {data.graphName ? ' · ' : ''}
            {data.seedVersion ? `seed ${data.seedVersion} · ` : ''}
            {data.summary.supportingCitationUses} supporting citation use
            {data.summary.supportingCitationUses !== 1 ? 's' : ''} ·{' '}
            {data.summary.publicationsSupportingClaims} publication
            {data.summary.publicationsSupportingClaims !== 1 ? 's' : ''} supporting claims ·{' '}
            <strong>{data.summary.sharedGroups}</strong> shared group
            {data.summary.sharedGroups !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {state.phase === 'loading' && (
        <p
          className="mt-3 text-sm text-ink-muted"
          role="status"
          data-testid="independence-loading"
        >
          Reading shared supporting publications from the graph…
        </p>
      )}

      {state.phase === 'missing' && (
        <div className="mt-3" data-testid="independence-missing">
          <p className="max-w-prose text-sm text-ink-muted">
            {state.reason === 'not-implemented'
              ? 'The independence endpoint reports “not implemented” on this build.'
              : 'No independence endpoint answered (function missing — HTTP 404 or an HTML page fallback).'}{' '}
            Shared supporting publications are read only from the real API, so none are
            shown until it answers — none are derived locally.
          </p>
          <button
            type="button"
            onClick={load}
            data-testid="independence-retry"
            className="mt-2 rounded border border-ink-border bg-paper px-3 py-1.5 text-sm text-ink hover:bg-paper-deep"
          >
            Retry independence read
          </button>
        </div>
      )}

      {state.phase === 'failure' && (
        <div className="mt-3" data-testid="independence-failure">
          <p
            role="alert"
            className="max-w-prose text-sm text-notice-text"
            data-testid="independence-failure-detail"
          >
            {state.message}
          </p>
          <button
            type="button"
            onClick={load}
            data-testid="independence-retry"
            className="mt-2 rounded border border-notice-text bg-notice-surface px-3 py-1.5 text-sm font-medium text-notice-text hover:bg-notice-surface-deep"
          >
            Retry independence read
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Server honesty strings — verbatim, always visible when returned. */}
          {(data.caveat || data.limitations) && (
            <div
              className="mt-3 rounded border border-uncertain-border bg-uncertain-surface px-4 py-3"
              data-testid="independence-caveats"
            >
              {data.caveat ? (
                <p className="max-w-prose text-sm text-uncertain-text" data-testid="independence-caveat">
                  {data.caveat}
                </p>
              ) : (
                <p className="max-w-prose text-sm text-uncertain-text" data-testid="independence-caveat">
                  The endpoint returned no standing caveat — this is a contract gap, and no
                  assumptions are made in its place.
                </p>
              )}
              {data.limitations && data.limitations.length > 0 && (
                <ul
                  className="mt-2 list-disc space-y-1 pl-4 text-xs text-uncertain-text"
                  data-testid="independence-limitations"
                >
                  {data.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {groups.length === 0 ? (
            <p
              className="mt-3 max-w-prose text-base text-ink-muted"
              data-testid="independence-empty"
            >
              {INDEPENDENCE_EMPTY_COPY}
            </p>
          ) : (
            <ul className="mt-3 space-y-3" data-testid="independence-groups">
              {groups.map((group) => (
                <GroupCard key={group.publication.id} group={group} />
              ))}
            </ul>
          )}
        </>
      )}

      {/* Standing read-only truth line — the panel informs review, never decides it. */}
      <p
        className="mt-4 border-t border-ink-border pt-3 text-xs text-ink-muted"
        data-testid="independence-readonly-note"
      >
        {INDEPENDENCE_READONLY_COPY}
      </p>
    </section>
  );
}

function GroupCard({ group }: { group: IndependenceGroup }) {
  const { publication, claims, citationUseIds } = group;
  const claimId = publication.id;
  return (
    <li>
      <article
        data-testid={`independence-group-${claimId}`}
        className="rounded border border-ink-border bg-paper p-3 text-sm text-ink"
      >
        <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="font-medium">
            Publication <span className="break-all font-mono">{publication.id}</span> supports{' '}
            {group.claimCount} claim{group.claimCount !== 1 ? 's' : ''} here — not independent
            evidence for each other
          </p>
          {publication.isSynthetic === true && (
            <span
              data-testid={`independence-group-${claimId}-synthetic`}
              className="inline-flex shrink-0 items-center rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text"
            >
              FICTIONAL / GUIDED DEMO
            </span>
          )}
          {publication.isSynthetic !== true && publication.isSynthetic !== false && (
            <span
              data-testid={`independence-group-${claimId}-synthetic-unreported`}
              className="inline-flex shrink-0 items-center rounded border border-ink-border bg-paper-deep px-2 py-0.5 text-xs text-ink-muted"
            >
              synthetic flag not reported
            </span>
          )}
        </header>
        <p className="mt-1" data-testid={`independence-group-${claimId}-identity`}>
          {publication.title ? (
            <span className="text-ink">“{publication.title}”</span>
          ) : (
            <span className="text-ink-muted">No title recorded on the returned record</span>
          )}
          {' · '}
          {publication.doi ? (
            <span className="break-all font-mono" data-testid={`independence-group-${claimId}-doi`}>
              DOI {publication.doi}
            </span>
          ) : (
            <span className="text-ink-muted" data-testid={`independence-group-${claimId}-doi-missing`}>
              No DOI recorded
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-ink-muted" data-testid={`independence-group-${claimId}-uses`}>
          Supporting citation use{citationUseIds.length !== 1 ? 's' : ''}:{' '}
          {citationUseIds.length > 0 ? (
            <span className="break-all font-mono">{citationUseIds.join(', ')}</span>
          ) : (
            'none returned by the payload'
          )}
        </p>
        {claims.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-medium text-ink">Claims sharing this supporting record</p>
            <div
              className="mt-1 flex flex-wrap gap-1.5"
              data-testid={`independence-group-${claimId}-claims`}
            >
              {claims.map((claim) => (
                <span
                  key={claim.id}
                  className="inline-flex items-center gap-1 rounded border border-ink-border bg-paper-deep px-1.5 py-0.5 text-xs"
                >
                  <span className="text-ink-muted">claim</span>
                  <span className="break-all font-mono">{claim.id}</span>
                  {claim.status && <span className="text-ink-muted">· {claim.status}</span>}
                  {!claim.text && !claim.status && (
                    <span className="text-ink-muted">· text/status not recorded</span>
                  )}
                </span>
              ))}
            </div>
            {claims.every((claim) => !claim.text) && (
              <p className="mt-1 text-xs text-ink-muted">
                No claim text was returned by this payload — examine these claims by id in the
                graph; none is invented here.
              </p>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
