/**
 * Temporary diagnostic: GET /.netlify/functions/envcheck
 * Names/count only — never values. Reports total env key count and a few pagination-safe signs
 * so we can distinguish "no runtime injection at all" from "scope semantics".
 */
const SIGNIFICANT = ['NODE_VERSION', 'AWS_LAMBDA_FUNCTION_NAME', 'NETLIFY', 'FALKORDB_HOST', 'FALKORDB_USER', 'SEED_SECRET'];

export default async function handler() {
  const keys = Object.keys(process.env);
  return Response.json({
    ok: true,
    service: 'aftershock-demo',
    envKeyCount: keys.length,
    significant: SIGNIFICANT.reduce((acc, k) => ({ ...acc, [k]: keys.includes(k) }), {}),
  });
}
