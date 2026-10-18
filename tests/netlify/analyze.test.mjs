/**
 * Unit tests for the POST /analyze handler (M4). Guards + honesty: POST-only,
 * JSON body {documentVersionId}, unknown version → 404, contentless version →
 * honest 422 content-not-stored, demo-manuscript version → REAL impact-path
 * analysis with a true findingsCount (never fabricated), rate limit, 503.
 */

import { describe, expect, it, vi } from 'vitest';
import { createAnalyzeHandler } from '../../netlify/functions/analyze.mjs';
import { createRateLimiter } from '../../server/demoApi.mjs';
import {
  DEMO_MANUSCRIPT_VERSION_ID,
  IMPACT_ANALYSIS_VERSION,
  METADATA_ONLY_DISCLOSURE,
  runAnalysis,
} from '../../server/importAnalyze.mjs';
import { assertParameterized, ConnectionError } from '../../server/graphClient.mjs';
import { fakeConfiguredEnv, fakeLayer, permissiveLimiter, readJson } from './_helpers.mjs';
import { expectUuid, m4FakeSession } from './_m4fake.mjs';

const BASE = 'http://localhost/.netlify/functions/analyze';
const analyzePost = (body) =>
  new Request(BASE, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

/**
 * One RAW impact-path query row (exactly the Cypher RETURN shape of
 * `impactPathFromSupportedClaims`) — withConclusion controls conclusionId.
 */
function pathRow(withConclusion) {
  return {
    publicationId: 'pub-mehra-2020',
    publicationDoi: '10.1016/S0140-6736(20)31180-6',
    isSynthetic: false,
    noticeId: 'notice-mehra-retraction-2020-06-04',
    noticeType: 'retraction',
    publishedDate: '2020-06-04',
    sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31324-6',
    citationUseId: 'cu-A-supporting',
    citationUseRole: 'supporting',
    citationUseExcerpt: null,
    claimId: 'claim-A',
    claimStatus: 'supporting',
    claimText: null,
    conclusionId: withConclusion ? 'conclusion-C' : null,
    conclusionText: null,
    dependencyId: withConclusion ? 'dep-conclusion-C-claim-A' : null,
    dependencyProvenanceKind: withConclusion ? 'observed' : null,
    dependencyRationale: withConclusion ? 'Conclusion depends on claim' : null,
    dependencyAnalysisVersion: withConclusion ? 'seed-1' : null,
    dependencyScope: withConclusion ? 'full' : null,
    dependencyConfidence: withConclusion ? 1 : null,
  };
}

function handlerWith(deps = {}) {
  return createAnalyzeHandler({
    env: fakeConfiguredEnv(),
    layer: fakeLayer(m4FakeSession({ versionRow: { id: 'v-user', contentStored: false } })),
    limiter: permissiveLimiter(),
    ...deps,
  });
}

describe('analyze handler — method + body guards', () => {
  it('rejects non-POST with 405 + allow header before touching anything', async () => {
    const analyzeOp = vi.fn();
    const handler = handlerWith({ analyzeOp });
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await handler(new Request(BASE, { method }));
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
    expect(analyzeOp).not.toHaveBeenCalled();
  });

  it('400 on non-JSON, malformed JSON, or a body without a string documentVersionId', async () => {
    const handler = handlerWith();
    for (const body of ['', 'not json', '{}', '[]', '{"documentVersionId":42}', '{"documentVersionId":""}']) {
      const res = await handler(analyzePost(body));
      expect(res.status, body).toBe(400);
      expect((await readJson(res)).error).toBe('invalid-request');
    }
  });

  it('400 on an oversized documentVersionId', async () => {
    const res = await handlerWith()(analyzePost({ documentVersionId: 'x'.repeat(201) }));
    expect(res.status).toBe(400);
  });
});

describe('analyze handler — honest refusals', () => {
  it('404 version-not-found when the DocumentVersion does not exist', async () => {
    const session = m4FakeSession({ versionRow: null });
    const handler = handlerWith({ layer: fakeLayer(session) });
    const res = await handler(analyzePost({ documentVersionId: 'no-such-version' }));
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe('version-not-found');
    expect(body.runId).toBeUndefined();
    expect(session.writes.length).toBe(0); // nothing was written
  });

  it('422 content-not-stored for a registered (contentless) version — verbatim disclosure', async () => {
    const session = m4FakeSession({ versionRow: { id: 'v-user', contentStored: false } });
    const handler = handlerWith({ layer: fakeLayer(session) });
    const res = await handler(analyzePost({ documentVersionId: 'v-user' }));
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe('content-not-stored');
    expect(body.disclosure).toBe(METADATA_ONLY_DISCLOSURE);
    expect(body.runId).toBeUndefined();
    expect(session.writes.length).toBe(0); // no AnalysisRun was fabricated
  });

  it('422 also when contentStored is not even false (nothing stores content in this tier)', async () => {
    const session = m4FakeSession({ versionRow: { id: 'v-odd', contentStored: true } });
    const handler = handlerWith({ layer: fakeLayer(session) });
    const res = await handler(analyzePost({ documentVersionId: 'v-odd' }));
    expect(res.status).toBe(422);
  });
});

describe('analyze handler — the REAL demo-manuscript analysis', () => {
  it('200 {runId} with a completed AnalysisRun whose findingsCount is the true derivation', async () => {
    const session = m4FakeSession({
      versionRow: { id: DEMO_MANUSCRIPT_VERSION_ID, contentStored: null },
      // Fixture reality: 1 direct flag (claim-A) + 1 indirect (conclusion-C).
      impactRows: [pathRow(true)],
    });
    const handler = createAnalyzeHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(session),
      limiter: permissiveLimiter(),
      analyzeOp: runAnalysis,
    });
    const res = await handler(analyzePost({ documentVersionId: DEMO_MANUSCRIPT_VERSION_ID }));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(expectUuid(body.runId)).toBe(true);

    expect(session.writes.length).toBe(1);
    const { cypher, params } = session.writes[0];
    expect(cypher).toContain('AnalysisRun');
    expect(() => assertParameterized(cypher, params)).not.toThrow();
    expect(params.id).toBe(body.runId);
    expect(params.documentVersionId).toBe(DEMO_MANUSCRIPT_VERSION_ID);
    expect(params.status).toBe('completed');
    expect(params.stage).toBe('completed');
    expect(params.findingsCount).toBe(2); // 1 direct + 1 indirect — the real count
    expect(params.analysisVersion).toBe(IMPACT_ANALYSIS_VERSION);
    expect(params.startedAt).toBe(params.completedAt);
  });

  it('0 findings on an unseeded graph — still a completed run, never a fabricated count', async () => {
    const session = m4FakeSession({
      versionRow: { id: DEMO_MANUSCRIPT_VERSION_ID, contentStored: null },
      impactRows: [],
    });
    const handler = createAnalyzeHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(session),
      limiter: permissiveLimiter(),
      analyzeOp: runAnalysis,
    });
    const res = await handler(analyzePost({ documentVersionId: DEMO_MANUSCRIPT_VERSION_ID }));
    expect(res.status).toBe(200);
    expect(session.writes[0].params.findingsCount).toBe(0);
  });

  it('counts each direct row and each dependent conclusion separately', async () => {
    const session = m4FakeSession({
      versionRow: { id: DEMO_MANUSCRIPT_VERSION_ID, contentStored: null },
      impactRows: [pathRow(true), pathRow(false), pathRow(false)],
    });
    const handler = createAnalyzeHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(session),
      limiter: permissiveLimiter(),
      analyzeOp: runAnalysis,
    });
    await handler(analyzePost({ documentVersionId: DEMO_MANUSCRIPT_VERSION_ID }));
    expect(session.writes[0].params.findingsCount).toBe(4); // 3 direct + 1 indirect
  });
});

describe('analyze handler — rate limiting + failure honesty', () => {
  it('429 with Retry-After inside the cooldown; refused runs never reach the op', async () => {
    const analyzeOp = vi.fn(async () => ({ runId: 'r-1' }));
    const handler = handlerWith({
      analyzeOp,
      limiter: createRateLimiter({ cooldownMs: 30_000, windowMs: 600_000, maxPerWindow: 5 }),
    });
    const ip = { 'x-nf-client-connection-ip': '203.0.113.9' };
    const post = (headers = {}) =>
      new Request(BASE, { method: 'POST', body: JSON.stringify({ documentVersionId: 'v-user' }), headers });
    expect((await handler(post(ip))).status).toBe(200);
    const second = await handler(post(ip));
    expect(second.status).toBe(429);
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(analyzeOp).toHaveBeenCalledTimes(1);
  });

  it('503 graph-backend-unavailable when the backend cannot be reached; no runId claimed', async () => {
    const handler = handlerWith({
      layer: { async open() { throw new ConnectionError('down'); } },
    });
    const res = await handler(analyzePost({ documentVersionId: 'v-user' }));
    expect(res.status).toBe(503);
    expect((await readJson(res)).error).toBe('graph-backend-unavailable');
  });

  it('binds the session to FALKORDB_GRAPH_NAME from the env seam (no hardcoded graph)', async () => {
    const env = fakeConfiguredEnv({ FALKORDB_GRAPH_NAME: 'aftershock:demo-smoke' });
    const layer = fakeLayer(m4FakeSession({ graphName: 'aftershock:demo-smoke' }));
    const handler = createAnalyzeHandler({ env, layer, limiter: permissiveLimiter() });
    await handler(analyzePost({ documentVersionId: 'v-user' }));
    expect(layer.openedGraphs).toEqual(['aftershock:demo-smoke']);
  });
});
