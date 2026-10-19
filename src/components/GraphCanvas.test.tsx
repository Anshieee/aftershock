import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import GraphCanvas, { GraphRecordsList } from './GraphCanvas';
import type { GraphEdge, GraphNode } from '../lib/api';

function node(id: string, kind: string, title: string): GraphNode {
  return { id, kind, properties: { title } };
}

function edge(fromId: string, toId: string, type = 'CITATION_USE_SUPPORTS_CLAIM'): GraphEdge {
  return {
    id: `${fromId}->${toId}`,
    type,
    fromId,
    toId,
    provenanceKind: 'graphly-identified',
  };
}

describe('GraphCanvas node buttons (a11y)', () => {
  it('exposes no heading elements in the records list (axe heading-order)', () => {
    render(
      <GraphRecordsList
        nodes={[node('n1', 'Claim', 'First claim')]}
        edges={[edge('n1', 'n1')]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Records (1)').tagName).toBe('P');
    expect(screen.getByText('Connections (1)').tagName).toBe('P');
    expect(
      document.querySelector('[data-testid="graph-nodes-list"] h3, [data-testid="graph-edges-list"] h3'),
    ).toBeNull();
    // The text itself (checked by the page test and e2e) is untouched.
    expect(screen.getByText('Connections (1)').className).toContain('text-sm font-semibold text-ink');
  });

  it('names each SVG node button exactly as its visible label text (axe label-content-name-mismatch)', () => {
    render(
      <GraphCanvas
        nodes={[node('long-claim-id-0001', 'Claim', 'Registry analysis relates to mortality')]}
        edges={[]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    const svg = screen.getByRole('group', { name: /Layered graph layout/ });
    const buttons = within(svg).getAllByRole('button');
    expect(buttons.length).toBe(1);
    const button = buttons[0];
    if (!button) throw new Error('expected one SVG node button');

    // Name-from-attribute only: no implicit subtree naming to fight against.
    const name = button.getAttribute('aria-label');
    expect(name, 'aria-label is set explicitly').toBeTruthy();
    const accessibleName = name ?? '';

    // The accessible name must equal the label the SVG visible text rows
    // display (concatenated, without extra separators).
    const textRows = Array.from(button.querySelectorAll('text')).map((t) => t.textContent ?? '');
    expect(textRows.join('')).toBe(accessibleName);
  });

  it('selection still works for pointer and keyboard after the a11y changes', () => {
    const onSelect = vi.fn();
    render(
      <GraphCanvas
        nodes={[node('a', 'Claim', 'Alpha'), node('b', 'Claim', 'Beta')]}
        edges={[edge('a', 'b')]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    const svg = screen.getByRole('group', { name: /Layered graph layout/ });
    const buttonA = svg.querySelector('[data-testid="graph-node-a"]') as SVGElement;
    expect(buttonA.getAttribute('tabindex')).toBe('0');
    fireEvent.click(buttonA);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    // Keyboard: Enter still selects.
    const buttonB = svg.querySelector('[data-testid="graph-node-b"]') as SVGElement;
    buttonB.focus();
    fireEvent.keyDown(buttonB, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    fireEvent.keyDown(buttonB, { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });
});
