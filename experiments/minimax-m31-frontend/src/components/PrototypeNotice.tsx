/**
 * The one-line public-preview disclosure.
 *
 * This build is published on a public URL so it can be shared and
 * evaluated. The notice is deliberately short and appears once per
 * context — it states the two things a reader of a shared screenshot must
 * not get wrong: the records are examples, and nothing here is connected
 * to a live analysis.
 */

export const PROTOTYPE_NOTICE =
  'Interactive prototype — example research data. Not connected to live analysis.';

export function PrototypeNotice({ className = '' }: { className?: string }) {
  return (
    <p className={`text-2xs leading-4 text-ink-soft ${className}`}>{PROTOTYPE_NOTICE}</p>
  );
}
