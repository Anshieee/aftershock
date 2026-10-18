import { NavLink, Outlet } from 'react-router-dom';
import ServiceStatusLine from './ServiceStatusLine';

/**
 * Primary navigation — exactly the five areas from the handoff §3.
 * One additional VISIBLE secondary destination below the divider:
 * Knowledge Graph. Evidence Reader / Export are never a sixth area.
 */
const primaryNav = [
  { to: '/overview', label: 'Overview' },
  { to: '/investigations', label: 'Investigations' },
  { to: '/library', label: 'Library' },
  { to: '/review-queue', label: 'Review Queue' },
  { to: '/activity', label: 'Activity' },
] as const;

const secondaryNav = [{ to: '/graph', label: 'Knowledge Graph' }] as const;

const linkBase =
  'block rounded-md px-3 py-2 text-sm no-underline motion-reduce:transition-none ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return (
    linkBase +
    (isActive
      ? ' bg-brand text-white font-medium'
      : ' text-ink hover:bg-brand-surface hover:text-brand-deep')
  );
}

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-raised focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        Skip to main content
      </a>

      <header className="shrink-0 border-b border-ink-border md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:border-b-0 md:border-r md:p-6">
        <div className="flex flex-col gap-1 p-4 md:block md:space-y-1 md:p-0">
          <NavLink
            to="/"
            className="wordmark text-[1.625rem] leading-none text-brand-deep no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Aftershock.
          </NavLink>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted md:mt-1">
            Evidence integrity workspace
          </p>
        </div>

        <nav aria-label="Primary" className="px-2 py-4 md:px-0 md:py-6">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Workspace
          </p>
          <ul className="space-y-1">
            {primaryNav.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={navLinkClass}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Explore" className="border-t border-ink-border px-2 py-4 md:px-0">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Explore
          </p>
          <ul className="space-y-1">
            {secondaryNav.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={navLinkClass}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-2 px-4 pb-4 md:mt-auto md:px-0 md:pb-0">
          <p className="hidden text-xs leading-5 text-ink-muted md:block">
            Guided-demo build. Areas marked “under construction” are not
            implemented yet — nothing here is simulated. Graph areas read the
            live demo API only.
          </p>
          {/* Discreet truthful status: same honest health classification as
              the chip, demoted to quiet text diagnostics. Never claims graph
              state — /health does not probe the graph backend. */}
          <ServiceStatusLine className="mt-2 text-[11px] md:mt-4 md:pb-0" />
        </div>
      </header>

      <main id="main-content" className="min-w-0 flex-1 px-4 py-8 md:px-10">
        <Outlet />
      </main>
    </div>
  );
}
