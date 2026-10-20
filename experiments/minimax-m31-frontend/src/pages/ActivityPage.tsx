import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip, Segmented } from '../components/ui';
import { activity, type ActivityEvent } from '../fixtures';
import { useStore } from '../state/store';

type KindFilter = 'all' | 'publication' | 'analysis' | 'human';

const KIND_LABEL: Record<string, string> = {
  publication_notice: 'Publication notice',
  indexing_record: 'Indexing record',
  analysis: 'Analysis activity',
  review: 'Human review',
  report: 'Report',
};

const DATE_KIND_COPY: Record<string, string> = {
  announcement: 'Announcement date',
  record: 'Indexing record date',
  system: 'System date',
  human: 'Human review date',
};

export default function ActivityPage() {
  const navigate = useNavigate();
  const { state } = useStore();
  const [filter, setFilter] = useState<KindFilter>('all');

  const events = useMemo(() => {
    const base = [...activity];
    // Prototype review decisions recorded in this session appear at the top.
    const local: ActivityEvent[] = Object.values(state.reviewDecisions)
      .filter((decision) => !decision.seeded)
      .map((decision) => ({
        id: decision.id,
        kind: 'review' as const,
        label: 'Review recorded in this session',
        detail: decision.note
          ? `“${decision.note}”`
          : 'A decision was recorded against a finding in this browser session.',
        dateKind: 'human' as const,
        timestamp: decision.decidedAt,
        synthetic: true,
      }));
    const all = [...local, ...base];
    if (filter === 'all') return all;
    if (filter === 'publication')
      return all.filter((event) => event.kind === 'publication_notice' || event.kind === 'indexing_record');
    if (filter === 'human') return all.filter((event) => event.kind === 'review');
    return all.filter((event) => event.kind === 'analysis' || event.kind === 'report');
  }, [filter, state.reviewDecisions]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const event of events) {
      const key = event.timestamp.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [events]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[860px] px-6 py-9 lg:px-10">
        <header className="border-b border-ink-border pb-6">
          <p className="eyebrow">Activity</p>
          <h1 className="mt-2 font-display text-[1.75rem] font-semibold leading-[1.16] tracking-[-0.022em] text-ink">
            What happened, and when
          </h1>
          <p className="mt-2 max-w-[64ch] text-sm leading-6 text-ink-muted">
            Dates are labelled by kind and never merged. A publication was announced on one day and
            recorded by the indexing systems on another; a review happened on a third.
          </p>
          <div className="mt-5">
            <Segmented
              label="Activity filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Everything' },
                { value: 'publication', label: 'Notices' },
                { value: 'analysis', label: 'Analysis' },
                { value: 'human', label: 'Human review' },
              ]}
            />
          </div>
        </header>

        <div className="mt-7 space-y-8">
          {grouped.map(([day, items]) => (
            <section key={day}>
              <h2 className="meta sticky top-0 bg-paper/90 py-1 backdrop-blur">{day}</h2>
              <ol className="mt-2 border-l border-ink-border pl-5">
                {items.map((event) => (
                  <li key={event.id} className="relative pb-5">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[26px] top-[7px] h-2 w-2 rounded-full border border-ink-border bg-paper-raised"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.8125rem] font-medium text-ink">{event.label}</span>
                      <Chip tone="neutral">{KIND_LABEL[event.kind] ?? event.kind}</Chip>
                      {event.synthetic ? <Chip tone="brand">Sample</Chip> : null}
                    </div>
                    <p className="mt-1 max-w-[68ch] text-xs leading-5 text-ink-muted">{event.detail}</p>
                    <p className="meta mt-1.5">
                      {new Date(event.timestamp).toLocaleString()} · {DATE_KIND_COPY[event.dateKind]}
                    </p>
                    {event.findingId ? (
                      <button
                        type="button"
                        onClick={() => navigate('/i/doc-demo-manuscript/evidence')}
                        className="mt-1 text-2xs text-brand-deep underline decoration-brand-line underline-offset-2 hover:text-brand"
                      >
                        Open the related finding
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <p className="meta mt-8 border-t border-ink-border pt-5 leading-4">
          Sample activity is clearly marked. No historical research event is invented, and no event
          here implies that the system discovered a notice on its own.
        </p>
      </div>
    </div>
  );
}
