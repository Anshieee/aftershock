import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip } from '../components/ui';
import { FindingStatusPill } from '../components/FindingStatusPill';
import { IconArrowRight } from '../components/Icons';
import { documents, findings as allFindings } from '../fixtures';
import { useStore } from '../state/store';

export default function InvestigationsPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useStore();

  const rows = useMemo(
    () =>
      documents.map((document) => {
        const scope = allFindings.filter((finding) => finding.documentId === document.id);
        const reviewed = scope.filter((finding) => state.reviewDecisions[finding.id]).length;
        return { document, total: scope.length, reviewed };
      }),
    [state.reviewDecisions],
  );

  const activeId = state.activeDocumentId;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1000px] px-6 py-9 lg:px-10">
        <header className="border-b border-ink-border pb-6">
          <p className="eyebrow">Investigations</p>
          <h1 className="mt-2 font-display text-[1.75rem] font-semibold leading-[1.16] tracking-[-0.022em] text-ink">
            Evidence tracing in progress
          </h1>
          <p className="mt-2 max-w-[62ch] text-sm leading-6 text-ink-muted">
            Each investigation holds a document, the findings prepared for it, and the review
            decisions recorded so far.
          </p>
        </header>

        <ul className="mt-2 divide-y divide-ink-border">
          {rows.map(({ document, total, reviewed }) => {
            const active = document.id === activeId;
            return (
              <li key={document.id}>
                <div
                  className={`group flex w-full items-center gap-4 py-4 transition-colors duration-150 ${
                    active ? 'bg-brand-soft/30' : 'hover:bg-ink/[0.025]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'set-document', documentId: document.id });
                      navigate(`/i/${document.id}/read`);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[0.9375rem] font-medium text-ink">
                        {document.title}
                      </span>
                      {active ? <Chip tone="brand">Open</Chip> : null}
                    </span>
                    <span className="meta mt-1 block">
                      imported {new Date(document.importedAt).toLocaleDateString()} · last activity{' '}
                      {new Date(document.lastActivityAt).toLocaleDateString()}
                    </span>
                  </button>

                  <FindingStatusPill status={document.status} />

                  <span className="hidden w-[132px] shrink-0 text-right text-2xs text-ink-soft sm:block">
                    {reviewed}/{total} reviewed
                  </span>

                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => {
                        dispatch({ type: 'set-document', documentId: document.id });
                        navigate(`/i/${document.id}/review`);
                      }}
                    >
                      Review
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        dispatch({ type: 'set-document', documentId: document.id });
                        navigate(`/i/${document.id}/report`);
                      }}
                    >
                      Report
                    </Button>
                  </span>

                  <IconArrowRight size={14} className="shrink-0 text-ink-soft" />
                </div>
              </li>
            );
          })}
        </ul>

        <p className="meta mt-8 border-t border-ink-border pt-5 leading-4">
          Investigations in this prototype are prepared records. There is no backend, no durable
          history, and no analysis of any uploaded manuscript.
        </p>
      </div>
    </div>
  );
}
