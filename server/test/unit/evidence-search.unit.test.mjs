/**
 * Unit tests: P4 Find Evidence ops (server/evidenceSearch.mjs).
 *
 * All fixtures here are SYNTHETIC test data living only in this file: the
 * fake graph session returns fixture-shaped rows and the fake fetch returns
 * script-shaped Crossref-style payloads. No real DB, no real provider, no
 * credentials, no ESM stubbing (see server/demoApi.mjs test-seam comment).
 */

import { describe, expect, it } from 'vitest';
import {
  buildCrossrefUrl,
  buildSuggestedQuery,
  CONCERN_SUMMARIES,
  CROSSREF_SELECT_FIELDS,
  loadEvidenceFindContext,
  searchCrossref,
  validateClaimId,
  validateSearchQuery,
} from '../../evidenceSearch.mjs';
import { ConnectionError } from '../../graphClient.mjs';

const GRAPH_NAME = 'test-graph';

/* ------------------------------------------------------------------ *
 * Synthetic fixture: a seeded Claim node row (shape mirrors seed.mjs).  *
 * ------------------------------------------------------------------ */

const CLAIM_A_ROW = {
  labels: ['Claim'],
  kind: 'Claim',
  text:
    'Claim A: this guided-demo passage relies on the supporting citation; the text below must never be modified by any endpoint.',
  documentVersionId: 'ver-demo-manuscript-v1',
};

/**
 * Fake GraphSession: echoes the fixture row for the claim context query and
 * returns scripted counts for the notice-linkage path queries. All Cypher that
 * reaches it is recorded so assertions can prove parameterization.
 * @param {{row?: Record<string, unknown> | null, noticeCounts?: number[], fail?: boolean}} options
 */
function buildFakeSession({ row = CLAIM_A_ROW, noticeCounts = [0, 0], fail = false } = {}) {
  const reads = [];
  let noticeQueryIndex = 0;
  const script = [...noticeCounts];
  return {
    graphName: GRAPH_NAME,
    reads,
    async roQuery(cypher, params) {
      reads.push({ cypher, params });
      if (fail) throw new ConnectionError('graph is down');
      if (cypher.includes('((c:Claim) OR (c:Conclusion))')) {
        return { data: row ? [row] : [] };
      }
      if (cypher.includes('DOCUMENT_HAS_VERSION')) {
        return { data: [{ docId: 'doc-demo-manuscript' }] };
      }
      if (cypher.includes('PUBLICATION_HAS_NOTICE')) {
        const n = script[Math.min(noticeQueryIndex, script.length - 1)] ?? 0;
        noticeQueryIndex += 1;
        return { data: [{ n }] };
      }
      return { data: [] };
    },
  };
}

/* ------------------------------------------------------------------ *
 * suggestedQuery — deterministic pure function
 * ------------------------------------------------------------------ */

describe('buildSuggestedQuery', () => {
  it('strips a leading "Claim X:" prefix and collapses whitespace', () => {
    expect(buildSuggestedQuery('Claim 2:    had\n unverified\t support ')).toBe('had unverified support');
  });

  it('strips a leading "Passage 2.1:" prefix', () => {
    expect(buildSuggestedQuery('Passage 2.1: the analysis styled a mortality signal.')).toBe(
      'the analysis styled a mortality signal.',
    );
  });

  it('leaves text without a prefix unchanged apart from whitespace collapse', () => {
    expect(buildSuggestedQuery('No   prefix   here')).toBe('No prefix here');
  });

  it('caps the result at 300 chars', () => {
    const long = 'x'.repeat(400);
    expect(buildSuggestedQuery(long)).toHaveLength(300);
  });

  it('is deterministic and prefix-stripping exactly once', () => {
    const text = 'Claim A: Claim B: direct text';
    expect(buildSuggestedQuery(text)).toBe('Claim B: direct text');
    expect(buildSuggestedQuery(text)).toBe(buildSuggestedQuery(text));
  });

  it('is safe for non-string input (empty suggestion, never a crash)', () => {
    expect(buildSuggestedQuery(undefined)).toBe('');
  });
});

/* ------------------------------------------------------------------ *
 * Input validation
 * ------------------------------------------------------------------ */

describe('validateClaimId', () => {
  it('accepts the contract charset', () => {
    expect(validateClaimId('claim-A')).toBe('claim-A');
    expect(validateClaimId('a9._-:Z')).toBe('a9._-:Z');
  });
  it('trims surrounding whitespace', () => {
    expect(validateClaimId(' claim-A ')).toBe('claim-A');
  });
  it('rejects empty, non-string, leading punctuation, bad charset, and overlong ids', () => {
    for (const bad of ['', '   ', null, 42, '-claim', ' claim/A', 'claim#', 'a'.repeat(65)]) {
      expect(() => validateClaimId(bad)).toThrow();
    }
    expect(() => validateClaimId('a'.repeat(64))).not.toThrow();
  });
});

describe('validateSearchQuery', () => {
  it('accepts and trims a normal query', () => {
    expect(validateSearchQuery('  registry  analysis  ')).toBe('registry  analysis');
  });
  it('rejects empty and whitespace-only queries', () => {
    expect(() => validateSearchQuery('')).toThrow();
    expect(() => validateSearchQuery('   ')).toThrow();
    expect(() => validateSearchQuery(undefined)).toThrow();
    expect(() => validateSearchQuery(7)).toThrow();
  });
  it('rejects a query that is only control characters', () => {
    expect(() => validateSearchQuery('\u0001\u0002\t\n')).toThrow();
  });
  it('strips control characters from an otherwise-valid query', () => {
    expect(validateSearchQuery('registry\u0001analysis')).toBe('registryanalysis');
  });
  it('rejects queries longer than 400 chars after normalization', () => {
    expect(() => validateSearchQuery('q'.repeat(401))).toThrow();
    expect(validateSearchQuery('q'.repeat(400))).toBe('q'.repeat(400));
  });
  it('strips the DEL character too', () => {
    expect(validateSearchQuery('regi\u007fstry')).toBe('registry');
  });
});

/* ------------------------------------------------------------------ *
 * loadEvidenceFindContext — read-only graph leg
 * ------------------------------------------------------------------ */

describe('loadEvidenceFindContext', () => {
  it('returns verbatim claim text, label, version + manuscript ids, and direction for a Claim (direct)', async () => {
    const session = buildFakeSession({ noticeCounts: [1, 0] });
    const ctx = await loadEvidenceFindContext(session, 'claim-A');
    expect(ctx).not.toBeNull();
    expect(ctx.claimId).toBe('claim-A');
    expect(ctx.claimText).toBe(CLAIM_A_ROW.text); // verbatim, incl. the "Claim A:" prefix
    expect(ctx.label).toBe('Claim');
    expect(ctx.direction).toBe('direct');
    expect(ctx.documentVersionId).toBe('ver-demo-manuscript-v1');
    expect(ctx.manuscriptId).toBe('doc-demo-manuscript');
    expect(ctx.hasNoticeLinkage).toBe(true);
    expect(ctx.concern.summary).toBe(CONCERN_SUMMARIES.noticeLinked);
    expect(ctx.concern.direction).toBe('direct');
    // Every Cypher that reached the (fake) session is parameterized.
    for (const { cypher, params } of session.reads) {
      expect(cypher).toContain('$');
      for (const value of Object.values(params ?? {})) {
        // no user value interpolated inline: no quotes wrapping a claim id
        expect(JSON.stringify(cypher)).not.toContain(`'${value}'`);
      }
    }
  });

  it('maps a Conclusion to indirect and checks the dependent-claim path too', async () => {
    const row = { labels: ['Conclusion'], kind: 'Conclusion', text: 'conclusion text', documentVersionId: 'ver-x' };
    const session = buildFakeSession({ row, noticeCounts: [0, 0, 2] });
    const ctx = await loadEvidenceFindContext(session, 'conclusion-C');
    expect(ctx.label).toBe('Conclusion');
    expect(ctx.direction).toBe('indirect');
    expect(ctx.hasNoticeLinkage).toBe(true);
    expect(session.reads.some((r) => r.cypher.includes('CONCLUSION_DEPENDS_ON_CLAIM'))).toBe(true);
  });

  it('uses the honest fallback concern summary when no notice linkage is stored', async () => {
    const session = buildFakeSession({ noticeCounts: [0, 0] });
    const ctx = await loadEvidenceFindContext(session, 'claim-A');
    expect(ctx.hasNoticeLinkage).toBe(false);
    expect(ctx.concern.summary).toBe(CONCERN_SUMMARIES.fallback);
  });

  it('omits manuscriptId honestly when the version linkage is not stored', async () => {
    const session = buildFakeSession();
    // Remove the DOCUMENT_HAS_VERSION leg by pointing documentVersionId at a
    // version the fake session cannot resolve.
    const row = { ...CLAIM_A_ROW, documentVersionId: 'ver-unknown' };
    session.roQuery = (async (cypher, params) => {
      session.reads.push({ cypher, params });
      expect(cypher).toContain('$');
      if (cypher.includes('((c:Claim) OR (c:Conclusion))')) return { data: [row] };
      if (cypher.includes('DOCUMENT_HAS_VERSION')) return { data: [] };
      if (cypher.includes('PUBLICATION_HAS_NOTICE')) return { data: [{ n: 0 }] };
      return { data: [] };
    });
    const ctx = await loadEvidenceFindContext(session, 'claim-A');
    expect(ctx.manuscriptId).toBeUndefined();
    expect(ctx.documentVersionId).toBe('ver-unknown');
  });

  it('returns null (→ 404) for an id with no Claim/Conclusion node', async () => {
    const session = buildFakeSession({ row: null });
    expect(await loadEvidenceFindContext(session, 'claim-missing')).toBeNull();
  });

  it('propagates graph failures (handler maps them to 503)', async () => {
    const session = buildFakeSession({ fail: true });
    await expect(loadEvidenceFindContext(session, 'claim-A')).rejects.toBeInstanceOf(ConnectionError);
  });
});

/* ------------------------------------------------------------------ *
 * searchCrossref — bounded provider leg (fake fetch, synthetic payloads)
 * ------------------------------------------------------------------ */

/** Realistic recorded-style Crossref item (values are synthetic test data). */
const CROSSREF_ITEM = {
  DOI: '10.9999/synth-record-2020',
  title: ['Synthetic registry analysis of a fictional cohort'],
  author: [
    { given: 'Ada', family: 'Synthwright' },
    { given: 'Ben', family: 'Fixtureman' },
  ],
  'container-title': ['The Synthetic Lancet'],
  published: { 'date-parts': [[2020, 5, 22]] },
  type: 'journal-article',
  publisher: 'Fixture Press',
  'is-referenced-by-count': 12,
  'update-to': [{ DOI: '10.9999/synth-retraction-2020', type: 'retraction', label: 'Retraction' }],
};

function crossrefReply(items) {
  return { status: 'ok', 'message-type': 'work-list', message: { items } };
}

/**
 * fetch double: records calls, resolves with the scripted reply, honors the
 * injected AbortController signal (so real abort paths are exercised), or
 * hangs until aborted. No real network is ever touched.
 * @param {{ reply?: Record<string, unknown>, httpStatus?: number, hangMs?: number, unordered?: unknown, throwOnce?: Error }} script
 */
function fakeFetch(script) {
  const calls = [];
  let thrown = false;
  return {
    calls,
    fetchFn: async (url, opts = {}) => {
      calls.push({ url, signal: opts.signal });
      const signal = opts.signal;
      return await new Promise((resolve, reject) => {
        try {
          if (signal?.aborted) return reject(abortLike());
          const onAbort = () => reject(abortLike());
          signal.addEventListener('abort', onAbort, { once: true });
          void (async () => {
            try {
              if (script.throwOnce && !thrown) {
                thrown = true;
                throw script.throwOnce;
              }
              if (script.hangMs !== undefined) {
                await new Promise((r) => setTimeout(r, script.hangMs));
              }
              signal.removeEventListener('abort', onAbort);
              if (script.httpStatus !== undefined) {
                resolve(new Response(JSON.stringify({ status: 'error' }), {
                  status: script.httpStatus,
                  headers: { 'content-type': 'application/json' },
                }));
                return;
              }
              resolve(new Response(
                JSON.stringify(script.unordered ?? script.reply ?? crossrefReply([])),
                { status: 200, headers: { 'content-type': 'application/json' } },
              ));
            } catch (err) {
              reject(err);
            }
          })();
        } catch (err) {
          reject(err);
        }
      });
    },
  };
}

function abortLike() {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

describe('buildCrossrefUrl', () => {
  it('encodes the query and pins rows=8 plus the verified select list', () => {
    const url = buildCrossrefUrl('registry analysis', undefined);
    expect(url.startsWith('https://api.crossref.org/works?')).toBe(true);
    expect(url).toContain('query.bibliographic=registry%20analysis');
    expect(url).toContain('rows=8');
    expect(url).toContain(`select=${CROSSREF_SELECT_FIELDS}`);
    expect(url).not.toContain('mailto=');
  });

  it('appends mailto only when configured', () => {
    expect(buildCrossrefUrl('q', 'contact@example.org')).toContain('mailto=contact%40example.org');
  });
});

describe('searchCrossref (fake fetch, synthetic Crossref payload)', () => {
  it('parses a recorded-style reply into spec EvidenceCandidates (real-metadata contract)', async () => {
    const { fetchFn } = fakeFetch({ reply: crossrefReply([CROSSREF_ITEM]) });
    const out = await searchCrossref('registry analysis', { fetch: fetchFn, timeoutMs: 500, budgetMs: 600 });
    expect(out.status).toBe('ok');
    expect(out.candidates).toHaveLength(1);
    const c = out.candidates[0];
    expect(c.candidateId).toBe('doi:10.9999/synth-record-2020');
    expect(c.doi).toBe('10.9999/synth-record-2020'); // provider display form, verbatim
    expect(c.title).toBe('Synthetic registry analysis of a fictional cohort');
    expect(c.authors).toEqual(['Synthwright, Ada', 'Fixtureman, Ben']);
    expect(c.year).toBe(2020);
    expect(c.container).toBe('The Synthetic Lancet');
    expect(c.publicationType).toBe('journal-article');
    expect(c.publisher).toBe('Fixture Press');
    expect(c.isSynthetic).toBe(false);
    expect(c.retractionStatus).toBe('notice_present'); // explicit provider update-to linkage
    expect(c.evidenceRelationship).toBe('unverified');
    expect(c.independence).toBe('unknown');
    expect(c.fullTextAvailability).toBe('unknown');
    expect(c.relevanceBasis.startsWith("Retrieved by Crossref bibliographic relevance for 'registry analysis'")).toBe(true);
    expect(c.urls.sourceUrl).toBe('https://doi.org/10.9999/synth-record-2020');
  });

  it('marks unknown retraction status when the record carries no update-to linkage', async () => {
    const { fetchFn } = fakeFetch({ reply: crossrefReply([{ ...CROSSREF_ITEM, 'update-to': undefined }]) });
    const out = await searchCrossref('q', { fetch: fetchFn, timeoutMs: 500, budgetMs: 600 });
    expect(out.candidates[0].retractionStatus).toBe('unknown');
  });

  it('dedupes by lowercase DOI and preserves provider order', async () => {
    const items = [
      { ...CROSSREF_ITEM },
      { ...CROSSREF_ITEM, DOI: '10.9999/SYNTH-RECORD-2020', title: ['Second entry, same record (uppercase DOI)'] },
      { ...CROSSREF_ITEM, DOI: '10.9999/other-record', 'update-to': undefined },
    ];
    const { fetchFn } = fakeFetch({ reply: crossrefReply(items) });
    const out = await searchCrossref('q', { fetch: fetchFn, timeoutMs: 500, budgetMs: 600 });
    expect(out.status).toBe('ok');
    expect(out.candidates).toHaveLength(2);
    expect(out.candidates[0].doi).toBe('10.9999/synth-record-2020');
    expect(out.candidates[1].doi).toBe('10.9999/other-record');
  });

  it('honours the ≤8 cap even when the provider returns more rows', async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ ...CROSSREF_ITEM, DOI: `10.9999/cap-${String(i).padStart(2, '0')}` }));
    const { fetchFn } = fakeFetch({ reply: crossrefReply(items) });
    const out = await searchCrossref('q', { fetch: fetchFn, timeoutMs: 500, budgetMs: 600 });
    expect(out.candidates).toHaveLength(8);
  });

  it('falls back to a sha1 fa: candidateId and omits sourceUrl when DOI is absent', async () => {
    const noDoi = { ...CROSSREF_ITEM, DOI: undefined };
    const { fetchFn } = fakeFetch({ reply: crossrefReply([noDoi]) });
    const out = await searchCrossref('q', { fetch: fetchFn, timeoutMs: 500, budgetMs: 600 });
    const c = out.candidates[0];
    expect(c.candidateId.startsWith('fa:')).toBe(true);
    expect(c.doi).toBeUndefined();
    expect(c.urls).toBeUndefined();
  });

  it('reports an honest empty status when the provider returns zero items', async () => {
    const { fetchFn } = fakeFetch({ reply: crossrefReply([]) });
    const out = await searchCrossref('very specific gibberish', { fetch: fetchFn, timeoutMs: 500, budgetMs: 600 });
    expect(out.status).toBe('empty');
    expect(out.candidates).toEqual([]);
    expect(out.message).toBeUndefined();
  });

  it('reports status timeout, retried once, with no candidates when both attempts abort', async () => {
    const { fetchFn, calls } = fakeFetch({ hangMs: 1_000 });
    const out = await searchCrossref('q', { fetch: fetchFn, timeoutMs: 60, budgetMs: 150 });
    expect(out.status).toBe('timeout');
    expect(out.retried).toBe(true);
    expect(out.candidates).toEqual([]);
    expect(calls.length).toBe(2); // exactly one retry
  });

  it('succeeds after one retry when the first attempt fails on the network only', async () => {
    const { fetchFn, calls } = fakeFetch({ reply: crossrefReply([CROSSREF_ITEM]), throwOnce: new Error('socket reset') });
    const out = await searchCrossref('q', { fetch: fetchFn, timeoutMs: 500, budgetMs: 1_000 });
    expect(out.status).toBe('ok');
    expect(out.retried).toBe(true);
    expect(out.candidates).toHaveLength(1);
    expect(calls.length).toBe(2);
  });

  it('reports a generic HTTP error status for non-200 replies without retry', async () => {
    const { fetchFn, calls } = fakeFetch({ httpStatus: 500 });
    const out = await searchCrossref('q', { fetch: fetchFn, timeoutMs: 500, budgetMs: 1_000 });
    expect(out.status).toBe('error');
    expect(out.retried).toBeUndefined();
    expect(out.candidates).toEqual([]);
    expect(out.message).toContain('HTTP 500');
    expect(out.message).not.toContain('q'); // content-redacted: query text never echoed
    expect(calls.length).toBe(1); // no retry on delivered provider responses
  });

  it('reports an error status for an unexpected/invalid payload shape, without fabrication', async () => {
    const { fetchFn } = fakeFetch({ unordered: { totally: 'different' } });
    const out = await searchCrossref('q', { fetch: fetchFn, timeoutMs: 500, budgetMs: 1_000 });
    expect(out.status).toBe('error');
    expect(out.candidates).toEqual([]);
    expect(out.message).toContain('unexpected payload shape');
  });

  it('honors the overall leg budget: each attempt aborts within its remaining share', async () => {
    const { fetchFn, calls } = fakeFetch({ hangMs: 1_000 });
    const legStart = Date.now();
    const out = await searchCrossref('q', { fetch: fetchFn, timeoutMs: 80, budgetMs: 130 });
    expect(out.status).toBe('timeout');
    expect(out.retried).toBe(true);
    expect(calls.length).toBe(2);
    // The leg must finish long before the fake 1 s hang would resolve.
    expect(Date.now() - legStart).toBeLessThan(800);
  });
});
