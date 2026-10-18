/**
 * @aftershock/server — FalkorDB graph client
 *
 * Server-side-only connection layer (AGENTS.md: the browser bundle must never
 * contain DB credentials). Conventions from FALKORDB.md are enforced here:
 *
 * - Reads go through `roQuery` (GRAPH.RO_QUERY), writes through `writeQuery`
 *   (GRAPH.QUERY).
 * - All Cypher is parameterized: `assertParameterized` rejects any query text
 *   that embeds quoted string literals and any non-object params bag, so
 *   string-concatenation injection cannot pass silently.
 * - Existing graphs are discovered with `db.list()` (GRAPH.LIST) before any
 *   implicit creation happens.
 * - Sane timeouts: connect timeout + per-query server-side TIMEOUT.
 * - Never logs or interpolates credential values into errors or output.
 */

import { FalkorDB } from 'falkordb';
import { DEMO_GRAPH_NAME, FIXTURE_IDS, SEED_ANALYSIS_VERSION } from './contract.mjs';

/** Credential/config problem (never includes the missing values themselves). */
export class CredentialsError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'CredentialsError';
  }
}

/** Connectivity failure (endpoint unreachable, auth rejected, …). */
export class ConnectionError extends Error {
  /**
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(message, cause) {
    super(message);
    this.name = 'ConnectionError';
    if (cause !== undefined) this.cause = cause;
  }
}

/** Query execution failure. Carries the Cypher text (safe: parameterized), never param payloads. */
export class GraphQueryError extends Error {
  /**
   * @param {string} graphName
   * @param {string} cypher
   * @param {unknown} cause
   */
  constructor(graphName, cypher, cause) {
    const original = cause instanceof Error ? cause.message : String(cause);
    super(`FalkorDB query failed on graph "${graphName}": ${original} — Cypher: ${cypher}`);
    this.name = 'GraphQueryError';
    this.graphName = graphName;
    this.cypher = cypher;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Violation of the parameterization guard (inline literal or invalid params bag). */
export class ParameterizationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ParameterizationError';
  }
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
/** Graph CPU budget per query — generous enough for the cloud ingress (FALKORDB.md). */
const DEFAULT_QUERY_TIMEOUT_MS = 20_000;

/**
 * @typedef {Object} Credentials
 * @property {string} host
 * @property {number} port
 * @property {string} username
 * @property {string} password
 * @property {'env'|'url'} source where the values came from (for diagnostics only, never values)
 */

/**
 * Extract FalkorDB credentials from an env-like map. Reads
 * `FALKORDB_HOST`/`FALKORDB_PORT`/`FALKORDB_USER`/`FALKORDB_PASSWORD`, falling
 * back to parsing `FALKORDB_URL` (`redis://user:pass@host:port`) for any piece
 * (host, port, username, password) that is not declared discretely. A discrete
 * env var always wins over the URL component. Error messages name the missing
 * *variable* — they never echo any value. Unit tests assert the no-leak
 * guarantee.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {Credentials}
 * @throws {CredentialsError}
 */
export function resolveCredentials(env = process.env) {
  assertEnvMap(env);
  const url = env.FALKORDB_URL ? safeParseUrl(env.FALKORDB_URL) : null;
  const host = env.FALKORDB_HOST;
  const portRaw = env.FALKORDB_PORT;
  const user = env.FALKORDB_USER;
  const password = env.FALKORDB_PASSWORD;

  if (!password && !(url && url.password)) {
    throw new CredentialsError('Missing connection credential: FALKORDB_PASSWORD is not set (or embed the password in FALKORDB_URL). Provide credentials via the server-side environment (Netlify env or .env); they are never client-side.');
  }
  if (host) {
    return {
      host,
      port: parsePort(portRaw, 'FALKORDB_PORT'),
      username: user || (url && url.username) || 'falkordb',
      password,
      source: 'env',
    };
  }
  if (url) {
    if (!url.hostname) {
      throw new CredentialsError('FALKORDB_URL was provided but carries no host component.');
    }
    return {
      host: url.hostname,
      port: url.port !== undefined ? url.port : parsePort(portRaw, 'FALKORDB_PORT'),
      username: user || url.username || 'falkordb',
      password: /** @type {string} */ (password ?? url.password),
      source: 'url',
    };
  }
  throw new CredentialsError('Missing connection target: FALKORDB_HOST (or FALKORDB_URL) is not set. Provide it via the server-side environment; it is never client-side.');
}

/**
 * @param {unknown} env
 * @returns {void}
 */
function assertEnvMap(env) {
  if (env === null || env === undefined || typeof env !== 'object') {
    throw new CredentialsError('resolveCredentials expects a process-env-like object.');
  }
}

/**
 * @param {string | undefined} raw
 * @param {string} varName
 * @returns {number}
 */
function parsePort(raw, varName) {
  const port = raw === undefined || raw === '' ? 6379 : Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CredentialsError(`${varName} must be an integer between 1 and 65535 (received ${raw === '' ? 'empty string' : 'an invalid value'}).`);
  }
  return port;
}

/**
 * @param {string} raw
 * @returns {{hostname: string, port?: number, username: string, password?: string}}
 */
function safeParseUrl(raw) {
  try {
    const u = /** @type {URL} */ (new URL(raw));
    return {
      hostname: u.hostname,
      port: u.port ? Number(u.port) : undefined,
      username: u.username ? decodeURIComponent(u.username) : 'default',
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch {
    throw new CredentialsError('FALKORDB_URL exists but is not a valid URL string.');
  }
}

export const CREDENTIAL_VARIABLES = Object.freeze({
  host: 'FALKORDB_HOST',
  port: 'FALKORDB_PORT',
  user: 'FALKORDB_USER',
  password: 'FALKORDB_PASSWORD',
});

const REDACTED_ENV = Object.freeze({
  FALKORDB_HOST: '[redacted]',
  FALKORDB_PORT: 0,
  FALKORDB_USER: '[redacted]',
  FALKORDB_PASSWORD: '[redacted]',
  FALKORDB_URL: 'redis://[redacted]@[redacted]:0',
});

/** Diagnostics-safe shape for logs/bug reports — never contains actual values. */
export function redactedEnvironmentView() {
  return Object.freeze({ ...REDACTED_ENV });
}

/**
 * Parameterization guard. Rejects any query containing a quoted string literal
 * (`'` or `"`) — every value must flow through `$param` (FALKORDB.md). Labels,
 * edge types, keywords and backtick-quoted identifiers may be written inline;
 * values may not.
 *
 * @param {string} cypher
 * @param {Record<string, unknown>} [params]
 * @throws {ParameterizationError}
 */
export function assertParameterized(cypher, params = {}) {
  if (typeof cypher !== 'string' || cypher.trim() === '') {
    throw new ParameterizationError('Cypher query text must be a non-empty string.');
  }
  if (params === undefined || params === null) {
    params = {};
  }
  if (typeof params !== 'object' || Array.isArray(params)) {
    throw new ParameterizationError('Query params must be a plain object ($param bag), not an array or scalar.');
  }
  for (const ch of cypher) {
    if (ch === '\'' || ch === '"') {
      throw new ParameterizationError(
        'Cypher query text contains a quoted string literal. Values must be passed as $params — inline literals are rejected by design (see FALKORDB.md).',
      );
    }
  }
}

/**
 * Build QueryOptions for the falkordb client: server-side TIMEOUT plus params.
 * Pure helper (unit-tested); exists so the timeout policy is explicit and
 * consistent across read and write paths.
 *
 * @param {Record<string, unknown>} params
 * @param {number} [timeoutMs]
 * @returns {{ params?: Record<string, unknown>, TIMEOUT: number }}
 */
export function buildQueryOptions(params, timeoutMs = DEFAULT_QUERY_TIMEOUT_MS) {
  const hasParams = params !== undefined && params !== null && Object.keys(params).length > 0;
  return {
    ...(hasParams ? { params } : {}),
    TIMEOUT: timeoutMs,
  };
}

/**
 * @typedef {Object} GraphSession
 * bound view over one FalkorDB connection + one target graph.
 * @property {import('falkordb').default} db raw client (use for db.list() probes)
 * @property {string} graphName target graph for all statement helpers below
 * @property {number} queryTimeoutMs
 * @property {(cypher: string, params?: Record<string, unknown>, opts?: {timeoutMs?: number}) => Promise<import('falkordb').GraphReply<Record<string, unknown>>>} roQuery
 * @property {(cypher: string, params?: Record<string, unknown>, opts?: {timeoutMs?: number}) => Promise<import('falkordb').GraphReply<Record<string, unknown>>>} writeQuery
 * @property {() => Promise<import('falkordb').GraphReply<Record<string, unknown>>>} listTypes probe
 * @property {() => Promise<string[]>} listGraphs
 * @property {() => Promise<boolean>} graphExists
 * @property {(opts?: {create?: boolean}) => Promise<{graphName: string, exists: boolean, created: boolean}>} ensureGraph
 * @property {() => Promise<void>} close
 */

/**
 * @typedef {Object} ConnectOptions
 * @property {string} [graphName='aftershock:demo']
 * @property {NodeJS.ProcessEnv | Record<string, string|undefined>} [env] defaults to process.env
 * @property {number} [connectTimeoutMs=10000]
 * @property {number} [queryTimeoutMs=20000]
 * @property {string} [clientName] CLIENT SETNAME tag, e.g. 'aftershock-netlify'
 */

/**
 * Connect to the FalkorDB cloud instance using server-side credentials from the
 * environment and return a bound `GraphSession` over the selected graph.
 * Defaults to `aftershock:demo`. Callers that intend to touch throwaway or
 * smoke graphs must pass those graph names explicitly.
 *
 * @param {ConnectOptions} [options]
 * @returns {Promise<GraphSession>}
 * @throws {CredentialsError} env missing/incomplete
 * @throws {ConnectionError} connect/socket failure
 */
export async function connectFromEnv(options = {}) {
  const env = options.env ?? process.env;
  const creds = resolveCredentials(env); // throws CredentialsError before any network I/O
  const graphName = options.graphName ?? DEMO_GRAPH_NAME;
  if (typeof graphName !== 'string' || graphName.trim() === '') {
    throw new ConnectionError('graphName must be a non-empty string.');
  }

  let db;
  try {
    db = await FalkorDB.connect({
      host: creds.host,
      port: creds.port,
      username: creds.username,
      password: creds.password,
      socket: { connectTimeout: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS },
      // Trivially identify our clients in the Cloud console; carries no secrets.
      name: options.clientName ?? 'aftershock-graph-library',
    });
  } catch (err) {
    // Never let original error carry credentials through: rewrite the message.
    const safeCause = err instanceof Error ? err.message.replace(/password[^,)]+/gi, 'password [redacted]') : String(err);
    throw new ConnectionError(`Could not connect to the FalkorDB instance (host/port are configured server-side; values never logged): ${safeCause}`, err);
  }

  return makeSession({
    db,
    graphName,
    queryTimeoutMs: options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
  });
}

/**
 * @param {{db: import('falkordb').default, graphName: string, queryTimeoutMs: number}} spec
 * @returns {GraphSession}
 */
function makeSession({ db, graphName, queryTimeoutMs }) {
  const graph = db.selectGraph(graphName);

  const runQuery = async (method, cypher, params, opts) => {
    assertParameterized(cypher, params);
    try {
      return await graph[method](cypher, buildQueryOptions(params, opts?.timeoutMs ?? queryTimeoutMs));
    } catch (err) {
      // GraphQueryError includes Cypher text (parameterized ⇒ no payload) but never params.
      throw new GraphQueryError(graphName, cypher, err);
    }
  };

  return {
    db,
    graphName,
    queryTimeoutMs,
    roQuery: (cypher, params = {}, opts = {}) => runQuery('roQuery', cypher, params, opts),
    writeQuery: (cypher, params = {}, opts = {}) => runQuery('query', cypher, params, opts),
    async listGraphs() {
      return db.list();
    },
    async graphExists() {
      const names = await db.list();
      return names.includes(graphName);
    },
    async ensureGraph(opts = {}) {
      const exists = await this.graphExists();
      if (exists) {
        return { graphName, exists: true, created: false };
      }
      if (!opts.create) {
        return { graphName, exists: false, created: false };
      }
      // Bootstrap write creates the graph implicitly (GRAPH.QUERY auto-create)
      // with the SeedMeta placeholder. seedGraph treats "SeedMeta without a
      // seedVersion matching the fixture" as stale and wipes/reseeds, so this
      // bootstrap never survives a real seed and cannot look like valid data.
      await this.writeQuery(
        // Param names are bare keys: the client serializes the bag as CYPHER key=value.
        'CREATE (m:SeedMeta) SET m.id = $id, m.seedVersion = null, m.bootstrappedAt = $ts, m.createdAt = $ts, m.updatedAt = $ts, m.provenanceKind = $prov, m.analysisVersion = $av, m.seeded = true',
        {
          id: FIXTURE_IDS.seedMeta,
          ts: new Date().toISOString(),
          prov: 'human_confirmed',
          av: SEED_ANALYSIS_VERSION,
        },
      );
      return { graphName, exists: true, created: true };
    },
    async close() {
      await db.close();
    },
  };
}
