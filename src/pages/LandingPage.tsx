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
import './landing-v2.css';

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
 * VARIANT 02 — THE RESEARCH STUDIO (design experiment, 2026-10-20).
 *
 * A SciSpace-inspired scholarly launcher on the journal of the record:
 * wordmark + small-caps eyebrow + one large serif research question, then
 * a hairline-ruled RESEARCH LAUNCHER whose single dominant indigo button
 * runs the REAL guarded seed flow (state machine byte-for-byte from the
 * Wave U1 design of record — every honest failure state preserved).
 * Import is a quiet secondary text line that progressively discloses the
 * real <ImportPanel/> untouched. Below the launcher: a plain-text
 * shortcuts row and the featured verified real record (the single
 * sanctioned amber badge). Reading rhythm like a bound journal; thin
 * rules instead of boxes; ruled-paper texture and a serif drop-cap as
 * clearly-decorative cues only.
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
    // Ruled-paper texture wraps the whole studio; the journal measure is a
    // single centered max-w-2xl column. The Aftershock. wordmark opens the
    // hero here (deliberate V2 diff vs the sidebar-only U1 hero).
    <div className="landing-v2">
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-2xl flex-col px-6">
        {/* 1 — Hero: wordmark, small-caps eyebrow, and the research question
            the tool answers, in display serif. */}
        <section aria-labelledby="hero-heading" className="pt-14 text-center md:pt-20">
          <p className="wordmark text-[1.75rem] leading-none text-brand-deep">
            Aftershock.
          </p>
          <p className="eyebrow mt-5">Trace the evidence.</p>
          <h1
            id="hero-heading"
            className="hero-headline mx-auto mt-6 max-w-xl text-ink [text-wrap:balance]"
          >
            What happened to this research after it was published?
          </h1>
          <p className="lede mx-auto mt-9 max-w-prose text-left text-lg leading-8 text-ink">
            Aftershock is an evidence-integrity workspace. It follows a
            publication through the public record — the corrections, the
            retractions, and the papers that cite it — so you can see what
            changed, what held, and what still deserves a careful human look.
          </p>
        </section>

        {/* 2 — THE RESEARCH LAUNCHER: hairline-ruled panel, one dominant
            indigo primary (the page's single indigo destination), the honest
            status region, the guided-path disclosure, the import
            disclosure, and the three quiet integrity lines. */}
        <section
          aria-labelledby="launcher-heading"
          data-testid="investigation-launcher"
          className="mt-14 border-t border-ink-border pt-10 md:mt-16"
        >
          <h2 id="launcher-heading" className="eyebrow text-center">
            Research launcher
          </h2>

          {/* The single real action. Legacy hero contract: this wrapper
              anchors the primary flow (data flow and honest states
              unchanged). */}
          <div
            data-testid="hero-guided-action"
            className="mt-8 flex justify-center"
          >
            <button
              type="button"
              onClick={seedDemo}
              disabled={seeding}
              aria-busy={seeding}
              data-testid="guided-seed-button"
              className="launcher-cta w-full max-w-md rounded-lg px-8 py-4 text-lg font-semibold text-white disabled:cursor-progress disabled:opacity-80"
            >
              {seeding ? 'Contacting demo API…' : 'Start the guided investigation'}
            </button>
          </div>

          {/* All honest seed states, unchanged (aria-live region intact). */}
          <div
            aria-live="polite"
            data-testid="guided-seed-state"
            className="mx-auto mt-6 min-h-5 max-w-prose"
          >
            {seedFlow.phase === 'submitting' && (
              <p className="text-center text-sm text-ink-muted" role="status">
                {guidance}
              </p>
            )}
            {seedFlow.phase === 'api-error' && (
              <p className="rounded border border-notice-border bg-notice-surface px-3 py-2 text-sm text-ink" role="status">
                API error (HTTP {seedFlow.status}) — no results are shown as a
                substitute. If the seed actually completed server-side, the
                Knowledge Graph will reflect the real state rather than this page
                guessing.
              </p>
            )}
            {seedFlow.phase === 'rejected' && (
              <p className="rounded border border-notice-border bg-notice-surface px-3 py-2 text-sm text-ink" role="status">
                {seedFlow.message} No simulated success is shown.
              </p>
            )}
            {(seedFlow.phase === 'unavailable' ||
              seedFlow.phase === 'cooldown' ||
              seedFlow.phase === 'not-wired') &&
              guidance && (
                <p
                  className="status-surface rounded border px-3 py-2 text-sm"
                  role="status"
                  data-testid="guided-seed-copy"
                >
                  {guidance}
                </p>
              )}
          </div>

          <p className="mt-3 text-center text-sm">
            <button
              type="button"
              onClick={() => setShowGuidedNote((open) => !open)}
              aria-expanded={showGuidedNote}
              className="text-toggle font-semibold"
            >
              What does that involve?
            </button>
          </p>

          {showGuidedNote && (
            <p
              className="status-surface mx-auto mt-3 max-w-prose rounded border px-3 py-2 text-sm leading-6"
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

          {/* 3 — Import disclosure: a secondary LINE (never a competing
              button) that toggles the real import flow — <ImportPanel/>
              rendered untouched: client-side guards → POST /import-document
              → verbatim server disclosure → Analyze only for the demo
              manuscript. */}
          <div className="mt-8 border-t border-ink-border pt-6 text-center">
            <button
              type="button"
              onClick={() => setShowDocumentArea((open) => !open)}
              aria-expanded={showDocumentArea}
              aria-controls="document-area"
              data-testid="choose-document-toggle"
              className="text-toggle text-sm font-medium"
            >
              Have a document? Register a file (metadata only)
            </button>
          </div>

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

          {/* 4 — Integrity lines, conceptually identical to the design of
              record, re-typeset as hairline-separated journal footnotes.
              The synthetic-vs-real line stays visible without expanding
              anything (never only inside a collapsed region). */}
          <ul className="mt-8 border-t border-ink-border">
            <li className="integrity-item px-1 pb-1 text-sm leading-6 text-ink-muted">
              The guided example uses clearly labeled synthetic content (FICTIONAL
              / GUIDED DEMO) alongside real public records — nothing is simulated.
            </li>
            <li className="integrity-item px-1 py-3 text-sm leading-6 text-ink-muted">
              A flag means evidence review is needed — never a verdict.
            </li>
            <li className="integrity-item px-1 pt-1 pb-3 text-sm leading-6 text-ink-muted">
              Importing registers a file&rsquo;s metadata only — nothing is stored.
            </li>
          </ul>
        </section>

        {/* 5 — Four real, quiet workspace shortcuts as one centered text
            row with hairline dividers (no icon tiles, no cards-in-cards). */}
        <nav aria-label="Workspace areas" className="mt-12 md:mt-14">
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <li className="shortcut">
              <Link
                to="/investigations"
                className="text-sm text-ink no-underline hover:text-brand-deep"
              >
                Investigations
              </Link>
            </li>
            <li className="shortcut">
              <Link
                to="/library"
                className="text-sm text-ink no-underline hover:text-brand-deep"
              >
                Library
              </Link>
            </li>
            <li className="shortcut">
              <Link
                to="/review-queue"
                className="text-sm text-ink no-underline hover:text-brand-deep"
              >
                Review Queue
              </Link>
            </li>
            <li className="shortcut">
              <Link
                to="/graph"
                className="text-sm text-ink no-underline hover:text-brand-deep"
              >
                Knowledge Graph
              </Link>
            </li>
          </ul>
        </nav>

        {/* 6 — Featured record: one real, publicly verified record, clearly
            distinct from the fictional guided-demo manuscript. The single
            CTA is a plain text link to /results — seeding happens only via
            the launcher above. Amber appears exactly once on the page,
            here, as the highlighted real-record badge. */}
        <section aria-labelledby="featured-heading" className="mt-12 pb-14 md:mt-14">
          <h2 id="featured-heading" className="eyebrow">
            Featured record
          </h2>
          <article className="mt-4 border-t border-ink-border pt-6">
            <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-2 text-center">
              <h3 className="font-display text-xl text-ink">
                The 2020 hydroxychloroquine retraction
              </h3>
              <span className="record-badge rounded-full border px-2.5 py-0.5 text-xs font-medium">
                Verified real record
              </span>
            </div>
            <p className="mx-auto mt-4 max-w-prose text-left text-sm leading-7 text-ink-muted">
              Mehra et al. 2020 (The Lancet) was retracted: the retraction was
              announced 2020-06-04 and recorded 2020-06-05 (PMIDs 32450107 /
              32511943). The guided investigation follows its impact through the
              demo graph; the manuscript under review there is fictional and
              labeled FICTIONAL / GUIDED DEMO — this record is not.
            </p>
            <div className="mt-5 text-center">
              <Link
                to="/results"
                className="text-toggle text-sm font-medium"
              >
                Open the guided investigation
              </Link>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
