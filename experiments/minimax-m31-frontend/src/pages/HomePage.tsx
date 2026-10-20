import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentLauncher, type SelectedDocument } from '../components/DocumentLauncher';
import { Button } from '../components/ui';
import { RippleGlyph } from '../components/Wordmark';
import { IconArrowRight } from '../components/Icons';
import { documents } from '../fixtures';
import { useStore } from '../state/store';
import { FindingStatusPill } from '../components/FindingStatusPill';

export default function HomePage() {
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const [opening, setOpening] = useState(false);

  const openSample = () => {
    setOpening(true);
    dispatch({ type: 'set-document', documentId: 'doc-demo-manuscript' });
    window.setTimeout(() => {
      navigate('/i/doc-demo-manuscript/read');
      setOpening(false);
    }, 520);
  };

  const openUploaded = (selection: SelectedDocument) => {
    const url = URL.createObjectURL(selection.file);
    dispatch({ type: 'set-source', url, name: selection.name, isUpload: true });
    dispatch({ type: 'set-document', documentId: 'doc-demo-manuscript' });
    setOpening(true);
    window.setTimeout(() => {
      navigate('/i/doc-demo-manuscript/read');
      setOpening(false);
    }, 620);
  };

  const recent = documents.filter((doc) => doc.id !== 'doc-demo-manuscript').slice(0, 3);

  return (
    <div className="h-full overflow-y-auto">
      {/* ---- Masthead ------------------------------------------------ */}
      <header className="flex items-center justify-between border-b border-ink-border px-6 py-3 lg:px-10">
        <p className="eyebrow">Research integrity · document first</p>
        <p className="meta hidden sm:block">Prototype · prepared sample data</p>
      </header>

      <div className="mx-auto w-full max-w-[1120px] px-6 pb-20 pt-12 lg:px-10 lg:pt-16">
        {/* ---- Hero ---------------------------------------------------- */}
        <section className="relative">
          <RippleGlyph
            size={280}
            className="pointer-events-none absolute right-[-60px] top-4 hidden opacity-60 lg:block"
          />
          <div className="relative max-w-[640px]">
            <p className="eyebrow">Aftershock. — Trace the evidence</p>
            <h1 className="mt-4 text-balance font-display text-[2.6rem] font-semibold leading-[1.06] tracking-[-0.028em] text-ink sm:text-[3.25rem]">
              Read the paper.
              <br />
              Then read what happened
              <br />
              <span className="italic text-brand">to the evidence behind it.</span>
            </h1>
            <p className="mt-5 max-w-[54ch] text-[0.9375rem] leading-[1.7] text-ink-muted">
              Aftershock follows a claim back to the publications it leans on, and shows you where
              that support has changed since you cited it — a retraction notice, a correction, a
              reference that never resolved.
            </p>
          </div>
        </section>

        {/* ---- Launcher ------------------------------------------------ */}
        <section className="mt-9 max-w-[620px]">
          <DocumentLauncher
            onSelect={openUploaded}
            onGuidedExample={openSample}
            busy={opening}
          />
        </section>

        {/* ---- Rule ---------------------------------------------------- */}
        <div className="mt-14 h-px w-full bg-ink-border" />

        {/* ---- Bottom band --------------------------------------------- */}
        <section className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-base font-semibold text-ink">
                Recent investigations
              </h2>
              <button
                type="button"
                onClick={() => navigate('/library')}
                className="text-xs text-brand-deep underline decoration-brand-line underline-offset-4 transition-colors hover:text-brand"
              >
                See the library
              </button>
            </div>
            <p className="meta mt-1">Prepared sample records — nothing here is a personal history.</p>

            <ul className="mt-4 divide-y divide-ink-border border-y border-ink-border">
              {recent.map((document) => (
                <li key={document.id}>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'set-document', documentId: document.id });
                      navigate(`/i/${document.id}/evidence`);
                    }}
                    className="group flex w-full items-center gap-4 py-3 text-left transition-colors duration-150 hover:bg-ink/[0.03]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[0.9375rem] font-medium leading-5 text-ink line-clamp-2">
                        {document.title}
                      </span>
                      <span className="meta mt-1 block">
                        {document.authors} · {document.venue} · {document.year}
                      </span>
                    </span>
                    <FindingStatusPill status={document.status} />
                    <span className="hidden w-[92px] shrink-0 text-right text-2xs text-ink-soft sm:block">
                      {document.findingCount} finding{document.findingCount === 1 ? '' : 's'}
                    </span>
                    <IconArrowRight
                      size={14}
                      className="shrink-0 text-ink-soft transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <aside className="lg:border-l lg:border-ink-border lg:pl-8">
            <h2 className="font-display text-base font-semibold text-ink">About this preview</h2>
            <div className="mt-3 space-y-3.5">
              {[
                [
                  'Prepared, not computed',
                  'The findings, the graph and the report all come from a fixed sample dataset that ships with the prototype.',
                ],
                [
                  'Simulated progress',
                  'When a document opens, example findings are revealed on a timer so the interface can be evaluated. No analysis is performed.',
                ],
                [
                  'Nothing leaves the browser',
                  'A file you choose is opened locally for reading. It is not uploaded, analysed, or written to any graph.',
                ],
              ].map(([title, body]) => (
                <div key={title}>
                  <p className="text-[0.8125rem] font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-ink-muted">{body}</p>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <Button size="sm" variant="ghost" onClick={() => navigate('/activity')}>
                See the activity record
              </Button>
            </div>
          </aside>
        </section>

        {/* ---- Footer note --------------------------------------------- */}
        <p className="mt-14 max-w-[70ch] border-t border-ink-border pt-5 text-2xs leading-4 text-ink-soft">
          Aftershock reports evidence that needs a human decision. A flag never means a claim is
          false, and a recorded review never means a claim has been certified.
        </p>
      </div>
    </div>
  );
}
