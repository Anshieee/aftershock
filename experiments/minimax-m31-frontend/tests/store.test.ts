import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_SECTIONS,
  initialState,
  reducer,
  type AppState,
} from '../src/state/store';

function baseState(): AppState {
  return { ...initialState };
}

describe('prototype state', () => {
  it('records a review decision against the finding', () => {
    const state = reducer(baseState(), {
      type: 'record-review',
      findingId: 'finding-direct-support',
      outcome: 'revision_needed',
      note: 'The sentence needs to name the retraction.',
    });
    const decision = state.reviewDecisions['finding-direct-support'];
    expect(decision).toBeDefined();
    expect(decision!.outcome).toBe('revision_needed');
    expect(decision!.note).toContain('retraction');
    expect(decision!.seeded).toBe(false);
  });

  it('replaces an earlier decision rather than keeping both', () => {
    let state = reducer(baseState(), {
      type: 'record-review',
      findingId: 'finding-direct-support',
      outcome: 'further_investigation',
      note: '',
    });
    state = reducer(state, {
      type: 'record-review',
      findingId: 'finding-direct-support',
      outcome: 'not_affected',
      note: 'Checked the passage.',
    });
    const decisionsForFinding = Object.values(state.reviewDecisions).filter(
      (decision) => decision.findingId === 'finding-direct-support',
    );
    expect(decisionsForFinding).toHaveLength(1);
    expect(state.reviewDecisions['finding-direct-support']!.outcome).toBe('not_affected');
  });

  it('moves a proposal between draft, accepted and discarded', () => {
    let state = reducer(baseState(), {
      type: 'set-proposal-status',
      findingId: 'finding-direct-support',
      status: 'accepted',
    });
    expect(state.proposals['finding-direct-support']!.status).toBe('accepted');
    state = reducer(state, {
      type: 'set-proposal-status',
      findingId: 'finding-direct-support',
      status: 'discarded',
    });
    expect(state.proposals['finding-direct-support']!.status).toBe('discarded');
  });

  it('reveals findings progressively and never twice', () => {
    let state = reducer(baseState(), { type: 'reveal-finding', findingId: 'finding-direct-support' });
    expect(state.revealedFindingIds).toEqual(['finding-direct-support']);
    state = reducer(state, { type: 'reveal-finding', findingId: 'finding-direct-support' });
    expect(state.revealedFindingIds).toHaveLength(1);
  });

  it('toggles report sections independently', () => {
    let state = reducer(baseState(), { type: 'toggle-report-section', section: 'revisions' });
    expect(state.reportSections['revisions']).toBe(
      !DEFAULT_REPORT_SECTIONS['revisions'],
    );
    state = reducer(state, { type: 'toggle-report-section', section: 'revisions' });
    expect(state.reportSections['revisions']).toBe(DEFAULT_REPORT_SECTIONS['revisions']);
  });

  it('switches document without carrying the previous selection', () => {
    let state = reducer(baseState(), { type: 'select-finding', findingId: 'finding-direct-support' });
    state = reducer(state, { type: 'set-document', documentId: 'doc-urban-heat' });
    expect(state.selectedFindingId).toBeNull();
    expect(state.activeDocumentId).toBe('doc-urban-heat');
  });

  it('resets the prototype back to its shipped state', () => {
    let state = reducer(baseState(), {
      type: 'record-review',
      findingId: 'finding-direct-support',
      outcome: 'not_affected',
      note: '',
    });
    state = reducer(state, { type: 'reset-prototype' });
    // The shipped state keeps only the prepared, seeded decision.
    expect(state.reviewDecisions['finding-direct-support']).toBeUndefined();
    expect(state.reviewDecisions['finding-historical-mention']?.seeded).toBe(true);
  });
});
