import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { documentById } from '../fixtures';
import { AftershockMark, Wordmark } from './Wordmark';
import {
  IconActivity,
  IconClose,
  IconGraph,
  IconHome,
  IconLayers,
  IconLibrary,
  IconList,
  IconMoon,
  IconPanel,
  IconPlus,
  IconReader,
  IconReport,
  IconReview,
  IconSun,
} from './Icons';
import { IconButton } from './ui';
import { PrototypeNotice } from './PrototypeNotice';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const WORKSPACE_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: <IconHome size={16} />, end: true },
  { to: '/library', label: 'Library', icon: <IconLibrary size={16} /> },
  { to: '/investigations', label: 'Investigations', icon: <IconList size={16} /> },
  { to: '/activity', label: 'Activity', icon: <IconActivity size={16} /> },
];

function navClass({ isActive }: { isActive: boolean }): string {
  return [
    'group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[0.8125rem] transition-colors duration-150 ease-swift',
    isActive
      ? 'bg-brand-soft/70 text-brand-deep font-medium'
      : 'text-ink-muted hover:bg-ink/[0.045] hover:text-ink',
  ].join(' ');
}

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink to={item.to} end={item.end} className={navClass} title={collapsed ? item.label : undefined}>
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-brand transition-opacity duration-150 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <span className="shrink-0 text-current">{item.icon}</span>
          <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { state, dispatch } = useStore();
  const { documentId } = useParams();
  const collapsed = state.sidebarCollapsed;
  const activeDocumentId = documentId ?? state.activeDocumentId;
  const document = documentById.get(activeDocumentId);
  const base = `/i/${activeDocumentId}`;

  const investigationItems: NavItem[] = [
    { to: `${base}/read`, label: 'Reader', icon: <IconReader size={16} /> },
    { to: `${base}/evidence`, label: 'Evidence', icon: <IconLayers size={16} /> },
    { to: `${base}/review`, label: 'Review', icon: <IconReview size={16} /> },
    { to: `${base}/graph`, label: 'Graph', icon: <IconGraph size={16} /> },
    { to: `${base}/report`, label: 'Reports', icon: <IconReport size={16} /> },
  ];

  return (
    <div className="flex h-full flex-col bg-paper-deep/55">
      <div
        className={`flex h-[52px] shrink-0 items-center border-b border-ink-border ${
          collapsed ? 'justify-center px-2' : 'justify-between px-3.5'
        }`}
      >
        {collapsed ? (
          <NavLink to="/" aria-label="Aftershock home">
            <AftershockMark size={24} />
          </NavLink>
        ) : (
          <NavLink to="/" className="min-w-0" onClick={onNavigate}>
            <Wordmark size="sm" />
          </NavLink>
        )}
        {onNavigate ? (
          <IconButton label="Close navigation" onClick={onNavigate} className="lg:hidden">
            <IconClose size={15} />
          </IconButton>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Primary">
        <NavLink
          to="/"
          onClick={onNavigate}
          title={collapsed ? 'New investigation' : undefined}
          className={`mb-2 flex items-center gap-2 rounded-md border border-ink-border bg-paper-raised text-ink-muted shadow-lift-1 transition-colors duration-150 hover:border-brand-line hover:text-brand-deep ${
            collapsed ? 'h-8 justify-center' : 'h-8 px-2.5'
          }`}
        >
          <IconPlus size={15} className="shrink-0" />
          <span className={collapsed ? 'sr-only' : 'truncate text-[0.8125rem] font-medium'}>
            New investigation
          </span>
        </NavLink>

        <ul className="space-y-0.5">
          {WORKSPACE_ITEMS.map((item) => (
            <li key={item.to}>
              <NavRow item={item} collapsed={collapsed} />
            </li>
          ))}
        </ul>

        {document ? (
          <div className="mt-6">
            {!collapsed ? (
              <p className="eyebrow mb-1.5 px-2.5">Investigation</p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-ink-border" />
            )}
            <p
              className={`mb-1.5 px-2.5 text-2xs leading-4 text-ink-soft ${
                collapsed ? 'sr-only' : 'line-clamp-2'
              }`}
            >
              {document.title}
            </p>
            <ul className="space-y-0.5">
              {investigationItems.map((item) => (
                <li key={item.to}>
                  <NavRow item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </nav>

      <div className="shrink-0 border-t border-ink-border px-2.5 py-2.5">
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'set-theme', theme: state.theme === 'dark' ? 'light' : 'dark' })
          }
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-xs text-ink-muted transition-colors duration-150 hover:bg-ink/[0.045] hover:text-ink ${
            collapsed ? 'justify-center' : ''
          }`}
          aria-label={state.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {state.theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
          <span className={collapsed ? 'sr-only' : ''}>
            {state.theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </span>
        </button>
        {!collapsed ? (
          <>
            <div className="mt-2 px-2.5">
              <PrototypeNotice />
              <p className="mt-1 text-[0.6875rem] leading-4 text-ink-soft">
                A file you choose is read in your browser only. It is never uploaded or analysed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'reset-prototype' });
                try {
                  window.localStorage.removeItem('aftershock.m31.state.v1');
                } catch {
                  /* storage unavailable */
                }
              }}
              className="mt-1.5 px-2.5 text-[0.6875rem] text-ink-soft underline decoration-ink-border underline-offset-2 transition-colors hover:text-ink"
            >
              Reset prototype state
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const collapsed = state.sidebarCollapsed;

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-ink-border transition-[width] duration-300 ease-settle lg:block print:hidden ${
          collapsed ? 'w-[56px]' : 'w-[252px]'
        }`}
      >
        <div className="relative h-full">
          <div className="h-full">
            <SidebarContent />
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'toggle-sidebar' })}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="absolute -right-[11px] top-[38px] z-20 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-ink-border bg-paper-raised text-ink-muted shadow-lift-1 transition-colors duration-150 hover:text-ink"
          >
            <IconPanel size={12} />
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 animate-fade-in bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 w-[268px] animate-fade-rise border-r border-ink-border bg-paper shadow-lift-3">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* Mobile bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-2 border-b border-ink-border bg-paper/95 px-3 backdrop-blur lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-ink/[0.05]"
        >
          <IconList size={17} />
        </button>
        <Wordmark size="sm" />
      </div>

      <main className="relative min-w-0 flex-1 overflow-hidden pt-12 lg:pt-0">{children}</main>
    </div>
  );
}
