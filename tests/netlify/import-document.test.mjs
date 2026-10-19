/**
 * Unit tests for the POST /import-document handler (M4, metadata-only tier).
 * Guards and honesty rules: POST-only, format whitelist (415), empty-body
 * 400, 10 MB ceiling (413 declared + actual), per-IP rate limit, metadata-only
 * registration (bytes NEVER enter the graph), contentStored:false + verbatim
 * disclosure, 503 honesty on backend failure.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createImportDocumentHandler } from '../../netlify/functions/import-document.mjs';
import { createRateLimiter } from '../../server/demoApi.mjs';
import {
  MAX_IMPORT_BYTES,
  METADATA_ONLY_DISCLOSURE,
  registerDocumentImport,
} from '../../server/importAnalyze.mjs';
import { MAX_SCAN_BYTES } from '../../server/metaExtract.mjs';
import { assertParameterized, ConnectionError } from '../../server/graphClient.mjs';
import { fakeConfiguredEnv, fakeLayer, permissiveLimiter, readJson } from './_helpers.mjs';
import { expectUuid, m4FakeSession } from './_m4fake.mjs';

const BASE = 'http://localhost/.netlify/functions/import-document';

const uploadUrl = (query = '?fileName=notes.txt&format=txt') => `${BASE}${query}`;
const uploadRequest = (query = '?fileName=notes.txt&format=txt', body = 'demo manuscript bytes', headers = {}) =>
  new Request(uploadUrl(query), {
    method: 'POST',
    body: typeof body === 'string' ? body : bytes(body),
    headers,
  });

/** @param {number} length */
function bytes(length) {
  return new Uint8Array(length).fill(0x61);
}

function handlerWith(deps = {}) {
  return createImportDocumentHandler({
    env: fakeConfiguredEnv(),
    layer: fakeLayer(m4FakeSession()),
    limiter: permissiveLimiter(),
    ...deps,
  });
}

describe('import-document handler — method + query guards', () => {
  it('rejects non-POST with 405 + allow header before touching anything', async () => {
    const registerOp = vi.fn();
    const handler = handlerWith({ registerOp });
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await handler(new Request(uploadUrl(), { method }));
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
    expect(registerOp).not.toHaveBeenCalled();
  });

  it('400 when fileName is missing or empty', async () => {
    const handler = handlerWith();
    for (const query of ['', '?format=txt', '?fileName=&format=txt', '?fileName=%20%20&format=txt']) {
      const res = await handler(uploadRequest(query));
      expect(res.status, query).toBe(400);
      expect((await readJson(res)).error).toBe('invalid-request');
    }
  });

  it('400 when fileName exceeds 255 characters (bounded metadata)', async () => {
    const res = await handlerWith()(uploadRequest(`?fileName=${'x'.repeat(256)}&format=txt`));
    expect(res.status).toBe(400);
  });

  it('400 when format is missing, 415 when format is outside pdf|docx|txt', async () => {
    const handler = handlerWith();
    const missing = await handler(uploadRequest('?fileName=notes.txt'));
    expect(missing.status).toBe(400);
    expect((await readJson(missing)).error).toBe('invalid-request');

    for (const format of ['exe', 'json', 'sh']) {
      const res = await handler(uploadRequest(`?fileName=x.${format}&format=${format}`));
      expect(res.status, format).toBe(415);
      expect((await readJson(res)).error).toBe('unsupported-media-type');
    }
  });

  it('accepts the three whitelisted formats case-insensitively', async () => {
    const handler = handlerWith();
    for (const format of ['pdf', 'docx', 'txt', 'TXT', 'PDF']) {
      const res = await handler(uploadRequest(`?fileName=f.${format}&format=${format}`));
      expect(res.status, format).toBe(200);
    }
  });
});

describe('import-document handler — body bounds', () => {
  it('400 on an empty body — nothing is registered', async () => {
    const registerOp = vi.fn();
    const res = await handlerWith({ registerOp })(uploadRequest(undefined, ''));
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe('invalid-request');
    expect(registerOp).not.toHaveBeenCalled();
  });

  it('413 on a declared Content-Length over 10 MB — refused before the body is read', async () => {
    const registerOp = vi.fn();
    const req = /** @type {any} */ ({
      method: 'POST',
      url: uploadUrl('?fileName=big.txt&format=txt'),
      headers: new Headers({ 'content-length': String(MAX_IMPORT_BYTES + 1) }),
      arrayBuffer: async () => {
        throw new Error('oversize must be refused before reading the body');
      },
    });
    const res = await handlerWith({ registerOp })(req);
    expect(res.status).toBe(413);
    expect((await readJson(res)).error).toBe('payload-too-large');
    expect(registerOp).not.toHaveBeenCalled();
  });

  it('413 on an actual body over 10 MB even when the length was undeclared', async () => {
    const res = await handlerWith()(uploadRequest(undefined, bytes(MAX_IMPORT_BYTES + 1)));
    expect(res.status).toBe(413);
    expect((await readJson(res)).error).toBe('payload-too-large');
  });
});

describe('import-document handler — metadata-only registration', () => {
  it('200 {documentId, versionId, contentStored:false, disclosure} with a verbatim sha256 sourceHash', async () => {
    const raw = 'demo manuscript bytes';
    const session = m4FakeSession();
    const handler = handlerWith({ layer: fakeLayer(session) });
    const res = await handler(uploadRequest('?fileName=notes.txt&format=txt', raw));
    expect(res.status).toBe(200);
    const body = await readJson(res);

    expect(expectUuid(body.documentId)).toBe(true);
    expect(expectUuid(body.versionId)).toBe(true);
    expect(body.contentStored).toBe(false);
    expect(body.disclosure).toBe(METADATA_ONLY_DISCLOSURE);
    // The bytes were hashed, not stored: sourceHash is the real sha256.
    const expectedHash = createHash('sha256').update(new Uint8Array(Buffer.from(raw, 'utf8'))).digest('hex');

    // Three fixed parameterized writes: document, version, provenance edge.
    expect(session.writes.length).toBe(3);
    const [docWrite, versionWrite, edgeWrite] = session.writes;
    for (const { cypher, params } of session.writes) {
      expect(() => assertParameterized(cypher, params)).not.toThrow();
      // The raw bytes NEVER travel into any query or param bag.
      expect(cypher).not.toContain(raw);
      for (const value of Object.values(params)) {
        expect(value, 'no raw byte arrays in params').not.toBeInstanceOf(Uint8Array);
      }
    }
    expect(docWrite.params.contentStored).toBe(false);
    expect(docWrite.params.isSynthetic).toBe(false); // real user upload
    expect(docWrite.params.sourceHash).toBe(expectedHash);
    expect(docWrite.params.sizeBytes).toBe(raw.length);
    expect(docWrite.params.fileName).toBe('notes.txt');
    expect(docWrite.params.format).toBe('txt');
    expect(versionWrite.params.sourceHash).toBe(expectedHash);
    expect(versionWrite.params.id).toBe(body.versionId);
    expect(docWrite.params.id).toBe(body.documentId);
    expect(edgeWrite.cypher).toContain('DOCUMENT_HAS_VERSION');
    expect(edgeWrite.params.provenanceKind).toBe('observed');
    expect(typeof edgeWrite.params.rationale).toBe('string');
    // No `seeded` flag: reseed wipes must never touch user documents.
    for (const { params } of session.writes) {
      expect(Object.keys(params)).not.toContain('seeded');
    }
  });

  it('uses the real registerDocumentImport op with the real sha256 helper', async () => {
    const session = m4FakeSession();
    const raw = 'byte-for-byte check';
    const handler = createImportDocumentHandler({
      env: fakeConfiguredEnv(),
      layer: fakeLayer(session),
      limiter: permissiveLimiter(),
      registerOp: registerDocumentImport,
    });
    const res = await handler(uploadRequest('?fileName=a.pdf&format=pdf', raw));
    expect(res.status).toBe(200);
    expect(session.writes[0].params.sourceHash).toBe(
      createHash('sha256').update(new Uint8Array(Buffer.from(raw, 'utf8'))).digest('hex'),
    );
  });
});

describe('import-document handler — rate limiting + failure honesty', () => {
  it('429 with Retry-After inside the cooldown; refused runs never reach the op', async () => {
    const registerOp = vi.fn(async () => ({ documentId: 'd', versionId: 'v', contentStored: false, disclosure: METADATA_ONLY_DISCLOSURE }));
    const handler = handlerWith({
      registerOp,
      limiter: createRateLimiter({ cooldownMs: 30_000, windowMs: 600_000, maxPerWindow: 5 }),
    });
    const ip = { 'x-nf-client-connection-ip': '203.0.113.9' };
    expect((await handler(uploadRequest(undefined, 'a', ip))).status).toBe(200);
    const second = await handler(uploadRequest(undefined, 'a', ip));
    expect(second.status).toBe(429);
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await readJson(second)).error).toBe('rate-limited');
    expect(registerOp).toHaveBeenCalledTimes(1);
  });

  it('503 graph-backend-unavailable when the backend cannot be reached; nothing is claimed', async () => {
    const handler = handlerWith({
      layer: { async open() { throw new ConnectionError('down'); } },
    });
    const res = await handler(uploadRequest());
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.error).toBe('graph-backend-unavailable');
    expect(body.documentId).toBeUndefined();
  });

  it('binds the session to FALKORDB_GRAPH_NAME from the env seam (no hardcoded graph)', async () => {
    const env = fakeConfiguredEnv({ FALKORDB_GRAPH_NAME: 'aftershock:demo-smoke' });
    const layer = fakeLayer(m4FakeSession({ graphName: 'aftershock:demo-smoke' }));
    const handler = createImportDocumentHandler({ env, layer, limiter: permissiveLimiter() });
    await handler(uploadRequest());
    expect(layer.openedGraphs).toEqual(['aftershock:demo-smoke']);
  });
});

describe('import-document handler — wave 3 in-memory extraction (response-only)', () => {
  it('attaches detection-only extraction for txt uploads; the graph writes are unchanged', async () => {
    const raw = [
      'CHAPTER 1',
      'Key citation: https://doi.org/10.4711/handler-fixture.',
      'Also referenced as 10.4711/handler-fixture and 10.8228/another-fixture;',
      'plain lorem follows, no check performed anywhere.',
    ].join('\n');
    const session = m4FakeSession();
    const handler = handlerWith({ layer: fakeLayer(session) });
    const res = await handler(uploadRequest('?fileName=notes.txt&format=txt', raw));
    expect(res.status).toBe(200);
    const body = await readJson(res);

    // Metadata-only contract unchanged.
    expect(body.contentStored).toBe(false);
    expect(body.disclosure).toBe(METADATA_ONLY_DISCLOSURE);

    // Additive detection-only extra: honest caveat + bounded scan flags.
    expect(body.extraction.attempted).toBe(true);
    expect(body.extraction.format).toBe('txt');
    expect(body.extraction.byteSelection.maxBytes).toBe(MAX_SCAN_BYTES);
    expect(body.extraction.byteSelection.truncated).toBe(false);
    expect(body.extraction.byteSelection.scannedBytes).toBe(new TextEncoder().encode(raw).byteLength);
    expect(body.extraction.caveat).toMatch(/unverified|proved nothing about claim support|reference validity/i);
    expect(body.extraction.dois.map((d) => d.doi)).toEqual(['10.4711/handler-fixture', '10.8228/another-fixture']);
    expect(body.extraction.dois[0].occurrences).toBe(2);

    // The graph contract is untouched: 3 metadata writes, no DOI-related
    // params, no new writes for extraction.
    expect(session.writes.length).toBe(3);
    for (const { params } of session.writes) {
      for (const value of Object.values(params)) {
        expect(value, 'no extraction payload in params').not.toEqual(
          body.extraction.dois,
        );
      }
    }
  });

  it('answers pdf/docx honestly: attempted:false + stable not-implemented reason', async () => {
    const handler = handlerWith();
    for (const format of ['pdf', 'docx']) {
      const res = await handler(uploadRequest(`?fileName=f.${format}&format=${format}`, 'bytes'));
      expect(res.status, format).toBe(200);
      const { extraction } = await readJson(res);
      expect(extraction).toEqual({
        attempted: false,
        format,
        reason: expect.stringMatching(/not implemented in the demo tier/i),
      });
      expect(extraction.reason).not.toMatch(/no references|no DOIs(?! were scanned)/i);
    }
  });

  it('tolerates an extraction op that throws: still 200 metadata-only with honest attempted:false', async () => {
    const handler = handlerWith({ extractTextOp: () => { throw new Error('simulated scan machinery failure'); } });
    const res = await handler(uploadRequest('?fileName=notes.txt&format=txt', 'some text 10.9111/never-verified'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.contentStored).toBe(false);
    expect(body.documentId).toBeDefined();
    expect(body.extraction).toEqual({
      attempted: false,
      format: 'txt',
      reason: 'Extraction failed unexpectedly; import registered metadata-only.',
    });
  });
});

