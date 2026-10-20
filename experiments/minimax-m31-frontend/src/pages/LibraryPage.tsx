import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, EmptyState } from '../components/ui';
import { FindingStatusPill } from '../components/FindingStatusPill';
import { IconArrowRight, IconDocument, IconSearch } from '../components/Icons';
import { documents, findings as allFindings } from '../fixtures';
import { useStore } from '../state/store';

export default function LibraryPage() {
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter(
      (document) =>
        document.title.toLowerCase().includes(needle) ||
        document.authors.toLowerCase().includes(needle) ||
        document.venue.toLowerCase().includes(needle),
    );
  }, [query]);

  const findingCount = (documentId: string) =>
    allFindings.filter((finding) => finding.documentId === documentId).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1000px] px-6 py-9 lg:px-10">
        <header className="border-b border-ink-border pb-6">
          <p className="eyebrow">Library</p>
          <h1 className="mt-2 font-display text-[1.75rem] font-semibold leading-[1.16] tracking-[-0.022em] text-ink">
            Research documents
          </h1>
          <p className="mt-2 max-w-[62ch] text-sm leading-6 text-ink-muted">
            Every document this prototype knows about. Records are prepared samples; the library is
            not a durable store.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex h-8 items-center gap-2 rounded-md border border-ink-border bg-paper-raised px-2.5">
              <IconSearch size={14} className="text-ink-soft" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title, author or venue…"
                aria-label="Search the library"
                className="w-[240px] bg-transparent text-xs text-ink outline-none placeholder:text-ink-soft"
              />
            </div>
            <Chip tone="neutral">{documents.length} records</Chip>
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="Nothing matches that search" icon={<IconDocument size={20} />}>
              Try a shorter phrase, or clear the search to see every prepared record.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-ink-border">
            {rows.map((document) => (
              <li key={document.id}>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'set-document', documentId: document.id });
                    navigate(`/i/${document.id}/evidence`);
                  }}
                  className="group flex w-full items-center gap-4 py-4 text-left transition-colors duration-150 hover:bg-ink/[0.025]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[0.9375rem] font-medium text-ink">
                        {document.title}
                      </span>
                      {document.isSample ? <Chip tone="brand">Sample</Chip> : null}
                    </span>
                    <span className="meta mt-1 block">
                      {document.authors} · {document.venue} · {document.year}
                    </span>
                    <span className="meta mt-0.5 block">
                      last activity {new Date(document.lastActivityAt).toLocaleDateString()}
                    </span>
                  </span>
                  <FindingStatusPill status={document.status} />
                  <span className="hidden w-[110px] shrink-0 text-right text-2xs text-ink-soft sm:block">
                    {findingCount(document.id)} finding
                    {findingCount(document.id) === 1 ? '' : 's'}
                    {document.reviewedCount > 0
                      ? ` · ${document.reviewedCount} reviewed`
                      : ''}
                  </span>
                  <IconArrowRight
                    size={14}
                    className="shrink-0 text-ink-soft transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 flex items-center gap-3 border-t border-ink-border pt-5">
          <Button variant="secondary" size="sm" onClick={() => navigate('/')}>
            Open a document
          </Button>
          <p className="text-2xs leading-4 text-ink-soft">
            A file you choose is read in your browser. It is never uploaded or analysed here.
          </p>
        </div>
      </div>
    </div>
  );
}
