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
import './landing-v4.css';

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

/** Real navigation destinations — the notebook index (no icon tiles). */
const indexEntries = [
  { to: '/investigations', label: 'Investigations' },
  { to: '/library', label: 'Library' },
  { to: '/review-queue', label: 'Review Queue' },
  { to: '/graph', label: 'Knowledge Graph' },
] as const;

/**
 * VARIANT 04 — THE INVESTIGATOR'S DESK (design experiment, 2026-10-20).
 *
 * The landing page is the top sheet of a working case file: a dotted desk pad,
 * a manila case-label margin tab, and a stack of divider-labelled sheets —
 * `01 · START` (the case card), `02 · INTAKE` (the real, untouched
 * <ImportPanel/>), `03 · RECORDS` (the verified public record + a stamp
 * legend), `04 · INDEX` (real navigation typeset as a notebook index).
 *
 * What did NOT change, by contract: the guarded seed state machine and every
 * honest outcome (submitting / unavailable / cooldown / not-wired / api-error /
 * rejected → typed messages, aria-live region, aria-busy, no success guessing),
 * the integrity line, the disclosure note, the still-disabled Bibliography /
 * Single DOI row with its single scope note, <ImportPanel/> itself, and the
 * featured record's real, distinct dates and PMIDs. The only surface additions
 * are presentational: new labels, a status lamp that MIRRORS the same state
 * machine (aria-hidden, so it never double-announces), and sheet chrome.
 *
 * No workspace history is invented: no recent investigations, no timestamps,
 * no user names, no activity feed. Every section label names this page's own
 * structure.
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

  // Status lamp — a terse, aria-hidden visual mirror of the SAME state
  // machine the live region announces. It can only show a phase that
  // actually happened; it never reports progress, success or history.
  const lampText =
    seedFlow.phase === 'submitting'
      ? 'Submitting…'
      : seedFlow.phase === 'unavailable'
        ? 'Unavailable'
        : seedFlow.phase === 'cooldown'
          ? 'Cooldown 429'
          : seedFlow.phase === 'not-wired'
            ? 'Not wired'
            : seedFlow.phase === 'api-error'
              ? `API error ${seedFlow.status}`
              : seedFlow.phase === 'rejected'
                ? 'Rejected'
                : 'Idle';
  const lampTone =
    seedFlow.phase === 'submitting' || seedFlow.phase === 'cooldown'
      ? 'busy'
      : seedFlow.phase === 'idle'
        ? 'idle'
        : 'flag';

  return (
    // Desk pad: dotted lab-notebook ground, one centered column, left-aligned
    // document body with a margin lane for the case tab (md+).
    <div className="landing-v4 mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-3xl flex-col">
      <div className="v4-stack">
        {/* HERO — the first page of the case file: case tab, wordmark,
            tagline, the question, and the honest scope stamp. */}
        <section aria-labelledby="hero-heading" className="v4-hero">
          <span className="v4-case-tab" aria-hidden="true">
            Case file · Desk
          </span>
          <p className="v4-brand">
            <span className="wordmark v4-wordmark">Aftershock.</span>
          </p>
          <p className="v4-tagline">Trace the evidence.</p>
          <h1 id="hero-heading" className="v4-hero-title">
            What would you like to investigate?
          </h1>
          <p className="v4-hero-lede v4-hero-lede--full">
            Three real paths on this desk: start the guided investigation,
            register a file (metadata only), or read a verified record from the
            public literature. Nothing here is staged.
          </p>
          <p className="v4-hero-lede v4-hero-lede--short">
            Three real paths: guided investigation, file registration (metadata
            only), verified record. Nothing here is staged.
          </p>
          <p className="v4-stamp">Guided demo build</p>
        </section>

        {/* 01 · START — the case card: the page's single indigo destination
            and the only seed trigger, on the unchanged guarded flow. */}
        <section
          aria-labelledby="launcher-heading"
          data-testid="investigation-launcher"
          className="v4-card"
        >
          <span className="v4-tab-label" aria-hidden="true">
            01 · Start
          </span>
          <h2 id="launcher-heading" className="v4-h2">
            Start an investigation
          </h2>

          {/* Practical file header: what this path really is + status field. */}
          <div className="v4-card-head">
            <p className="v4-meta">Guarded, rate-limited seed API · idempotent reseed</p>
            <p className={`v4-lamp v4-lamp--${lampTone}`} aria-hidden="true">
              {lampText}
            </p>
          </div>

          {/* The single seed control (legacy hero contract testid kept). */}
          <div data-testid="hero-guided-action" className="v4-actions">
            <button
              type="button"
              onClick={seedDemo}
              disabled={seeding}
              aria-busy={seeding}
              data-testid="guided-seed-button"
              className="v4-cta"
            >
              {seeding ? 'Contacting demo API…' : 'Start the guided investigation'}
            </button>
          </div>

          {/* Quiet integrity line: the honest synthetic-vs-real distinction,
              visible without expanding anything (never only inside a
              collapsed region). */}
          <p className="v4-integrity">
            The guided example uses clearly labeled synthetic content (FICTIONAL
            / GUIDED DEMO) alongside real public records — nothing is simulated.
          </p>

          <p className="v4-disclosure-line">
            <button
              type="button"
              onClick={() => setShowGuidedNote((open) => !open)}
              aria-expanded={showGuidedNote}
              className="v4-link-btn"
            >
              What does that involve?
            </button>
          </p>

          {showGuidedNote && (
            <p className="v4-note" role="note">
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
            className="v4-seed-state"
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

        {/* 02 · INTAKE — always present so numbering stays 01 → 02 → 03 →
            04 even when collapsed. Collapsed: a thin header row carrying the
            tab label and the existing intake toggle. Expanded: the real,
            untouched <ImportPanel/> plus the honestly disabled Bibliography /
            Single DOI affordances. */}
        <section
          id="document-area"
          aria-labelledby="intake-heading"
          className={`v4-sheet${showDocumentArea ? '' : ' v4-sheet--collapsed'}`}
        >
          <div className="v4-intake-head">
            <span className="v4-tab-label" aria-hidden="true">
              02 · Intake
            </span>
            <button
              type="button"
              onClick={() => setShowDocumentArea((open) => !open)}
              aria-expanded={showDocumentArea}
              aria-controls="document-area"
              data-testid="choose-document-toggle"
              className="v4-toggle v4-toggle--intake"
            >
              <span className="v4-toggle-lead">Have a document?</span>{' '}
              <span>Register a file (metadata only)</span>
            </button>
          </div>

          {showDocumentArea && (
            <>
              <h2 id="intake-heading" className="v4-h2">
                Intake — register a file (metadata only)
              </h2>

              <ImportPanel />

              <div className="v4-disabled-row">
                <button type="button" disabled className="v4-disabled-chip">
                  Bibliography
                </button>
                <button type="button" disabled className="v4-disabled-chip">
                  Single DOI
                </button>
                <span>
                  Bibliography and DOI imports arrive with the import flow — they
                  cannot detect passage-level claim dependencies; original research
                  text is needed for that.
                </span>
              </div>
            </>
          )}
        </section>

        {/* 03 · RECORDS — one real, publicly verified record, clearly
            distinct from the fictional guided-demo manuscript, followed by
            the stamp legend that defines this workspace's own language. */}
        <section aria-labelledby="featured-heading" className="v4-sheet">
          <span className="v4-tab-label" aria-hidden="true">
            03 · Records
          </span>
          <h2 id="featured-heading" className="v4-h2">
            Featured investigation
          </h2>

          <article className="mt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h3 id="record-heading" className="v4-record-title">
                The 2020 hydroxychloroquine retraction
              </h3>
              <span className="v4-badge">Verified real record</span>
            </div>
            <p className="v4-record-body">
              Mehra et al. 2020 (The Lancet) was retracted: the retraction was
              announced 2020-06-04 and recorded 2020-06-05 (PMIDs 32450107 /
              32511943). The guided investigation follows its impact through the
              demo graph; the manuscript under review there is fictional and
              labeled FICTIONAL / GUIDED DEMO — this record is not.
            </p>
            <Link to="/results" className="v4-outline-link">
              Open the guided investigation
            </Link>
          </article>

          <aside aria-labelledby="stamp-legend-heading" className="v4-legend">
            <h3 id="stamp-legend-heading" className="v4-legend-title">
              Stamp legend
            </h3>
            <ul>
              <li>
                <span className="v4-badge">Verified real record</span>
                <span>
                  A real, publicly documented record — its dates and identifiers
                  are shown above.
                </span>
              </li>
              <li>
                <span className="v4-flag-stamp">Flagged — needs human review</span>
                <span>
                  A review flag means a person still needs to read it — never
                  that a claim was proven or disproven.
                </span>
              </li>
            </ul>
          </aside>
        </section>

        {/* 04 · INDEX — real destinations typeset as a notebook index:
            text links, hairline leaders, real route paths. No icon tiles. */}
        <nav aria-label="Workspace index" className="v4-sheet">
          <span className="v4-tab-label" aria-hidden="true">
            04 · Index
          </span>
          <h2 className="v4-h2">Index</h2>
          <ul className="v4-index">
            {indexEntries.map((entry) => (
              <li key={entry.to}>
                <Link to={entry.to} className="v4-index-link">
                  {entry.label}
                </Link>
                <span className="v4-leader" aria-hidden="true" />
                <span className="v4-index-path" aria-hidden="true">
                  {entry.to}
                </span>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
