import { useEffect, useRef, useState } from 'react';

type Status = 'checking' | 'online' | 'unavailable';

/**
 * Truthful service-status chip. Queries the real Netlify function and
 * reports exactly what it observed — never a derived or simulated state.
 * The only labels used are "online" and "unavailable" (plus an honest
 * transient "checking…"). No claim is made about the graph backend here:
 * the health endpoint in M1 does not probe FalkorDB.
 */
export default function ServiceStatusChip({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status>('checking');
  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    acRef.current = ac;
    fetch('/.netlify/functions/health', { signal: ac.signal, headers: { Accept: 'application/json' } })
      .then((res) => {
        if (res.ok) setStatus('online');
        else setStatus('unavailable');
      })
      .catch(() => setStatus('unavailable'));
    return () => ac.abort();
  }, []);

  const label =
    status === 'checking' ? 'API: checking…' : status === 'online' ? 'API: online' : 'API: unavailable';

  const tone =
    status === 'online'
      ? 'border-reviewed-default bg-reviewed-surface text-reviewed-text'
      : status === 'unavailable'
        ? 'border-notice-border bg-notice-surface text-notice-text'
        : 'border-ink-border bg-paper-deep text-ink-muted';

  return (
    <span
      data-testid="service-status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${tone} ${className ?? ''}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
