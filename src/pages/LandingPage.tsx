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
 * Action-first landing (P0 redesign).
 *
 * One calm editorial hero (the research question), then exactly ONE primary
 * interaction surface: the real guarded guided-seed flow with all of its
 * honest states (submitting / unavailable / cooldown / not-wired / api-error
 * / rejected). The document picker (ImportPanel — the real import flow)
 * sits quietly below the panel in a subdued companion container, with the
 * not-yet-wired Bibliography / Single DOI affordances demoted to one honest
 * line. Real workspace shortcuts and the featured 2020 hydroxychloroquine
 * investigation (real, publicly verified record) close the page. The
 * Aftershock. wordmark stays in the sidebar, never in the hero.
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
    <div className="mx-auto max-w-3xl pb-10">
      {/* 1 — Hero: the research question in display serif. The Aftershock.
          wordmark remains the site brand in the sidebar, never here. */}
      <section aria-labelledby="hero-heading" className="mt-6 md:mt-10">
        <h1
          id="hero-heading"
          className="max-w-2xl font-display text-4xl leading-tight tracking-tight text-ink md:text-5xl"
        >
          What would you like to investigate?
        </h1>
        <p className="mt-4 max-w-prose text-lg leading-7 text-ink-muted md:text-xl md:leading-8">
          Trace changes in scientific evidence and discover which claims may
          need review.
        </p>
      </section>

      {/* 2 — THE primary action panel: the only seed trigger on the page.
          Same guarded, honest guided-seed flow as before — its states now
          live here instead of a separate "Try guided example" section. */}
      <section
        aria-labelledby="guided-heading"
        className="mt-8 rounded-lg border border-ink-border bg-paper-raised p-6 shadow-sm md:p-7"
      >
        <h2 id="guided-heading" className="font-display text-2xl leading-snug text-ink">
          Try guided example
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-ink-muted">
          Seeds the live demo graph with a fictional manuscript plus one real,
          publicly verified retraction record, then shows actual graph-derived
          results. Runs through the guarded, rate-limited API.{' '}
          <button
            type="button"
            onClick={() => setShowGuidedNote((open) => !open)}
            aria-expanded={showGuidedNote}
            className="font-semibold text-brand-deep underline"
          >
            What does that involve?
          </button>
        </p>

        {showGuidedNote && (
          <p
            className="mt-3 max-w-prose rounded border border-uncertain-border bg-uncertain-surface px-3 py-2 text-sm leading-6 text-uncertain-text"
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

        {/* Testid hook kept for the legacy hero contract: this wrapper holds
            the single primary CTA (data flow and honest states unchanged). */}
        <div data-testid="hero-guided-action" className="mt-5">
          <button
            type="button"
            onClick={seedDemo}
            disabled={seeding}
            aria-busy={seeding}
            data-testid="guided-seed-button"
            className="w-full rounded-lg bg-brand px-6 py-3.5 text-base font-semibold text-white shadow-sm no-underline hover:bg-brand-deep disabled:cursor-progress disabled:opacity-80 sm:w-auto"
          >
            {seeding ? 'Contacting demo API…' : 'Explore guided investigation'}
          </button>
        </div>

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

      {/* 3 — The real import flow, the quiet companion surface. ImportPanel
          is rendered as-is: client-side guards → POST /import-document →
          verbatim server disclosure → Analyze only for the demo manuscript. */}
      <section
        aria-labelledby="import-heading"
        className="mt-5 rounded-lg border border-ink-border bg-paper-deep p-5 md:px-6"
      >
        <h2 id="import-heading" className="text-sm font-semibold text-ink">
          Or start from your own document
        </h2>
        <p className="mt-1 max-w-prose text-xs leading-5 text-ink-muted">
          PDF, DOCX or TXT, registered through the real import flow — the
          server's own disclosure is shown verbatim and nothing is simulated.
        </p>
        <ImportPanel />

        {/* Secondary affordances: visible, honest, and demoted to one
            quiet line — they are not built yet and cannot produce
            passage-level claim dependency analysis. */}
        <div className="mt-4 border-t border-ink-border pt-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-muted">
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded border border-ink-border bg-paper px-2 py-1 text-xs text-ink-muted"
            >
              Bibliography
            </button>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded border border-ink-border bg-paper px-2 py-1 text-xs text-ink-muted"
            >
              Single DOI
            </button>
            <span className="leading-5">
              Bibliography and DOI imports arrive with the import flow — they
              cannot detect passage-level claim dependencies; original research
              text is needed for that.
            </span>
          </div>
        </div>
      </section>

      {/* 4 — Three real, quiet workspace shortcuts (no summary cards — the
          areas themselves show the live state). */}
      <nav aria-label="Workspace areas" className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Your workspace
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-3">
          <li>
            <Link
              to="/library"
              className="text-sm text-ink no-underline hover:text-brand-deep"
            >
              <span className="font-medium">My Library</span>
              <span className="ml-1.5 text-xs text-ink-muted">
                Sources under review in one place.
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/review-queue"
              className="text-sm text-ink no-underline hover:text-brand-deep"
            >
              <span className="font-medium">Review Claims</span>
              <span className="ml-1.5 text-xs text-ink-muted">
                Needs human judgement.
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/graph"
              className="text-sm text-ink no-underline hover:text-brand-deep"
            >
              <span className="font-medium">Evidence Graph</span>
              <span className="ml-1.5 text-xs text-ink-muted">
                From the live demo API.
              </span>
            </Link>
          </li>
        </ul>
      </nav>

      {/* 5 — Featured investigation: one real, publicly verified record,
          clearly distinct from the fictional guided-demo manuscript. The
          single CTA is a plain link to /results — seeding happens only via
          the primary panel above. */}
      <section aria-labelledby="featured-heading" className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Featured investigation
        </h2>
        <article className="mt-3 rounded-lg border border-ink-border bg-paper-raised p-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 id="featured-heading" className="font-display text-xl text-ink">
              The 2020 hydroxychloroquine retraction
            </h3>
            <span className="rounded-full border border-review-border bg-review-surface px-2.5 py-0.5 text-xs font-medium text-review-text">
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
            className="mt-4 inline-block rounded border border-ink-border bg-paper px-4 py-2 text-sm font-medium text-ink no-underline hover:bg-paper-deep"
          >
            Open the guided investigation
          </Link>
        </article>
      </section>
    </div>
  );
}
