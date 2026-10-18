import { useState } from 'react';
import { Link } from 'react-router-dom';

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

/**
 * Import-first landing (M1 skeleton state).
 *
 * The file picker is real and native (accessible), but selection is where
 * it stops: no upload endpoint exists yet, so the UI discloses exactly
 * that. No simulated progress, no fake parse, no fake results.
 */
export default function LandingPage() {
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [showGuidedNote, setShowGuidedNote] = useState(false);

  const onPicked = (file: File | null) => {
    if (!file) return;
    setSelectedFile({ name: file.name, size: describeSize(file.size), type: describeType(file) });
  };

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
              anywhere; there is no analysis backend in this build (M1).
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
        <p className="mt-1 text-sm text-ink-muted">
          Available after graph seed.{' '}
          <button
            type="button"
            onClick={() => setShowGuidedNote(true)}
            className="font-semibold text-brand-deep underline"
          >
            Why isn’t it available?
          </button>
        </p>
        {showGuidedNote && (
          <p
            className="mt-2 max-w-prose rounded border border-uncertain-border bg-uncertain-surface px-3 py-2 text-sm text-uncertain-text"
            role="note"
          >
            The guided example walks verified public retraction records through
            a fictional manuscript on a live demo graph. The graph is seeded in
            a later milestone (M2), so there is nothing to show yet — showing
            fake results is not an option.
          </p>
        )}
      </section>

      <p className="mt-6 text-sm text-ink-muted">
        Just exploring? The{' '}
        <Link to="/overview" className="text-brand-deep underline">
          Overview
        </Link>{' '}
        shows the current build status.
      </p>
    </div>
  );
}
