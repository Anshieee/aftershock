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

interface SelectedFile {
  name: string;
  size: string;
  type: string;
}

function describeSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${bytes} bytes`;
}

function describeType(file: File): string {
  if (file.type) return file.type;
  const extIndex = file.name.lastIndexOf('.');
  if (extIndex === -1) return 'unknown format';
  return `.${file.name.slice(extIndex + 1)}`;
}

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
 * Import-first landing (M2 state).
 *
 * The document picker is real but selection is where it stops: no import
 * endpoint exists, so the UI discloses that. "Try guided example" is now the
 * one wired action — it calls the guarded POST demo-seed endpoint and either
 * navigates to real results or states exactly what went wrong.
 */
export default function LandingPage() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [showGuidedNote, setShowGuidedNote] = useState(false);
  const [seedFlow, setSeedFlow] = useState<SeedFlow>({ phase: 'idle' });
  const activeRef = useRef<AbortController | null>(null);

  const onPicked = (file: File | null) => {
    if (!file) return;
    setSelectedFile({ name: file.name, size: describeSize(file.size), type: describeType(file) });
  };

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
  const buttonState =
    seedFlow.phase === 'submitting'
      ? { disabled: true, label: 'Contacting demo API…' }
      : { disabled: false, label: 'Try guided example' };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-4xl leading-tight text-ink">
        Find out which of your sources changed after publication
      </h1>
      <p className="mt-3 max-w-prose text-ink-muted">
        Aftershock traces retraction and status notices from your cited sources
        to the claims that depend on them, so you can review with evidence in
        hand. Everything shown in this build is real or clearly labeled —
        nothing is simulated.
      </p>

      <section
        aria-labelledby="import-heading"
        className="mt-8 rounded-lg border border-ink-border bg-paper-raised p-6 md:p-8"
      >
        <h2 id="import-heading" className="text-lg font-semibold text-ink">
          Start with a document
        </h2>

        {/* Primary affordance: native file picker, keyboard + screen-reader reachable */}
        <label
          htmlFor="import-input"
          className="mt-4 flex cursor-pointer items-center justify-center rounded-lg bg-brand px-6 py-3 text-center font-medium text-white hover:bg-brand-deep"
        >
          Choose a document
        </label>
        <input
          id="import-input"
          type="file"
          className="sr-only"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          data-testid="import-input"
          onChange={(e) => onPicked(e.target.files?.[0] ?? null)}
        />

        <p className="mt-4 text-sm leading-6 text-ink-muted">
          Accepted formats once wired: PDF, DOCX and TXT, with posted size
          limits rather than overpromises. Drag-and-drop arrives with the
          import flow. Once analysis exists, it starts automatically after a
          real import and your source document is never modified. In this
          build nothing is uploaded or transmitted — the import pipeline is
          not implemented yet.
        </p>

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

        {selectedFile && (
          <div
            className="mt-6 rounded-lg border border-review-border bg-review-surface p-4"
            role="status"
            data-testid="selection-state"
          >
            <p className="font-medium text-review-text">
              Selected: {selectedFile.name} — {selectedFile.size}, {selectedFile.type}
            </p>
            <p className="mt-1 text-sm text-ink">
              Not wired yet — skeleton. This file has not been uploaded
              anywhere; there is no import pipeline in this build.
            </p>
          </div>
        )}
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
          disabled={buttonState.disabled}
          aria-busy={seedFlow.phase === 'submitting'}
          data-testid="guided-seed-button"
          className="mt-3 rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep disabled:cursor-progress disabled:opacity-80"
        >
          {buttonState.label}
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
