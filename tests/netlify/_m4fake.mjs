/**
 * Shared fakes for the M4 Netlify-function unit tests (import-document,
 * analyze, analyze-status, document-detail).
 *
 * Same discipline as `_helpers.mjs`: a scripted GraphSession stand-in that
 * dispatches on the exact Cypher the M4 ops (`server/importAnalyze.mjs` +
 * `server/impact.mjs`) send, so no test touches a real DB and no ESM module
 * is stubbed. Anything unexpected throws so tests fail loudly.
 *
 * @param {{
 *   graphName?: string,
 *   versionRow?: {id: string, contentStored: unknown} | null,
 *   impactRows?: Array<Record<string, unknown>>,
 *   runRow?: Record<string, unknown> | null,
 *   docRow?: Record<string, unknown> | null,
 *   versionRows?: Array<Record<string, unknown>>,
 * }} [options]
 */
export function m4FakeSession({
  graphName = 'aftershock:demo-smoke',
  versionRow = null,
  impactRows = [],
  runRow = null,
  docRow = null,
  versionRows = [],
} = {}) {
  return {
    graphName,
    /** @type {Array<{cypher: string, params: Record<string, unknown>}>} */
    writes: [],
    /** @type {string[]} */
    seenQueries: [],
    async close() {
      /* withSession's bounded defensive close — no-op */
    },
    async roQuery(cypher, params = {}) {
      this.seenQueries.push(cypher);
      if (cypher.includes('MATCH (v:DocumentVersion) WHERE v.id = $id')) {
        return { data: versionRow ? [versionRow] : [] };
      }
      if (cypher.includes('PUBLICATION_HAS_NOTICE')) {
        return { data: impactRows };
      }
      if (cypher.includes('MATCH (r:AnalysisRun) WHERE r.id = $id')) {
        return { data: runRow ? [runRow] : [] };
      }
      if (cypher.includes('properties(d) AS doc')) {
        return { data: docRow ? [{ doc: docRow }] : [] };
      }
      if (cypher.includes('DOCUMENT_HAS_VERSION')) {
        return { data: versionRows.map((version) => ({ version })) };
      }
      throw new Error(`m4FakeSession received an unexpected query: ${cypher}`);
    },
    async writeQuery(cypher, params = {}) {
      this.writes.push({ cypher, params });
      return { data: [] };
    },
  };
}

/** Node 18+ UUID shape guard shared by the M4 tests. @param {string} value */
export function expectUuid(value) {
  return new RegExp(
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  ).test(value);
}
