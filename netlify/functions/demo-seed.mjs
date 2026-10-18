/**
 * POST /.netlify/functions/demo/seed — guided-demo seed (bodyless, public).
 *
 * Netlify Functions v2 handler; the client-facing path `/demo/seed` is mapped
 * onto this dash-named file by a netlify.toml status-200 rewrite (function
 * filenames cannot contain dots, and Functions-v2 `config.path` must not be
 * relied upon under the /.netlify/functions base — the rewrite IS the route).
 *
 * Behavior (DATA_CONTRACTS §5/§6, honesty rules from AGENTS.md):
 * - POST only (405 otherwise). ANY request body → 400 (this route must be
 *   bodyless; nothing to parse, nothing to trust).
 * - Probe-and-seed via `server/seed.mjs#seedGraph` — the idempotency
 *   authority from M2. Its own version+count check decides:
 *     action 'noop'           → 200 { seeded: false, alreadySeeded: true,  seedVersion }
 *     action 'seeded'/'reseeded' → 200 { seeded: true, alreadySeeded: false, seedVersion }
 *   Every success value traces to the real seedGraph return value — nothing
 *   is ever simulated or promoted to a fake success.
 * - Failure → 503 `{ error: 'seed-failed', … }` with no fabricated body.
 * - Rate limiting: per-IP cooldown (1 run / 30 s) + window (5 / 10 min), with
 *   a plain-language honest 429 message plus `Retry-After`. Runs are
 *   serialized per isolate via a global queue so parallel POSTs cannot
 *   double-seed; the queued second caller re-runs seedGraph and surfaces the
 *   honest `alreadySeeded` flag.
 *
 * HONEST LIMITATION (documented, demo scope): in-memory rate limits are
 * per-isolate (Netlify cold starts reset them). Platform-side limiting is
 * the real production control; this layer is protection against accidental
 * double-clicks, not an abuse boundary. The route is public BY DESIGN
 * (it seeds the synthetic fixture only) but still guarded: method + body
 * + rate limit + bounded runtime.
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
  textBodyOf,
  withSession,
} from '../../server/demoApi.mjs';

const RATE_LIMIT_COOLDOWN_MS = 10_000; // one run per IP per 10 s
const RATE_LIMIT_WINDOW_MS = 60_000; // 1-minute window
const RATE_LIMIT_MAX_PER_WINDOW = 6; // at most 6 runs per window per IP

export function createDemoSeedHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const layer = deps.layer ?? createGraphLayer(env);
  const limiter = deps.limiter ?? createRateLimiter({
    cooldownMs: RATE_LIMIT_COOLDOWN_MS,
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxPerWindow: RATE_LIMIT_MAX_PER_WINDOW,
  });
  const enqueue = deps.enqueue ?? createSerialQueue();
  const runSeed = deps.seedRunner ?? seedGraph;
  // Seed writes are unbudgeted by the wall-clock deadline on purpose: each
  // write carries the library's own server-side TIMEOUT (60 s), and a
  // deadline-abort would leave mid-flight state while the client already
  // saw an error. seedGraph's meta-node-last ordering means ANY failure or
  // abandonment leaves no advertised seedVersion and is healed by the next
  // seed attempt (scoped `seeded = true` wipe).
  const timeoutMs = deps.timeoutMs ?? 120_000;

  return async function handler(request /*, context */) {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method-not-allowed' }, { allow: 'POST' });
    }

    // Bodyless guard: refuse before reading when Content-Length is declared,
    // then verify nothing arrived (chunked/buffered bodies).
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

    // Per-IP gate. The IP key is used for in-memory throttling only; it is
    // never logged and never echoed into a response.
    const gate = limiter.check(clientIpOf(request));
    if (!gate.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(gate.retryAfterMs / 1000));
      return jsonResponse(
        429,
        {
          error: 'rate-limited',
          message: 'Demo seeding is rate limited: at most once every 10 seconds and 6 times per minute per client. Please wait and try again. This request seeded nothing.',
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
          seedVersion: result.seedVersion,
        });
      } catch (err) {
        const { status, body } = errorBodyFor(err, 'seed');
        return jsonResponse(status, body);
      }
    });
  };
}

export default createDemoSeedHandler();
