import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Chip, EmptyState, Segmented, TextArea } from '../components/ui';
import { IconArrowRight, IconFilter, IconReview } from '../components/Icons';
import { useStore } from '../state/store';
import { documentById, findings as allFindings, REVIEW_OUTCOME_LABEL } from '../fixtures';
import { findingKindLabel, findingStatus, findingTone, statusLabel } from '../lib/findings';
import type { ReviewOutcome } from '../fixtures';

type Scope = 'open' | 'reviewed' | 'all';

export default function ReviewQueuePage() {
  const { documentId = 'doc-demo-manuscript' } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();
  const [scope, setScope] = useState<Scope>('open');
  const [kind, setKind] = useState<string>('all');
  const [note, setNote] = useState('');

  const document = documentById.get(documentId);
  const documentFindings = useMemo(
    () => allFindings.filter((f) => f.documentId === documentId),
    [documentId],
  );

  const rows = useMemo(() => {
    return documentFindings.filter((finding) => {
      const status = findingStatus(state.reviewDecisions, state.proposals, finding);
      if (scope === 'open' && status !== 'awaiting_review' && status !== 'further_investigation')
        return false;
      if (scope === 'reviewed' && status === 'awaiting_review') return false;
      if (kind !== 'all' && finding.kind !== kind) return false;
      return true;
    });
  }, [documentFindings, scope, kind, state]);

  const kinds = useMemo(
    () => [...new Set(documentFindings.map((finding) => finding.kind))],
    [documentFindings],
  );

  const selectedId = state.selectedFindingId;
  const selected = documentFindings.find((finding) => finding.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      {/* ---- Queue ---------------------------------------------------- */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-6 py-8 lg:px-10">
          <header className="border-b border-ink-border pb-6">
            <p className="eyebrow">Review</p>
            <h1 className="mt-2 font-display text-[1.75rem] font-semibold leading-[1.16] tracking-[-0.022em] text-ink">
              {document?.title ?? 'Document'}
            </h1>
            <p className="mt-2 max-w-[62ch] text-sm leading-6 text-ink-muted">
              A queue of passages that still need a person. Decisions are recorded against the
              passage — never against a truth.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Chip tone="neutral">
                {documentFindings.filter(
                  (f) => findingStatus(state.reviewDecisions, state.proposals, f) === 'awaiting_review',
                ).length}{' '}
                awaiting review
              </Chip>
              <Chip tone="sage">
                {documentFindings.filter(
                  (f) => findingStatus(state.reviewDecisions, state.proposals, f) !== 'awaiting_review',
                ).length}{' '}
                reviewed
              </Chip>
            </div>
          </header>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Segmented
              label="Queue scope"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'open', label: 'Needs a decision' },
                { value: 'reviewed', label: 'Reviewed' },
                { value: 'all', label: 'All' },
              ]}
            />
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <IconFilter size={13} />
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
                className="h-7 rounded-md border border-ink-border bg-paper-raised px-2 text-xs text-ink focus:border-brand focus:outline-none"
              >
                <option value="all">All kinds</option>
                {kinds.map((value) => (
                  <option key={value} value={value}>
                    {findingKindLabel({ kind: value } as never)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {rows.length === 0 ? (
            <div className="mt-5">
              <EmptyState title="Nothing in this queue" icon={<IconReview size={20} />}>
                {scope === 'open'
                  ? 'Every passage in this investigation has a recorded decision.'
                  : 'No passages match this filter.'}
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-ink-border border-y border-ink-border">
              {rows.map((finding) => {
                const status = findingStatus(state.reviewDecisions, state.proposals, finding);
                const decision = state.reviewDecisions[finding.id];
                const tone = findingTone(finding);
                const active = finding.id === selectedId;
                return (
                  <li key={finding.id}>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'select-finding', findingId: finding.id })}
                      className={`group flex w-full items-start gap-3 px-1 py-3 text-left transition-colors duration-150 ${
                        active ? 'bg-brand-soft/40' : 'hover:bg-ink/[0.03]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{
                          background:
                            tone === 'notice'
                              ? 'rgb(var(--c-notice))'
                              : tone === 'amber'
                                ? 'rgb(var(--c-amber))'
                                : tone === 'sage'
                                  ? 'rgb(var(--c-sage))'
                                  : tone === 'uncertain'
                                    ? 'rgb(var(--c-uncertain))'
                                    : 'rgb(var(--c-brand))',
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.8125rem] font-medium text-ink">
                          {finding.title}
                        </span>
                        <span className="meta mt-0.5 block">
                          {findingKindLabel(finding)} · {finding.locationLabel} ·{' '}
                          {statusLabel(status)}
                        </span>
                        {decision ? (
                          <span className="mt-1 block text-2xs text-sage">
                            {REVIEW_OUTCOME_LABEL[decision.outcome]} — {decision.reviewer}
                          </span>
                        ) : null}
                      </span>
                      <IconArrowRight
                        size={13}
                        className="mt-1 shrink-0 text-ink-soft opacity-0 transition-opacity duration-150 group-hover:opacity-70"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ---- Detail ---------------------------------------------------- */}
      <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-ink-border bg-paper-raised/40 xl:block">
        {selected ? (
          <div className="px-5 py-5">
            <p className="eyebrow">Passage</p>
            <h2 className="mt-1.5 font-display text-base font-semibold leading-5 text-ink">
              {selected.title}
            </h2>
            <p className="meta mt-1">{selected.locationLabel}</p>

            <blockquote className="mt-3 border-l-2 border-brand-line pl-3 font-display text-[0.875rem] leading-[1.65] text-ink-muted">
              {selected.plainExplanation}
            </blockquote>

            <p className="eyebrow mt-5">Decision</p>
            {state.reviewDecisions[selected.id] ? (
              <p className="mt-1.5 text-xs leading-5 text-sage">
                {REVIEW_OUTCOME_LABEL[state.reviewDecisions[selected.id]!.outcome]} —{' '}
                {state.reviewDecisions[selected.id]!.reviewer}
              </p>
            ) : (
              <p className="mt-1.5 text-xs leading-5 text-ink-muted">
                Nothing recorded yet.
              </p>
            )}

            <div className="mt-3">
              <TextArea
                value={note}
                onChange={setNote}
                rows={2}
                label="Note"
                placeholder="Why you decided this…"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(
                  [
                    ['further_investigation', 'Further investigation'],
                    ['revision_needed', 'Revision needed'],
                    ['not_affected', 'Not affected'],
                    ['evidence_updated', 'Evidence updated'],
                  ] as Array<[ReviewOutcome, string]>
                ).map(([outcome, label]) => (
                  <Button
                    key={outcome}
                    size="xs"
                    variant={
                      state.reviewDecisions[selected.id]?.outcome === outcome
                        ? 'primary'
                        : 'secondary'
                    }
                    onClick={() =>
                      dispatch({
                        type: 'record-review',
                        findingId: selected.id,
                        outcome,
                        note,
                      })
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-5 border-t border-ink-border pt-4">
              <Button
                size="sm"
                variant="secondary"
                className="w-full justify-start"
                onClick={() => navigate(`/i/${documentId}/read`)}
              >
                Open the passage in the reader
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 w-full justify-start"
                onClick={() => navigate(`/i/${documentId}/graph`)}
              >
                See it in the evidence graph
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-6">
            <p className="eyebrow">Queue</p>
            <h2 className="mt-1.5 font-display text-base font-semibold text-ink">
              Select a passage
            </h2>
            <p className="mt-1.5 text-xs leading-5 text-ink-muted">
              The queue stays connected to the manuscript — selecting an item here and opening it in
              the reader keeps your place.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
