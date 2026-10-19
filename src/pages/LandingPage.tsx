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
import WaveRule from './landing-v5/WaveRule';
import useBodoniItalic from './landing-v5/useBodoniItalic';
import './landing-v5/landing-v5.css';

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
 * V5 — THE EDITORIAL STATEMENT (variant experiment 2026-10-20,
 * branch experiment/home-v5-editorial).
 *
 * The bold typography-first variant: the research question restated as a
 * two-line display statement — "After the shock," (Bodoni Moda 900 roman,
 * ink) / "the record." (true italic, indigo) — followed by the original
 * question line as a secondary serif standfirst. Asymmetric grid below the
 * fold of the display: body copy left, a narrow right column holding the
 * single launcher (one dominant seed action + progressive-disclosure
 * document toggle) and a folio-style destination index; the featured real
 * record closes the page as a public-record clipping strip.
 *
 * Data flow is Wave U1's, unchanged: the guarded demo-seed state machine
 * with every honest state (submitting / unavailable / cooldown / not-wired
 * / api-error / rejected), an aria-live guidance region, navigation only on
 * real success. The document picker is the untouched <ImportPanel/> behind
 * aria-expanded disclosure; Bibliography / Single DOI stay visible-but-
 * disabled with the honest scope note. Motion is a <600ms staggered rise
 * plus one hover pulse on the indigo wave rule — both disabled under
 * prefers-reduced-motion by the shell's global rule.
 */
export default function LandingPage() {
  const navigate = useNavigate();
  const [showGuidedNote, setShowGuidedNote] = useState(false);
  const [showDocumentArea, setShowDocumentArea] = useState(false);
  const [seedFlow, setSeedFlow] = useState<SeedFlow>({ phase: 'idle' });
  const [ctaEmphasis, setCtaEmphasis] = useState(false);
  const activeRef = useRef<AbortController | null>(null);

  useBodoniItalic();

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
    <div className="v5-root flex min-h-[calc(100svh-4rem)] flex-col">
      {/* 1 — Folio frame: magazine chrome, hairline top rule, two margin
          micro-labels. No wordmark in the hero (it stays in the sidebar). */}
      <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-ink-border pt-2.5">
        <p className="v5-micro text-ink-muted">
          N° 01 <span aria-hidden="true">—</span> Trace the evidence
        </p>
        <p className="v5-micro hidden text-ink-muted sm:block">
          Evidence integrity workspace
        </p>
      </div>

      {/* 2 — THE EDITORIAL STATEMENT: two display lines, staggered rise on
          load (<600ms total, transform/opacity only). Line one is Bodoni
          Moda 900 roman in ink; line two is the true italic cut in indigo —
          the wave identity carried typographically, not decoratively. */}
      <section aria-labelledby="hero-heading" className="mt-10 md:mt-14">
        <h1 id="hero-heading" className="v5-display [text-wrap:balance]">
          <span className="v5-line">After the shock,</span>
          <span className="v5-line v5-line--2 v5-turn">the record.</span>
        </h1>
        <div className="v5-line v5-line--3">
          <WaveRule pulsing={ctaEmphasis} />
          {/* Secondary standfirst: the original research question kept as
              the page's spoken voice, in the display serif's italic. */}
          <p className="mt-4 font-display text-2xl italic text-ink md:text-3xl">
            What would you like to investigate?
          </p>
        </div>
      </section>

      {/* 3 — Asymmetric editorial grid: disciplined body copy left
          (~62%), launcher + folio index in the narrow right margin
          column. Collapse to one column below lg. */}
      <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-12 lg:mt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)] lg:gap-x-16">
        <section aria-label="About the workspace" className="max-w-prose">
          <p className="text-lg leading-8 text-ink md:text-xl md:leading-9">
            Follow the evidence. Understand what changed.
          </p>
          <p className="mt-4 text-[15px] leading-7 text-ink-muted">
            When a study is retracted or corrected, its fingerprints stay
            behind in what it once supported. Aftershock traces how those
            aftershocks reach the claims your own records depend on — and
            marks exactly where a human review, not a verdict, is needed.
          </p>
        </section>

        {/* THE launcher: the page's single seed trigger and the single
            indigo destination. The integrity line is visible without any
            expansion; all honest seed states render in the live region. */}
        <section
          aria-labelledby="launcher-heading"
          data-testid="investigation-launcher"
          className="lg:pt-1 lg:border-l lg:border-ink-border lg:pl-8"
        >
          <h2 id="launcher-heading" className="sr-only">
            Start an investigation
          </h2>
          <p className="v5-micro text-brand-deep">Start here</p>

          {/* Testid hook kept for the legacy hero contract: this wrapper
              anchors the two real actions (data flow and honest states
              unchanged; labels re-typeset in the editorial voice). */}
          <div data-testid="hero-guided-action" className="mt-4 flex flex-col gap-3.5">
            <button
              type="button"
              onClick={seedDemo}
              disabled={seeding}
              aria-busy={seeding}
              data-testid="guided-seed-button"
              className="v5-focus w-full rounded-md bg-brand px-4 py-3 text-[15px] font-semibold tracking-tight text-white no-underline hover:bg-brand-deep disabled:cursor-progress disabled:opacity-80"
              onMouseEnter={() => setCtaEmphasis(true)}
              onMouseLeave={() => setCtaEmphasis(false)}
              onFocus={() => setCtaEmphasis(true)}
              onBlur={() => setCtaEmphasis(false)}
            >
              {seeding ? 'Contacting demo API…' : 'Start the guided investigation'}
            </button>
            {/* Secondary action: text-style, deliberately NOT indigo — it
                only discloses the real picker; it never competes with the
                primary CTA for the one indigo destination. */}
            <button
              type="button"
              onClick={() => setShowDocumentArea((open) => !open)}
              aria-expanded={showDocumentArea}
              aria-controls="document-area"
              data-testid="choose-document-toggle"
              className="v5-focus w-fit text-left text-[15px] leading-6 text-ink underline decoration-ink-border decoration-1 underline-offset-4 hover:decoration-ink"
            >
              Have a document? Register a file (metadata only)
            </button>
          </div>

          {/* Quiet integrity line: the honest synthetic-vs-real distinction,
              visible without expanding anything (never only inside a
              collapsed region). */}
          <p className="mt-5 text-sm leading-6 text-ink-muted">
            The guided example uses clearly labeled synthetic content (FICTIONAL
            / GUIDED DEMO) alongside real public records — nothing is simulated.
          </p>

          <p className="mt-2">
            <button
              type="button"
              onClick={() => setShowGuidedNote((open) => !open)}
              aria-expanded={showGuidedNote}
              className="v5-focus font-semibold text-brand-deep underline"
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
              <p className="text-sm leading-6 text-ink-muted" role="status">
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

          {/* 4 — Document area, collapsed by default. Toggling it reveals
              the real import flow (ImportPanel rendered untouched: client-side
              guards → POST /import-document → verbatim server disclosure →
              Analyze only for the demo manuscript) plus the still-unbuilt
              Bibliography / Single DOI affordances, honest and disabled. */}
          {showDocumentArea && (
            <div
              id="document-area"
              className="mt-5 rounded-xl bg-paper-deep p-5"
            >
              <ImportPanel />

              <div className="mt-4 border-t border-ink-border pt-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-muted">
                  <button
                    type="button"
                    disabled
                    className="v5-focus cursor-not-allowed rounded border border-ink-border bg-paper px-2 py-1 text-xs text-ink-muted"
                  >
                    Bibliography
                  </button>
                  <button
                    type="button"
                    disabled
                    className="v5-focus cursor-not-allowed rounded border border-ink-border bg-paper px-2 py-1 text-xs text-ink-muted"
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

        {/* 5 — Folio destination index: the workspace areas as a numbered
            magazine table of contents, plain text links (no cards). */}
        <nav aria-label="Workspace areas" className="lg:col-start-2">
          <p className="v5-micro text-ink-muted">Destinations</p>
          <ol className="mt-3 flex flex-col divide-y divide-ink-border border-y border-ink-border">
            {[
              { to: '/investigations', label: 'Investigations' },
              { to: '/library', label: 'My Library' },
              { to: '/review-queue', label: 'Review Claims' },
              { to: '/graph', label: 'Evidence Graph' },
            ].map((item, index) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="v5-focus group flex items-baseline gap-3 py-2.5 text-[15px] font-display text-ink no-underline hover:text-brand-deep"
                >
                  <span className="v5-folio-numeral v5-micro text-ink-muted" aria-hidden="true">
                    0{index + 1}
                  </span>
                  <span className="underline-offset-4 group-hover:underline">
                    {item.label}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* 6 — Public-record clipping strip: one real, publicly verified
          record, clearly distinct from the fictional guided-demo
          manuscript. The single CTA is a plain outline link to /results —
          seeding happens only via the launcher above. */}
      <section
        aria-labelledby="featured-heading"
        className="mt-16 border-t border-ink-border pb-10 pt-5 md:mt-20"
      >
        <p className="v5-micro text-ink-muted">From the public record</p>
        <article className="mt-4 md:flex md:items-start md:justify-between md:gap-10">
          <div className="max-w-prose">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 id="featured-heading" className="font-display text-xl text-ink">
                The 2020 hydroxychloroquine retraction
              </h3>
              <span className="rounded-full border border-review-border bg-review-surface px-2.5 py-0.5 text-xs font-medium text-review-text">
                Verified real record
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              Mehra et al. 2020 (The Lancet) was retracted: the retraction was
              announced 2020-06-04 and recorded 2020-06-05 (PMIDs 32450107 /
              32511943). The guided investigation follows its impact through the
              demo graph; the manuscript under review there is fictional and
              labeled FICTIONAL / GUIDED DEMO — this record is not.
            </p>
          </div>
          <div className="mt-4 shrink-0 md:mt-0 md:self-center">
            <Link
              to="/results"
              className="v5-focus inline-block rounded-md border border-ink-border bg-paper px-4 py-2 text-sm font-medium text-ink no-underline hover:bg-paper-deep"
            >
              Open the guided investigation
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
