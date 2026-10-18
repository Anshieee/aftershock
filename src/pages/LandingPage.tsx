import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  ApiUnavailableError,
  ensureDemoSeed,
} from '../lib/api';
import ImportPanel from '../components/ImportPanel';

const disabledLater =
  'cursor-not-allowed rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink-muted';

type SeedFlow =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'unavailable' }
  | { phase: 'cooldown' }
  | { phase: 'not-wired' }
  | { phase: 'api-error'; status: number }
  | { phase: 'rejected'; message: string };

const seedFlowMessages: Record<string, string> = {
  submitting: 'Contacting the demo API — requesting the guarded seed run…',
  unavailable: 'API unavailable — nothing ran. No simulated seed or results are shown.',
  cooldown: 'Seeding cooldown is active (HTTP 429). Try again shortly.',
  'not-wired': 'Demo seeding is not wired on this build yet — nothing ran.',
};

/**
 * Research-workspace landing (M4 state) — import-first.
 *
 * The hero poses the research question ("What would you like to
 * investigate?") with the one wired action (guarded guided-seed flow) plus
 * workflow shortcuts and the featured 2020 hydroxychloroquine investigation
 * (real, verified record). The document picker is the REAL import flow
 * (ImportPanel): client-side guards → POST /import-document → verbatim
 * server disclosure → Analyze enabled only for the guided demo manuscript.
 * The guided flow either navigates to real results or states exactly what
 * went wrong.
 */
export default function LandingPage() {
  const navigate = useNavigate();
  const [showGuidedNote, setShowGuidedNote] = useState(false);
  const [seedFlow, setSeedFlow] = useState<SeedFlow>({ phase: 'idle' });
  const activeRef = useRef<AbortController | null>(null);

  const seedDemo = useCallback(() => {
    activeRef.current?.abort();
    const controller = new AbortController();
    activeRef.current = controller;
    setSeedFlow({ phase: 'submitting' });

    ensureDemoSeed({ signal: controller.signal })
      .then(() => {
        if (controller.signal.aborted) return;
        // Success — navigate to real, graph-derived results.
        navigate('/results');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiTimeoutError || error instanceof ApiNetworkError) {
          setSeedFlow({ phase: 'unavailable' });
        } else if (error instanceof ApiHttpError && error.status === 429) {
          setSeedFlow({ phase: 'cooldown' });
        } else if (error instanceof ApiHttpError && (error.status === 404 || error.status === 501)) {
          setSeedFlow({ phase: 'not-wired' });
        } else if (error instanceof ApiUnavailableError) {
          // HTML-shaded 2xx on the POST: endpoint missing — identical honesty
          // to a 404, never a seeded-looking outcome.
          setSeedFlow({ phase: 'not-wired' });
        } else if (error instanceof ApiHttpError) {
          setSeedFlow({ phase: 'api-error', status: error.status });
        } else if (error instanceof ApiClientError) {
          setSeedFlow({ phase: 'rejected', message: error.message });
        } else {
          setSeedFlow({ phase: 'unavailable' });
        }
      });
  }, [navigate]);

  const guidance = seedFlowMessages[seedFlow.phase];
  const seeding = seedFlow.phase === 'submitting';

  return (
    <div className="mx-auto max-w-3xl">
      {/* Hero: the research question in display serif. The Aftershock.
          wordmark remains the site brand in the header, never here. */}
      <section aria-labelledby="hero-heading" className="mt-2 md:mt-6">
        <h1
          id="hero-heading"
          className="max-w-2xl font-display text-4xl leading-tight text-ink md:text-5xl"
        >
          What would you like to investigate?
        </h1>
        <p className="mt-4 max-w-prose text-lg leading-7 text-ink-muted md:text-xl md:leading-8">
          Aftershock traces retractions and status notices through your citations
          down to claim-level impact — so you know which of your sources changed
          after publication and which of your claims depend on them.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Large primary action — same guarded guided-seed flow as the
              guided section's seeded button (shared handler, same honesty). */}
          <button
            type="button"
            onClick={seedDemo}
            disabled={seeding}
            aria-busy={seeding}
            data-testid="hero-guided-action"
            className="rounded-lg bg-brand px-6 py-3.5 text-base font-semibold text-white no-underline hover:bg-brand-deep disabled:cursor-progress disabled:opacity-80"
          >
            {seeding ? 'Contacting demo API…' : 'Explore guided investigation'}
          </button>
          {/* Secondary affordance: forwards to the real file picker (single
              label association — the panel's label is the canonical one). */}
          <button
            type="button"
            data-testid="hero-choose-document"
            onClick={() => document.getElementById('import-input')?.click()}
            className="cursor-pointer rounded-lg border border-ink-border bg-paper-raised px-6 py-3.5 text-center text-base font-medium text-ink hover:bg-paper-deep"
          >
            Choose a document
          </button>
        </div>
        {seeding && (
          <p className="mt-3 text-sm text-ink-muted" role="status">
            {guidance}
          </p>
        )}
      </section>

      {/* Workflow shortcuts — three real destinations, quiet hover only. */}
      <nav aria-label="Workspace areas" className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Your workspace
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <li>
            <Link
              to="/overview"
              className="block h-full rounded-lg border border-ink-border bg-paper-raised p-4 no-underline hover:bg-paper-deep"
            >
              <span className="block font-medium text-ink">Overview</span>
              <span className="mt-1 block text-sm leading-6 text-ink-muted">
                Current state of the workspace and the demo graph.
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/graph"
              className="block h-full rounded-lg border border-ink-border bg-paper-raised p-4 no-underline hover:bg-paper-deep"
            >
              <span className="block font-medium text-ink">Knowledge Graph</span>
              <span className="mt-1 block text-sm leading-6 text-ink-muted">
                Records, provenance and review state, from the live demo API.
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/library"
              className="block h-full rounded-lg border border-ink-border bg-paper-raised p-4 no-underline hover:bg-paper-deep"
            >
              <span className="block font-medium text-ink">Library</span>
              <span className="mt-1 block text-sm leading-6 text-ink-muted">
                Sources under review in one place.
              </span>
            </Link>
          </li>
        </ul>
      </nav>

      {/* Featured investigation — one real, publicly verified record. */}
      <section aria-labelledby="featured-heading" className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Featured investigation
        </h2>
        <article className="mt-3 rounded-lg border border-ink-border bg-paper-raised p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h3 id="featured-heading" className="font-display text-xl text-ink">
              The 2020 hydroxychloroquine retraction
            </h3>
            <span className="rounded-full border border-reviewed-surface bg-reviewed-surface px-2.5 py-0.5 text-xs font-medium text-reviewed-text">
              Verified real record
            </span>
          </div>
          <p className="mt-3 max-w-prose text-sm leading-6 text-ink-muted">
            Mehra et al. 2020 (The Lancet) was retracted: the retraction was
            announced 2020-06-04 and recorded 2020-06-05 (PMIDs 32450107 /
            32511943). The guided investigation follows its impact through the
            demo graph; the manuscript under review there is fictional and
            labeled FICTIONAL / GUIDED DEMO — this record is not.
          </p>
          <Link
            to="/results"
            className="mt-4 inline-block rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink no-underline hover:bg-paper-deep"
          >
            Open the guided investigation
          </Link>
        </article>
      </section>

      <section
        aria-labelledby="import-heading"
        className="mt-8 rounded-lg border border-ink-border bg-paper-raised p-6 md:p-8"
      >
        <h2 id="import-heading" className="text-lg font-semibold text-ink">
          Start with a document
        </h2>

        {/* The real M4 import flow: guards → registration → verbatim
            disclosure → demo-manuscript-only analyze. */}
        <ImportPanel />

        {/* Secondary affordances: visible, but not built yet */}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-border pt-4">
          <button type="button" disabled className={disabledLater}>
            Bibliography
          </button>
          <button type="button" disabled className={disabledLater}>
            Single DOI
          </button>
          <p className="w-full text-xs text-ink-muted lg:ml-auto lg:w-72 lg:self-center">
            Bibliography and DOI imports arrive with the import flow. Note: they
            cannot detect passage-level claim dependencies — original research
            text is needed for that.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="guided-heading"
        className="mt-6 rounded-lg border border-ink-border bg-paper-raised p-6"
      >
        <h2 id="guided-heading" className="text-lg font-semibold text-ink">
          Try guided example
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Seeds the live demo graph with a fictional manuscript plus one real,
          publicly verified retraction record, then shows actual graph-derived
          results. Runs through the guarded, rate-limited API.{' '}
          <button
            type="button"
            onClick={() => setShowGuidedNote(true)}
            className="font-semibold text-brand-deep underline"
            aria-expanded={showGuidedNote}
          >
            What does that involve?
          </button>
        </p>

        {showGuidedNote && (
          <p
            className="mt-2 max-w-prose rounded border border-uncertain-border bg-uncertain-surface px-3 py-2 text-sm text-uncertain-text"
            role="note"
          >
            The guided example is the only path fully wired right now. It sends
            a bodyless seed request; the server seeds labeled synthetic fixture
            content (FICTIONAL / GUIDED DEMO) plus one real bibliographic
            retraction record from the public literature. No personal or real
            manuscript content is involved, reseeding is idempotent, and the
            graph is a disposable free-tier instance — synthetic demo data only.
          </p>
        )}

        <button
          type="button"
          onClick={seedDemo}
          disabled={seeding}
          aria-busy={seeding}
          data-testid="guided-seed-button"
          className="mt-3 rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep disabled:cursor-progress disabled:opacity-80"
        >
          {seeding ? 'Contacting demo API…' : 'Try guided example'}
        </button>

        <div
          aria-live="polite"
          data-testid="guided-seed-state"
          className="mt-3 min-h-5"
        >
          {seedFlow.phase === 'submitting' && (
            <p className="text-sm text-ink-muted" role="status">
              {guidance}
            </p>
          )}
          {seedFlow.phase === 'api-error' && (
            <p
              className="rounded border border-notice-border bg-notice-surface px-3 py-2 text-sm text-ink"
              role="status"
            >
              API error (HTTP {seedFlow.status}) — no results are shown as a
              substitute. If the seed actually completed server-side, the
              Knowledge Graph will reflect the real state rather than this page
              guessing.
            </p>
          )}
          {seedFlow.phase === 'rejected' && (
            <p
              className="rounded border border-notice-border bg-notice-surface px-3 py-2 text-sm text-ink"
              role="status"
            >
              {seedFlow.message} No simulated success is shown.
            </p>
          )}
          {(seedFlow.phase === 'unavailable' ||
            seedFlow.phase === 'cooldown' ||
            seedFlow.phase === 'not-wired') &&
            guidance && (
              <p
                className="rounded border border-uncertain-border bg-uncertain-surface px-3 py-2 text-sm text-uncertain-text"
                role="status"
                data-testid="guided-seed-copy"
              >
                {guidance}
              </p>
            )}
        </div>
      </section>

      <p className="mt-6 text-sm text-ink-muted">
        Just exploring? The{' '}
        <Link to="/overview" className="text-brand-deep underline">
          Overview
        </Link>{' '}
        shows the current state of the workspace.
      </p>
    </div>
  );
}
