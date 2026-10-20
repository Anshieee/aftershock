import { useMemo } from 'react';
import { manuscript, anchorSpecs, type ManuscriptBlock } from '../fixtures/manuscriptContent';
import type { Finding } from '../fixtures';
import { findingTone } from '../lib/findings';

const TONE_CLASS: Record<string, string> = {
  notice: 'bg-notice/[0.14] text-ink underline decoration-notice decoration-1.5 underline-offset-[3px]',
  amber: 'bg-amber/[0.16] text-ink underline decoration-amber decoration-1.5 underline-offset-[3px]',
  uncertain:
    'bg-uncertain/[0.14] text-ink underline decoration-uncertain decoration-1.5 underline-offset-[3px]',
  sage: 'bg-sage/[0.16] text-ink underline decoration-sage decoration-1.5 underline-offset-[3px]',
  brand: 'bg-brand/[0.13] text-ink underline decoration-brand decoration-1.5 underline-offset-[3px]',
};

/**
 * The reflowed reading mode.
 *
 * It shows the same manuscript content as the PDF, typeset for the screen.
 * Marked passages are highlighted in place and remain clickable, so the two
 * modes stay in step.
 */
export function ReflowReader({
  findings,
  selectedId,
  onSelect,
}: {
  findings: Finding[];
  selectedId: string | null;
  onSelect: (findingId: string) => void;
}) {
  const marks = useMemo(() => {
    const map = new Map<string, { finding: Finding; tone: string }>();
    for (const finding of findings) {
      if (!finding.anchorId) continue;
      const anchor = anchorSpecs.find((a) => a.id === finding.anchorId);
      if (!anchor) continue;
      map.set(anchor.phrase, { finding, tone: findingTone(finding) });
    }
    return map;
  }, [findings]);

  const renderParagraph = (text: string) => {
    const phrases = [...marks.keys()].filter((phrase) => text.includes(phrase));
    if (phrases.length === 0) return text;
    // Longest phrase first so nested matches do not fragment the text.
    phrases.sort((a, b) => b.length - a.length);
    type Part = string | { phrase: string; finding: Finding; tone: string };
    const parts: Part[] = [text];
    for (const phrase of phrases) {
      const mark = marks.get(phrase);
      if (!mark) continue;
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        if (typeof part !== 'string' || !part.includes(phrase)) continue;
        const [before = '', after = ''] = part.split(phrase);
        parts.splice(i, 1, before, { phrase, finding: mark.finding, tone: mark.tone }, after);
        i += 2;
      }
    }
    return parts.map((part, index) =>
      typeof part === 'string' ? (
        <span key={index}>{part}</span>
      ) : part === undefined ? null : (
        <button
          key={index}
          type="button"
          onClick={() => onSelect(part.finding.id)}
          className={`rounded-[2px] px-[1px] text-left transition-colors duration-150 ${
            TONE_CLASS[part.tone] ?? ''
          } ${
            part.finding.id === selectedId
              ? 'bg-brand/20 ring-1 ring-brand/50'
              : 'hover:brightness-[0.97]'
          }`}
          aria-current={part.finding.id === selectedId ? 'true' : undefined}
          title={part.finding.title}
        >
          {part.phrase}
        </button>
      ),
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-paper">
      <article className="mx-auto w-full max-w-[680px] px-6 pb-24 pt-10 sm:px-10">
        <header className="border-b border-ink-border pb-6">
          <p className="eyebrow text-notice">Sample manuscript — fictional</p>
          <h1 className="mt-3 text-balance font-display text-[1.75rem] font-semibold leading-[1.18] tracking-[-0.02em] text-ink">
            {manuscript.title}
          </h1>
          <p className="mt-3 font-display text-sm italic leading-6 text-ink-muted">
            {manuscript.authors}
          </p>
          <p className="meta mt-2">{manuscript.affiliation}</p>
          <p className="meta mt-1">{manuscript.journalLine}</p>
        </header>

        {manuscript.sections.map((section) => (
          <section key={section.id} className="mt-8">
            {section.heading ? (
              <h2 className="mb-3 font-display text-lg font-semibold text-ink">{section.heading}</h2>
            ) : null}
            {section.blocks.map((block, index) => (
              <BlockView
                key={`${section.id}-${index}`}
                block={block}
                renderParagraph={renderParagraph}
              />
            ))}
          </section>
        ))}

        <footer className="mt-12 border-t border-ink-border pt-5">
          <p className="text-2xs leading-4 text-ink-soft">
            This manuscript, its authors, its journal and its results are fictional. It exists so
            the prototype can demonstrate real PDF reading and real annotation geometry. The
            publication it cites as evidence, and that publication’s retraction notice, are real
            records.
          </p>
        </footer>
      </article>
    </div>
  );
}

function BlockView({
  block,
  renderParagraph,
}: {
  block: ManuscriptBlock;
  renderParagraph: (text: string) => React.ReactNode;
}) {
  switch (block.kind) {
    case 'h2':
      return (
        <h3 className="mb-2 mt-6 font-display text-[1.0625rem] font-semibold text-ink">
          {block.text}
        </h3>
      );
    case 'h3':
      return (
        <h4 className="mb-2 mt-5 font-display text-[0.9375rem] font-semibold italic text-ink">
          {block.text}
        </h4>
      );
    case 'p':
      return <p className="mb-4">{renderParagraph(block.text)}</p>;
    case 'figure':
      return (
        <figure className="my-6">
          <div className="rounded-md border border-ink-border bg-paper-deep/40 px-4 py-5">
            <p className="text-center font-display text-sm italic text-ink-muted">{block.label}</p>
            <div className="mt-3 flex h-24 items-end gap-6 px-6">
              {block.series.map((series, index) => (
                <div key={index} className="flex-1">
                  <div className="relative h-16">
                    <svg viewBox="0 0 100 40" className="h-full w-full" preserveAspectRatio="none">
                      <polyline
                        points={series
                          .map((value, i) => `${(i / (series.length - 1)) * 100},${40 - (value / 180) * 40}`)
                          .join(' ')}
                        fill="none"
                        stroke={index === 0 ? 'var(--c-brand)' : 'var(--c-amber)'}
                        strokeWidth="1.4"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  </div>
                  <p className="meta mt-1 text-center">{index === 0 ? 'gated' : 'ungated'}</p>
                </div>
              ))}
            </div>
          </div>
          <figcaption className="mt-2 text-xs leading-5 text-ink-muted">{block.caption}</figcaption>
        </figure>
      );
    case 'table':
      return (
        <figure className="my-6">
          <figcaption className="mb-2 text-xs leading-5 text-ink-muted">{block.caption}</figcaption>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-ink-border">
                  {block.columns.map((column) => (
                    <th key={column} className="py-1.5 pr-4 font-semibold text-ink">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, index) => (
                  <tr key={index} className="border-b border-ink-border/60">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="py-1.5 pr-4 text-ink-muted">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      );
    case 'references':
      return (
        <ol className="mt-4 space-y-2">
          {block.items.map((item) => (
            <li key={item.label} className="flex gap-2 text-[0.8125rem] leading-6 text-ink-muted">
              <span className="shrink-0 text-ink-soft">{item.label}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ol>
      );
    default:
      return null;
  }
}
