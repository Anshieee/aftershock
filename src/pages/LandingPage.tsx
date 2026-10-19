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
import './landing-v1.css';

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
 * VARIANT 01 — "THE MINIMALIST" (2026-10-20 home-experiment branch only).
 *
 * Chat-level simplicity: one centered whisper-quiet column where the only
 * visually loud element is the single indigo CTA "Start the guided
 * investigation". The brand beat (Aftershock. + Trace the evidence.) sits
 * above the fluid-clamp display question; the document picker is pure
 * progressive disclosure behind a one-line "Have a document?" toggle that
 * reveals the untouched <ImportPanel/>; the workspace micro-nav and the
 * featured real record are typeset near-silent below the fold.
 *
 * All guarded-seed machine behavior (phases, messages, abort handling,
 * aria-live region, testids) is carried over verbatim from the Wave U1
 * baseline — integration and honesty state code paths unchanged.
 */
export default function LandingPage() {
  const navigate = useNavigate();
  const [showGuidedNote, setShowGuidedNote] = useState(false);
  const [showDocumentArea, setShowDocumentArea] = useState(false);
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

  const microNav = [
    { to: '/investigations', label: 'Investigations' },
    { to: '/library', label: 'Library' },
    { to: '/review-queue', label: 'Review Queue' },
    { to: '/graph', label: 'Knowledge Graph' },
  ] as const;

  return (
    // One narrow centered column (max-w-xl): whitespace is the layout
    // device. Vertically balanced in the usable viewport (md+), never a
    // left-pinned dashboard, never a card grid.
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl flex-col justify-center xl:max-w-2xl">
      {/* 1 — Hero zone: borderless, card-free. Brand beat → the question →
          THE action. Exactly one element here is loud. */}
      <section aria-labelledby="hero-heading" className="px-2 text-center">
        <p className="v1-reveal">
          {/* Brand: the real wordmark token class (Bodoni Moda 900), the
              exact mark "Aftershock.", with the approved tagline under it. */}
          <span className="wordmark text-2xl text-brand-deep md:text-[1.75rem]">
            Aftershock.
          </span>
          <span className="mt-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
            Trace the evidence.
          </span>
        </p>

        <h1
          id="hero-heading"
          className="v1-reveal v1-reveal-v2 v1-hero-title mt-10 font-display font-medium leading-[1.04] tracking-tight text-ink [text-wrap:balance] md:mt-12"
        >
          What would you like to investigate?
        </h1>
      </section>

      {/* 2 — THE single launcher: the only seed trigger on the page, and
          visually the ONLY loud element. No card chrome — just the action,
          then the honesty lines in whisper type. */}
      <section
        aria-labelledby="launcher-heading"
        data-testid="investigation-launcher"
        className="mt-10 md:mt-12"
      >
        <h2 id="launcher-heading" className="sr-only">
          Start an investigation
        </h2>

        {/* Testid hook kept for the legacy hero contract: this wrapper
            anchors the primary action (data flow and honest states
            unchanged). */}
        <div
          data-testid="hero-guided-action"
          className="v1-reveal v1-reveal-v3 flex justify-center"
        >
          <button
            type="button"
            onClick={seedDemo}
            disabled={seeding}
            aria-busy={seeding}
            data-testid="guided-seed-button"
            className="w-full max-w-sm rounded-xl bg-brand px-8 py-4 text-lg font-semibold text-white no-underline shadow-[0_1px_2px_rgba(39,40,59,0.08),0_10px_30px_rgba(82,74,120,0.18)] transition-colors motion-reduce:transition-none hover:bg-brand-deep disabled:cursor-progress disabled:opacity-80 sm:w-auto"
          >
            {seeding ? 'Contacting demo API…' : 'Start the guided investigation'}
          </button>
        </div>

        {/* Quiet integrity line: the honest synthetic-vs-real distinction,
            visible without expanding anything (never only inside a
            collapsed region). Re-typeset smaller; wording unchanged. */}
        <p className="v1-reveal v1-reveal-v3 mx-auto mt-6 max-w-[38ch] text-[13px] leading-6 text-ink-muted">
          The guided example uses clearly labeled synthetic content (FICTIONAL
          / GUIDED DEMO) alongside real public records — nothing is simulated.
          A flagged passage means a review of the evidence is needed, never a
          verdict.
        </p>

        <p className="mt-2 text-center text-sm">
          <button
            type="button"
            onClick={() => setShowGuidedNote((open) => !open)}
            aria-expanded={showGuidedNote}
            className="text-[13px] font-medium text-ink-muted underline decoration-ink-border underline-offset-4 hover:text-brand-deep"
          >
            What does that involve?
          </button>
        </p>

        {showGuidedNote && (
          <p
            className="mt-3 rounded border border-uncertain-border bg-uncertain-surface px-3 py-2 text-sm leading-6 text-uncertain-text"
            role="note"
          >
            The guided example is the only path fully wired right now. It sends
            a bodyless seed request through the guarded, rate-limited API; the
            server seeds labeled synthetic fixture content (FICTIONAL / GUIDED
            DEMO) plus one real bibliographic retraction record from the
            public literature. No personal or real manuscript content is
            involved, reseeding is idempotent, and the graph is a disposable
            free-tier instance — synthetic demo data only.
          </p>
        )}

        {/* All honest seed states, unchanged (aria-live region intact). */}
        <div
          aria-live="polite"
          data-testid="guided-seed-state"
          className="mt-3 min-h-5"
        >
          {seedFlow.phase === 'submitting' && (
            <p className="text-center text-sm text-ink-muted" role="status">
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

        {/* 3 — Document import: progressive disclosure ONLY. One quiet
            line; expanding it reveals the real import flow (ImportPanel
            rendered untouched) plus the still-unbuilt Bibliography / Single
            DOI affordances, honest and disabled. */}
        <p className="mt-5 text-center text-sm">
          <button
            type="button"
            onClick={() => setShowDocumentArea((open) => !open)}
            aria-expanded={showDocumentArea}
            aria-controls="document-area"
            data-testid="choose-document-toggle"
            className="text-[13px] text-ink-muted no-underline hover:text-brand-deep underline-offset-4 hover:underline"
          >
            Have a document?
          </button>
        </p>
        {showDocumentArea && (
          <div
            id="document-area"
            className="mt-6 rounded-xl bg-paper-deep p-5 text-left md:p-6"
          >
            <ImportPanel />

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
          </div>
        )}
      </section>

      {/* 4 — Below the fold: whisper typography. The sturdy workspace
          micro-nav, one hairline rule above it. */}
      <nav
        aria-label="Workspace areas"
        className="mt-16 border-t border-ink-border pt-6"
      >
        <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {microNav.map((item, index) => (
            <li key={item.to} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden="true" className="text-xs text-ink-muted">
                  ·
                </span>
              )}
              <Link
                to={item.to}
                className="text-xs uppercase tracking-wide text-ink-muted no-underline hover:text-brand-deep"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* 5 — Featured investigation: one real, publicly verified record,
          clearly distinct from the fictional guided-demo manuscript. Quiet
          text typesetting (no card); the single CTA is a plain outline link
          to /results — seeding happens only via the launcher above. */}
      <section aria-labelledby="featured-heading" className="mt-10 pb-10">
        <article className="mx-auto max-w-[52ch] text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Featured investigation
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <h2 id="featured-heading" className="font-display text-lg text-ink">
              The 2020 hydroxychloroquine retraction
            </h2>
            <span className="rounded-full border border-review-border bg-review-surface px-2.5 py-0.5 text-xs font-medium text-review-text">
              Verified real record
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-6 text-ink-muted">
            Mehra et al. 2020 (The Lancet) was retracted: the retraction was
            announced 2020-06-04 and recorded 2020-06-05 (PMIDs 32450107 /
            32511943). The guided investigation follows its impact through the
            demo graph; the manuscript under review there is fictional and
            labeled FICTIONAL / GUIDED DEMO — this record is not.
          </p>
          <Link
            to="/results"
            className="mt-3 inline-block text-[13px] font-medium text-brand-deep underline decoration-ink-border underline-offset-4 hover:decoration-brand-deep"
          >
            Open the guided investigation
          </Link>
        </article>
      </section>
    </div>
  );
}
