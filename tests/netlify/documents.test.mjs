/**
 * Unit tests for the GET /.netlify/functions/documents handler.
 * Unseeded → 200 {documents: []} (nothing synthesized at response time);
 * seeded → real Document rows incl. honest isSynthetic/syntheticLabel.
 */

import { describe, expect, it, vi } from 'vitest';
import { createDocumentsHandler } from '../../netlify/functions/documents.mjs';
import { ConnectionError } from '../../server/graphClient.mjs';
import { fakeConfiguredEnv, fakeLayer, readJson, scriptedSession } from './_helpers.mjs';

const DOCS_URL = 'http://localhost/.netlify/functions/documents';

describe('documents handler — method guard', () => {
  it('rejects non-GET with 405 + allow header', async () => {
    const handler = createDocumentsHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      readDocuments: vi.fn(),
    });
    const res = await handler(new Request(DOCS_URL, { method: 'POST' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });
});

describe('documents handler — honest document list', () => {
  it('unseeded graph → 200 {documents: []}', async () => {
    const handler = createDocumentsHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession({ exists: false })),
    });
    const res = await handler(new Request(DOCS_URL));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ documents: [] });
  });

  it('seeded graph → wrapped document rows, synthetic content labeled', async () => {
    const documents = [{
      id: 'doc-demo-manuscript',
      kind: 'ResearchDocument',
      title: 'Guided demo manuscript',
      isSynthetic: true,
      syntheticLabel: 'FICTIONAL / GUIDED DEMO',
    }];
    const readDocuments = vi.fn(async () => ({ documents, seedVersion: 'seed-1' }));
    const handler = createDocumentsHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(scriptedSession()),
      readDocuments,
    });
    const res = await handler(new Request(DOCS_URL));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.documents).toEqual(documents);
    expect(body.documents[0].isSynthetic).toBe(true);
    expect(body.documents[0].syntheticLabel).toBe('FICTIONAL / GUIDED DEMO');
    // seedVersion is internal to the read helper — not part of the wire contract here.
    expect(body.seedVersion).toBeUndefined();
  });

  it('503 on backend failure — never a fabricated list', async () => {
    const handler = createDocumentsHandler({
      env: fakeConfiguredEnv(),
      layer: { async open() { throw new ConnectionError('down'); } },
    });
    const res = await handler(new Request(DOCS_URL));
    expect(res.status).toBe(503);
    expect((await readJson(res)).error).toBe('graph-backend-unavailable');
  });
});
