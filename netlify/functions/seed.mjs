/**
 * POST /.netlify/functions/seed — SENSITIVE managed reseed route
 * (DATA_CONTRACTS §5 `POST /seed`; handoff §13; AGENTS.md hard rules).
 *
 * This is intentionally NOT called by the frontend — it exists so a vacated
 * free-tier graph can be truthfully rebuilt from the versioned synthetic
 * fixture. Guards, in order:
 *   1. POST only (405 otherwise, `allow` header).
 *   2. Bodyless (any body → 400).
 *   3. Secret: header `x-seed-secret` must equal `SEED_SECRET` via a
 *      constant-time comparison (`sha256` + `crypto.timingSafeEqual`).
 *      Missing header → 401; wrong value → 403. Error text never contains
 *      or hints at the secret values.
 *   4. Rate limit: stricter than /demo/seed (1 / 60 s, 3 / 10 min per IP),
 *      per-isolate in-memory (honest demo-scope limitation, same as
 *      demo-seed — the platform edge is the real production control).
 *   5. Serialized per isolate via a queue; runs `server/seed.mjs#seedGraph`
 *      on `FALKORDB_GRAPH_NAME` ONLY (no hardcoded graph). Idempotent: an
 *      up-to-date graph reports `action:'noop'` honestly instead of
 *      pretending a reseed happened.
 *
 * There is no arbitrary-Cypher, no reset-token-free path, and no log output
 * anywhere on this route.
 */

import { seedGraph } from '../../server/seed.mjs';
import {
  clientIpOf,
  createGraphLayer,
  createRateLimiter,
  createSerialQueue,
  demoGraphName,
  errorBodyFor,
  jsonResponse,
  safeSecretEqual,
  textBodyOf,
  withSession,
} from '../../server/demoApi.mjs';

const RATE_LIMIT_COOLDOWN_MS = 60_000; // managed path: stricter cooldown
const RATE_LIMIT_WINDOW_MS = 600_000;
const RATE_LIMIT_MAX_PER_WINDOW = 3;

export function createManagedSeedHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter({
    cooldownMs: RATE_LIMIT_COOLDOWN_MS,
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxPerWindow: RATE_LIMIT_MAX_PER_WINDOW,
  });
  const enqueue = deps.enqueue ?? createSerialQueue();
  const runSeed = deps.seedRunner ?? seedGraph;
  const timeoutMs = deps.timeoutMs ?? 120_000;

  return async function handler(request /*, context */) {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: 'POST' });
    }

    const declaredLength = request.headers.get('content-length');
    if (declaredLength && Number(declaredLength) > 0) {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: 'This endpoint must be called without a request body.',
      });
    }
    const body = await textBodyOf(request);
    if (body.length > 0) {
      return jsonResponse(400, {
        error: 'invalid-request',
        message: 'This endpoint must be called without a request body.',
      });
    }

    // Secret guard FIRST: unauthenticated traffic must not consume the
    // managed-path run budget. Constant-time; no secret material is ever
    // included in any response or log.
    const provided = request.headers.get('x-seed-secret');
    const expected = env.SEED_SECRET;
    if (!provided) {
      return jsonResponse(401, {
        error: 'unauthorized',
        message: 'Missing required x-seed-secret header. This route is reserved for server-side operations.',
      });
    }
    if (!safeSecretEqual(provided, expected)) {
      return jsonResponse(403, {
        error: 'forbidden',
        message: 'Seed secret did not match. Access is denied; the configured value is never disclosed.',
      });
    }

    const gate = limiter.check(clientIpOf(request));
    if (!gate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        {
          error: 'rate-limited',
          message: 'Managed seeding is rate limited: at most once per 60 seconds and 3 times per 10 minutes. Wait and try again. Nothing was changed by this request.',
        },
        { 'retry-after': String(retryAfterSeconds) },
      );
    }

    return enqueue(async () => {
      try {
        const result = await withSession(layer, demoGraphName(env), (session) => runSeed(session), {
          timeoutMs,
        });
        const alreadySeeded = result.action === 'noop';
        return jsonResponse(200, {
          seeded: !alreadySeeded,
          alreadySeeded,
          action: result.action,
          seedVersion: result.seedVersion,
        });
      } catch (err) {
        const { status, body } = errorBodyFor(err, 'seed');
        return jsonResponse(status, body);
      }
    });
  };
}

export default createManagedSeedHandler();
