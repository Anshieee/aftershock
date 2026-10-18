/**
 * Placeholder handler for routes that are intentionally NOT implemented yet:
 *   GET /.netlify/functions/documents/:id
 *   GET /.netlify/functions/analyze/:runId/status
 * (M4/M5 scope — see DATA_CONTRACTS.md §5 and the M3 brief.)
 *
 * Chosen wiring (simpler than per-route functions): `netlify.toml` rewrites
 * `/.netlify/functions/documents/*` and `/.netlify/functions/analyze/*` to
 * this function with status 200. The response is 501 with
 * `{ reason: 'not-implemented', … }`, which the deployed client maps —
 * together with a plain 404 — to the honest "not available yet" outcome.
 * It claims nothing, fabricates nothing, and runs no database code.
 */

const BODY = {
  reason: 'not-implemented',
  message: 'This API surface is not implemented yet (M4/M5 scope). Nothing ran; no data was read or written.',
};

export default async function handler() {
  return new Response(JSON.stringify(BODY), {
    status: 501,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      allow: 'GET',
    },
  });
}
