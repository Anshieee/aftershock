/**
 * Unit tests: `GET /documents-imported` — user-imported (non-seeded)
 * documents read from the graph.
 *
 * Test seam (per server/demoApi.mjs): `readDocuments(session, { seeded })`
 * takes an injected fake GraphSession; `createImportedDocumentsHandler(deps)`
 * takes an injectable fake layer, scripted `readDocuments` op and `limiter`.
 * No real database, no credentials, no ESM stubbing.
 *
 * Run: `npx vitest run --config vitest.unit.config.js` from `server/`.
 */

import { describe, expect, it } from 'vitest';
import { assertParameterized, ConnectionError } from '../../graphClient.mjs';
import { readDocuments } from '../../demoApi.mjs';
import { createImportedDocumentsHandler } from '../../../netlify/functions/documents-imported.mjs';

const GRAPH_NAME = 'test-graph';

const SEeded_DOC = {
  id: 'doc-demo-manuscript',
  title: 'Guided Demo Manuscript',
  fileName: 'demo.pdf',
  format: 'pdf',
  sizeBytes: 12345,
  importedAt: '2026-01-01T00:00:00.000Z',
  versionId: 'ver-demo-manuscript-v1',
  provenanceKind: 'observed',
  analysisVersion: 'seed-1',
  seeded: true,
  isSynthetic: true,
  syntheticLabel: 'FICTIONAL / GUIDED DEMO',
};

const IMPORTED_DOC = {
  id: 'doc-imported-1',
  title: 'Real User Manuscript',
  fileName: 'my-research.pdf',
  format: 'pdf',
  sizeBytes: 98765,
  importedAt: '2026-03-01T00:00:00.000Z',
  versionId: 'ver-imported-1-v1',
  provenanceKind: 'human_confirmed',
  analysisVersion: 'seed-1',
  seeded: false,
  isSynthetic: false,
};

const IMPORTED_DOC_2 = {
  id: 'doc-imported-2',
  title: 'Another User Manuscript',
  fileName: 'notes.txt',
  format: 'txt',
  sizeBytes: 1000,
  importedAt: '2026-03-02T00:00:00.000Z',
  versionId: 'ver-imported-2-v1',
  provenanceKind: 'human_confirmed',
  analysisVersion: 'seed-1',
  seeded: false,
  isSynthetic: false,
};

/** Legacy M4 import: `seeded` property ABSENT (ghost node — regresses to true). */
const LEGACY_GHOST_DOC = {
  id: 'doc-imported-legacy',
  title: 'Legacy Import (no seeded stamp)',
  fileName: 'legacy.pdf',
  format: 'pdf',
  sizeBytes: 2048,
  importedAt: '2026-02-01T00:00:00.000Z',
  versionId: 'ver-imported-legacy-v1',
  provenanceKind: 'human_confirmed',
  analysisVersion: 'seed-1',
  isSynthetic: false,
};

/* ------------------------------------------------------------------ *
 * Test doubles: scripted fake session + layer
 * ------------------------------------------------------------------ */

/**
 * @param {{documents?: Array<Record<string, unknown>>, fail?: boolean}} options
 */
function buildFakeSession({ documents = [], fail = false } = {}) {
  const reads = [];
  const session = {
    graphName: GRAPH_NAME,
    async graphExists() {
      return true;
    },
    async roQuery(cypher, params) {
      reads.push({ cypher, params });
      if (fail) throw new ConnectionError('graph is down');
      const seeded = params.seeded;
      // Mirror readDocuments' actual query semantics: coalesce(n.seeded,false)
      // buckets "absent property" together with "explicitly false" (legacy
      // ghost imports must resolve in the imported cohort). The bounded count
      // query answers with the honest total; the list query honors LIMIT.
      const cohort = documents.filter((d) => /** @type {boolean} */ ((d.seeded ?? false)) === seeded);
      if (cypher.includes('count(n) AS c')) {
        return { data: [{ c: cohort.length }] };
      }
      const limited = typeof params.limit === 'number' ? cohort.slice(0, params.limit) : cohort;
      return { data: limited.map((d) => ({ row: d })) };
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
  return new Request('http://localhost/documents-imported', { method, headers });
}

async function jsonOf(response) {
  return response.json();
}

/* ------------------------------------------------------------------ *
 * readDocuments — op level
 * ------------------------------------------------------------------ */

describe('readDocuments — seeded filter', () => {
  it('returns only seeded documents when seeded=true (default behavior preserved)', async () => {
    const { session, reads } = buildFakeSession({
      documents: [SEeded_DOC, IMPORTED_DOC],
    });
    const result = await readDocuments(session, { seeded: true });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('doc-demo-manuscript');
    expect(result.documents[0].isSynthetic).toBe(true);
    expect(result.seedVersion).toBeNull();

    // readSeedMeta + the documents query = 2 reads; the documents query
    // passes seeded=true as a parameter.
    expect(reads).toHaveLength(2);
    const docsRead = reads[reads.length - 1];
    expect(docsRead.params.seeded).toBe(true);
    for (const { cypher, params } of reads) {
      expect(cypher).not.toMatch(/['"]/);
      expect(() => assertParameterized(cypher, params ?? {})).not.toThrow();
    }
  });

  it('defaults to seeded=true when no options argument is passed', async () => {
    const { session, reads } = buildFakeSession({
      documents: [SEeded_DOC, IMPORTED_DOC],
    });
    const result = await readDocuments(session);

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('doc-demo-manuscript');
    const docsRead = reads[reads.length - 1];
    expect(docsRead.params.seeded).toBe(true);
    expect(reads).toHaveLength(2);
  });

  it('returns only non-seeded (user-imported) documents when seeded=false', async () => {
    const { session, reads } = buildFakeSession({
      documents: [SEeded_DOC, IMPORTED_DOC, IMPORTED_DOC_2],
    });
    const result = await readDocuments(session, { seeded: false });

    expect(result.documents).toHaveLength(2);
    const ids = result.documents.map((d) => d.id).sort();
    expect(ids).toEqual(['doc-imported-1', 'doc-imported-2']);
    for (const doc of result.documents) {
      // `seeded` is an internal key stripped by toWireNode (never surfaces
      // in wire payloads); isSynthetic stays and marks real user content.
      expect(doc.isSynthetic).toBe(false);
    }

    // The query param flows through and is parameterized.
    const docsRead = reads[reads.length - 1];
    expect(docsRead.params.seeded).toBe(false);
    expect(docsRead.cypher).not.toMatch(/['"]/);
    expect(() => assertParameterized(docsRead.cypher, docsRead.params ?? {})).not.toThrow();
  });

  it('returns an empty array when no documents match — nothing fabricated', async () => {
    const { session } = buildFakeSession({ documents: [SEeded_DOC] });
    const result = await readDocuments(session, { seeded: false });
    expect(result.documents).toEqual([]);
  });

  it('resolves LEGACY imports whose seeded property is absent in the imported cohort (regression)', async () => {
    // Regression for the production drift: M4-era registrations carried no
    // `seeded` property, and openCypher `n.seeded = false` skips absent
    // properties — user imports were invisible to BOTH read cohorts. The
    // coalesce bucket treats absent as false.
    const { session, reads } = buildFakeSession({
      documents: [SEeded_DOC, IMPORTED_DOC, LEGACY_GHOST_DOC],
    });
    const imported = await readDocuments(session, { seeded: false });
    expect(imported.documents.map((d) => d.id)).toEqual(['doc-imported-1', 'doc-imported-legacy']);
    // The seeded cohort never includes the ghost.
    const seededCohort = await readDocuments(session, { seeded: true });
    expect(seededCohort.documents.map((d) => d.id)).toEqual(['doc-demo-manuscript']);
    for (const { cypher, params } of reads) {
      expect(() => assertParameterized(cypher, params ?? {})).not.toThrow();
    }
  });

  it('returns an empty array and seedVersion null when the graph does not exist', async () => {
    const session = {
      graphName: GRAPH_NAME,
      async graphExists() {
        return false;
      },
      async roQuery() {
        throw new Error('roQuery must not be called when the graph does not exist');
      },
      async close() {},
    };
    const result = await readDocuments(session, { seeded: false });
    expect(result.documents).toEqual([]);
    expect(result.seedVersion).toBeNull();
  });

  it('propagates graph read failures — no fabricated documents', async () => {
    const { session } = buildFakeSession({ documents: [IMPORTED_DOC], fail: true });
    await expect(readDocuments(session, { seeded: false })).rejects.toThrow(ConnectionError);
  });

  describe('bounded imported-cohort read (bounded: true)', () => {
    it('caps the list at IMPORTED_DOCUMENTS_LIMIT and discloses the honest total + truncation', async () => {
      const many = Array.from({ length: 25 }, (_, i) => ({
        ...IMPORTED_DOC,
        id: `doc-imported-${i}`,
        importedAt: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      }));
      const { session, reads } = buildFakeSession({ documents: [...many, SEeded_DOC] });
      const result = await readDocuments(session, { seeded: false, bounded: true });
      expect(result.documents).toHaveLength(20);
      expect(result.importedTotal).toBe(25); // cohort-only count (seeded doc excluded)
      expect(result.truncated).toBe(true);
      expect(result.seedVersion).toBeNull(); // no SeedMeta node in this fake
      // 3 reads: meta + bounded list + honest cohort count.
      expect(reads).toHaveLength(3);
      const listRead = reads[1];
      expect(listRead.params.limit).toBe(20);
      expect(listRead.params.seeded).toBe(false);
      expect(listRead.cypher).toContain('ORDER BY n.importedAt DESC');
      expect(listRead.cypher).toContain('coalesce(n.seeded, false)');
      const countRead = reads[2];
      expect(countRead.params).toEqual({ seeded: false });
      for (const { cypher, params } of reads) {
        expect(() => assertParameterized(cypher, params ?? {})).not.toThrow();
      }
    });

    it('reports truncated:false and the real total when the cohort fits the cap', async () => {
      const { session, reads } = buildFakeSession({ documents: [IMPORTED_DOC, LEGACY_GHOST_DOC] });
      const result = await readDocuments(session, { seeded: false, bounded: true });
      expect(result.documents).toHaveLength(2);
      expect(result.importedTotal).toBe(2);
      expect(result.truncated).toBe(false);
      expect(reads).toHaveLength(3);
    });

    it('returns honest zero bounds for an empty cohort', async () => {
      const { session } = buildFakeSession({ documents: [SEeded_DOC] });
      const result = await readDocuments(session, { seeded: false, bounded: true });
      expect(result.documents).toEqual([]);
      expect(result.importedTotal).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('returns honest zero bounds when the graph does not exist (bounded mode)', async () => {
      const session = {
        graphName: GRAPH_NAME,
        async graphExists() {
          return false;
        },
        async roQuery() {
          throw new Error('roQuery must not be called when the graph does not exist');
        },
        async close() {},
      };
      const result = await readDocuments(session, { seeded: false, bounded: true });
      expect(result).toEqual({ documents: [], seedVersion: null, importedTotal: 0, truncated: false });
    });
  });
});

/* ------------------------------------------------------------------ *
 * createImportedDocumentsHandler — HTTP level
 * ------------------------------------------------------------------ */

describe('createImportedDocumentsHandler — HTTP', () => {
  it('returns 200 with the imported document list as JSON', async () => {
    const { session } = buildFakeSession({ documents: [IMPORTED_DOC] });
    const handler = createImportedDocumentsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      readDocuments,
    });

    const res = await handler(requestFor());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await jsonOf(res);
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].id).toBe('doc-imported-1');
    expect(body.documents[0].isSynthetic).toBe(false);
    // Honest bounds travel with the list (never a silently-cut complete list).
    expect(body.importedTotal).toBe(1);
    expect(body.truncated).toBe(false);
  });

  it('surfaces the honest bound envelope when the cohort exceeds the cap', async () => {
    const many = Array.from({ length: 23 }, (_, i) => ({
      ...IMPORTED_DOC,
      id: `doc-imported-bulk-${i}`,
    }));
    const { session } = buildFakeSession({ documents: many });
    const handler = createImportedDocumentsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      readDocuments,
    });
    const res = await handler(requestFor());
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.documents).toHaveLength(20);
    expect(body.importedTotal).toBe(23);
    expect(body.truncated).toBe(true);
  });

  it('returns 405 for non-GET methods with an Allow header', async () => {
    const handler = createImportedDocumentsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(buildFakeSession().session),
      readDocuments,
    });
    const res = await handler(requestFor('POST'));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('returns 503 when the graph backend is not configured and fabricates nothing', async () => {
    const handler = createImportedDocumentsHandler({
      env: {}, // FALKORDB_GRAPH_NAME unset
      layer: buildFakeLayer(buildFakeSession().session),
      readDocuments,
    });
    const res = await handler(requestFor());
    expect(res.status).toBe(503);
    const body = await jsonOf(res);
    expect(body.error).toBe('graph-backend-not-configured');
    expect(body.message).toContain('Nothing was read');
  });

  it('returns 503 when the graph read fails and fabricates nothing', async () => {
    const { session } = buildFakeSession({ documents: [IMPORTED_DOC], fail: true });
    const handler = createImportedDocumentsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      readDocuments,
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
    const handler = createImportedDocumentsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(buildFakeSession().session),
      readDocuments,
      limiter,
    });
    const res = await handler(new Request('http://localhost/documents-imported', {
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
    const handler = createImportedDocumentsHandler({
      env: envWithGraph(),
      layer: buildFakeLayer(session),
      readDocuments,
      limiter,
    });
    const res = await handler(requestFor());
    expect(res.status).toBe(429);
    expect(reads).toHaveLength(0);
  });
});
