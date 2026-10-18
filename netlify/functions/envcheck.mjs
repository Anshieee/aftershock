/**
 * Temporary diagnostic: GET /.netlify/functions/envcheck
 * Reports ONLY the NAMES of relevant env vars present in the function runtime.
 * Never returns values. Removed/reduced once backend wiring (M2) lands.
 */
const KEYS = ['FALKORDB_HOST', 'FALKORDB_PORT', 'FALKORDB_USER', 'FALKORDB_PASSWORD', 'FALKORDB_GRAPH_NAME', 'SEED_SECRET', 'NODE_VERSION'];

export default async function handler() {
  const present = KEYS.filter((k) => typeof process.env[k] === 'string' && process.env[k].length > 0);
  return Response.json({
    ok: true,
    service: 'aftershock-demo',
    envKeysPresent: present,
    envKeysMissing: KEYS.filter((k) => !present.includes(k)),
  });
}
