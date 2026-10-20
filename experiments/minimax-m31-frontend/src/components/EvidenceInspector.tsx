import { useMemo, useState } from 'react';
import {
  Chip,
  Button,
  Disclosure,
  MetaRow,
  TextArea,
  type ChipTone,
} from './ui';
import {
  IconChevronRight,
  IconExternal,
  IconGraph,
  IconLayers,
  IconReview,
} from './Icons';
import { ForceGraph } from './ForceGraph';
import { useStore } from '../state/store';
import type { Finding, ReviewOutcome } from '../fixtures';
import {
  STATUS_TONE,
  findingEdges,
  findingKindLabel,
  findingNotice,
  findingNodes,
  findingPublication,
  findingStatus,
  findingTone,
  outcomeHint,
  outcomeLabel,
  relationSummary,
  statusLabel,
} from '../lib/findings';

/* ------------------------------------------------------------------ *
 * Findings overview — compact, collapsible, always in reach
 * ------------------------------------------------------------------ */

const TONE_TEXT: Record<ChipTone, string> = {
  notice: 'text-notice',
  amber: 'text-amber',
  sage: 'text-sage',
  uncertain: 'text-uncertain',
  brand: 'text-brand',
  neutral: 'text-ink-muted',
};

export function FindingsList({
  findings,
  selectedId,
  onSelect,
  compact = false,
}: {
  findings: Finding[];
  selectedId: string | null;
  onSelect: (findingId: string) => void;
  compact?: boolean;
}) {
  const { state } = useStore();
  const [collapsed, setCollapsed] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const finding of findings) {
      map.set(finding.kind, (map.get(finding.kind) ?? 0) + 1);
    }
    return map;
  }, [findings]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 text-left"
        >
          <span
            aria-hidden="true"
            className={`text-[11px] text-ink-soft transition-transform duration-200 ease-swift ${
              collapsed ? '' : 'rotate-90'
            }`}
          >
            ›
          </span>
          <span className="font-display text-[0.9375rem] font-semibold text-ink">Findings</span>
          <span className="rounded-full border border-ink-border bg-paper-deep px-1.5 text-2xs font-medium text-ink-muted">
            {findings.length}
          </span>
        </button>
      </div>

      {!collapsed ? (
        <>
          <ul className="mt-2.5 space-y-px">
            {findings.map((finding) => {
              const tone = findingTone(finding);
              const status = findingStatus(state, finding);
              const active = finding.id === selectedId;
              return (
                <li key={finding.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(finding.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`group flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-150 ${
                      active ? 'bg-brand-soft/70' : 'hover:bg-ink/[0.04]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full ${TONE_TEXT[tone]}`}
                      style={{ background: 'currentColor' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[0.8125rem] font-medium text-ink">
                          {finding.title}
                        </span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-soft">
                        <span>{findingKindLabel(finding)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{finding.locationLabel}</span>
                        {status !== 'awaiting_review' ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-sage">{statusLabel(status)}</span>
                          </>
                        ) : null}
                      </span>
                    </span>
                    <IconChevronRight
                      size={13}
                      className={`mt-1 shrink-0 text-ink-soft transition-transform duration-150 ${
                        active ? 'translate-x-0.5 text-brand' : 'opacity-0 group-hover:opacity-70'
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          {findings.length > 0 && counts.size > 1 && !compact ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-ink-border pt-3">
              {[...counts.entries()].map(([kind, count]) => (
                <div key={kind} className="flex items-baseline gap-1.5">
                  <dt className="text-2xs text-ink-soft">{findingKindLabel({ kind } as Finding)}</dt>
                  <dd className="text-2xs font-medium tabular-nums text-ink">{count}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Contextual evidence inspector
 * ------------------------------------------------------------------ */

export function EvidenceInspector({
  finding,
  findings = [],
  selectedId = null,
  onSelectFinding,
  onOpenGraph,
  onExploreRevisions,
  onBack,
}: {
  finding: Finding | null;
  findings?: Finding[];
  selectedId?: string | null;
  onSelectFinding?: (findingId: string) => void;
  onOpenGraph: (findingId: string) => void;
  onExploreRevisions: (findingId: string) => void;
  onBack?: () => void;
}) {
  const { state, dispatch } = useStore();
  const [note, setNote] = useState('');

  if (!finding) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-ink-border px-5 pb-4 pt-4">
          <p className="eyebrow">Evidence</p>
          <h2 className="mt-2 font-display text-lg font-semibold leading-6 text-ink">
            What needs a human look
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-ink-muted">
            Choose a marked passage in the manuscript, or a finding below. Each one opens in plain
            language first.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <FindingsList
            findings={findings}
            selectedId={selectedId}
            onSelect={(id) => onSelectFinding?.(id)}
          />
        </div>
      </div>
    );
  }

  const tone = findingTone(finding);
  const status = findingStatus(state, finding);
  const decision = state.reviewDecisions[finding.id];
  const proposal = state.proposals[finding.id];
  const publication = findingPublication(finding);
  const notice = findingNotice(finding);
  const nodes = findingNodes(finding);
  const relations = relationSummary(finding);
  const graphEdges = findingEdges(finding);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-ink-border px-5 pb-4 pt-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 -ml-1 inline-flex items-center gap-1 text-2xs font-medium text-ink-muted transition-colors hover:text-ink"
          >
            ← All findings
          </button>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={tone} dot>
            {findingKindLabel(finding)}
          </Chip>
          <Chip tone={STATUS_TONE[status]}>{statusLabel(status)}</Chip>
        </div>
        <h2 className="mt-2.5 font-display text-[1.0625rem] font-semibold leading-6 text-ink">
          {finding.title}
        </h2>
        <p className="meta mt-1.5">{finding.locationLabel}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        {/* ---- Level 1: plain language ------------------------------ */}
        <p className="mt-4 font-display text-[0.9375rem] leading-[1.62] text-ink">
          {finding.plainExplanation}
        </p>

        <div className="mt-3 flex items-start gap-2 rounded-md border border-ink-border bg-paper-deep/50 px-3 py-2.5">
          <span className="mt-[3px] shrink-0 text-ink-soft">
            <IconReview size={14} />
          </span>
          <p className="text-xs leading-5 text-ink-muted">{finding.actionHint}</p>
        </div>

        {/* ---- Actions ------------------------------------------------ */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            icon={<IconGraph size={13} />}
            onClick={() => onOpenGraph(finding.id)}
          >
            Open in graph
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<IconLayers size={13} />}
            onClick={() => onExploreRevisions(finding.id)}
            disabled={!proposal}
            title={proposal ? undefined : 'No revision proposal exists for this finding'}
          >
            Explore revisions
          </Button>
        </div>

        {/* ---- Level 2: the evidence relationship --------------------- */}
        <Disclosure label="The evidence relationship" tone="brand">
          <div className="space-y-3 pt-1">
            {publication ? (
              <div>
                <p className="eyebrow">Source publication</p>
                <p className="mt-1 text-sm leading-5 text-ink">{publication.label}</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  {String(publication.properties['authors'] ?? '')}
                  {publication.properties['journal'] ? ` · ${String(publication.properties['journal'])}` : ''}
                  {publication.properties['year'] ? ` · ${String(publication.properties['year'])}` : ''}
                </p>
                {publication.properties['doi'] ? (
                  <p className="meta mt-1 break-all">
                    DOI {String(publication.properties['doi'])}
                  </p>
                ) : null}
                <p className="mt-1.5 text-2xs text-ink-soft">
                  {publication.isSynthetic
                    ? 'Synthetic sample record — invented for this prototype.'
                    : 'Real publication record.'}
                </p>
              </div>
            ) : null}

            {notice ? (
              <div className="rounded-md border border-notice-line bg-notice-surface/60 px-3 py-2.5">
                <p className="eyebrow text-notice-deep">
                  {String(notice.properties['noticeType'] ?? 'status notice')}
                </p>
                <p className="mt-1 text-sm leading-5 text-ink">
                  Announced {String(notice.properties['publishedDate'] ?? 'not recorded')}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-ink-muted">
                  Recorded by the indexing systems{' '}
                  {String(notice.properties['noticeRecordedDate'] ?? 'not recorded')} · verified
                </p>
              </div>
            ) : null}

            <div>
              <p className="eyebrow">How this passage relates</p>
              <ul className="mt-1.5 space-y-1">
                {relations.map((relation) => (
                  <li key={relation.edge.id} className="text-xs leading-5 text-ink-muted">
                    <span className="text-ink">{relation.relation}</span>
                    <span className="text-ink-soft"> · {relation.provenance}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="eyebrow">What is still uncertain</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                A flag means a person should look at this. It does not mean the claim is wrong, and
                a person has not yet verified it.
              </p>
            </div>
          </div>
        </Disclosure>

        {/* ---- Level 3: provenance ----------------------------------- */}
        <Disclosure label="Provenance and records">
          <div className="pt-1">
            <dl className="divide-y divide-ink-border">
              {relations.map((relation) => (
                <MetaRow key={relation.edge.id} label={relation.relation}>
                  <span className="block text-ink">{relation.provenance}</span>
                  <span className="mt-0.5 block break-all text-ink-soft">{relation.source}</span>
                  <span className="meta mt-0.5 block">
                    analysis {relation.analysisVersion} · {relation.reviewState}
                  </span>
                </MetaRow>
              ))}
            </dl>

            <div className="mt-3">
              <p className="eyebrow">Records in this finding</p>
              <ul className="mt-1.5 space-y-1">
                {nodes.map((node) => (
                  <li key={node.id} className="flex items-baseline gap-2 text-xs text-ink-muted">
                    <span className="font-mono text-2xs text-ink-soft">{node.id}</span>
                    <span className="text-ink">{node.label}</span>
                    <span className="text-2xs text-ink-soft">{node.kind}</span>
                    {node.isSynthetic ? (
                      <span className="text-2xs uppercase tracking-wide text-brand">synthetic</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <p className="meta mt-3 leading-4">
              Prepared sample data · findings are not the result of analysing this document
            </p>
          </div>
        </Disclosure>

        {/* ---- Compact graph ----------------------------------------- */}
        <Disclosure label="Evidence graph" hint={`${nodes.length} records`}>
          <div className="mt-1 overflow-hidden rounded-md border border-ink-border bg-paper-deep/40">
            <ForceGraph
              nodes={nodes}
              edges={graphEdges}
              width={340}
              height={230}
              selectedId={finding.nodeIds[0] ?? null}
              onSelect={() => onOpenGraph(finding.id)}
              compact
              className="h-[230px]"
            />
          </div>
          <p className="mt-2 text-2xs leading-4 text-ink-soft">
            Every record in this finding is already shown. Selecting a node inspects it — it never
            reveals further relationships.
          </p>
        </Disclosure>

        {/* ---- Human review ------------------------------------------ */}
        <div className="mt-5 border-t border-ink-border pt-4">
          <p className="eyebrow">Human review</p>
          {decision ? (
            <div className="mt-2 rounded-md border border-sage-line bg-sage-surface/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-sage-deep">{outcomeLabel(decision.outcome)}</span>
                <span className="meta ml-auto">{decision.reviewer}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-muted">{outcomeHint(decision.outcome)}</p>
              {decision.note ? (
                <p className="mt-1.5 border-l-2 border-sage-line pl-2 text-xs italic leading-5 text-ink-muted">
                  “{decision.note}”
                </p>
              ) : null}
              <p className="meta mt-1.5">
                recorded {new Date(decision.decidedAt).toLocaleString()} · this is a workflow state,
                not a scientific verdict
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-xs leading-5 text-ink-muted">
              No decision recorded yet. Recording one documents what you decided — it does not
              certify the claim.
            </p>
          )}

          <div className="mt-3 space-y-1.5">
            <TextArea
              value={note}
              onChange={setNote}
              rows={2}
              placeholder="Optional note for the review record…"
              label="Reviewer note"
            />
            <div className="flex flex-wrap gap-1.5">
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
                  variant={decision?.outcome === outcome ? 'primary' : 'secondary'}
                  onClick={() =>
                    dispatch({
                      type: 'record-review',
                      findingId: finding.id,
                      outcome,
                      note,
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
            {proposal ? (
              <p className="flex items-center gap-1.5 text-2xs text-ink-soft">
                <IconExternal size={11} />
                A revision proposal exists for this passage ({proposal.status}).
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
