interface EmptyAreaProps {
  title: string;
  /** Honest, area-specific note — must not promise outcomes or fake data. */
  note: string;
}

/**
 * Honest empty state for areas not implemented in M1. Always "Feature
 * under construction" + a truthful scope note; no placeholder content
 * that could be mistaken for functionality.
 */
export default function EmptyArea({ title, note }: EmptyAreaProps) {
  return (
    <section
      aria-labelledby="empty-heading"
      className="rounded-lg border border-ink-border bg-paper-raised p-8 md:p-12"
    >
      <p className="mb-3 inline-flex items-center gap-2 rounded border border-uncertain-border bg-uncertain-surface px-2 py-0.5 text-xs font-medium text-uncertain-text">
        Feature under construction
      </p>
      <h1 id="empty-heading" className="font-display text-3xl text-ink">
        {title}
      </h1>
      <p className="mt-3 max-w-prose text-ink-muted">{note}</p>
    </section>
  );
}
