/**
 * Unit tests: reseed audit-survival contract (P4 integrity wave).
 *
 * Regression guard for the decision-history wipe bug: a recorded ReviewDecision
 * carried seeded:true, so the seeded-count idempotency accounting treated it as
 * fixture drift and the next guided-seed wiped the audit history. These tests
 * pin down the defenses:
 *
 *   1. Runtime audit writers stamp seeded:false (reviewState.mjs — asserted in
 *      review-state.unit.test.mjs).
 *   2. The reseed wipe itself can never delete ReviewDecision/RevisionProposal
 *      nodes, even a legacy/mis-stamped one (source contract on the wipe Cypher).
 *   3. After a wipe, relinkReviewDecisionEdges re-creates only missing
 *      HAS_REVIEW_DECISION links (idempotent batching, honest props).
 *
 * No DB, no credentials — a scripted fake session, same discipline as the
 * other unit suites.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REVIEW_DECISION_EDGE_TYPE } from '../../reviewState.mjs';
import { relinkReviewDecisionEdges } from '../../seed.mjs';

function buildFakeSession({ decisionsData = [], linkedData = [] } = {}) {
  /** @type {Array<{cypher: string, params: Record<string, unknown>, opts?: unknown}>} */
  const writes = [];
  /** @type {Array<{cypher: string, params: Record<string, unknown>}>} */
  const reads = [];

  const session = {
    graphName: 'fake-graph',
    async roQuery(cypher, params) {
      reads.push({ cypher, params });
      // Order of reads in relinkReviewDecisionEdges: decisions first, then
      // existing links.
      if (reads.length === 1) return { data: decisionsData };
      if (reads.length === 2) return { data: linkedData };
      return { data: [] };
    },
    async writeQuery(cypher, params, opts) {
      writes.push({ cypher, params, opts });
      return { data: [] };
    },
    async close() {},
  };
  return { session, writes, reads };
}

describe('reseed audit-survival contract', () => {
  it('the reseed wipe source can never target audit artifacts (string contract)', () => {
    const src = readFileSync(new URL('../../seed.mjs', import.meta.url), 'utf8');
    expect(src).toContain('AND NOT n:ReviewDecision AND NOT n:RevisionProposal');
    expect(src).toContain('relinkReviewDecisionEdges');
    // The legacy unguarded wipe signature must be gone from the source.
    expect(src).not.toContain("MATCH (n) WHERE n.seeded = $seeded DETACH DELETE n");
  });

  it('relinks only decision endpoints without a live edge (idempotent)', async () => {
    const { session, writes, reads } = buildFakeSession({
      decisionsData: [
        { id: 'dec-1', caseId: 'claim-A', prov: 'human_confirmed', av: 'impact-1', createdAt: '2026-10-18T10:00:00.000Z', afterState: '{"reviewState":"review_recorded","flags":[]}' },
        { id: 'dec-2', caseId: 'conclusion-C', prov: 'human_confirmed', av: 'impact-1', createdAt: '2026-10-18T11:00:00.000Z', afterState: null },
      ],
      linkedData: [{ did: 'dec-2' }],
    });

    const result = await relinkReviewDecisionEdges(session);
    expect(result).toEqual({ relinked: 1, decisions: 2 });
    expect(writes).toHaveLength(1);
    expect(writes[0].cypher).toEqual(expect.stringContaining(REVIEW_DECISION_EDGE_TYPE));
    expect(writes[0].cypher).toEqual(expect.stringContaining('UNWIND $rows AS row'));
    const rows = writes[0].params.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].fromId).toBe('claim-A');
    expect(rows[0].toId).toBe('dec-1');
    expect(rows[0].props.seeded).toBe(false);
    expect(rows[0].props.caseId).toBe('claim-A');
    expect(rows[0].props.id).toBe('relink-dec-1');
    expect(rows[0].props.sourcePointer).toBe('ReviewDecision node dec-1');
    expect(rows[0].props.provenanceKind).toBe('human_confirmed');
    expect(rows[0].props.reviewState).toBe('review_recorded');
    expect(reads[0].params).toEqual({ audit: false });
    expect(reads[1].params).toEqual({ audit: false });
  });

  it('degrades honestly on corrupt afterState and keeps queries parameterized', async () => {
    const { session, writes, reads } = buildFakeSession({
      decisionsData: [
        { id: 'dec-1', caseId: 'claim-A', prov: 'human_confirmed', av: null, createdAt: '2026-10-18T10:00:00.000Z', afterState: 'not-json' },
      ],
      linkedData: [],
    });

    const result = await relinkReviewDecisionEdges(session);
    expect(result).toEqual({ relinked: 1, decisions: 1 });
    expect(writes[0].params.rows[0].props.reviewState).toBe(null);
    expect(writes[0].params.rows[0].props.analysisVersion).toBe('seed-1'); // SEED_ANALYSIS_VERSION fallback

    // Reads carry the $audit param; the only inline label fragments are the
    // contract-edge type (same whitelist discipline as the M5 writer).
    for (const r of reads) {
      expect(r.params).toEqual({ audit: false });
      expect(r.cypher).toEqual(expect.not.stringContaining('not-json'));
    }
  });

  it('no decisions → honest zero-work no-op', async () => {
    const { session, writes, reads } = buildFakeSession({ decisionsData: [], linkedData: [] });
    const result = await relinkReviewDecisionEdges(session);
    expect(result).toEqual({ relinked: 0, decisions: 0 });
    expect(writes).toHaveLength(0);
    expect(reads).toHaveLength(1);
  });

  it('everything already linked → no writes', async () => {
    const { session, writes } = buildFakeSession({
      decisionsData: [
        { id: 'dec-1', caseId: 'claim-A', prov: 'human_confirmed', av: 'impact-1', createdAt: '2026-10-18T10:00:00.000Z', afterState: '{"reviewState":"review_recorded"}' },
      ],
      linkedData: [{ did: 'dec-1' }],
    });
    const result = await relinkReviewDecisionEdges(session);
    expect(result).toEqual({ relinked: 0, decisions: 1 });
    expect(writes).toHaveLength(0);
  });
});
