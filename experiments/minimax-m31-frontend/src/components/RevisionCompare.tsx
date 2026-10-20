import { useMemo, useState } from 'react';
import { Button, Chip, Disclosure, Segmented } from './ui';
import { IconCheck, IconClose, IconLayers } from './Icons';
import { diffWords, summarise } from '../lib/diff';
import type { Finding, RevisionProposalRecord } from '../fixtures';
import { useStore } from '../state/store';
import { findingEdges, findingNotice, findingPublication } from '../lib/findings';

/**
 * Revision comparison.
 *
 * Two modes: side by side (the default) and tracked changes. Neither mode
 * edits the original manuscript, and a proposal is never presented as
 * verified scientific correctness.
 */
export function RevisionCompare({
  finding,
  proposal,
}: {
  finding: Finding;
  proposal: RevisionProposalRecord;
}) {
  const { state, dispatch } = useStore();
  const [mode, setMode] = useState<'side-by-side' | 'tracked'>(state.revisionMode);
  const tokens = useMemo(
    () => diffWords(proposal.originalText, proposal.proposedText),
    [proposal.originalText, proposal.proposedText],
  );
  const summary = useMemo(() => summarise(tokens), [tokens]);
  const publication = findingPublication(finding);
  const notice = findingNotice(finding);
  const edges = findingEdges(finding);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Revision view"
          value={mode}
          onChange={(value) => {
            setMode(value);
            dispatch({ type: 'set-revision-mode', mode: value });
          }}
          options={[
            { value: 'side-by-side', label: 'Side by side' },
            { value: 'tracked', label: 'Tracked changes' },
          ]}
        />
        <Chip tone={proposal.status === 'accepted' ? 'sage' : proposal.status === 'discarded' ? 'neutral' : 'amber'}>
          {proposal.status === 'accepted'
            ? 'In the draft revision plan'
            : proposal.status === 'discarded'
              ? 'Discarded'
              : 'Draft proposal'}
        </Chip>
        <span className="meta">
          +{summary.inserted} / −{summary.deleted} words
        </span>
      </div>

      {mode === 'side-by-side' ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-ink-border bg-paper-raised/60">
            <header className="flex items-center gap-2 border-b border-ink-border px-4 py-2.5">
              <span className="eyebrow">Original passage</span>
              <span className="meta ml-auto">As printed</span>
            </header>
            <p className="px-4 py-4 font-display text-[0.9375rem] leading-[1.7] text-ink-muted">
              {proposal.originalText}
            </p>
          </section>

          <section className="rounded-lg border border-brand-line bg-brand-soft/35">
            <header className="flex items-center gap-2 border-b border-brand-line/60 px-4 py-2.5">
              <span className="eyebrow text-brand-deep">Suggested revision</span>
              <span className="meta ml-auto">Not applied</span>
            </header>
            <p className="px-4 py-4 font-display text-[0.9375rem] leading-[1.7] text-ink">
              {proposal.proposedText}
            </p>
          </section>
        </div>
      ) : (
        <section className="mt-5 rounded-lg border border-ink-border bg-paper-raised/60">
          <header className="flex items-center gap-3 border-b border-ink-border px-4 py-2.5">
            <span className="eyebrow">Tracked changes</span>
            <span className="flex items-center gap-2 text-2xs text-ink-soft">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="h-[2px] w-4 bg-sage" />
                added
              </span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="h-[2px] w-4 bg-notice" />
                removed
              </span>
            </span>
          </header>
          <p className="px-4 py-4 font-display text-[0.9375rem] leading-[1.75] text-ink">
            {tokens.map((token, index) => {
              if (token.type === 'equal') return <span key={index}>{token.text}</span>;
              if (token.type === 'insert') {
                return (
                  <span
                    key={index}
                    className="rounded-[2px] bg-sage/[0.18] text-sage-deep underline decoration-sage decoration-[1.5px] underline-offset-[3px]"
                  >
                    {token.text}
                  </span>
                );
              }
              return (
                <span
                  key={index}
                  className="rounded-[2px] bg-notice/[0.14] text-notice-deep line-through decoration-notice decoration-[1.5px]"
                >
                  {token.text}
                </span>
              );
            })}
          </p>
        </section>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="primary"
          icon={<IconCheck size={13} />}
          onClick={() =>
            dispatch({ type: 'set-proposal-status', findingId: finding.id, status: 'accepted' })
          }
          disabled={proposal.status === 'accepted'}
        >
          Accept into draft revision plan
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<IconClose size={13} />}
          onClick={() =>
            dispatch({ type: 'set-proposal-status', findingId: finding.id, status: 'discarded' })
          }
          disabled={proposal.status === 'discarded'}
        >
          Discard
        </Button>
        <span className="meta ml-1">The original PDF is never modified.</span>
      </div>

      <div className="mt-5 rounded-lg border border-ink-border bg-paper-raised/50">
        <Disclosure label="Why this revision is suggested" defaultOpen>
          <p className="pt-1 text-sm leading-6 text-ink-muted">{proposal.rationale}</p>
          <p className="meta mt-2 leading-4">
            Prepared sample proposal · a suggestion for a human to accept, edit or discard
          </p>
        </Disclosure>

        <Disclosure label="Supporting evidence context">
          <div className="space-y-2 pt-1">
            {publication ? (
              <p className="text-xs leading-5 text-ink-muted">
                <span className="text-ink">{publication.label}</span> —{' '}
                {String(publication.properties['journal'] ?? '')}{' '}
                {String(publication.properties['year'] ?? '')}
                {publication.properties['doi'] ? (
                  <span className="meta ml-1">DOI {String(publication.properties['doi'])}</span>
                ) : null}
              </p>
            ) : null}
            {notice ? (
              <p className="text-xs leading-5 text-ink-muted">
                <span className="text-ink">{String(notice.properties['noticeType'] ?? 'notice')}</span>{' '}
                announced {String(notice.properties['publishedDate'] ?? 'not recorded')} · verified
              </p>
            ) : null}
            <ul className="space-y-1">
              {edges.map((edge) => (
                <li key={edge.id} className="text-2xs text-ink-soft">
                  {edge.type} · {edge.provenanceKind} · {edge.sourcePointer}
                </li>
              ))}
            </ul>
          </div>
        </Disclosure>
      </div>

      <p className="mt-4 flex items-start gap-2 text-2xs leading-4 text-ink-soft">
        <IconLayers size={12} className="mt-[2px] shrink-0" />
        A suggested revision records what a person might change and why. Accepting it adds it to a
        draft plan for you to apply in your own manuscript — it does not make the wording correct.
      </p>
    </div>
  );
}
