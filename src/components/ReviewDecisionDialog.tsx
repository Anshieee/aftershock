import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  ApiUnavailableError,
  reviewDecide,
  type ReviewDecisionRequest,
  type ReviewDecisionResult,
  type ReviewOutcome,
} from '../lib/api';

type DialogFlow =
  | { phase: 'idle' }
  | { phase: 'deciding' }
  | { phase: 'failed'; message: string }
  | { phase: 'done'; decision: ReviewDecisionResult };

interface ReviewDecisionDialogProps {
  /** The claim/conclusion under review. Its text is shown read-only (immutable). */
  item: {
    id: string;
    kind: 'claim' | 'conclusion';
    reviewKind: 'direct_evidence_review' | 'indirect_evidence_review';
    text?: string;
  };
  open: boolean;
  /** True when a decision was already recorded (and shown) for this case. */
  alreadyRecorded?: boolean;
  onClose: () => void;
  /** Fired when a real decision is recorded server-side. */
  onDecisionRecorded: (decision: ReviewDecisionResult) => void;
}

const OUTCOMES: Array<{
  value: ReviewOutcome;
  label: string;
  note: string;
}> = [
  {
    value: 'revision_needed',
    label: 'Revision needed',
    note: 'The passage needs rewording before it can stand.',
  },
  {
    value: 'more_evidence_needed',
    label: 'More evidence needed',
    note: 'The supporting basis is insufficient as returned.',
  },
  {
    value: 'not_affected',
    label: 'Not affected',
    note: 'The flag does not hold on closer review.',
  },
  {
    value: 'evidence_updated',
    label: 'Evidence updated',
    note: 'The citation/supporting basis has been corrected.',
  },
];

function describeDecisionError(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return 'The review API did not answer within 10 seconds (timeout) — nothing was recorded. Try again.';
  }
  if (error instanceof ApiNetworkError) {
    return 'Network error — the request did not reach the review API, nothing was recorded.';
  }
  if (error instanceof ApiUnavailableError) {
    return `${error.message} The decision was not recorded.`;
  }
  // NOTE: ApiHttpError extends ApiClientError — the status-specific branches
  // must be checked BEFORE the generic client-error fallback.
  if (error instanceof ApiHttpError) {
    if (error.status === 400) {
      return 'The decision was rejected as malformed (HTTP 400) — check the explanation and try again.';
    }
    if (error.status === 409) {
      return 'A decision was already recorded for this case (HTTP 409) — nothing changed.';
    }
    if (error.status === 429) {
      // Per-IP rate limit on the review endpoint: do not retry in a tight
      // loop. The Retry affordance exists, but the copy tells the user to
      // wait the cooldown out first.
      return 'Rate limited (HTTP 429) — the review endpoint allows only a few decisions per short interval. Wait for the cooldown to pass, then try again. Nothing was recorded.';
    }
    if (error.status >= 500) {
      return 'The review API is unavailable (server error) — the decision was not recorded.';
    }
    return `The review API returned HTTP ${error.status} — the decision was not recorded.`;
  }
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return 'The decision could not be recorded — nothing was saved.';
}

export default function ReviewDecisionDialog({
  item,
  open,
  alreadyRecorded = false,
  onClose,
  onDecisionRecorded,
}: ReviewDecisionDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [explanation, setExplanation] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [flow, setFlow] = useState<DialogFlow>({ phase: 'idle' });

  // Open/close lifecycle: reset form, trap focus, return focus on close.
  useEffect(() => {
    if (open) {
      abortRef.current?.abort();
      setOutcome(null);
      setExplanation('');
      setReviewer('');
      setFlow({ phase: 'idle' });
      triggerRef.current = document.activeElement as HTMLButtonElement | null;
      dialogRef.current?.focus();
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const keyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', keyDown);
      return () => document.removeEventListener('keydown', keyDown);
    }
  }, [open, keyDown]);

  const isSubmitReady = Boolean(outcome && explanation.trim().length > 0);

  const selectOutcome = useCallback((value: ReviewOutcome) => {
    setOutcome(value);
    setFlow({ phase: 'idle' });
  }, []);

  const submit = useCallback(() => {
    if (!outcome || !explanation.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFlow({ phase: 'deciding' });

    const request: ReviewDecisionRequest = {
      outcome,
      explanation: explanation.trim(),
      reviewer: reviewer.trim() || undefined,
    };

    reviewDecide(item.id, request, { signal: controller.signal })
      .then((decision) => {
        if (controller.signal.aborted) return;
        setFlow({ phase: 'done', decision });
        onDecisionRecorded(decision);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFlow({ phase: 'failed', message: describeDecisionError(error) });
      });
  }, [item.id, outcome, explanation, reviewer, onDecisionRecorded]);

  if (!open) return null;

  const decided = flow.phase === 'done' ? flow.decision : null;

  return (
    <>
      {/* Backdrop: dismisses the dialog on click. */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-decision-dialog-title"
        aria-busy={flow.phase === 'deciding'}
        tabIndex={-1}
        className="fixed left-[50%] top-[14%] -translate-x-1/2 z-50 w-full max-w-md rounded-lg border border-ink-border bg-paper-raised p-6 shadow-xl text-ink"
        data-testid="review-decision-dialog"
      >
        <div className="flex items-baseline justify-between gap-2 mb-4">
          <h2 id="review-decision-dialog-title" className="text-lg font-semibold text-ink">
            Record review decision
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-ink-border bg-paper px-2 py-1 text-sm text-ink hover:bg-paper-deep"
            data-testid="review-decision-dialog-close"
          >
            Close
          </button>
        </div>

        {(alreadyRecorded === true) && flow.phase === 'idle' && (
          <p className="mb-4 rounded border border-ink-border bg-paper px-3 py-2 text-xs text-ink-muted">
            A decision has already been recorded for this case in this session — you
            can record another one; the server decides whether the case reopens or
            rejects repeats (its exact response is shown here, never invented).
          </p>
        )}

        {/* Original text — immutable, read-only, never an editable field. */}
        <div className="mb-4">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
            Original claim / conclusion text — immutable
          </p>
          <blockquote
            className="rounded border border-ink-border bg-paper-deep pl-3 py-2 text-sm text-ink italic"
            data-testid="review-decision-dialog-original-text"
          >
            {item.text ? `“${item.text}”` : 'No text recorded on the returned record.'}
          </blockquote>
          <p className="mt-1 text-xs text-ink-muted">
            This text is shown read-only. A decision never edits the original passage.
          </p>
        </div>

        {/* Outcome choice. */}
        <div className="mb-4">
          <p className="text-sm font-medium text-ink mb-2">Decision outcome</p>
          <div className="space-y-2" role="radiogroup" aria-label="Review decision outcome">
            {OUTCOMES.map((choice) => {
              const selected = outcome === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={flow.phase === 'deciding'}
                  onClick={() => selectOutcome(choice.value)}
                  data-testid={`review-decision-outcome-${choice.value}`}
                  className={
                    'w-full flex flex-col items-start gap-1 rounded border px-3 py-2.5 text-sm text-left transition-colors disabled:opacity-60' +
                    (selected
                      ? ' border-brand bg-brand-surface text-brand font-medium'
                      : ' border-ink-border bg-paper text-ink hover:bg-paper-deep')
                  }
                >
                  <span className="font-medium">{choice.label}</span>
                  <span className="text-xs text-ink-muted">{choice.note}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rationale (required). */}
        <div className="mb-4">
          <label className="text-sm font-medium text-ink block mb-1">
            Explanation / rationale<span className="text-ink-muted font-normal"> · required</span>
          </label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={4}
            className="rounded border border-ink-border bg-paper-raised px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-offset-1 focus:outline-brand disabled:opacity-60"
            placeholder="Why this decision…"
            disabled={flow.phase === 'deciding'}
            data-testid="review-decision-explanation"
            aria-required="true"
          />
          {flow.phase === 'idle' && outcome !== null && explanation.trim().length === 0 ? (
            <p
              className="mt-1 text-xs text-notice-text"
              data-testid="review-decision-rationale-error"
            >
              An explanation is required before recording — say, in your own words, why
              this decision holds, so the audit trail carries a meaningful rationale.
            </p>
          ) : null}
        </div>

        {/* Reviewer (optional, human attribution). */}
        <div className="mb-4">
          <label className="text-sm font-medium text-ink block mb-1">
            Reviewer name<span className="text-ink-muted font-normal"> · optional</span>
          </label>
          <input
            type="text"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            className="rounded border border-ink-border bg-paper-raised px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-offset-1 focus:outline-brand disabled:opacity-60"
            placeholder="Your name (optional)"
            disabled={flow.phase === 'deciding'}
            data-testid="review-decision-reviewer"
            maxLength={100}
          />
        </div>

        {/* Action row. */}
        <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-ink-border">
          <button
            type="button"
            onClick={onClose}
            disabled={flow.phase === 'deciding'}
            className="rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink disabled:opacity-60 hover:bg-paper-deep"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!isSubmitReady || flow.phase === 'deciding'}
            aria-busy={flow.phase === 'deciding'}
            className={
              'rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60'
            }
            data-testid="review-decision-submit"
          >
            {flow.phase === 'deciding' ? 'Recording decision…' : 'Record decision'}
          </button>
        </div>

        {/* Error banner — exact failure, honest, with Retry. */}
        {flow.phase === 'failed' && (
          <div
            role="alert"
            className="mt-4 rounded border border-notice-border bg-notice-surface px-3 py-3 text-sm text-notice-text"
            data-testid="review-decision-error"
          >
            <p className="font-medium">{flow.message}</p>
            <button
              type="button"
              onClick={submit}
              className="mt-2 inline rounded border border-notice-text bg-notice-surface px-2 py-1 text-xs font-medium text-notice-text hover:bg-notice-surface-deep"
              data-testid="review-decision-retry"
            >
              Retry
            </button>
          </div>
        )}

        {/* Done: confirmation panel — before/after state, no auto-navigate. */}
        {decided && (
          <div
            role="status"
            className="mt-4 rounded border border-reviewed bg-reviewed-surface px-3 py-3 text-sm text-reviewed-text"
            data-testid="review-decision-done"
          >
            <p className="font-medium text-reviewed-text">Decision recorded.</p>
            <p className="mt-1">
              Outcome:{' '}
              <span className="font-mono">{decided.outcome}</span> · decided{' '}
              <span className="font-mono">{decided.decidedAt}</span>
              {decided.reviewer ? ` · by ${decided.reviewer}` : ''}
            </p>
            <p className="mt-1">
              Case <span className="font-mono">{decided.caseId}</span> · decision{' '}
              <span className="font-mono">{decided.decisionId}</span>.
            </p>
            <p className="mt-1">
              State: <span className="font-mono">{decided.beforeState}</span> →{' '}
              <span className="font-mono">{decided.afterState}</span>.
            </p>
            <p className="mt-2 text-xs text-reviewed-text">
              This is the SERVER response — a recorded decision is a human
              judgement, not scientific validation. The queue reflects the returned
              record (sage styling derives from the server state, refreshed in the
              background). Revisions still require a separate, human acceptance step.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 rounded border border-ink-border bg-paper px-3 py-1.5 text-sm text-ink hover:bg-paper-deep"
              data-testid="review-decision-done-close"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}
