import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';

/**
 * Pins the header design decisions from the brand/UX wave and the PR #7
 * review follow-ups: the wordmark treatment (Aftershock. with period),
 * a de-emphasized status (quiet line in the sidebar — never a chip in the
 * header row), and the unchanged information architecture (5 primary areas
 * + Knowledge Graph as the single secondary destination).
 */

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Layout />
    </MemoryRouter>,
  );
}

describe('Layout — header pinning', () => {
  it('renders the wordmark "Aftershock." (with period) in the wordmark treatment', () => {
    renderLayout();
    const mark = screen.getByRole('link', { name: 'Aftershock.' });
    expect(mark.className).toContain('wordmark');
  });

  it('has NO prominent status chip in the header — status is the quiet sidebar line only', () => {
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
    // Exactly one status line, rendered in the sidebar (header element).
    const lines = screen.getAllByTestId('service-status-line');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.closest('header') ?? null).not.toBeNull();
    expect(container).toBeTruthy();
  });

  it('keeps the locked IA: five primary areas plus one Knowledge Graph destination', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.querySelectorAll('a')).toHaveLength(5);
    expect(screen.getAllByRole('link', { name: 'Knowledge Graph' }).length).toBeGreaterThan(0);
  });
});
