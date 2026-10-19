/**
 * Diagnostic: GET /.netlify/functions/envcheck
 *
 * TEMPORARY build/deploy diagnostic, now GATED (hardening wave): the route is
 * behind the same server secret as /seed (`x-seed-secret`, constant-time
 * comparison, no secret material in any response or log). Unauthenticated
 * callers receive honest 401/403 and NO environment facts.
 *
 * Payload (only for the secret-holding caller): names/count/booleans only —
 * never values, never config contents. Kept callable for deploy verification
 * (`curl -H 'x-seed-secret: …'`); removal decision documented in
 * docs/POST_SUBMISSION_AUDIT.md.
 *
 * Test seam: `createEnvcheckHandler(deps)` accepts an injectable `env` so unit
 * tests never touch real process.env (same discipline as the other handlers).
 */

import { jsonResponse, safeSecretEqual } from '../../server/demoApi.mjs';

const SIGNIFICANT = [
  'NODE_VERSION',
  'FALKORDB_HOST',
  'FALKORDB_PORT',
  'FALKORDB_USER',
  'FALKORDB_PASSWORD',
  'FALKORDB_GRAPH_NAME',
  'SEED_SECRET',
];

export function createEnvcheckHandler(deps = {}) {
  const env = deps.env ?? process.env;

  return async function handler(request) {
    const provided =
      request instanceof Request && typeof request.headers.get === 'function'
        ? request.headers.get('x-seed-secret')
        : null;

    if (!provided) {
      return jsonResponse(401, {
        error: 'unauthorized',
        message: 'Missing required x-seed-secret header. This diagnostic route is reserved for server-side operations.',
      });
    }
    if (!safeSecretEqual(provided, env.SEED_SECRET)) {
      return jsonResponse(403, {
        error: 'forbidden',
        message: 'Diagnostic secret did not match. Access is denied; the configured value is never disclosed.',
      });
    }

    const keys = Object.keys(env);
    return jsonResponse(200, {
      ok: true,
      service: 'aftershock-demo',
      envKeyCount: keys.length,
      significant: SIGNIFICANT.reduce(
        (acc, k) => ({ ...acc, [k]: Object.prototype.hasOwnProperty.call(env, k) }),
        {},
      ),
    });
  };
}

export default createEnvcheckHandler();
