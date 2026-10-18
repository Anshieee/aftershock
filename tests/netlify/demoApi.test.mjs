/**
 * Unit tests for server/demoApi.mjs — the M3 Netlify-function support layer.
 * Pure, credential-free: rate limiter math, serial queue, constant-time secret
 * comparison, error mapping (never fabricates success), wire-shape mappers,
 * and the scripted read helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  DeadlineError,
  EDGES_LIMIT,
  NODE_DEPTH_ENUM,
  clientIpOf,
  createRateLimiter,
  createSerialQueue,
  demoGraphName,
  errorBodyFor,
  jsonResponse,
  neighborhoodIds,
  probeSeedState,
  readDocuments,
  readGraphRecords,
  safeSecretEqual,
  textBodyOf,
  toWireEdge,
  toWireNode,
  withDeadline,
} from '../../server/demoApi.mjs';
import { ConnectionError, CredentialsError, GraphQueryError } from '../../server/graphClient.mjs';
import { scriptedSession } from './_helpers.mjs';

describe('demoGraphName', () => {
  it('resolves the graph name from the env seam only — never a hardcoded fallback', () => {
    expect(demoGraphName({ FALKORDB_GRAPH_NAME: 'aftershock:demo-smoke' })).toBe('aftershock:demo-smoke');
    expect(demoGraphName({ FALKORDB_GRAPH_NAME: '  g  ' })).toBe('g');
    expect(demoGraphName({})).toBeNull();
    expect(demoGraphName({ FALKORDB_GRAPH_NAME: '   ' })).toBeNull();
    expect(demoGraphName({ FALKORDB_GRAPH_NAME: undefined })).toBeNull();
  });
});

describe('clientIpOf', () => {
  it('prefers the Netlify header, then x-forwarded-for, then unknown', () => {
    const nf = new Request('http://x/', { headers: { 'x-nf-client-connection-ip': '203.0.113.9' } });
    expect(clientIpOf(nf)).toBe('203.0.113.9');
    const xff = new Request('http://x/', { headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' } });
    expect(clientIpOf(xff)).toBe('198.51.100.7');
    expect(clientIpOf(new Request('http://x/'))).toBe('unknown');
  });
});

describe('jsonResponse', () => {
  it('emits charset-bound JSON with no-store (dynamic truth data)', async () => {
    const res = jsonResponse(200, { ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('textBodyOf', () => {
  it('reads the body text; unreadable bodies become a non-empty sentinel (rejected by bodyless guards)', async () => {
    expect(await textBodyOf(new Request('http://x/', { method: 'POST', body: '{"x":1}' }))).toBe('{"x":1}');
    const broken = /** @type {any} */ ({ text: async () => { throw new Error('boom'); } });
    expect(await textBodyOf(broken)).toBe('unreadable');
  });
});

describe('withDeadline', () => {
  it('passes results through when the run beats the deadline', async () => {
    await expect(withDeadline(500, async () => 'value')).resolves.toBe('value');
  });

  it('rejects with DeadlineError (never a fabricated result) when the deadline wins', async () => {
    const err = /** @type {DeadlineError} */ (
      await withDeadline(10, () => new Promise(() => {})).catch((e) => e)
    );
    expect(err).toBeInstanceOf(DeadlineError);
    expect(err.message).toContain('10 ms');
  });
});

describe('errorBodyFor — truthful status mapping', () => {
  it('maps CredentialsError to 503 graph-backend-not-configured', () => {
    const { status, body } = errorBodyFor(new CredentialsError('x'));
    expect(status).toBe(503);
    expect(body.error).toBe('graph-backend-not-configured');
  });

  it('maps ConnectionError / GraphQueryError / DeadlineError to 503 graph-backend-unavailable', () => {
    for (const err of [new ConnectionError('x'), new GraphQueryError('g', 'MATCH (n)', new Error('x')), new DeadlineError(1)]) {
      const { status, body } = errorBodyFor(err);
      expect(status).toBe(503);
      expect(body.error).toBe('graph-backend-unavailable');
    }
  });

  it('renames the 503 code to seed-failed when the failure happened while writing', () => {
    const { status, body } = errorBodyFor(new ConnectionError('x'), 'seed');
    expect(status).toBe(503);
    expect(body.error).toBe('seed-failed');
  });

  it('maps unknown errors to 500 internal-error and never echoes error text', () => {
    const { status, body } = errorBodyFor(new Error('super-secret-detail'));
    expect(status).toBe(500);
    expect(body.error).toBe('internal-error');
    expect(JSON.stringify(body).includes('super-secret-detail')).toBe(false);
  });
});

describe('createRateLimiter', () => {
  it('enforces the per-IP cooldown with an honest retryAfterMs', () => {
    const limiter = createRateLimiter({ cooldownMs: 30_000, windowMs: 600_000, maxPerWindow: 5 });
    expect(limiter.check('ip', 0).allowed).toBe(true);
    const denied = limiter.check('ip', 1);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(29_999);
    expect(limiter.check('ip', 29_999).allowed).toBe(false);
    expect(limiter.check('ip', 30_000).allowed).toBe(true);
  });

  it('enforces the window cap and recovers when the window slides out', () => {
    const limiter = createRateLimiter({ cooldownMs: 0, windowMs: 600_000, maxPerWindow: 2 });
    expect(limiter.check('ip', 0).allowed).toBe(true);
    expect(limiter.check('ip', 1).allowed).toBe(true);
    const denied = limiter.check('ip', 2);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(600_000 - 2); // window slides from the FIRST recorded run
    // Refused runs are not recorded: still capped at the same window edge.
    expect(limiter.check('ip', 3).allowed).toBe(false);
    expect(limiter.check('ip', 600_001).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = createRateLimiter({ cooldownMs: 30_000, windowMs: 600_000, maxPerWindow: 5 });
    expect(limiter.check('a', 0).allowed).toBe(true);
    expect(limiter.check('b', 0).allowed).toBe(true);
    expect(limiter.check('a', 1).allowed).toBe(false);
  });

  it('reset() forgets all recorded runs (tests only)', () => {
    const limiter = createRateLimiter({ cooldownMs: 30_000, windowMs: 600_000, maxPerWindow: 5 });
    limiter.check('a', 0);
    limiter.reset();
    expect(limiter.check('a', 0).allowed).toBe(true);
  });
});

describe('createSerialQueue', () => {
  it('serializes tasks in submission order; a rejection never breaks the chain', async () => {
    const enqueue = createSerialQueue();
    const order = [];
    const slow = enqueue(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('slow');
      return 'slow';
    });
    const failing = enqueue(async () => {
      order.push('fail');
      throw new Error('boom');
    });
    const third = enqueue(async () => {
      order.push('third');
      return 'third';
    });
    await expect(slow).resolves.toBe('slow');
    await expect(failing).rejects.toThrow('boom');
    await expect(third).resolves.toBe('third');
    expect(order).toEqual(['slow', 'fail', 'third']);
  });
});

describe('safeSecretEqual — constant-time comparison', () => {
  it('accepts only an exact match against a configured secret', () => {
    expect(safeSecretEqual('right', 'right')).toBe(true);
    expect(safeSecretEqual('wrong', 'right')).toBe(false);
    expect(safeSecretEqual('right ', 'right')).toBe(false);
  });

  it('never throws on length mismatch and refuses unconfigured/typed-bad inputs', () => {
    expect(safeSecretEqual('a', 'a-very-different-length-secret')).toBe(false);
    expect(safeSecretEqual('x', undefined)).toBe(false);
    expect(safeSecretEqual('x', '')).toBe(false);
    expect(safeSecretEqual(/** @type {any} */ (123), 'x')).toBe(false);
  });
});

describe('toWireNode — flat node shape mirroring the deployed client', () => {
  it('strips server-internal flags and keeps all display fields top-level', () => {
    const wire = toWireNode({
      id: 'doc-demo-manuscript',
      kind: 'ResearchDocument',
      primaryLabel: 'ResearchDocument',
      seeded: true,
      title: 'Guided demo manuscript',
      isSynthetic: true,
      syntheticLabel: 'FICTIONAL / GUIDED DEMO',
    });
    expect(wire).toEqual({
      id: 'doc-demo-manuscript',
      kind: 'ResearchDocument',
      title: 'Guided demo manuscript',
      isSynthetic: true,
      syntheticLabel: 'FICTIONAL / GUIDED DEMO',
    });
  });

  it('falls back to primaryLabel (then Unknown) when kind is missing', () => {
    expect(toWireNode({ id: 'n', primaryLabel: 'Publication', seeded: true }).kind).toBe('Publication');
    expect(toWireNode({ id: 'n', seeded: true }).kind).toBe('Unknown');
  });
});

describe('toWireEdge — type/fromId/toId are ALWAYS emitted (client drops edges without them)', () => {
  it('promotes contract provenance fields and parks the rest in properties', () => {
    const wire = toWireEdge({
      type: 'CITES',
      fromId: 'claim-A',
      toId: 'pub-mehra-2020',
      props: {
        id: 'cu-A-supporting-edge',
        seeded: true,
        provenanceKind: 'observed',
        rationale: 'direct supporting citation',
        sourcePointer: 'fixture#cu-A-supporting',
        reviewState: 'none',
        createdAt: '2026-10-18T00:00:00.000Z',
      },
    });
    expect(wire.type).toBe('CITES');
    expect(wire.fromId).toBe('claim-A');
    expect(wire.toId).toBe('pub-mehra-2020');
    expect(wire.id).toBe('cu-A-supporting-edge');
    expect(wire.provenanceKind).toBe('observed');
    expect(wire.rationale).toBe('direct supporting citation');
    expect(wire.sourcePointer).toBe('fixture#cu-A-supporting');
    expect(wire.reviewState).toBe('none');
    expect(wire.properties).toEqual({ createdAt: '2026-10-18T00:00:00.000Z' });
  });

  it('still emits type/fromId/toId for a bare edge row', () => {
    const wire = toWireEdge({ type: 'RELATES', fromId: 'a', toId: 'b', props: {} });
    expect(wire).toEqual({ type: 'RELATES', fromId: 'a', toId: 'b', properties: {} });
  });
});

describe('probeSeedState (real helper over a scripted session)', () => {
  it('reports a truthful unseeded state without reading meta', async () => {
    const session = scriptedSession({ exists: false });
    await expect(probeSeedState(session)).resolves.toEqual({ exists: false, seedVersion: null, nodeCount: null });
  });

  it('reports seeded state with version and seeded-node count only', async () => {
    const session = scriptedSession({
      nodeRows: [{ id: 'n1' }, { id: 'n2' }],
      edgeRows: [{ type: 'CITES', fromId: 'n1', toId: 'n2' }], // edges are NOT counted as nodes
    });
    const probe = await probeSeedState(session);
    expect(probe).toEqual({ exists: true, seedVersion: 'seed-1', nodeCount: 2 });
  });
});

describe('readGraphRecords (real helper over a scripted session)', () => {
  const nodeRows = [
    { id: 'a', kind: 'Claim', seeded: true, primaryLabel: 'Claim' },
    { id: 'b', kind: 'Publication', seeded: true, primaryLabel: 'Publication', isSynthetic: false },
  ];
  const edgeRows = [{ type: 'CITES', fromId: 'a', toId: 'b', props: { id: 'e1', provenanceKind: 'observed' } }];

  it('answers an honest empty overview for an unseeded graph', async () => {
    const session = scriptedSession({ exists: false });
    await expect(readGraphRecords(session, { limit: 40 })).resolves.toEqual({
      graphName: session.graphName,
      seedVersion: null,
      nodes: [],
      edges: [],
      truncated: false,
    });
  });

  it('maps stored rows into the wire shape and caps edges at limit', async () => {
    const session = scriptedSession({ nodeRows, edgeRows });
    const records = await readGraphRecords(session, { limit: EDGES_LIMIT.default });
    expect(records.seedVersion).toBe('seed-1');
    expect(records.nodes[0]).toEqual({ id: 'a', kind: 'Claim' });
    expect(records.edges[0].type).toBe('CITES');
    expect(records.edges[0].provenanceKind).toBe('observed');
    expect(records.truncated).toBe(false);
  });

  it('marks truncated honestly when the edge limit bites', async () => {
    const manyEdges = Array.from({ length: 5 }, (_, i) => ({
      type: 'CITES',
      fromId: 'a',
      toId: 'b',
      props: { id: `e${i}` },
    }));
    const session = scriptedSession({ nodeRows, edgeRows: manyEdges });
    const records = await readGraphRecords(session, { limit: 2 });
    expect(records.edges).toHaveLength(2);
    expect(records.truncated).toBe(true);
  });

  it('scopes to the node neighborhood and filters edges to surviving nodes', async () => {
    const wideNodes = [
      ...nodeRows,
      { id: 'c', kind: 'Dataset', seeded: true, primaryLabel: 'Dataset' },
    ];
    const wideEdges = [
      ...edgeRows,
      { type: 'DERIVES_FROM', fromId: 'b', toId: 'c', props: { id: 'e2' } }, // 'c' outside the a-neighborhood
    ];
    const session = scriptedSession({ nodeRows: wideNodes, edgeRows: wideEdges, neighborhood: ['a', 'b'] });
    const records = await readGraphRecords(session, { limit: 40, nodeId: 'a', depth: 2 });
    expect(records.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(records.edges.map((e) => e.type)).toEqual(['CITES']);
  });
});

describe('readDocuments (real helper over a scripted session)', () => {
  it('answers an honest empty list for an unseeded graph', async () => {
    const session = scriptedSession({ exists: false });
    await expect(readDocuments(session)).resolves.toEqual({ documents: [], seedVersion: null });
  });

  it('returns only Document rows with string ids, internal flags stripped', async () => {
    const session = scriptedSession({
      nodeRows: [
        { id: 'doc-demo-manuscript', kind: 'ResearchDocument', seeded: true, primaryLabel: 'ResearchDocument', isSynthetic: true },
        { kind: 'ResearchDocument', seeded: true, primaryLabel: 'ResearchDocument' }, // dropped: no id
      ],
    });
    const result = await readDocuments(session);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toEqual({
      id: 'doc-demo-manuscript',
      kind: 'ResearchDocument',
      isSynthetic: true,
    });
    expect(result.seedVersion).toBe('seed-1');
  });
});

describe('shared constants', () => {
  it('expose the wire limits the client-visible API documents', () => {
    expect(EDGES_LIMIT).toEqual({ min: 1, max: 200, default: 40 });
    expect(NODE_DEPTH_ENUM).toEqual([1, 2]);
  });

  it('neighborhoodIds refuses any depth outside the contract enum (defence in depth)', async () => {
    const session = scriptedSession({ neighborhood: ['b'] });
    await expect(neighborhoodIds(session, { nodeId: 'a', depth: /** @type {any} */ (3) })).rejects.toThrow(/depth in \{1, 2\}/);
    await expect(neighborhoodIds(session, { nodeId: 'a', depth: 2 })).resolves.toEqual(['a', 'b']);
  });
});
