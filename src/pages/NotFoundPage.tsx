import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="mx-auto max-w-2xl rounded-lg border border-ink-border bg-paper-raised p-8">
      <h1 className="font-display text-3xl text-ink">Page not found</h1>
      <p className="mt-2 text-ink-muted">
        That address doesn’t exist in this app. The sidebar can take you where
        you meant to go — or return to the{' '}
        <Link to="/" className="text-brand-deep underline">
          import landing
        </Link>
        . This is a plain 404; no content was invented for it.
      </p>
    </section>
  );
}
