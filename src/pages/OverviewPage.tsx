import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  ApiUnavailableError,
  getSeedStatus,
  type SeedStatus,
} from '../lib/api';

type ProbeState =
  | { phase: 'checking' }
  | { phase: 'seeded'; status: SeedStatus }
  | { phase: 'empty'; status: SeedStatus }
  | { phase: 'failure'; detail: string };

/**
 * Overview — one primary card, one secondary destination (handoff §5):
 * the top card is the main next action ("Continue your work" when the
 * demo graph is seeded; the guided-example start when it is not), the
 * Knowledge Graph is a clearly secondary destination card, and the
 * service status lives in a quiet line at the end of the page (its
 * prominent header placement is gone). Seed presence is verified with a
 * real /graph/probe call; failed checks are disclosed, never assumed away.
 */
export default function OverviewPage() {
  const [probe, setProbe] = useState<ProbeState>({ phase: 'checking' });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    getSeedStatus({ signal: controller.signal })
      .then((status) => {
        if (controller.signal.aborted) return;
        setProbe(
          status.exists
            ? { phase: 'seeded', status }
            : { phase: 'empty', status },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // 5xx / network / parse / availability problems each carry a typed,
        // human-readable detail. Never credentials, URLs or raw jargon —
        // and never a guessed workspace state instead of the failure.
        const detail =
          error instanceof ApiUnavailableError
            ? 'Likely the site fallback served HTML instead of JSON — the status function may be missing from this deployment.'
            : error instanceof ApiTimeoutError
              ? 'The seed status check timed out after 10 seconds.'
              : error instanceof ApiHttpError
                ? `API answered with HTTP ${error.status}.`
                : error instanceof ApiNetworkError
                  ? 'The seed status check could not reach the API.'
                  : 'The response could not be read as graph state.';
        setProbe({ phase: 'failure', detail });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl text-ink">Overview</h1>

      {probe.phase === 'seeded' ? (
        <section
          aria-labelledby="overview-continue"
          className="mt-8 rounded-lg border border-ink-border bg-paper-raised p-6 md:p-8"
          data-testid="continue-card"
        >
          <h2 id="overview-continue" className="text-lg font-semibold text-ink">
            Continue your work
          </h2>
          <p className="mt-3 max-w-prose text-base text-ink" data-testid="continue-summary">
            The guided demo graph is present. The demo results view maps verified
            notices, affected claims, historical mentions and unresolved
            references from the real graph data.
          </p>
          {/* Probe details stay inspectable but out of the primary message:
              a quiet, truthful caption rather than dev jargon in the card. */}
          <p
            className="mt-3 text-xs leading-5 text-ink-muted"
            data-testid="continue-caption"
          >
            Graph probe details{probe.status.seedVersion && `: seedVersion ${probe.status.seedVersion}`}
            {typeof probe.status.nodeCount === 'number' && `, ${probe.status.nodeCount} nodes`} —
            read from the real <code className="rounded bg-paper-deep px-1">/graph-probe</code>{' '}
            check, never guessed.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/results"
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white no-underline hover:bg-brand-deep"
            >
              View guided results
            </Link>
            <Link
              to="/review-queue"
              className="rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink no-underline hover:bg-paper-deep"
            >
              Review Queue
            </Link>
          </div>
        </section>
      ) : probe.phase === 'checking' ? (
        <p className="mt-8 text-base text-ink-muted" role="status" data-testid="overview-checking">
          Checking whether a demo graph already exists…
        </p>
      ) : probe.phase === 'failure' ? (
        <p
          className="mt-8 rounded border border-notice-border bg-notice-surface px-4 py-3 text-base text-ink"
          role="note"
          data-testid="overview-probe-failure"
        >
          <span className="block font-medium">
            Seed status can’t be confirmed right now — the overview API didn’t respond.
          </span>
          <span className="mt-1 block text-sm text-ink-muted">{probe.detail}</span>
          <span className="mt-1 block text-sm text-ink-muted">
            The workspace cannot confirm seed status, so no “continue your work” card is
            shown — status is never guessed.
          </span>
        </p>
      ) : (
        <section
          aria-labelledby="overview-attention"
          className="mt-8 rounded-lg border border-ink-border bg-paper-raised p-6 md:p-8"
          data-testid="import-first-card"
        >
          <h2 id="overview-attention" className="text-lg font-semibold text-ink">
            Getting started
          </h2>
          <p className="mt-3 max-w-prose text-base text-ink">
            There is no seeded demo graph in this environment yet, so there is no
            continuation work to show. The guided example seeds the synthetic demo
            through the guarded, rate-limited API and then shows real graph-derived
            results. Document import is not wired in this build — nothing is uploaded
            anywhere.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/"
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white no-underline hover:bg-brand-deep"
            >
              Try guided example
            </Link>
            <Link
              to="/"
              className="rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink no-underline hover:bg-paper-deep"
            >
              Import a document
            </Link>
          </div>
        </section>
      )}

      {/* Secondary destination — deliberately quieter than the primary card. */}
      <section
        aria-labelledby="overview-graph"
        className="mt-6 rounded-lg border border-ink-border bg-paper p-5"
        data-testid="overview-graph-card"
      >
        <h2 id="overview-graph" className="text-base font-semibold text-ink">
          Knowledge Graph
        </h2>
        <p className="mt-2 max-w-prose text-base text-ink-muted">
          Browse the records the demo graph actually returns — canvas plus a
          plain-text records list, with provenance, review state and
          FICTIONAL / GUIDED DEMO labels. If the graph API is unavailable, the
          page says so plainly.
        </p>
        <Link
          to="/graph"
          className="mt-4 inline-block rounded border border-ink-border bg-paper-raised px-4 py-2 text-sm text-ink no-underline hover:bg-paper-deep"
        >
          Open the Knowledge Graph
        </Link>
      </section>

      <div className="mt-10 border-t border-ink-border pt-4" data-testid="overview-status-footnote">
        <p className="max-w-prose text-base text-ink-muted">
          The sidebar status line queries the platform’s real{' '}
          <code className="rounded bg-paper-deep px-1">/health</code> endpoint; the cards
          above reflect the real <code className="rounded bg-paper-deep px-1">/graph-probe</code>{' '}
          read-only check. “Online” never implies a connected data layer, and nothing here
          is simulated.
        </p>
      </div>
    </div>
  );
}
