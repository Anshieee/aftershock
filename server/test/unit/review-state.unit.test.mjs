/**
 * Unit tests: M5 review decision + revision proposal API.
 *
 * Test seam (per server/demoApi.mjs): handlers are built with `create*Handler(deps)`
 * accepting an injectable fake `layer` plus scripted ops. Ops accept an injected
 * `GraphSession`. No real database, no credentials, no ESM stubbing.
 *
 * Run: `npx vitest --config server/vitest.unit.config.js run` from the repo root.
 */

import { describe, expect, it } from 'vitest';
import {
  assertParameterized,
  ConnectionError,
  GraphQueryError,
} from '../../graphClient.mjs';
import {
  createReviewDecideHandler,
} from '../../../netlify/functions/review-decide.mjs';
import { createReviewRevisionHandler } from '../../../netlify/functions/review-revision.mjs';

import {
  createRevisionProposal,
  getReviewDecisionsForCase,
  recordReviewDecision,
  validateReviewDecisionInput,
  validateRevisionProposalInput,
  REVIEW_OUTCOMES,
  ReviewValidationError,
  ReviewConflictError,
  ReviewNotFoundError,
} from '../../reviewState.mjs';

const GRAPH_NAME = 'test-graph';
const CASE_ID = 'claim-A';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/* ------------------------------------------------------------------ *
 * Test doubles: a stateful fake session + layer.
 * ------------------------------------------------------------------ */

/**
 * Builds a fake GraphSession that simulates one case node and records every
 * write. The case node starts `awaiting_review`; the relationship/write pass
 * applies the state transition so a second decision can be tested.
 * @param {{caseNode?: Record<string, unknown>, fail?: boolean}} [options]
 */
function buildFakeSession({ caseNode, fail = false } = {}) {
  const writes = [];
  const reads = [];
  const decisions = [];
  const proposals = [];
  let state = caseNode
    ? {
        id: caseNode.id,
        text: caseNode.text,
        kind: caseNode.kind ?? 'Claim',
        reviewState: caseNode.reviewState ?? 'awaiting_review',
        reviewFlags: caseNode.reviewFlags ?? [],
      }
    : null;

  const session = {
    graphName: GRAPH_NAME,
    async roQuery(cypher, params) {
      reads.push({ cypher, params });
      if (fail) throw new ConnectionError('graph is down');
      // getReviewDecisionsForCase
      if (cypher.includes('ReviewDecision') && cypher.includes('WHERE d.caseId')) {
        return {
          data: decisions
            .filter((d) => d.caseId === params.caseId)
            .map((d) => ({ ...d, beforeState: JSON.stringify(d.beforeState), afterState: JSON.stringify(d.afterState) })),
        };
      }
      // read case node (readCaseState)
      if (cypher.includes('WHERE n.id = $caseId')) {
        return {
          data: state
            ? [{ id: state.id, text: state.text, kind: state.kind, reviewState: state.reviewState, reviewFlags: state.reviewFlags }]
            : [],
        };
      }
      return { data: [] };
    },
    async writeQuery(cypher, params) {
      if (fail) throw new GraphQueryError(GRAPH_NAME, cypher, new Error('write failed'));
      writes.push({ cypher, params });
      if (cypher.includes('CREATE (d:ReviewDecision)')) {
        decisions.push({
          id: params.id,
          caseId: params.caseId,
          outcome: params.outcome,
          explanation: params.explanation,
          reviewer: params.reviewer || undefined,
          decidedAt: params.decidedAt,
          beforeState: JSON.parse(params.beforeState),
          afterState: JSON.parse(params.afterState),
          provenanceKind: params.prov,
          analysisVersion: params.av,
          createdAt: params.ts,
          updatedAt: params.ts,
          seeded: params.seeded,
        });
      }
      if (cypher.includes('CREATE (p:RevisionProposal)')) {
        proposals.push({
          id: params.id,
          caseId: params.caseId,
          originalText: params.originalText,
          proposedText: params.proposedText,
          rationale: params.rationale || undefined,
          status: params.status,
          createdAt: params.ts,
          provenanceKind: params.prov,
          analysisVersion: params.av,
          seeded: params.seeded,
        });
      }
      // Simulate the case-node state transition from the link+update pass.
      if (cypher.includes('SET c.reviewState')) {
        state = { ...state, reviewState: params.primaryState, reviewFlags: params.flags, updatedAt: params.ts };
      }
      return { data: [] };
    },
    async close() {},
  };

  return { session, writes, reads, decisions, proposals, getState: () => state };
}

function buildFakeLayer(session) {
  return { open: async () => session };
}

function envWithGraph() {
  return { FALKORDB_GRAPH_NAME: GRAPH_NAME };
}

/** Build a POST Request for the handlers. */
function requestFor(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jsonOf(response) {
  return response.json();
}

/* ------------------------------------------------------------------ *
 * recordReviewDecision (op-level, fake session)
 * ------------------------------------------------------------------ */

describe('recordReviewDecision — op', () => {
  it('creates a ReviewDecision node and transitions the case awaiting_review → review_recorded', async () => {
    const { session, decisions, getState } = buildFakeSession({ caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' } });

    const result = await recordReviewDecision(session, {
      caseId: CASE_ID,
      outcome: 'not_affected',
      explanation: 'The retracted record is not relied upon here.',
      reviewer: 'Dr. Reviewer',
    });

    expect(result).toMatchObject({
      decisionId: expect.any(String),
      caseId: CASE_ID,
      outcome: 'not_affected',
      explanation: 'The retracted record is not relied upon here.',
      reviewer: 'Dr. Reviewer',
      decidedAt: expect.stringMatching(ISO_RE),
    });
    expect(result.beforeState).toEqual({ reviewState: 'awaiting_review', flags: [] });
    expect(result.afterState).toEqual({ reviewState: 'review_recorded', flags: [] });

    expect(decisions).toHaveLength(1);
    expect(decisions[0].provenanceKind).toBe('human_confirmed');
    // Audit invariant: a decision node is a human-audit artifact, NOT fixture
    // content — seeded:false keeps it out of the reseed wipe scope and out of
    // the seeded-count idempotency accounting (a seeded:true decision would
    // make every later guided-seed see "drift" and erase audit history).
    expect(decisions[0].seeded).toBe(false);
    expect(getState().reviewState).toBe('review_recorded');
    expect(getState().text).toBe('Original claim text.'); // immutability
  });

  it.each(REVIEW_OUTCOMES)('outcome %s maps to the correct afterState', async (outcome) => {
    const { session, getState } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    const result = await recordReviewDecision(session, { caseId: CASE_ID, outcome, explanation: 'e' });

    const expected = { revision_needed: ['revision_pending'], more_evidence_needed: ['further_investigation'], not_affected: [], evidence_updated: [] }[outcome];
    expect(result.afterState.reviewState).toBe('review_recorded');
    expect(result.afterState.flags).toEqual(expected);
    expect(getState().reviewState).toBe('review_recorded');
  });

  it('rejects an invalid outcome', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    await expect(
      recordReviewDecision(session, { caseId: CASE_ID, outcome: 'bogus', explanation: 'e' }),
    ).rejects.toThrow(ReviewValidationError);
  });

  it('rejects a missing explanation', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    await expect(
      recordReviewDecision(session, { caseId: CASE_ID, outcome: 'not_affected', explanation: '' }),
    ).rejects.toThrow(ReviewValidationError);
  });

  it('rejects a missing caseId', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    await expect(
      recordReviewDecision(session, { caseId: '', outcome: 'not_affected', explanation: 'e' }),
    ).rejects.toThrow(ReviewValidationError);
  });

  it('reopens a case already in review_recorded (reopened_due_to_new_information)', async () => {
    const { session, decisions, getState } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim', reviewState: 'review_recorded', reviewFlags: [] },
    });

    // First decision (on this fixture) transitions review_recorded → reopened.
    const result = await recordReviewDecision(session, {
      caseId: CASE_ID,
      outcome: 'revision_needed',
      explanation: 'New evidence surfaced.',
    });

    expect(result.beforeState).toEqual({ reviewState: 'review_recorded', flags: [] });
    expect(result.afterState).toEqual({ reviewState: 'reopened_due_to_new_information', flags: ['revision_pending'] });
    expect(decisions).toHaveLength(1);
    expect(getState().reviewState).toBe('reopened_due_to_new_information');
  });

  it('blocks a decision on a terminal case (409)', async () => {
    const { session } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 't', kind: 'Claim', reviewState: 'resolved', reviewFlags: [] },
    });
    await expect(
      recordReviewDecision(session, { caseId: CASE_ID, outcome: 'not_affected', explanation: 'e' }),
    ).rejects.toThrow(ReviewConflictError);
  });

  it('returns 400-equivalent when no case node exists', async () => {
    const { session } = buildFakeSession({});
    await expect(
      recordReviewDecision(session, { caseId: 'no-such-case', outcome: 'not_affected', explanation: 'e' }),
    ).rejects.toThrow(ReviewNotFoundError);
  });

  it('refuses a non-Claim/Conclusion case node', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Publication' } });
    await expect(
      recordReviewDecision(session, { caseId: CASE_ID, outcome: 'not_affected', explanation: 'e' }),
    ).rejects.toThrow(ReviewValidationError);
  });
});

/* ------------------------------------------------------------------ *
 * createRevisionProposal (op-level, fake session)
 * ------------------------------------------------------------------ */

describe('createRevisionProposal — op', () => {
  it('creates a draft proposal copying the immutable original text and never touches case text', async () => {
    const { session, proposals, getState } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' },
    });

    const result = await createRevisionProposal(session, {
      caseId: CASE_ID,
      proposedText: 'Revised claim text.',
      rationale: 'The original overstates the finding.',
    });

    expect(result).toMatchObject({
      proposalId: expect.any(String),
      caseId: CASE_ID,
      originalText: 'Original claim text.',
      proposedText: 'Revised claim text.',
      rationale: 'The original overstates the finding.',
      status: 'draft',
      createdAt: expect.stringMatching(ISO_RE),
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0].provenanceKind).toBe('human_confirmed');
    // Audit invariant (same as decisions): revision proposals are human-audit
    // records, never fixture content — seeded:false survives reseeds.
    expect(proposals[0].seeded).toBe(false);
    // Immutability: case text unchanged by the proposal.
    expect(getState().text).toBe('Original claim text.');
    expect(getState().reviewState).toBe('awaiting_review'); // proposal does not record a decision
  });

  it('rejects missing proposedText', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    await expect(
      createRevisionProposal(session, { caseId: CASE_ID, proposedText: '' }),
    ).rejects.toThrow(ReviewValidationError);
  });

  it('rejects missing caseId', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    await expect(
      createRevisionProposal(session, { caseId: '', proposedText: 'x' }),
    ).rejects.toThrow(ReviewValidationError);
  });

  it('returns 400-equivalent when no case node exists', async () => {
    const { session } = buildFakeSession({});
    await expect(
      createRevisionProposal(session, { caseId: 'no-such-case', proposedText: 'x' }),
    ).rejects.toThrow(ReviewNotFoundError);
  });
});

/* ------------------------------------------------------------------ *
 * getReviewDecisionsForCase (op-level, fake session)
 * ------------------------------------------------------------------ */

describe('getReviewDecisionsForCase — op', () => {
  it('returns the decisions recorded against a case with before/after state parsed', async () => {
    const { session, decisions } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' } });
    await recordReviewDecision(session, { caseId: CASE_ID, outcome: 'not_affected', explanation: 'e' });

    const rows = await getReviewDecisionsForCase(session, CASE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].caseId).toBe(CASE_ID);
    expect(rows[0].outcome).toBe('not_affected');
    expect(rows[0].afterState).toEqual({ reviewState: 'review_recorded', flags: [] });
    expect(rows[0].beforeState).toEqual({ reviewState: 'awaiting_review', flags: [] });
  });

  it('rejects an empty caseId', async () => {
    const { session } = buildFakeSession({});
    await expect(getReviewDecisionsForCase(session, '')).rejects.toThrow(ReviewValidationError);
  });
});

/* ------------------------------------------------------------------ *
 * Validation guards (max-length + caseId format) — 400 before graph I/O
 * ------------------------------------------------------------------ */

describe('validateReviewDecisionInput — input bounds', () => {
  it('rejects an oversized explanation (> 5000)', () => {
    expect(() =>
      validateReviewDecisionInput({ caseId: CASE_ID, outcome: 'not_affected', explanation: 'x'.repeat(5001) }),
    ).toThrow(ReviewValidationError);
  });

  it('rejects an oversized reviewer (> 200)', () => {
    expect(() =>
      validateReviewDecisionInput({ caseId: CASE_ID, outcome: 'not_affected', explanation: 'e', reviewer: 'x'.repeat(201) }),
    ).toThrow(ReviewValidationError);
  });

  it('rejects an oversized caseId (> 100)', () => {
    expect(() =>
      validateReviewDecisionInput({ caseId: 'x'.repeat(101), outcome: 'not_affected', explanation: 'e' }),
    ).toThrow(ReviewValidationError);
  });

  it('accepts caseId at exactly 100 chars and explanation at exactly 5000 chars', () => {
    expect(() =>
      validateReviewDecisionInput({
        caseId: 'x'.repeat(100),
        outcome: 'not_affected',
        explanation: 'x'.repeat(5000),
        reviewer: 'x'.repeat(200),
      }),
    ).not.toThrow();
  });
});

describe('validateRevisionProposalInput — input bounds', () => {
  it('rejects an oversized proposedText (> 5000)', () => {
    expect(() =>
      validateRevisionProposalInput({ caseId: CASE_ID, proposedText: 'x'.repeat(5001) }),
    ).toThrow(ReviewValidationError);
  });

  it('rejects an oversized rationale (> 1000)', () => {
    expect(() =>
      validateRevisionProposalInput({ caseId: CASE_ID, proposedText: 'p', rationale: 'x'.repeat(1001) }),
    ).toThrow(ReviewValidationError);
  });

  it('rejects an oversized caseId (> 100)', () => {
    expect(() =>
      validateRevisionProposalInput({ caseId: 'x'.repeat(101), proposedText: 'p' }),
    ).toThrow(ReviewValidationError);
  });

  it('accepts proposedText at exactly 5000 chars and rationale at exactly 1000 chars', () => {
    expect(() =>
      validateRevisionProposalInput({ caseId: CASE_ID, proposedText: 'x'.repeat(5000), rationale: 'x'.repeat(1000) }),
    ).not.toThrow();
  });
});

describe('caseId format constraint', () => {
  it.each(['case id with spaces!', '../../etc', 'x;y', 'a"b', 'case/id', 'case.id'])(
    'rejects an unsafe caseId: %s',
    (badCaseId) => {
      expect(() =>
        validateReviewDecisionInput({ caseId: badCaseId, outcome: 'not_affected', explanation: 'e' }),
      ).toThrow(ReviewValidationError);
      expect(() =>
        validateRevisionProposalInput({ caseId: badCaseId, proposedText: 'p' }),
      ).toThrow(ReviewValidationError);
    },
  );

  it('accepts alphanumeric, underscore and hyphen caseIds', () => {
    expect(() =>
      validateReviewDecisionInput({ caseId: 'claim-A_2', outcome: 'not_affected', explanation: 'e' }),
    ).not.toThrow();
    expect(() =>
      validateRevisionProposalInput({ caseId: 'claim-A_2', proposedText: 'p' }),
    ).not.toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * assertParameterized self-defense — every Cypher string passed to the
 * session is explicitly guarded (no inline literals).
 * ------------------------------------------------------------------ */

describe('Cypher parameterization guard', () => {
  it('explicitly assertParameterizes every write and the decisions read', async () => {
    const { session, writes, reads } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' },
    });

    await recordReviewDecision(session, { caseId: CASE_ID, outcome: 'not_affected', explanation: 'Needs review.', reviewer: 'R1' });
    await createRevisionProposal(session, { caseId: CASE_ID, proposedText: 'Revised text.', rationale: 'More precise.' });
    await getReviewDecisionsForCase(session, CASE_ID);

    // 2 writes for the decision (node + edge/case-update), 1 write for the
    // proposal; reads are readCaseState (twice) + getReviewDecisionsForCase.
    expect(writes.length).toBe(3);
    expect(reads.length).toBe(3);

    const all = [...writes, ...reads];
    for (const { cypher, params } of all) {
      // No inline string literals anywhere in the query text.
      expect(cypher).not.toMatch(/['"]/);
      // The explicit guard must accept the query text + params bag.
      expect(() => assertParameterized(cypher, params ?? {})).not.toThrow();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Handlers (HTTP layer, fake layer + scripted ops)
 * ------------------------------------------------------------------ */

describe('createReviewDecideHandler — HTTP', () => {
  const base = `http://localhost/${GRAPH_NAME}`;

  it('records a decision and returns 200 with the decision record', async () => {
    const { session, decisions, getState } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' },
    });
    const handler = createReviewDecideHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      decide: recordReviewDecision,
    });

    const res = await handler(requestFor(`${base}/review-decide?caseId=${CASE_ID}`, {
      outcome: 'revision_needed',
      explanation: 'Needs a rewrite.',
      reviewer: 'R1',
    }));

    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.decisionId).toBeDefined();
    expect(body.outcome).toBe('revision_needed');
    expect(body.afterState).toEqual({ reviewState: 'review_recorded', flags: ['revision_pending'] });
    expect(decisions).toHaveLength(1);
    expect(getState().reviewState).toBe('review_recorded');
    expect(getState().text).toBe('Original claim text.');
  });

  it('returns 405 for non-POST methods with an Allow header', async () => {
    const handler = createReviewDecideHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(new Request(`${base}/review-decide?caseId=${CASE_ID}`, { method: 'GET' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('returns 400 for a missing caseId', async () => {
    const handler = createReviewDecideHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/review-decide`, { outcome: 'not_affected', explanation: 'e' }));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toBe('invalid-request');
  });

  it('returns 400 for an invalid outcome', async () => {
    const handler = createReviewDecideHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/review-decide?caseId=${CASE_ID}`, { outcome: 'bogus', explanation: 'e' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing explanation', async () => {
    const handler = createReviewDecideHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/review-decide?caseId=${CASE_ID}`, { outcome: 'not_affected', explanation: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 409 for an invalid state transition (terminal case)', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim', reviewState: 'resolved' } });
    const handler = createReviewDecideHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      decide: recordReviewDecision,
    });
    const res = await handler(requestFor(`${base}/review-decide?caseId=${CASE_ID}`, { outcome: 'not_affected', explanation: 'e' }));
    expect(res.status).toBe(409);
    const body = await jsonOf(res);
    expect(body.error).toBe('conflict');
  });

  it('reports a missing case with the honest `case-not-found` code (400 per contract)', async () => {
    // The contract deliberately surfaces unknown review cases as 400 (no 404
    // review-decision status), but the error CODE must still discriminate:
    // a missing case is not generic input validation.
    const handler = createReviewDecideHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/review-decide?caseId=unknown-case`, { outcome: 'not_affected', explanation: 'e' }));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toBe('case-not-found');
  });

  it('maps a validation failure to `invalid-request` (not case-not-found)', async () => {
    const handler = createReviewDecideHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/review-decide?caseId=${CASE_ID}`, { outcome: 'bogus', explanation: 'e' }));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toBe('invalid-request');
  });

  it('returns 503 when the graph is unavailable and fabricates nothing', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' }, fail: true });
    const handler = createReviewDecideHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      decide: recordReviewDecision,
    });
    const res = await handler(requestFor(`${base}/review-decide?caseId=${CASE_ID}`, { outcome: 'not_affected', explanation: 'e' }));
    expect(res.status).toBe(503);
    const body = await jsonOf(res);
    expect(body.error).toBe('graph-backend-unavailable');
    expect(body.message).toContain('no fabricated data');
  });

  it('returns 400 for malformed JSON body', async () => {
    const handler = createReviewDecideHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(new Request(`${base}/review-decide?caseId=${CASE_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 429 + Retry-After when the per-IP bucket is exhausted', async () => {
    const fakeLimiter = {
      check(key) {
        if (key === 'ip:203.0.113.10') return { allowed: false, retryAfterMs: 15_000 };
        return { allowed: true, retryAfterMs: 0 };
      },
    };
    const handler = createReviewDecideHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(buildFakeSession().session),
      decide: recordReviewDecision,
      limiter: fakeLimiter,
    });

    const res = await handler(new Request(`${base}/review-decide?caseId=${CASE_ID}`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.10', 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'not_affected', explanation: 'e' }),
    }));

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe(String(Math.max(1, Math.ceil(15_000 / 1000))));
    const body = await res.json();
    expect(body.error).toBe('rate-limited');
    expect(body.message).toContain('nothing was recorded');
  });
});

describe('createReviewRevisionHandler — HTTP', () => {
  const base = `http://localhost/${GRAPH_NAME}`;

  it('reports a missing case with the honest `case-not-found` code (400 per contract)', async () => {
    const handler = createReviewRevisionHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/review-revision?caseId=unknown-case`, { proposedText: 'Revised.' }));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toBe('case-not-found');
  });

  it('creates a draft proposal and returns 200', async () => {
    const { session, proposals, getState } = buildFakeSession({
      caseNode: { id: CASE_ID, text: 'Original claim text.', kind: 'Claim' },
    });
    const handler = createReviewRevisionHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      propose: createRevisionProposal,
    });

    const res = await handler(requestFor(`${base}/review-revision?caseId=${CASE_ID}`, {
      proposedText: 'Revised claim text.',
      rationale: 'More precise.',
    }));

    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.proposalId).toBeDefined();
    expect(body.caseId).toBe(CASE_ID);
    expect(body.originalText).toBe('Original claim text.');
    expect(body.proposedText).toBe('Revised claim text.');
    expect(body.rationale).toBe('More precise.');
    expect(body.status).toBe('draft');
    expect(body.createdAt).toMatch(ISO_RE);
    expect(proposals).toHaveLength(1);
    // Immutability: case text untouched; no decision recorded.
    expect(getState().text).toBe('Original claim text.');
    expect(getState().reviewState).toBe('awaiting_review');
  });

  it('returns 405 for non-POST methods', async () => {
    const handler = createReviewRevisionHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(new Request(`${base}/review-revision?caseId=${CASE_ID}`, { method: 'GET' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('returns 400 for missing proposedText', async () => {
    const handler = createReviewRevisionHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/review-revision?caseId=${CASE_ID}`, { proposedText: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing caseId', async () => {
    const handler = createReviewRevisionHandler({ env: envWithGraph(), layer: buildFakeLayer(buildFakeSession().session) });
    const res = await handler(requestFor(`${base}/review-revision`, { proposedText: 'x' }));
    expect(res.status).toBe(400);
  });

  it('returns 503 when the graph is unavailable', async () => {
    const { session } = buildFakeSession({ caseNode: { id: CASE_ID, text: 't', kind: 'Claim' }, fail: true });
    const handler = createReviewRevisionHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      propose: createRevisionProposal,
    });
    const res = await handler(requestFor(`${base}/review-revision?caseId=${CASE_ID}`, { proposedText: 'x' }));
    expect(res.status).toBe(503);
  });
});
