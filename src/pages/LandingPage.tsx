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
import EvidenceMotif from './landing-v3/EvidenceMotif';
import './landing-v3.css';

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
 * VARIANT 03 — THE EVIDENCE LENS (2026-10-20 design experiment).
 *
 * First impression: the real brand hero (`Aftershock.` in Bodoni Moda 900
 * over the promise "Trace the evidence.") beside a hand-drawn ripple +
 * network artwork that radiates from one point. The artwork signals
 * *connected evidence* through composition alone; it is DECORATIVE, marked
 * "Illustrative composition — not evidence data.", carries no data, no
 * labels, no claims, and sits strictly behind the interactive layer.
 *
 * Behavior is the design-of-record seed machine, unchanged: one loud indigo
 * CTA ("Start the guided investigation") → the guarded, honest seed states
 * (submitting / unavailable / cooldown / not-wired / api-error / rejected,
 * aria-live, navigate to /results only on real success) → then the
 * progressive-disclosure document area (the untouched <ImportPanel/> behind
 * "Register a file (metadata only)"), a hairline reading-guide with the
 * flag rule, the featured verified real record, and a quiet links row.
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
    // The page root owns the vertical rhythm and clips the artwork's
    // right-edge crop so the motif can push past the viewport edge without
    // ever creating horizontal scroll.
    <div className="landing-v3 relative min-h-[calc(100svh-4rem)] overflow-x-clip pb-12">
      {/* ARTWORK LAYER — decorative, aria-hidden, pointer-events-none.
          Radiates behind/right of the hero; on mobile it is scaled and
          cropped into the top-right corner, never crowded, never over a
          control. No text above z-0 sits on it illegibly: hairlines are
          lavender-on-paper and all interactive elements stay z-10. */}
      <div className="motif-layer">
        <EvidenceMotif />
      </div>

      {/* 1 — Hero: real brand mark + the page promise. The tagline is the
          h1; the wordmark is a brand mark (not a heading). */}
      <section className="relative z-10 px-2 pt-4 md:pt-10" aria-labelledby="hero-heading">
        <p className="wordmark type-hero text-ink">Aftershock.</p>
        <h1
          id="hero-heading"
          className="type-tagline mt-3 font-display font-semibold text-brand-deep"
        >
          Trace the evidence.
        </h1>
        <p className="body-lede mt-4 max-w-lg text-ink-muted">
          One publication sends a ripple through the literature. Aftershock
          draws the wave — which works cite which, and where the record asks
          a human to look. A flag is a request for review, never a verdict.
        </p>
        {/* Integrity caption for the artwork: page text, near the art,
            honest about what it is NOT. */}
        <p className="motif-caption mt-4 max-w-lg text-ink-muted">
          Illustrative composition — not evidence data.
        </p>
      </section>

      {/* 2 — THE launcher: the page's single indigo destination and the
          only seed trigger. One loud CTA; its honest states unchanged. */}
      <section
        aria-labelledby="launcher-heading"
        data-testid="investigation-launcher"
        className="relative z-10 mt-8 max-w-xl rounded-2xl border border-ink-border bg-paper-raised p-6 shadow-[0_1px_2px_rgba(39,40,59,0.06),0_8px_24px_rgba(39,40,59,0.05)] md:p-7"
      >
        <h2 id="launcher-heading" className="sr-only">
          Start an investigation
        </h2>

        {/* Legacy hero contract: this wrapper anchors the primary action
            (data flow and honest states unchanged). */}
        <div data-testid="hero-guided-action" className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={seedDemo}
            disabled={seeding}
            aria-busy={seeding}
            data-testid="guided-seed-button"
            className="w-full rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-white no-underline shadow-[0_1px_2px_rgba(82,74,120,0.3)] hover:bg-brand-deep disabled:cursor-progress disabled:opacity-80 sm:w-auto"
          >
            {seeding ? 'Contacting demo API…' : 'Start the guided investigation'}
          </button>
        </div>

        {/* Quiet integrity line — verbatim, visible without expanding. */}
        <p className="mt-5 text-sm leading-6 text-ink-muted">
          The guided example uses clearly labeled synthetic content (FICTIONAL
          / GUIDED DEMO) alongside real public records — nothing is simulated.
        </p>

        <p className="mt-2 text-sm">
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

      {/* 3 — Progressive-disclosure import. The picker (the untouched
          <ImportPanel/>) exists only after the toggle expands the area. */}
      <section aria-labelledby="document-heading" className="relative z-10 mt-8 max-w-xl px-2">
        <h2 id="document-heading" className="text-sm font-semibold text-ink">
          Have a document?
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          <button
            type="button"
            onClick={() => setShowDocumentArea((open) => !open)}
            aria-expanded={showDocumentArea}
            aria-controls="document-area"
            data-testid="choose-document-toggle"
            className="font-semibold text-ink underline decoration-ink-border decoration-2 underline-offset-4 hover:text-brand-deep"
          >
            Register a file (metadata only)
          </button>
        </p>

        {showDocumentArea && (
          <div
            id="document-area"
            className="mt-4 rounded-xl border border-ink-border bg-paper-raised p-5 text-left md:p-6"
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

      {/* 4 — How to read the evidence: hairline definition rows (no icon
          cards) with the flag rule in plain words, then the featured
          REAL record kept verbatim from the design of record. */}
      <section aria-labelledby="reading-heading" className="relative z-10 mt-10 max-w-xl px-2">
        <h2
          id="reading-heading"
          className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
        >
          How to read the evidence
        </h2>
        <dl className="mt-3 divide-y divide-[#DFD8C9]">
          <div className="py-3.5">
            <dt className="font-display text-base font-semibold text-ink">Flags</dt>
            <dd className="mt-1 text-sm leading-6 text-ink-muted">
              A flag asks a human to review the evidence — it is never a
              verdict, and never a proof.
            </dd>
          </div>
          <div className="py-3.5">
            <dt className="font-display text-base font-semibold text-ink">Imports</dt>
            <dd className="mt-1 text-sm leading-6 text-ink-muted">
              Registering a file records metadata only; the text of real
              documents never leaves your side of this demo.
            </dd>
          </div>
        </dl>

        <article
          aria-labelledby="featured-heading"
          className="mt-6 rounded-2xl border border-ink-border bg-paper-raised p-6"
        >
          <h3 id="featured-heading" className="font-display text-xl text-ink">
            Theory under real pressure
          </h3>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Mehra et al. 2020 (The Lancet) was retracted: the retraction was
            announced 2020-06-04 and recorded 2020-06-05 (PMIDs 32450107 /
            32511943). The guided investigation follows its impact through the
            demo graph; the manuscript under review there is fictional and
            labeled FICTIONAL / GUIDED DEMO — this record is not.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded-full border border-review-border bg-review-surface px-2.5 py-0.5 text-xs font-medium text-review-text">
              Verified real record
            </span>
            <Link
              to="/results"
              className="rounded border border-ink-border bg-paper px-3.5 py-1.5 text-sm font-medium text-ink no-underline hover:bg-paper-deep"
            >
              Open the guided investigation
            </Link>
          </div>
        </article>
      </section>

      {/* 5 — Quiet links row: four real destinations, one text line. */}
      <nav aria-label="Workspace areas" className="relative z-10 mt-10 px-2">
        <ul className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <li>
            <Link
              to="/investigations"
              className="text-sm text-ink no-underline hover:text-brand-deep"
            >
              Investigations
            </Link>
          </li>
          <li aria-hidden="true" className="text-sm text-ink-muted">
            ·
          </li>
          <li>
            <Link to="/library" className="text-sm text-ink no-underline hover:text-brand-deep">
              Library
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
              Review Queue
            </Link>
          </li>
          <li aria-hidden="true" className="text-sm text-ink-muted">
            ·
          </li>
          <li>
            <Link to="/graph" className="text-sm text-ink no-underline hover:text-brand-deep">
              Knowledge Graph
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
