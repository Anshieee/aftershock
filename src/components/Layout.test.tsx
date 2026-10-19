import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';

/**
 * Pins the P0 sidebar decisions: the wordmark treatment (Aftershock. with
 * period), a compact honest scope marker instead of the long dev-facing
 * paragraph, the truthful API status behind a native disclosure rather than
 * in always-on text, and the unchanged information architecture (5 primary
 * areas + Knowledge Graph as the single secondary destination).
 */

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Layout />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Layout — header pinning', () => {
  it('renders the wordmark "Aftershock." (with period) in the wordmark treatment', () => {
    renderLayout();
    const mark = screen.getByRole('link', { name: 'Aftershock.' });
    expect(mark.className).toContain('wordmark');
    expect(mark.className).toContain('text-brand-deep');
  });

  it('keeps the short tagline and removes the long dev-facing paragraph', () => {
    renderLayout();
    expect(screen.getByText('Evidence integrity workspace')).toBeTruthy();
    // The long "Guided-demo build…" explanation is gone; a compact honest
    // marker replaces it.
    expect(screen.queryByText(/Areas marked/)).toBeNull();
    expect(screen.queryByText(/nothing here is simulated/)).toBeNull();
    expect(screen.getByText('Guided-demo build')).toBeTruthy();
  });

  it('moves the service status behind the "System diagnostics" disclosure — never a chip', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const { container } = renderLayout();
    expect(screen.queryByTestId('service-status')).toBeNull();
    // Exactly one status line, inside the sidebar header, behind the
    // native disclosure (keyword-reachable, no pointer-only interaction).
    const lines = screen.getAllByTestId('service-status-line');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.closest('header') ?? null).not.toBeNull();
    const details = container.querySelector('details[data-testid="sidebar-diagnostics"]');
    expect(details).not.toBeNull();
    expect(details?.textContent).toContain('System diagnostics');
    expect(lines[0]?.closest('details')).toBe(details);
    expect(container).toBeTruthy();
  });

  it('keeps the locked IA: five primary areas plus one Knowledge Graph destination', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.querySelectorAll('a')).toHaveLength(5);
    expect(screen.getAllByRole('link', { name: 'Knowledge Graph' }).length).toBeGreaterThan(0);
    // Evidence Reader / Export are never added as an area (e2e guard).
    expect(screen.queryByRole('link', { name: 'Evidence Reader' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Export' })).toBeNull();
  });

  it('keeps the skip link for keyboard users', () => {
    renderLayout();
    expect(screen.getByText('Skip to main content')).toBeTruthy();
  });
});
