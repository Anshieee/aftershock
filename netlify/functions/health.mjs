/**
 * GET /.netlify/functions/health — Netlify Functions v2 style handler.
 *
 * Liveness indicator only. Deliberately does NOT connect to FalkorDB in M1:
 * no secrets exist in the runtime yet, and nothing must be labeled
 * "connected" that isn't. Migrations in M2 add a truthful graph probe.
 *
 * Response shape is contractual (docs/DATA_CONTRACTS.md §5): all JSON.
 */

const version = '0.1.0';

export default async function handler() {
  return Response.json({
    ok: true,
    service: 'aftershock-demo',
    graph: 'not-configured',
    version,
  });
}
