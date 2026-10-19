import { NavLink, Outlet } from 'react-router-dom';
import ServiceStatusLine from './ServiceStatusLine';

/**
 * Primary navigation — exactly the five areas from the brief: Home,
 * Investigations, Library, Review Queue, Activity. One additional VISIBLE
 * secondary destination below the divider: Knowledge Graph. Evidence
 * Reader / Export are never a sixth area.
 *
 * M7 note (IA rule applied to /reader): the Evidence Reader is a linked
 * destination, NOT a nav item — it is opened from the Investigations
 * demo-manuscript card, from Review Queue / Results links, and via
 * /reader#p-<nodeId> deep links. The sidebar markup below therefore
 * stays untouched (five primary areas + the Explore area, unchanged).
 *
 * Wave U1 (2026-10-19 redesign): Overview → Home pointing at '/'; the
 * active state is the calm lavender surface (brand.surface + brand.deep +
 * font-medium) with a paper.deep hover; on mobile the primary nav renders
 * as a horizontally scrollable row (no JS, no burger) with the Explore nav
 * directly below it, so the full IA stays visible to tests and users.
 * The standalone "Guided-demo build" status line moved inside the
 * diagnostics details (honesty preserved, prominence reduced).
 */
const primaryNav = [
  { to: '/', label: 'Home', end: true },
  { to: '/investigations', label: 'Investigations' },
  { to: '/library', label: 'Library' },
  { to: '/review-queue', label: 'Review Queue' },
  { to: '/activity', label: 'Activity' },
] as const;

const secondaryNav = [{ to: '/graph', label: 'Knowledge Graph' }] as const;

const linkBase =
  'block shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm no-underline ' +
  'motion-reduce:transition-none transition-colors md:whitespace-normal ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return (
    linkBase +
    (isActive
      ? ' bg-brand-surface text-brand-deep font-medium'
      : ' text-ink hover:bg-paper-deep')
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
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted md:mt-1.5 md:whitespace-nowrap">
            Evidence integrity workspace
          </p>
        </div>

        {/* < md: primary nav as ONE horizontally scrollable row (no JS,
            no burger — the IA stays visible to tests and users); the
            Explore nav sits directly below it as a second compact row.
            md+: both navs collapse back into the vertical sidebar column. */}
        <nav aria-label="Primary" className="px-2 pt-3 md:px-0 md:py-6">
          <p className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:block">
            Workspace
          </p>
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {primaryNav.map((item) => (
              <li key={item.to} className="shrink-0 md:w-full">
                <NavLink to={item.to} end={'end' in item ? item.end : false} className={navLinkClass}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Explore" className="border-t border-ink-border px-2 py-3 md:border-t-0 md:px-0 md:py-4">
          <p className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:block">
            Explore
          </p>
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {secondaryNav.map((item) => (
              <li key={item.to} className="shrink-0 md:w-full">
                <NavLink to={item.to} className={navLinkClass}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Sidebar tail: dev-facing diagnostics behind a native disclosure
            (keyboard-reachable, no pointer-only interaction). The honest
            "Guided-demo build" scope marker lives INSIDE the details as its
            first line — disclosed on request, not sprayed in the nav column. */}
        <div className="mt-1 flex flex-col gap-1.5 px-4 pb-4 md:mt-auto md:px-0 md:pb-1">
          <details data-testid="sidebar-diagnostics" className="group min-w-0">
            <summary className="-mx-2 flex cursor-pointer list-none select-none items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium tracking-wide text-ink-muted no-underline hover:text-ink [&::-webkit-details-marker]:hidden">
              System diagnostics
              <span aria-hidden="true" className="group-open:hidden">
                +
              </span>
              <span aria-hidden="true" className="hidden group-open:inline">
                –
              </span>
            </summary>
            <p className="mt-1 px-2 text-[11px] uppercase tracking-wide text-ink-muted">
              Guided-demo build
            </p>
            {/* Discreet truthful status: same honest health classification
                as the chip, demoted to quiet text diagnostics, revealed on
                request only. Never claims graph state — /health does not
                probe the graph backend. */}
            <ServiceStatusLine className="mt-1 text-[11px]" />
          </details>
        </div>
      </header>

      <main id="main-content" className="min-w-0 flex-1 px-4 py-8 md:px-10">
        <Outlet />
      </main>
    </div>
  );
}
