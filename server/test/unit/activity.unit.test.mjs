/**
 * Unit tests: P2 activity timeline (GET /activity) data assembly + handler.
 *
 * Test seam (per server/demoApi.mjs): `assembleActivityEvents(session)` takes
 * an injected fake GraphSession; `createActivityHandler(deps)` takes an
 * injectable fake layer, scripted `assemble` op and `limiter`. No real
 * database, no credentials, no ESM stubbing.
 *
 * Run: `npx vitest run --config vitest.unit.config.js` from `server/`.
 */

import { describe, expect, it } from 'vitest';
import { assertParameterized, ConnectionError } from '../../graphClient.mjs';
import {
  assembleActivityEvents,
  ACTIVITY_EVENT_TYPES,
  MAX_ACTIVITY_CASE_ID_LEN,
  parseActivityCaseId,
} from '../../activity.mjs';
import { createActivityHandler } from '../../../netlify/functions/activity.mjs';

const GRAPH_NAME = 'test-graph';
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const DECISION_REVIEW_NEEDED = {
  id: 'dec-1',
  caseId: 'claim-A',
  outcome: 'revision_needed',
  explanation: 'Needs a rewrite.',
  reviewer: 'Dr. Reviewer',
  decidedAt: '2026-01-02T00:00:00.000Z',
  beforeState: { reviewState: 'awaiting_review', flags: [] },
  afterState: { reviewState: 'review_recorded', flags: ['revision_pending'] },
  provenanceKind: 'human_confirmed',
  analysisVersion: 'seed-1',
};

const DECISION_NOT_AFFECTED = {
  id: 'dec-2',
  caseId: 'conclusion-C',
  outcome: 'not_affected',
  explanation: 'Not relied upon here.',
  reviewer: undefined,
  decidedAt: '2026-01-05T00:00:00.000Z',
  beforeState: { reviewState: 'awaiting_review', flags: [] },
  afterState: { reviewState: 'review_recorded', flags: [] },
  provenanceKind: 'human_confirmed',
  analysisVersion: 'seed-1',
};

const NOTICE_RETRACTION = {
  id: 'notice-mehra-retraction-2020-06-04',
  noticeType: 'retraction',
  publishedDate: '2020-06-04',
  noticeRecordedDate: '2020-06-05',
  detectedAt: '2026-01-10T00:00:00.000Z',
  lastVerifiedAt: '2026-01-15T00:00:00.000Z',
  sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31324-6',
  verified: true,
  publicationId: 'pub-mehra-2020',
  publicationTitle: 'Mehra et al. 2020',
  provenanceKind: 'source_verified',
};

const RUN_COMPLETED = {
  id: 'run-1',
  documentVersionId: 'ver-demo-manuscript-v1',
  startedAt: '2026-02-01T00:00:00.000Z',
  completedAt: '2026-02-01T01:30:00.000Z',
  status: 'completed',
  stage: 'results',
  provenanceKind: 'observed',
};

const RUN_FAILED_NO_END = {
  id: 'run-2',
  documentVersionId: 'ver-demo-manuscript-v1',
  startedAt: '2026-01-20T00:00:00.000Z',
  completedAt: undefined,
  status: 'failed',
  stage: 'parsing',
  error: 'parse failed',
  provenanceKind: 'observed',
};

/* ------------------------------------------------------------------ *
 * Test doubles: scripted fake session + layer
 * ------------------------------------------------------------------ */

/**
 * @param {{decisions?: Array, notices?: Array, runs?: Array, fail?: boolean}} options
 */
function buildFakeSession({ decisions = [], notices = [], runs = [], fail = false } = {}) {
  const reads = [];
  const session = {
    graphName: GRAPH_NAME,
    async roQuery(cypher, params) {
      reads.push({ cypher, params });
      if (fail) throw new ConnectionError('graph is down');
      if (cypher.includes('ReviewDecision')) {
        // Mirror the real graph semantics: the $caseId WHERE clause filters.
        const rows = cypher.includes('$caseId')
          ? decisions.filter((d) => d.caseId === params.caseId)
          : decisions;
        return {
          data: rows.map((d) => ({
            ...d,
            beforeState: JSON.stringify(d.beforeState),
            afterState: JSON.stringify(d.afterState),
          })),
        };
      }
      if (cypher.includes('SourceNotice')) {
        return { data: notices };
      }
      if (cypher.includes('AnalysisRun')) {
        return { data: runs };
      }
      return { data: [] };
    },
    async close() {},
  };
  return { session, reads };
}

function buildFakeLayer(session) {
  return { open: async () => session };
}

function envWithGraph() {
  return { FALKORDB_GRAPH_NAME: GRAPH_NAME };
}

function requestFor(method = 'GET', headers = {}) {
  return new Request('http://localhost/activity', { method, headers });
}

async function jsonOf(response) {
  return response.json();
}

/* ------------------------------------------------------------------ *
 * assembleActivityEvents — op level
 * ------------------------------------------------------------------ */

describe('assembleActivityEvents — review decisions', () => {
  it('maps a ReviewDecision node to a review_decision event with before/after state', async () => {
    const { session, reads } = buildFakeSession({ decisions: [DECISION_REVIEW_NEEDED] });
    const events = await assembleActivityEvents(session);

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toMatchObject({
      id: 'dec-1',
      type: 'review_decision',
      actor: 'Dr. Reviewer',
      action: 'revision_needed',
      timestamp: '2026-01-02T00:00:00.000Z',
      targetId: 'claim-A',
      targetType: 'case',
      description: 'Needs a rewrite.',
    });
    expect(event.timestamp).toMatch(ISO_RE);
    expect(event.beforeState).toEqual({ reviewState: 'awaiting_review', flags: [] });
    expect(event.afterState).toEqual({ reviewState: 'review_recorded', flags: ['revision_pending'] });
    expect(event.provenanceKind).toBe('human_confirmed');

    // All three graph reads run and every Cypher string is parameterized.
    expect(reads).toHaveLength(3);
    for (const { cypher, params } of reads) {
      expect(cypher).not.toMatch(/['"]/);
      expect(() => assertParameterized(cypher, params ?? {})).not.toThrow();
    }
  });

  it('omits actor when the decision has no reviewer', async () => {
    const { session } = buildFakeSession({ decisions: [DECISION_NOT_AFFECTED] });
    const events = await assembleActivityEvents(session);

    expect(events[0].actor).toBeUndefined();
    expect(events[0]).not.toHaveProperty('actor');
  });

  it('excludes a decision without decidedAt (cannot be placed on a timeline)', async () => {
    const { session } = buildFakeSession({
      decisions: [{ ...DECISION_REVIEW_NEEDED, id: 'dec-no-time', decidedAt: undefined }],
    });
    const events = await assembleActivityEvents(session);
    expect(events).toHaveLength(0);
  });
});

describe('assembleActivityEvents — source notices', () => {
  it('maps a SourceNotice node to a source_notice event with distinct timestamps', async () => {
    const { session } = buildFakeSession({ notices: [NOTICE_RETRACTION] });
    const events = await assembleActivityEvents(session);

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toMatchObject({
      id: 'notice-mehra-retraction-2020-06-04',
      type: 'source_notice',
      action: 'published',
      timestamp: '2020-06-04',
      targetId: 'pub-mehra-2020',
      targetType: 'Publication',
      description: 'retraction notice for Mehra et al. 2020',
    });
    // Discovery/verification dates are separate fields — never merged into
    // the notice's official publication date.
    expect(event.detectedAt).toBe('2026-01-10T00:00:00.000Z');
    expect(event.lastVerifiedAt).toBe('2026-01-15T00:00:00.000Z');
    expect(event.noticeRecordedDate).toBe('2020-06-05'); // ≠ publishedDate — distinct kinds
    expect(event.noticeRecordedDate).not.toBe(event.timestamp);
    expect(event.actor).toBeUndefined();
    expect(event.provenanceKind).toBe('source_verified');
  });

  it('omits target fields when the notice has no linked publication', async () => {
    const { session } = buildFakeSession({
      notices: [{ ...NOTICE_RETRACTION, id: 'notice-orphan', publicationId: undefined, publicationTitle: undefined }],
    });
    const events = await assembleActivityEvents(session);
    expect(events[0].targetId).toBeUndefined();
    expect(events[0].targetType).toBeUndefined();
    expect(events[0].description).toBe('retraction notice for an unpublished publication');
  });

  it('excludes a notice without publishedDate', async () => {
    const { session } = buildFakeSession({
      notices: [{ ...NOTICE_RETRACTION, id: 'notice-no-time', publishedDate: undefined }],
    });
    const events = await assembleActivityEvents(session);
    expect(events).toHaveLength(0);
  });
});

describe('assembleActivityEvents — analysis runs', () => {
  it('maps an AnalysisRun node to an analysis_run event (completedAt preferred)', async () => {
    const { session } = buildFakeSession({ runs: [RUN_COMPLETED] });
    const events = await assembleActivityEvents(session);

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toMatchObject({
      id: 'run-1',
      type: 'analysis_run',
      action: 'completed',
      timestamp: '2026-02-01T01:30:00.000Z', // completedAt wins over startedAt
      targetId: 'ver-demo-manuscript-v1',
      targetType: 'DocumentVersion',
      description: 'Analysis run for document version',
    });
    expect(event.provenanceKind).toBe('observed');
    // The run window stays visible as distinct fields — the timeline
    // timestamp (completedAt) is never the only recorded time.
    expect(event.startedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(event.completedAt).toBe('2026-02-01T01:30:00.000Z');
    expect(event.actor).toBeUndefined();
  });

  it('falls back to startedAt when completedAt is absent', async () => {
    const { session } = buildFakeSession({ runs: [RUN_FAILED_NO_END] });
    const events = await assembleActivityEvents(session);
    expect(events[0].timestamp).toBe('2026-01-20T00:00:00.000Z');
    expect(events[0].action).toBe('failed');
  });

  it('excludes a run without any timestamp', async () => {
    const { session } = buildFakeSession({
      runs: [{ ...RUN_COMPLETED, id: 'run-no-time', startedAt: undefined, completedAt: undefined }],
    });
    const events = await assembleActivityEvents(session);
    expect(events).toHaveLength(0);
  });
});

describe('assembleActivityEvents — ordering, dedup, empty, failures', () => {
  it('returns events newest-first across all event types', async () => {
    const { session } = buildFakeSession({
      decisions: [DECISION_REVIEW_NEEDED, DECISION_NOT_AFFECTED], // Jan 2, Jan 5
      notices: [NOTICE_RETRACTION],                                 // 2020-06-04
      runs: [RUN_COMPLETED, RUN_FAILED_NO_END],                     // Feb 1 01:30, Jan 20
    });
    const events = await assembleActivityEvents(session);

    expect(events).toHaveLength(5);
    expect(events.map((e) => e.timestamp)).toEqual([
      '2026-02-01T01:30:00.000Z',
      '2026-01-20T00:00:00.000Z',
      '2026-01-05T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      '2020-06-04',
    ]);
    expect(events.map((e) => e.type)).toEqual([
      'analysis_run', 'analysis_run', 'review_decision', 'review_decision', 'source_notice',
    ]);
  });

  it('deduplicates events by id (first occurrence wins)', async () => {
    const { session } = buildFakeSession({
      decisions: [DECISION_REVIEW_NEEDED, { ...DECISION_REVIEW_NEEDED, explanation: 'duplicate' }],
    });
    const events = await assembleActivityEvents(session);
    expect(events).toHaveLength(1);
    expect(events[0].description).toBe('Needs a rewrite.');
  });

  it('returns an empty array for an empty graph — nothing fabricated', async () => {
    const { session } = buildFakeSession({});
    const events = await assembleActivityEvents(session);
    expect(Array.isArray(events)).toBe(true);
    expect(events).toEqual([]);
  });

  it('propagates graph read failures (no fabricated events)', async () => {
    const { session } = buildFakeSession({ decisions: [DECISION_REVIEW_NEEDED], fail: true });
    await expect(assembleActivityEvents(session)).rejects.toThrow(ConnectionError);
  });
});

describe('ACTIVITY_EVENT_TYPES', () => {
  it('lists the contracted event types', () => {
    expect(ACTIVITY_EVENT_TYPES).toEqual([
      'review_decision',
      'source_notice',
      'analysis_run',
      'export_generated',
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * parseActivityCaseId — shared validator for the M7 per-case filter
 * ------------------------------------------------------------------ */

describe('parseActivityCaseId — M7 per-case filter validation', () => {
  it('returns undefined for absent input (no filter)', () => {
    expect(parseActivityCaseId(undefined)).toBeUndefined();
    expect(parseActivityCaseId(null)).toBeUndefined();
  });

  it('normalizes whitespace around a valid id', () => {
    expect(parseActivityCaseId(' claim-A ')).toBe('claim-A');
    expect(parseActivityCaseId('claim-A_conclusion-C-2')).toBe('claim-A_conclusion-C-2');
  });

  it('rejects empty and non-string input', () => {
    for (const bad of ['', '   ', 42, {}, []]) {
      expect(() => parseActivityCaseId(bad)).toThrowError(/caseId filter/);
    }
  });

  it('rejects charset violations before any graph work', () => {
    for (const bad of ['claim A', '../etc', 'claim;A', 'claim"A', 'claim$A', 'a+b']) {
      expect(() => parseActivityCaseId(bad)).toThrowError(/letters, digits, underscores, and hyphens/);
    }
  });

  it('rejects oversized ids with the shared length bound', () => {
    expect(() => parseActivityCaseId('a'.repeat(MAX_ACTIVITY_CASE_ID_LEN + 1))).toThrowError(
      /characters or fewer/,
    );
    expect(parseActivityCaseId('a'.repeat(MAX_ACTIVITY_CASE_ID_LEN))).toBe('a'.repeat(MAX_ACTIVITY_CASE_ID_LEN));
  });
});

/* ------------------------------------------------------------------ *
 * assembleActivityEvents — M7 per-case filter (additive, read-only)
 * ------------------------------------------------------------------ */

describe('assembleActivityEvents — caseId filter (M7 Priority D)', () => {
  it('narrows review decisions with a parameterized $caseId and reads nothing else', async () => {
    const { session, reads } = buildFakeSession({
      decisions: [DECISION_REVIEW_NEEDED], // caseId claim-A
      notices: [NOTICE_RETRACTION],
      runs: [RUN_COMPLETED],
    });
    const events = await assembleActivityEvents(session, { caseId: 'claim-A' });

    // Only the review decision recorded against this case, and only one
    // graph read (notices/runs are not case-scoped — they are never
    // laundered into case events).
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'review_decision', targetId: 'claim-A' });
    expect(reads).toHaveLength(1);
    const { cypher, params } = reads[0];
    expect(cypher).toContain('$caseId');
    expect(cypher).toContain('WHERE d.caseId = $caseId');
    expect(cypher).not.toContain("'claim-A'");
    expect(cypher).not.toMatch(/['"]/); // no inline literals
    expect(() => assertParameterized(cypher, params)).not.toThrow();
    expect(params).toEqual({ caseId: 'claim-A' });
  });

  it('returns an empty array (honest) when the case has no recorded decisions', async () => {
    const { session } = buildFakeSession({ decisions: [] });
    const events = await assembleActivityEvents(session, { caseId: 'claim-A' });
    expect(events).toEqual([]);
  });

  it('decisions recorded against other cases drop out of the filtered view', async () => {
    const { session } = buildFakeSession({ decisions: [DECISION_NOT_AFFECTED] }); // conclusion-C
    const events = await assembleActivityEvents(session, { caseId: 'claim-A' });
    expect(events).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * createActivityHandler — HTTP level
 * ------------------------------------------------------------------ */

describe('createActivityHandler — HTTP', () => {
  it('returns 200 with the assembled event array as JSON', async () => {
    const { session } = buildFakeSession({ decisions: [DECISION_REVIEW_NEEDED] });
    const handler = createActivityHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      assemble: assembleActivityEvents,
    });

    const res = await handler(requestFor());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await jsonOf(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('dec-1');
    expect(body[0].type).toBe('review_decision');
  });

  it('returns 405 for non-GET methods with an Allow header', async () => {
    const handler = createActivityHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(buildFakeSession().session),
    });
    const res = await handler(requestFor('POST'));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('returns 503 when the graph backend is not configured and fabricates nothing', async () => {
    const handler = createActivityHandler({
      env: {}, // FALKORDB_GRAPH_NAME unset
      layer: buildFakeLayer(buildFakeSession().session),
    });
    const res = await handler(requestFor());
    expect(res.status).toBe(503);
    const body = await jsonOf(res);
    expect(body.error).toBe('graph-backend-not-configured');
    expect(body.message).toContain('Nothing was read');
  });

  it('returns 503 when the graph read fails and fabricates nothing', async () => {
    const { session } = buildFakeSession({ decisions: [DECISION_REVIEW_NEEDED], fail: true });
    const handler = createActivityHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      assemble: assembleActivityEvents,
    });
    const res = await handler(requestFor());
    expect(res.status).toBe(503);
    const body = await jsonOf(res);
    expect(body.error).toBe('graph-backend-unavailable');
    expect(body.message).toContain('Nothing was read or written');
    expect(body.message).toContain('no fabricated data');
  });

  it('returns 429 + Retry-After when the per-IP bucket is exhausted', async () => {
    const limiter = {
      check(key) {
        if (key === 'ip:203.0.113.10') return { allowed: false, retryAfterMs: 15_000 };
        return { allowed: true, retryAfterMs: 0 };
      },
    };
    const handler = createActivityHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(buildFakeSession().session),
      limiter,
    });
    const res = await handler(new Request('http://localhost/activity', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('15');
    const body = await jsonOf(res);
    expect(body.error).toBe('rate-limited');
  });

  it('does not consult the graph when the rate limit refuses the request', async () => {
    const reads = [];
    const session = {
      graphName: GRAPH_NAME,
      async roQuery(cypher) {
        reads.push({ cypher });
        return { data: [] };
      },
      async close() {},
    };
    const limiter = { check() { return { allowed: false, retryAfterMs: 100 }; } };
    const handler = createActivityHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      limiter,
    });
    const res = await handler(requestFor());
    expect(res.status).toBe(429);
    expect(reads).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * createActivityHandler — M7 caseId filter (HTTP level)
 * ------------------------------------------------------------------ */

describe('createActivityHandler — ?caseId= filter', () => {
  it('forwards a valid caseId to the assemble op and returns the filtered events', async () => {
    const received = [];
    const handler = createActivityHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(buildFakeSession().session),
      assemble: (session, options) => {
        received.push(options);
        return Promise.resolve([
          { id: 'dec-1', type: 'review_decision', action: 'revision_needed', timestamp: '2026-01-02T00:00:00.000Z' },
        ]);
      },
    });
    const res = await handler(new Request('http://localhost/activity?caseId=claim-A%20'));
    expect(res.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ caseId: 'claim-A' }); // normalized (spaces trimmed)
    const body = await jsonOf(res);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('dec-1');
  });

  it('no caseId param → the assemble op receives an undefined filter (full timeline)', async () => {
    const received = [];
    const handler = createActivityHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(buildFakeSession().session),
      assemble: (session, options) => {
        received.push(options);
        return Promise.resolve([]);
      },
    });
    const res = await handler(requestFor());
    expect(res.status).toBe(200);
    expect(received[0]).toEqual({ caseId: undefined });
  });

  it('returns 400 and reads nothing for a malformed caseId (charset)', async () => {
    const reads = [];
    const session = {
      graphName: GRAPH_NAME,
      async roQuery(cypher) {
        reads.push(cypher);
        return { data: [] };
      },
      async close() {},
    };
    const handler = createActivityHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
    });
    for (const bad of ['claim%20A', 'claim;A', '../probe', 'a+b']) {
      const res = await handler(new Request(`http://localhost/activity?caseId=${bad}`));
      expect(res.status).toBe(400);
      const body = await jsonOf(res);
      expect(body.error).toBe('invalid-request');
    }
    expect(reads).toHaveLength(0); // validated before any graph I/O
  });

  it('returns 400 for an oversized caseId before any graph I/O', async () => {
    let consulted = false;
    const session = {
      graphName: GRAPH_NAME,
      async roQuery() {
        consulted = true;
        return { data: [] };
      },
      async close() {},
    };
    const handler = createActivityHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
    });
    const res = await handler(new Request(`http://localhost/activity?caseId=${'a'.repeat(101)}`));
    expect(res.status).toBe(400);
    expect(consulted).toBe(false);
  });
});
