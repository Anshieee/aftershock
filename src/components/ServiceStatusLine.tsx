import { useServiceStatus, type ServiceStatus } from './ServiceStatusChip';

const LABELS: Record<ServiceStatus, string> = {
  checking: 'API: checking…',
  online: 'API: online',
  unavailable: 'API: unavailable',
};

/**
 * Quiet diagnostics line — the discreet home of the truthful service
 * status (bottom of the sidebar / end of the mobile header block). Same
 * honest semantics as the chip (JSON-vs-HTML classification, never a fake
 * online state), deliberately de-emphasized: plain text-xs in muted ink,
 * no border, no pill, no tone colors. It reports only the platform API —
 * the health endpoint does not probe the graph backend, so this line
 * never claims "graph" state.
 */
export default function ServiceStatusLine({ className }: { className?: string }) {
  const status = useServiceStatus();

  return (
    <p
      data-testid="service-status-line"
      aria-live="polite"
      className={`text-xs leading-5 text-ink-muted ${className ?? ''}`}
    >
      {LABELS[status]}
    </p>
  );
}
