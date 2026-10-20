import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Chip, EmptyState, Segmented } from '../components/ui';
import { EvidenceInspector, FindingsList } from '../components/EvidenceInspector';
import { RevisionCompare } from '../components/RevisionCompare';
import { IconArrowLeft, IconLayers } from '../components/Icons';
import { useStore } from '../state/store';
import { documentById, findings as allFindings } from '../fixtures';
import { findingStatus, findingTone, statusLabel } from '../lib/findings';

export default function EvidencePage() {
  const { documentId = 'doc-demo-manuscript' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();
  const [view, setView] = useState<'findings' | 'revision'>('findings');

  const document = documentById.get(documentId);
  const documentFindings = useMemo(
    () => allFindings.filter((f) => f.documentId === documentId),
    [documentId],
  );
  const focusId = searchParams.get('focus');
  const selectedFinding =
    documentFindings.find((finding) => finding.id === (focusId ?? state.selectedFindingId)) ?? null;

  const proposal = selectedFinding ? state.proposals[selectedFinding.id] : undefined;

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-6 py-8 lg:px-10">
          <button
            type="button"
            onClick={() => navigate(`/i/${documentId}/read`)}
            className="inline-flex items-center gap-1.5 text-2xs font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <IconArrowLeft size={12} />
            Back to the reader
          </button>

          <header className="mt-5 border-b border-ink-border pb-6">
            <p className="eyebrow">Evidence</p>
            <h1 className="mt-2 font-display text-[1.75rem] font-semibold leading-[1.16] tracking-[-0.022em] text-ink">
              {document?.title ?? 'Document'}
            </h1>
            <p className="mt-2 max-w-[62ch] text-sm leading-6 text-ink-muted">
              Every passage in this manuscript whose evidence may need a human decision, with the
              reason in plain language first. The technical record is one click further in.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Chip tone="brand">{documentFindings.length} findings</Chip>
              <Chip tone="neutral">
                {documentFindings.filter((f) => findingStatus(state, f) !== 'awaiting_review').length}{' '}
                reviewed
              </Chip>
              {document?.isSample ? <Chip tone="neutral">Example investigation</Chip> : null}
            </div>
          </header>

          <div className="mt-6 flex items-center gap-3">
            <Segmented
              label="Evidence view"
              value={view}
              onChange={setView}
              options={[
                { value: 'findings', label: 'Findings' },
                { value: 'revision', label: 'Revisions' },
              ]}
            />
            {selectedFinding ? (
              <p className="meta truncate">
                Selected: {selectedFinding.title}
              </p>
            ) : null}
          </div>

          {view === 'findings' ? (
            <div className="mt-5">
              {documentFindings.length === 0 ? (
                <EmptyState title="No prepared findings for this record">
                  This investigation has no prepared sample findings. The reader, graph and report
                  views remain available.
                </EmptyState>
              ) : (
                <div className="rounded-lg border border-ink-border bg-paper-raised/50">
                  <div className="border-b border-ink-border px-4 py-3">
                    <FindingsList
                      findings={documentFindings}
                      selectedId={selectedFinding?.id ?? null}
                      onSelect={(findingId) => {
                        dispatch({ type: 'select-finding', findingId });
                        setSearchParams({ focus: findingId });
                      }}
                    />
                  </div>

                  <ul className="divide-y divide-ink-border">
                    {documentFindings.map((finding) => {
                      const tone = findingTone(finding);
                      const status = findingStatus(state, finding);
                      const active = finding.id === selectedFinding?.id;
                      return (
                        <li key={finding.id}>
                          <button
                            type="button"
                            onClick={() => {
                              dispatch({ type: 'select-finding', findingId: finding.id });
                              setSearchParams({ focus: finding.id });
                            }}
                            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 ${
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
                              <span className="block font-display text-[0.9375rem] font-medium text-ink">
                                {finding.title}
                              </span>
                              <span className="mt-1 block max-w-[68ch] text-xs leading-5 text-ink-muted">
                                {finding.plainExplanation}
                              </span>
                              <span className="meta mt-1.5 block">
                                {finding.locationLabel} · {statusLabel(status)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5">
              {proposal && selectedFinding ? (
                <RevisionCompare finding={selectedFinding} proposal={proposal} />
              ) : (
                <EmptyState title="No revision selected" icon={<IconLayers size={20} />}>
                  Choose a finding with a prepared revision proposal to compare the original
                  passage with the suggested wording.
                </EmptyState>
              )}
            </div>
          )}
        </div>
      </div>

      <aside className="hidden w-[392px] shrink-0 border-l border-ink-border bg-paper-raised/40 xl:block">
        <div className="h-full overflow-hidden">
          <EvidenceInspector
            finding={selectedFinding}
            findings={documentFindings}
            selectedId={selectedFinding?.id ?? null}
            onSelectFinding={(findingId) => {
              dispatch({ type: 'select-finding', findingId });
              setSearchParams({ focus: findingId });
            }}
            onOpenGraph={() => navigate(`/i/${documentId}/graph`)}
            onExploreRevisions={() => setView('revision')}
          />
        </div>
      </aside>
    </div>
  );
}
