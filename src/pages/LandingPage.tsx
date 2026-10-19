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
 * Wave U1 entry experience (2026-10-19 design-of-record).
 *
 * One centered entry column: the research question as a display-serif hero,
 * then exactly ONE launcher card with exactly two real actions — the guarded
 * guided-seed flow (all of its honest states: submitting / unavailable /
 * cooldown / not-wired / api-error / rejected) and an outline toggle that
 * discloses the real document picker (<ImportPanel/> untouched) behind
 * progressive disclosure. The still-not-wired Bibliography / Single DOI
 * affordances stay visible-but-honestly-disabled inside that area only.
 * A quiet links row and the featured real-record investigation close the
 * page. The Aftershock. wordmark stays in the sidebar, never in the hero.
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

  return (
    // Entry column: hero + launcher vertically balanced in the usable
    // viewport (md+), centered, `max-w-2xl` — never a left-pinned dashboard.
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-2xl flex-col justify-center">
      {/* 1 — Hero: the research question in display serif. The Aftershock.
          wordmark remains the site brand in the sidebar, never here. */}
      <section aria-labelledby="hero-heading" className="px-2 text-center">
        <h1
          id="hero-heading"
          className="text-4xl font-display leading-[1.05] tracking-tight text-ink [text-wrap:balance] md:text-6xl"
        >
          What would you like to investigate?
        </h1>
        <p className="mt-4 text-lg leading-7 text-ink-muted md:text-xl md:leading-8">
          Follow the evidence. Understand what changed.
        </p>
      </section>

      {/* 2 — THE launcher card: the only seed trigger on the page and the
          only document action in the initial viewport (the picker itself is
          disclosed behind the outline toggle). Two actions, one memory:
          the indigo primary is the page's single indigo destination. */}
      <section
        aria-labelledby="launcher-heading"
        data-testid="investigation-launcher"
        className="mt-8 rounded-2xl border border-ink-border bg-paper-raised p-6 shadow-[0_1px_2px_rgba(39,40,59,0.06),0_8px_24px_rgba(39,40,59,0.05)] md:p-8"
      >
        <h2 id="launcher-heading" className="sr-only">
          Start an investigation
        </h2>

        {/* Testid hook kept for the legacy hero contract: this wrapper
            anchors the two real actions (data flow and honest states
            unchanged). */}
        <div
          data-testid="hero-guided-action"
          className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <button
            type="button"
            onClick={seedDemo}
            disabled={seeding}
            aria-busy={seeding}
            data-testid="guided-seed-button"
            className="w-full rounded-lg bg-brand px-6 py-3.5 text-base font-semibold text-white no-underline hover:bg-brand-deep disabled:cursor-progress disabled:opacity-80 sm:w-auto"
          >
            {seeding ? 'Contacting demo API…' : 'Explore guided investigation'}
          </button>
          {/* Secondary action: outline, deliberately NOT indigo — it only
              discloses the real picker; it never competes with the primary
              CTA for the one indigo destination. */}
          <button
            type="button"
            onClick={() => setShowDocumentArea((open) => !open)}
            aria-expanded={showDocumentArea}
            aria-controls="document-area"
            data-testid="choose-document-toggle"
            className="w-full rounded-lg border border-ink-border bg-paper px-6 py-3.5 text-base font-semibold text-ink no-underline hover:bg-paper-deep sm:w-auto"
          >
            Choose a document
          </button>
        </div>

        {/* Quiet integrity line: the honest synthetic-vs-real distinction,
            visible without expanding anything (never only inside a
            collapsed region). */}
        <p className="mx-auto mt-5 max-w-prose text-center text-sm leading-6 text-ink-muted">
          The guided example uses clearly labeled synthetic content (FICTIONAL
          / GUIDED DEMO) alongside real public records — nothing is simulated.
        </p>

        <p className="mt-2 text-center text-sm">
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

        {/* 3 — Document area, collapsed by default. Toggling it reveals the
            real import flow (ImportPanel rendered untouched: client-side
            guards → POST /import-document → verbatim server disclosure →
            Analyze only for the demo manuscript) plus the still-unbuilt
            Bibliography / Single DOI affordances, honest and disabled. */}
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

      {/* 4 — Three real, quiet workspace shortcuts as one centered text
          row (no summary cards — the areas themselves show the live state). */}
      <nav aria-label="Workspace areas" className="mt-8">
        <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <li>
            <Link
              to="/library"
              className="text-sm text-ink no-underline hover:text-brand-deep"
            >
              My Library
            </Link>
          </li>
          <li aria-hidden="true" className="text-sm text-ink-muted">
            ·
          </li>
          <li>
            <Link
              to="/review-queue"
              className="text-sm text-ink no-underline hover:text-brand-deep"
            >
              Review Claims
            </Link>
          </li>
          <li aria-hidden="true" className="text-sm text-ink-muted">
            ·
          </li>
          <li>
            <Link
              to="/graph"
              className="text-sm text-ink no-underline hover:text-brand-deep"
            >
              Evidence Graph
            </Link>
          </li>
        </ul>
      </nav>

      {/* 5 — Featured investigation: one real, publicly verified record,
          clearly distinct from the fictional guided-demo manuscript. The
          single CTA is a plain outline link to /results — seeding happens
          only via the launcher above. */}
      <section aria-labelledby="featured-heading" className="mt-10 pb-10">
        <h2
          id="featured-heading"
          className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
        >
          Featured investigation
        </h2>
        <article className="mt-3 rounded-2xl border border-ink-border bg-paper-raised p-6">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <h3 id="featured-heading" className="font-display text-xl text-ink">
              The 2020 hydroxychloroquine retraction
            </h3>
            <span className="rounded-full border border-review-border bg-review-surface px-2.5 py-0.5 text-xs font-medium text-review-text">
              Verified real record
            </span>
          </div>
          <p className="mx-auto mt-3 max-w-prose text-sm leading-6 text-ink-muted">
            Mehra et al. 2020 (The Lancet) was retracted: the retraction was
            announced 2020-06-04 and recorded 2020-06-05 (PMIDs 32450107 /
            32511943). The guided investigation follows its impact through the
            demo graph; the manuscript under review there is fictional and
            labeled FICTIONAL / GUIDED DEMO — this record is not.
          </p>
          <div className="text-center">
            <Link
              to="/results"
              className="mt-4 inline-block rounded border border-ink-border bg-paper px-4 py-2 text-sm font-medium text-ink no-underline hover:bg-paper-deep"
            >
              Open the guided investigation
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
