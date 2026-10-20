import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvidenceInspector } from '../src/components/EvidenceInspector';
import { StoreProvider } from '../src/state/store';
import { findings } from '../src/fixtures';

function renderInspector(findingId: string | null) {
  const finding = findings.find((item) => item.id === findingId) ?? null;
  return render(
    <MemoryRouter>
      <StoreProvider>
        <EvidenceInspector
          finding={finding}
          findings={findings.filter((item) => item.documentId === 'doc-demo-manuscript')}
          selectedId={findingId}
          onSelectFinding={() => undefined}
          onOpenGraph={() => undefined}
          onExploreRevisions={() => undefined}
        />
      </StoreProvider>
    </MemoryRouter>,
  );
}

describe('evidence inspector', () => {
  it('opens with the findings overview when nothing is selected', () => {
    renderInspector(null);
    expect(screen.getByText('What needs a human look')).toBeTruthy();
    expect(screen.getByText('A supporting source was later retracted')).toBeTruthy();
  });

  it('leads with a plain-language explanation', () => {
    renderInspector('finding-direct-support');
    expect(
      screen.getByText(/This passage relies on a published registry analysis that was retracted/),
    ).toBeTruthy();
  });

  it('keeps the deeper levels collapsed until they are asked for', () => {
    renderInspector('finding-direct-support');
    // The relationship and provenance detail is available but not shown.
    expect(screen.queryByText('Source publication')).toBeNull();
    expect(
      screen.getByRole('button', { name: /The evidence relationship/i }),
    ).toBeTruthy();
  });

  it('offers the human-review decisions and says what they are not', () => {
    renderInspector('finding-direct-support');
    expect(screen.getByText('Further investigation')).toBeTruthy();
    expect(screen.getByText('Revision needed')).toBeTruthy();
    expect(screen.getByText('Not affected')).toBeTruthy();
    expect(screen.getByText('Evidence updated')).toBeTruthy();
    expect(
      screen.getByText(/Recording one documents what you decided — it does not certify the claim/),
    ).toBeTruthy();
  });

  it('distinguishes the unresolved reference from a compromised citation', () => {
    renderInspector('finding-unresolved-reference');
    expect(
      screen.getByText(/matches more than one candidate publication/),
    ).toBeTruthy();
    expect(screen.getByText('Unresolved reference')).toBeTruthy();
  });

  it('says plainly that a historical mention is not vulnerable support', () => {
    renderInspector('finding-historical-mention');
    expect(screen.getByText(/It is not offered as evidence for anything/)).toBeTruthy();
  });
});
