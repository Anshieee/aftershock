import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  getSeedStatus,
  type SeedStatus,
} from '../lib/api';
import ServiceStatusChip from '../components/ServiceStatusChip';

type ProbeState =
  | { phase: 'checking' }
  | { phase: 'seeded'; status: SeedStatus }
  | { phase: 'empty'; status: SeedStatus }
  | { phase: 'failure'; message: string };

/**
 * Overview — one attention card, not a KPI dashboard (handoff §5):
 * a returning user sees "Continue your work" when the demo graph is seeded;
 * a new user sees the import-first prompt. Seed presence is verified with a
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
        // 5xx / network / parse problems are distinct from "no seed".
        const message =
          error instanceof ApiTimeoutError
            ? 'The seed status check timed out after 10 seconds.'
            : error instanceof ApiHttpError
              ? `The seed status check failed with HTTP ${error.status}.`
              : error instanceof ApiNetworkError
                ? 'The seed status check could not reach the API.'
                : error instanceof ApiClientError
                  ? error.message
                  : 'The seed status check failed unexpectedly.';
        setProbe({ phase: 'failure', message });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-ink">Overview</h1>
        <ServiceStatusChip />
      </div>

      {probe.phase === 'seeded' ? (
        <section
          aria-labelledby="overview-continue"
          className="mt-6 rounded-lg border border-ink-border bg-paper-raised p-6"
          data-testid="continue-card"
        >
          <h2 id="overview-continue" className="text-lg font-semibold text-ink">
            Continue your work
          </h2>
          <p className="mt-2 max-w-prose text-ink" data-testid="continue-summary">
            The guided demo graph is present
            {probe.status.seedVersion && ` (seedVersion ${probe.status.seedVersion})`}
            {typeof probe.status.nodeCount === 'number' && ` with ${probe.status.nodeCount} nodes as reported by the graph probe`}
            . The demo results view maps verified notices, affected claims, historical
            mentions and unresolved references from the real graph data.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/results"
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white no-underline hover:bg-brand-deep"
            >
              View guided results
            </Link>
            <Link
              to="/graph"
              className="rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink no-underline hover:bg-paper-deep"
            >
              Explore the Knowledge Graph
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
        <p className="mt-6 text-sm text-ink-muted" role="status" data-testid="overview-checking">
          Checking whether a demo graph already exists…
        </p>
      ) : probe.phase === 'failure' ? (
        <p
          className="mt-6 rounded border border-notice-border bg-notice-surface px-3 py-2 text-sm text-ink"
          role="note"
          data-testid="overview-probe-failure"
        >
          {probe.message} The workspace cannot confirm seed status, so no
          “continue your work” card is shown — status is never guessed.
        </p>
      ) : (
        <section
          aria-labelledby="overview-attention"
          className="mt-6 rounded-lg border border-ink-border bg-paper-raised p-6"
          data-testid="import-first-card"
        >
          <h2 id="overview-attention" className="text-lg font-semibold text-ink">
            Getting started
          </h2>
          <p className="mt-2 max-w-prose text-ink-muted">
            Aftershock helps you see which claims in your manuscript rest on sources that
            have changed after publication — such as retraction or correction notices.
            There is no seeded demo graph in this environment yet, so there is no
            continuation work to show. Start from a document import once wired — or try
            the guided example, which seeds the synthetic demo through the guarded API.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/"
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white no-underline hover:bg-brand-deep"
            >
              Import a document
            </Link>
            <Link
              to="/"
              className="rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink no-underline hover:bg-paper-deep"
            >
              Try guided example
            </Link>
          </div>
        </section>
      )}

      <p className="mt-4 max-w-prose text-base text-ink-muted">
        The status chip above queries the platform’s real{' '}
        <code className="rounded bg-paper-deep px-1">/health</code> endpoint; the card
        above reflects the real <code className="rounded bg-paper-deep px-1">/graph/probe</code>{' '}
        read-only check. “Online” never implies a connected data layer, and nothing here
        is simulated.
      </p>
    </div>
  );
}
