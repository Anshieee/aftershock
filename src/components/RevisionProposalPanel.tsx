import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  ApiUnavailableError,
  reviewRevision,
  type RevisionProposalRequest,
  type RevisionProposalResult,
} from '../lib/api';

type PanelFlow =
  | { phase: 'idle' }
  | { phase: 'proposing' }
  | { phase: 'draft'; proposal: RevisionProposalResult }
  | { phase: 'copied'; proposal: RevisionProposalResult }
  | { phase: 'accepted'; proposal: RevisionProposalResult }
  | { phase: 'failed'; message: string };

interface RevisionProposalPanelProps {
  caseId: string;
  /** The original passage text — immutable, displayed read-only only. */
  originalText: string;
  /** Kind label for the announcement ("claim" / "conclusion"). */
  kindLabel?: string;
  /** Fired when the user explicitly accepts the suggestion (user-reported, not verified). */
  onAccepted?: (proposal: RevisionProposalResult) => void;
}

export default function RevisionProposalPanel({
  caseId,
  originalText,
  kindLabel = 'passage',
  onAccepted,
}: RevisionProposalPanelProps) {
  const abortRef = useRef<AbortController | null>(null);
  const [proposedText, setProposedText] = useState('');
  const [rationale, setRationale] = useState('');
  const [flow, setFlow] = useState<PanelFlow>({ phase: 'idle' });

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const describeError = useCallback((error: unknown): string => {
    if (error instanceof ApiTimeoutError) {
      return 'The revision API did not answer within 10 seconds (timeout) — no proposal was created. Try again.';
    }
    if (error instanceof ApiNetworkError) {
      return 'Network error — the request did not reach the revision API, no proposal was created.';
    }
    if (error instanceof ApiUnavailableError) {
      return `${error.message} No proposal was created.`;
    }
    // NOTE: ApiHttpError extends ApiClientError — status-specific branches
    // must run BEFORE the generic client-error fallback.
    if (error instanceof ApiHttpError) {
      if (error.status === 400) {
        return 'The proposal was rejected as malformed (HTTP 400) — check the proposed text and try again.';
      }
      if (error.status === 429) {
        return 'Rate limited (HTTP 429) — the revision endpoint allows only a few requests per short interval. Wait for the cooldown to pass, then try again. No proposal was created.';
      }
      if (error.status >= 500) {
        return 'The revision API is unavailable (server error) — no proposal was created.';
      }
      return `The revision API returned HTTP ${error.status} — no proposal was created.`;
    }
    if (error instanceof ApiClientError) {
      return error.message;
    }
    return 'The proposal could not be created — nothing was saved.';
  }, []);

  const propose = useCallback(() => {
    if (!proposedText.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFlow({ phase: 'proposing' });

    const request: RevisionProposalRequest = {
      proposedText: proposedText.trim(),
      rationale: rationale.trim() || undefined,
    };

    reviewRevision(caseId, request, { signal: controller.signal })
      .then((proposal) => {
        if (controller.signal.aborted) return;
        setFlow({ phase: 'draft', proposal });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFlow({ phase: 'failed', message: describeError(error) });
      });
  }, [caseId, proposedText, rationale, describeError]);

  const copyProposal = useCallback(() => {
    // DRAFT / COPIED / ACCEPTED all carry the proposal; `copied` was missing
    // before, which removed the Copy/Accept row right after a successful copy.
    const proposal =
      flow.phase === 'draft' || flow.phase === 'copied' || flow.phase === 'accepted'
        ? flow.proposal
        : null;
    const text = proposal?.proposedText ?? proposedText.trim();
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setFlow((current) =>
          current.phase === 'draft' || current.phase === 'copied' || current.phase === 'accepted'
            ? { phase: 'copied', proposal: current.proposal }
            : current,
        );
      })
      .catch(() => {
        // Clipboard access may be blocked; the copy is a convenience, not a requirement.
        setFlow((current) =>
          current.phase === 'draft' || current.phase === 'copied' || current.phase === 'accepted'
            ? { phase: 'draft', proposal: current.proposal }
            : current,
        );
      });
  }, [flow, proposedText]);

  const accept = useCallback(() => {
    const proposal =
      flow.phase === 'draft' || flow.phase === 'copied' ? flow.proposal : null;
    if (!proposal) return;
    // Acceptance is a human-reported action, not scientific validation.
    // It is not re-sent to the graph backend unless an accept endpoint exists.
    setFlow({ phase: 'accepted', proposal });
    onAccepted?.(proposal);
  }, [flow, onAccepted]);

  const proposal =
    flow.phase === 'draft' || flow.phase === 'copied' || flow.phase === 'accepted'
      ? flow.proposal
      : null;
  const canPropose = Boolean(proposedText.trim());
  const inFlight = flow.phase === 'proposing';

  return (
    <section
      aria-labelledby="revision-proposal-panel-heading"
      className="mt-4 rounded-lg border border-ink-border bg-paper-raised p-4 text-base"
      data-testid="revision-proposal-panel"
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 id="revision-proposal-panel-heading" className="text-sm font-semibold text-ink">
          Revision proposal — {kindLabel}
        </h3>
        <span
          className={[
            'inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-xs font-medium',
            flow.phase === 'idle'
              ? 'border-ink-border bg-paper text-ink-muted'
              : 'border-reviewed bg-reviewed-surface text-reviewed-text',
          ].join(' ')}
          data-testid="revision-proposal-status"
        >
          {flow.phase === 'idle'
            ? 'Not proposed'
            : flow.phase === 'proposing'
              ? 'Proposing…'
              : flow.phase === 'draft'
                ? 'Draft'
                : flow.phase === 'copied'
                  ? 'Copied'
                  : flow.phase === 'accepted'
                    ? 'Accepted (reported)'
                    : 'Failed'
          }
        </span>
      </div>

      {/* Original (left) vs proposed (right) — side by side from md up, so
          the immutable original and the editable proposal read as one
          comparison without ever equating copy with an applied change. */}
      <div className="mb-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
            Original {kindLabel} text — immutable
          </p>
          <blockquote
            className="rounded border border-ink-border bg-paper-deep pl-3 py-2 text-sm text-ink italic"
            data-testid="revision-proposal-original-text"
          >
            {originalText ? `“${originalText}”` : 'No text recorded on the returned record.'}
          </blockquote>
          <p className="mt-1 text-xs text-ink-muted">
            Shown read-only. Copying or accepting a proposal never edits the original
            passage.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-ink block mb-1">
            Proposed replacement text
          </label>
          <textarea
            value={proposedText}
            onChange={(e) => setProposedText(e.target.value)}
            rows={5}
            className="rounded border border-ink-border bg-paper-raised px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-offset-1 focus:outline-brand disabled:opacity-60"
            placeholder="Suggest the replacement wording here…"
            disabled={inFlight}
            data-testid="revision-proposal-proposed-text"
          />
          {flow.phase === 'idle' && (
            <p className="mt-1 text-xs text-ink-muted">
              A proposal starts as a draft. It is not applied, and it does not imply
              scientific validation, until a human explicitly accepts it.
            </p>
          )}
        </div>
      </div>
      <div className="mb-3">
        <label className="text-sm font-medium text-ink block mb-1">
          Rationale<span className="text-ink-muted font-normal"> · optional</span>
        </label>
        <input
          type="text"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          className="rounded border border-ink-border bg-paper-raised px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-offset-1 focus:outline-brand disabled:opacity-60"
          placeholder="Why this replacement…"
          disabled={inFlight}
          data-testid="revision-proposal-rationale"
          maxLength={500}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={propose}
          disabled={!canPropose || inFlight}
          aria-busy={inFlight}
          className={
            'rounded border border-ink-border bg-paper px-4 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60 hover:bg-paper-deep'
          }
          data-testid="revision-proposal-propose"
        >
          {inFlight ? 'Proposing…' : 'Propose revision'}
        </button>

        {proposal && (
          <>
            <button
              type="button"
              onClick={copyProposal}
              disabled={flow.phase === 'proposing'}
              className="rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink disabled:opacity-60 hover:bg-paper-deep"
              data-testid="revision-proposal-copy"
            >
              {flow.phase === 'copied' ? 'Copied!' : 'Copy proposed text'}
            </button>
            <button
              type="button"
              onClick={accept}
              disabled={flow.phase === 'proposing' || flow.phase === 'accepted'}
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep disabled:opacity-60"
              data-testid="revision-proposal-accept"
            >
              {flow.phase === 'accepted' ? 'Accepted' : 'Accept suggestion'}
            </button>
            <p className="mt-2 w-full text-xs text-ink-muted">
              {flow.phase === 'accepted'
                ? 'Accepted — reported as applied externally (user-reported; the server keeps the draft, it is not validated by this page).'
                : 'Copying copies text only — it does not apply, validate, or store anything.'}
            </p>
          </>
        )}
      </div>

      {/* Draft / accepted detail. */}
      {proposal && (
        <div className="mt-3 pt-3 border-t border-ink-border text-sm text-ink-muted">
          <p className="font-medium text-ink">
            Proposal <span className="font-mono">{proposal.proposalId}</span> · status{' '}
            <span className="font-mono">{proposal.status}</span> · created{' '}
            <span className="font-mono">{proposal.createdAt}</span>.
          </p>
          {proposal.originalText && (
            <p className="mt-1">
              Original (read-only): <span className="font-mono">{proposal.originalText}</span>
            </p>
          )}
        </div>
      )}

      {/* Error banner — exact failure, honest, with Retry. */}
      {flow.phase === 'failed' && (
        <div
          role="alert"
          className="mt-3 rounded border border-notice-border bg-notice-surface px-3 py-3 text-sm text-notice-text"
          data-testid="revision-proposal-error"
        >
          <p className="font-medium">{flow.message}</p>
          <button
            type="button"
            onClick={propose}
            className="mt-2 inline rounded border border-notice-text bg-notice-surface px-2 py-1 text-xs font-medium text-notice-text hover:bg-notice-surface-deep"
            data-testid="revision-proposal-retry"
          >
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
