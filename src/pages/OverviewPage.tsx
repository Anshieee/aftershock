import { Link } from 'react-router-dom';
import ServiceStatusChip from '../components/ServiceStatusChip';

/**
 * Overview — M1 scope is intentionally thin and honest:
 * one attention card placing the user in this build, and the real
 * service-status chip from `/.netlify/functions/health`. No KPI cards,
 * no fabricated "recent changes" or continuation work (there is none yet).
 */
export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-ink">Overview</h1>
        <ServiceStatusChip />
      </div>

      <section
        aria-labelledby="overview-attention"
        className="mt-6 rounded-lg border border-ink-border bg-paper-raised p-6"
      >
        <h2 id="overview-attention" className="text-lg font-semibold text-ink">
          Getting started
        </h2>
        <p className="mt-2 max-w-prose text-ink-muted">
          Aftershock helps you see which claims in your manuscript rest on
          sources that have changed after publication — such as retraction or
          correction notices. Start by importing a document; the import flow
          itself is one of the features not implemented in this skeleton.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/"
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white no-underline hover:bg-brand-deep"
          >
            Import a document
          </Link>
          <Link
            to="/library"
            className="rounded border border-ink-border bg-paper px-4 py-2 text-sm text-ink no-underline hover:bg-paper-deep"
          >
            Open the Library
          </Link>
        </div>
      </section>

      <p className="mt-4 max-w-prose text-sm text-ink-muted">
        The status chip above queries the platform’s real{' '}
        <code className="rounded bg-paper-deep px-1">/health</code> endpoint.
        “API: online” only means the Netlify function answered correctly — the
        graph backend is not configured in this build, so no state here
        implies a connected data layer.
      </p>
    </div>
  );
}
