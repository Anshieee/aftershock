import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from './LandingPage';

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('LandingPage (import-first)', () => {
  it('renders the primary document affordance and secondary DOI/bibliography affordances', () => {
    renderLanding();

    expect(screen.getByLabelText('Choose a document')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bibliography' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Single DOI' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Try guided example' })).toBeTruthy();
  });

  it('labels the guided example as available after graph seed', () => {
    renderLanding();
    expect(
      screen.getByText(/available after graph seed/i),
    ).toBeTruthy();
  });

  it('shows an honest not-wired-yet state after a file is chosen — no fake upload or analysis', () => {
    renderLanding();
    const input = screen.getByTestId('import-input') as HTMLInputElement;

    const file = new File(['%PDF-1.4 minimal'], 'field-notes.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 12345 });
    fireEvent.change(input, { target: { files: [file] } });

    const state = screen.getByTestId('selection-state');
    expect(state.textContent).toContain('field-notes.pdf');
    expect(state.textContent).toContain('Not wired yet — skeleton');
    expect(state.textContent).toContain('has not been uploaded anywhere');

    // Nothing pretends a pipeline exists.
    expect(screen.queryByText(/uploading/i)).toBeNull();
    expect(screen.queryByText(/analysis complete/i)).toBeNull();
    expect(screen.queryByText(/parsed/i)).toBeNull();
  });

  it('does not show results for the guided example — only an honest disclosure', () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: /why isn’t it available/i }));
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('M2');
    expect(note.textContent).not.toMatch(/retraction identified|1 affected claim|damage report/);
  });
});
