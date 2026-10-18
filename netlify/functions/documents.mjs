/**
 * GET /.netlify/functions/documents — read-only document list.
 * Netlify Functions v2 handler. List of REAL Document nodes from the seeded
 * graph (the synthetic guided-demo manuscript and — in later M4 real-import
 * flows — real records), including `isSynthetic`/`syntheticLabel` so every
 * item is honest about fictionality. Nothing is synthesized at response
 * time: an unseeded graph answers `{ documents: [] }`.
 *
 * Single-document and analysis-status routes are NOT implemented here (M4):
 * they resolve through `netlify.toml` rewrites to the `unimplemented` stub
 * (501 `{ reason: 'not-implemented' }`), which the deployed client maps to
 * an honest "not available yet" outcome.
 */

import {
  createGraphLayer,
  demoGraphName,
  errorBodyFor,
  jsonResponse,
  withSession,
} from '../../server/demoApi.mjs';
import { readDocuments } from '../../server/demoApi.mjs';

const READ_BUDGET_MS = 8_000;

export function createDocumentsHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const readList = deps.readDocuments ?? readDocuments;

  return async function handler(request /*, context */) {
    if (request.method !== 'GET') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: 'GET' });
    }
    try {
      const result = await withSession(layer, demoGraphName(env), (session) => readList(session), {
        timeoutMs: READ_BUDGET_MS,
      });
      return jsonResponse(200, { documents: result.documents });
    } catch (err) {
      const { status, body } = errorBodyFor(err);
      return jsonResponse(status, body);
    }
  };
}

export default createDocumentsHandler();
