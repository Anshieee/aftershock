/**
 * Unit tests: Wave 4 read-only independence groups (GET
 * /.netlify/functions/independence-groups) — op + handler.
 *
 * Test seam (per server/demoApi.mjs): `independenceGroups(session)` takes an
 * injected fake GraphSession; `createIndependenceGroupsHandler(deps)` takes an
 * injectable fake layer, scripted `compute` op and `limiter`. No real
 * database, no credentials, no ESM stubbing.
 *
 * Honesty focus (Wave-4 spec ≥8 cases): empty-graph zeros, single group,
 * multi-group ordering, singleton excluded from groups but counted, historical
 * role never feeds a group, rows lacking text/status stay honest, missing
 * publication id skips-with-summary, duplicate cu→claim rows dedupe.
 *
 * Run: `npx vitest run --config vitest.unit.config.js` from `server/`.
 */

import { describe, expect, it } from 'vitest';
import { assertParameterized, ConnectionError } from '../../graphClient.mjs';
import {
  INDEPENDENCE_CAVEAT,
  INDEPENDENCE_LIMITATIONS,
  SUPPORTING_ROLE,
  independenceGroups,
} from '../../independence.mjs';
import { createIndependenceGroupsHandler } from '../../../netlify/functions/independence-groups.mjs';

const GRAPH_NAME = 'test-graph';
const EXPECTED_CAVEAT = 'Claims appearing in the same group share a supporting publication record. '
  + 'Sharing a supporting record means the claims are not independent evidence for each other — '
  + 'review them together at the paper itself. This alone never changes any review state.';

/* ------------------------------------------------------------------ *
 * Test doubles: scripted fake session + layer
 * ------------------------------------------------------------------ */

/** One flat row as the Wave-4 Cypher returns it. */
function row({ publicationId, claimId, citationUseId, doi = null, title = null, isSynthetic = null, text = null, status = null }) {
  return {
    publicationId,
    pubDoi: doi,
    pubTitle: title,
    pubIsSynthetic: isSynthetic,
    claimId,
    claimText: text,
    claimStatus: status,
    supportProvenance: 'human_confirmed',
    supportAnalysisVersion: 'seed-1',
    citationUseId,
  };
}

/**
 * @param {{exists?: boolean, seedVersion?: string | null, rows?: Array<Record<string, unknown>>, fail?: boolean}} options
 */
function buildFakeSession({ exists = true, seedVersion = 'seed-1', rows = [], fail = false } = {}) {
  /** @type {Array<{cypher: string, params: Record<string, unknown>}>} */
  const reads = [];
  const session = {
    graphName: GRAPH_NAME,
    async graphExists() {
      return exists;
    },
    async roQuery(cypher, params) {
      reads.push({ cypher, params });
      if (fail) throw new ConnectionError('graph is down');
      if (cypher.includes('SeedMeta')) {
        return {
          data: seedVersion === null ? [] : [{ seedVersion, seededAt: null, fixtureId: null }],
        };
      }
      if (cypher.includes('CITATION_USE_SUPPORTS_CLAIM')) {
        return { data: rows };
      }
      throw new Error(`fake session received an unexpected query: ${cypher}`);
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
  return new Request('http://localhost/independence-groups', { method, headers });
}

/* ------------------------------------------------------------------ *
 * independenceGroups — op level
 * ------------------------------------------------------------------ */

describe('independenceGroups — honest empties and seed metadata', () => {
  it('returns all-zero summary + empty groups for an empty graph (nothing fabricated)', async () => {
    const { session, reads } = buildFakeSession({ rows: [] });
    const body = await independenceGroups(session);

    expect(body.graphName).toBe(GRAPH_NAME);
    expect(body.seeded).toBe(true);
    expect(body.seedVersion).toBe('seed-1');
    expect(body.summary).toEqual({
      supportingCitationUses: 0,
      publicationsSupportingClaims: 0,
      sharedGroups: 0,
    });
    expect(body.groups).toEqual([]);
    expect(body.caveat).toBe(EXPECTED_CAVEAT);
    expect(body.limitations).toEqual(INDEPENDENCE_LIMITATIONS);
    // Exactly one support traversal + one SeedMeta read; no writes anywhere.
    expect(reads).toHaveLength(2);
    expect(reads.every((r) => typeof r.cypher === 'string' && r.cypher.includes('MATCH'))).toBe(true);
  });

  it('reports seeded:false / seedVersion:null honestly for a nonexistent graph', async () => {
    const { session } = buildFakeSession({ exists: false });
    const body = await independenceGroups(session);
    expect(body).toEqual({
      graphName: GRAPH_NAME,
      seeded: false,
      seedVersion: null,
      summary: { supportingCitationUses: 0, publicationsSupportingClaims: 0, sharedGroups: 0 },
      groups: [],
      caveat: INDEPENDENCE_CAVEAT,
      limitations: INDEPENDENCE_LIMITATIONS,
    });
  });

  it('reports seeded:false when no SeedMeta row advertises a seedVersion', async () => {
    const { session } = buildFakeSession({ seedVersion: null });
    const body = await independenceGroups(session);
    expect(body.seeded).toBe(false);
    expect(body.seedVersion).toBe(null);
  });

  it('uses exactly one roQuery traversal guarded by assertParameterized + the supporting param', async () => {
    const { session, reads } = buildFakeSession({ rows: [] });
    await independenceGroups(session);
    const supportReads = reads.filter((r) => r.cypher.includes('CITATION_USE_SUPPORTS_CLAIM'));
    expect(supportReads).toHaveLength(1);
    const { cypher, params } = supportReads[0];
    // Relation-type discipline: ONLY the support edge + role filter feed groups.
    expect(cypher).toContain('CITATION_USE_SUPPORTS_CLAIM');
    expect(cypher).toContain('CITATION_USE_REFERENCES_PUBLICATION');
    expect(cypher).toContain('cu.role = $supporting');
    expect(params).toEqual({ supporting: SUPPORTING_ROLE });
    expect(cypher).not.toContain('MENTIONS_HISTORICALLY');
    expect(cypher).not.toContain('POSSIBLE_MATCH');
    expect(cypher).not.toContain('PROVENANCE_OF'); // spec: the notice leg is explicitly NOT in this traversal
    expect(() => assertParameterized(cypher, params)).not.toThrow();
  });

  it('propagates graph read failures (no fabricated groups)', async () => {
    const { session } = buildFakeSession({ rows: [row({ publicationId: 'pub-mehra-2020', claimId: 'claim-A', citationUseId: 'cu-A-supporting' })], fail: true });
    await expect(independenceGroups(session)).rejects.toThrow(ConnectionError);
  });
});

describe('independenceGroups — grouping semantics', () => {
  it('builds one shared group from two claims of the same publication', async () => {
    const { session } = buildFakeSession({
      rows: [
        row({
          publicationId: 'pub-mehra-2020', claimId: 'claim-A', citationUseId: 'cu-A-supporting',
          doi: '10.1016/S0140-6736(20)31180-6', title: 'Mehra et al. 2020', isSynthetic: false,
          text: 'Agent P-9 relied on the registry analysis.', status: 'awaiting_review',
        }),
        row({
          publicationId: 'pub-mehra-2020', claimId: 'claim-D', citationUseId: 'cu-D-supporting',
          doi: '10.1016/S0140-6736(20)31180-6', title: 'Mehra et al. 2020', isSynthetic: false,
          text: null, status: null,
        }),
      ],
    });
    const body = await independenceGroups(session);

    expect(body.summary).toEqual({
      supportingCitationUses: 2,
      publicationsSupportingClaims: 1,
      sharedGroups: 1,
    });
    expect(body.groups).toHaveLength(1);
    const group = body.groups[0];
    expect(group.publication).toEqual({
      id: 'pub-mehra-2020',
      doi: '10.1016/S0140-6736(20)31180-6',
      title: 'Mehra et al. 2020',
      isSynthetic: false,
    });
    expect(group.claimCount).toBe(2);
    expect(group.citationUseIds).toEqual(['cu-A-supporting', 'cu-D-supporting']);
    // Honest field carry-through: text/status may legitimately be null.
    expect(group.claims).toEqual([
      { id: 'claim-A', text: 'Agent P-9 relied on the registry analysis.', status: 'awaiting_review' },
      { id: 'claim-D', text: null, status: null },
    ]);
  });

  it('excludes singletons from groups but keeps them visible in the summary', async () => {
    const { session } = buildFakeSession({
      rows: [
        row({ publicationId: 'pub-a', claimId: 'claim-A', citationUseId: 'cu-1' }),
        row({ publicationId: 'pub-b', claimId: 'claim-A', citationUseId: 'cu-2' }),
      ],
    });
    const body = await independenceGroups(session);
    expect(body.groups).toEqual([]);
    expect(body.summary).toEqual({
      supportingCitationUses: 2,
      publicationsSupportingClaims: 2,
      sharedGroups: 0,
    });
  });

  it('orders multi-group output by publicationId (query ORDER BY carries through)', async () => {
    const { session } = buildFakeSession({
      rows: [
        row({ publicationId: 'pub-alpha', claimId: 'claim-1', citationUseId: 'cu-1' }),
        row({ publicationId: 'pub-alpha', claimId: 'claim-2', citationUseId: 'cu-2' }),
        row({ publicationId: 'pub-beta', claimId: 'claim-3', citationUseId: 'cu-3' }),
        row({ publicationId: 'pub-beta', claimId: 'claim-4', citationUseId: 'cu-4' }),
        row({ publicationId: 'pub-zulu', claimId: 'claim-5', citationUseId: 'cu-5' }), // singleton
      ],
    });
    const body = await independenceGroups(session);
    expect(body.groups.map((g) => g.publication.id)).toEqual(['pub-alpha', 'pub-beta']);
    expect(body.summary).toEqual({
      supportingCitationUses: 5,
      publicationsSupportingClaims: 3,
      sharedGroups: 2,
    });
    expect(body.groups[0].claims.map((c) => c.id)).toEqual(['claim-1', 'claim-2']);
  });

  it('keeps claims distinct: two citation uses supporting ONE claim are a singleton', async () => {
    const { session } = buildFakeSession({
      rows: [
        row({ publicationId: 'pub-mehra-2020', claimId: 'claim-A', citationUseId: 'cu-1' }),
        row({ publicationId: 'pub-mehra-2020', claimId: 'claim-A', citationUseId: 'cu-2' }),
      ],
    });
    const body = await independenceGroups(session);
    expect(body.summary).toEqual({
      supportingCitationUses: 2,
      publicationsSupportingClaims: 1,
      sharedGroups: 0,
    });
    expect(body.groups).toEqual([]);
  });

  it('feeds groups exclusively from supporting uses — history never contributes by construction', async () => {
    // Roles are enforced ONLY via `cu.role = $supporting` in the traversal —
    // a historical use (cu-B-historical / MENTIONS_HISTORICALLY) can never be
    // part of these rows, so a group is fed exclusively by supporting uses.
    const { session, reads } = buildFakeSession({
      rows: [
        row({ publicationId: 'pub-mehra-2020', claimId: 'claim-A', citationUseId: 'cu-A-supporting' }),
        row({ publicationId: 'pub-mehra-2020', claimId: 'claim-D', citationUseId: 'cu-D-supporting' }),
      ],
    });
    const body = await independenceGroups(session);
    const supportCypher = reads.find((r) => r.cypher.includes('CITATION_USE_SUPPORTS_CLAIM')).cypher;
    expect(supportCypher).toContain('cu.role = $supporting');
    expect(supportCypher).not.toContain('MENTIONS_HISTORICALLY');
    expect(body.summary.sharedGroups).toBe(1);
  });

  it('omits null bookkeeping members honestly and never pads claim fields', async () => {
    const { session } = buildFakeSession({
      rows: [
        row({ publicationId: 'pub-real', claimId: 'claim-1', citationUseId: 'cu-1' }),
        row({ publicationId: 'pub-real', claimId: 'claim-2', citationUseId: 'cu-2', text: '', status: undefined }),
      ],
    });
    const body = await independenceGroups(session);
    const group = body.groups[0];
    // Publication meta may be null when the graph does not store it.
    expect(group.publication).toEqual({ id: 'pub-real', doi: null, title: null, isSynthetic: null });
    expect(group.claims[1]).toEqual({ id: 'claim-2', text: null, status: null });
  });

  it('skips rows without a usable publication id but still counts the support link in the summary', async () => {
    const { session } = buildFakeSession({
      rows: [
        row({ publicationId: null, claimId: 'claim-x', citationUseId: 'cu-orphan' }),
        row({ publicationId: 'pub-a', claimId: 'claim-A', citationUseId: 'cu-1' }),
        row({ publicationId: 'pub-a', claimId: 'claim-A', citationUseId: 'cu-1' }), // duplicate row — deduped
        row({ publicationId: 'pub-a', claimId: 'claim-B', citationUseId: 'cu-2' }),
      ],
    });
    const body = await independenceGroups(session);
    expect(body.summary).toEqual({
      supportingCitationUses: 3, // orphan link counted + 2 surviving distinct pub-a links
      publicationsSupportingClaims: 1,
      sharedGroups: 1,
    });
    expect(body.groups[0].claims.map((c) => c.id)).toEqual(['claim-A', 'claim-B']);
    expect(body.groups[0].claims.some((c) => c.id === 'claim-x')).toBe(false);
  });
});

describe('INDEPENDENCE_* constants — verbatim honesty strings', () => {
  it('carries the standing caveat exactly (never paraphrased server-side)', () => {
    expect(INDEPENDENCE_CAVEAT).toBe(EXPECTED_CAVEAT);
  });

  it('carries the honest v1 limitations scope', () => {
    expect(INDEPENDENCE_LIMITATIONS).toEqual([
      'Only same-publication sharing is detected in this tier; shared datasets, analyses, or review trees are not detected (Find Evidence responses disclose the same limitation).',
      'Historical mentions never contribute to these groups; only supporting citation uses do.',
    ]);
    expect(Object.isFrozen(INDEPENDENCE_LIMITATIONS)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * createIndependenceGroupsHandler — HTTP level
 * ------------------------------------------------------------------ */

describe('createIndependenceGroupsHandler — HTTP', () => {
  it('returns 200 with the full body on a supported graph', async () => {
    const { session } = buildFakeSession({
      rows: [
        row({ publicationId: 'pub-mehra-2020', claimId: 'claim-A', citationUseId: 'cu-A-supporting', isSynthetic: false }),
        row({ publicationId: 'pub-mehra-2020', claimId: 'claim-D', citationUseId: 'cu-D-supporting', isSynthetic: false }),
      ],
    });
    const handler = createIndependenceGroupsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      compute: independenceGroups,
    });

    const res = await handler(requestFor());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.seeded).toBe(true);
    expect(body.groups).toHaveLength(1);
    expect(body.summary.sharedGroups).toBe(1);
    expect(body.groups[0].publication.isSynthetic).toBe(false);
  });

  it('returns 405 for non-GET methods with an Allow header', async () => {
    const handler = createIndependenceGroupsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(buildFakeSession().session),
    });
    const res = await handler(requestFor('POST'));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('returns 503 when the graph backend is not configured and fabricates nothing', async () => {
    const handler = createIndependenceGroupsHandler({
      env: {}, // FALKORDB_GRAPH_NAME unset
      layer: buildFakeLayer(buildFakeSession().session),
    });
    const res = await handler(requestFor());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('graph-backend-not-configured');
    expect(body.message).toContain('Nothing was read');
  });

  it('returns 503 when the graph read fails and fabricates nothing', async () => {
    const { session } = buildFakeSession({ rows: [row({ publicationId: 'pub-a', claimId: 'claim-A', citationUseId: 'cu-1' })], fail: true });
    const handler = createIndependenceGroupsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      compute: independenceGroups,
    });
    const res = await handler(requestFor());
    expect(res.status).toBe(503);
    const body = await res.json();
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
    const handler = createIndependenceGroupsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(buildFakeSession().session),
      limiter,
    });
    const res = await handler(new Request('http://localhost/independence-groups', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('15');
    const body = await res.json();
    expect(body.error).toBe('rate-limited');
  });

  it('does not consult the graph when the rate limit refuses the request', async () => {
    const reads = [];
    const session = {
      graphName: GRAPH_NAME,
      async graphExists() {
        reads.push('exists');
        return true;
      },
      async roQuery(cypher) {
        reads.push(cypher);
        return { data: [] };
      },
      async close() {},
    };
    const limiter = { check() { return { allowed: false, retryAfterMs: 100 }; } };
    const handler = createIndependenceGroupsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      limiter,
    });
    const res = await handler(requestFor());
    expect(res.status).toBe(429);
    expect(reads).toHaveLength(0);
  });
});
