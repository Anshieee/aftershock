/**
 * Temporary diagnostic: GET /.netlify/functions/envcheck
 * Names/count/booleans only — never values.
 */
const SIGNIFICANT = ['NODE_VERSION', 'FALKORDB_HOST', 'FALKORDB_PORT', 'FALKORDB_USER', 'FALKORDB_PASSWORD', 'FALKORDB_GRAPH_NAME', 'SEED_SECRET'];

export default async function handler() {
  const keys = Object.keys(process.env);
  return Response.json({
    ok: true,
    service: 'aftershock-demo',
    envKeyCount: keys.length,
    significant: SIGNIFICANT.reduce((acc, k) => ({ ...acc, [k]: keys.includes(k) }), {}),
  });
}
