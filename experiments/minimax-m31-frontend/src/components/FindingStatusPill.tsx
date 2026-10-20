import type { DocumentStatus } from '../fixtures';

const STATUS_COPY: Record<DocumentStatus, { label: string; tone: 'notice' | 'amber' | 'sage' | 'uncertain' | 'brand' | 'neutral' }> = {
  example_investigation: { label: 'Example investigation', tone: 'brand' },
  analysis_complete: { label: 'Analysis complete', tone: 'sage' },
  awaiting_review: { label: 'Awaiting review', tone: 'amber' },
  imported: { label: 'Imported', tone: 'neutral' },
  not_started: { label: 'Not started', tone: 'neutral' },
};

export function FindingStatusPill({ status }: { status: DocumentStatus }) {
  const copy = STATUS_COPY[status] ?? { label: status, tone: 'neutral' as const };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-[2px] text-2xs font-medium ${
        copy.tone === 'brand'
          ? 'border-brand-line bg-brand-soft text-brand-deep'
          : copy.tone === 'sage'
            ? 'border-sage-line bg-sage-surface text-sage-deep'
            : copy.tone === 'amber'
              ? 'border-amber-line bg-amber-surface text-amber-deep'
              : copy.tone === 'notice'
                ? 'border-notice-line bg-notice-surface text-notice-deep'
                : 'border-ink-border bg-ink/[0.04] text-ink-muted'
      }`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {copy.label}
    </span>
  );
}
