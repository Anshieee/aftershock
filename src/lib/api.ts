/**
 * Typed API client for the Aftershock demo Netlify functions.
 *
 * Contract basis: docs/DATA_CONTRACTS.md §5 (routes), §1–§4 (entity/status
 * shapes), plus the M2-wave brief for payload shapes the contract leaves to
 * the functions layer. Rules honored here:
 *
 * - Truthful failure behavior: every failure mode (network down, timeout,
 *   HTTP error status, unparseable body) becomes a distinct typed error or
 *   an honest "not available yet" outcome. Nothing is ever remapped to a
 *   fake success.
 * - Truthful timeouts: every request carries a hard 10 s abort, matching
 *   what we tell the user; hanging requests surface as ApiTimeoutError.
 * - Graph reads stay read-only; the demo-seed POST is bodyless and guarded
 *   server-side (secret + rate limit). No arbitrary query payloads exist.
 */

/** Netlify Functions base — all JSON per contract §5. */
export const API_BASE = '/.netlify/functions';

/** Truthful client-side abort budget for every call (10 s). */
export const API_TIMEOUT_MS = 10_000;

/**
 * Route table — single place to adjust when the functions layer wires the
 * backend. Canonical dash paths = function filenames; Netlify cannot rewrite
 * inside the reserved /.netlify/functions namespace (production-verified
 * 2026-10-18), so every route is a function file's own path and dynamic
 * parameters live only in the query string. Unwired routes target the 501
 * stub `unimplemented` (`?for=` selects the surface). DATA_CONTRACTS §5
 * lists the generic `POST /seed`; if the wired endpoint differs, change it
 * here only.
 */
export const apiRoutes = {
  health: '/health',
  graphProbe: '/graph-probe',
  demoSeed: '/demo-seed',
  graphEdges: '/graph-edges',
  documents: '/documents',
  document: (id: string) => '/unimplemented?for=document&id=' + encodeURIComponent(id),
  analysisRunStatus: (runId: string) => '/unimplemented?for=analyze&runId=' + encodeURIComponent(runId),
} as const;

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class ApiClientError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options ? { cause: options.cause } : undefined);
    this.name = 'ApiClientError';
  }
}

/** The request was aborted by the client-side 10 s timeout. */
export class ApiTimeoutError extends ApiClientError {
  constructor(cause?: unknown) {
    super(`API request timed out after ${API_TIMEOUT_MS} ms`, { cause });
    this.name = 'ApiTimeoutError';
  }
}

/** `fetch` itself rejected — network down, DNS, refused connection, CORS. */
export class ApiNetworkError extends ApiClientError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ApiNetworkError';
  }
}

/** A non-success HTTP status the caller did not pre-handle. */
export class ApiHttpError extends ApiClientError {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message, { cause: status });
    this.name = 'ApiHttpError';
    this.status = status;
  }
}

/**
 * A 2xx answer carrying a non-JSON document body (content-type other than
 * `application/json`, e.g. the SPA fallback `/* → /index.html` shading a
 * function that is not deployed). Endpoint-missing — NOT unseeded, NOT a
 * failed probe with a derivable state: nothing about the workspace may be
 * inferred from it, so callers either report "not available yet" or an
 * unknown-status error, never a guessed status.
 */
export class ApiUnavailableError extends ApiClientError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ApiUnavailableError';
  }
}

/* ------------------------------------------------------------------ *
 * Outcomes for endpoints that may honestly not exist yet
 * (import/document/analyze graph routes land in later waves). Per the
 * brief, 404/501 there must read as "not available yet", never an error.
 * ------------------------------------------------------------------ */

/** Internal marker for a tolerated "endpoint not there yet" response. */
type NotAvailable = { reason: 'endpoint-missing' | 'not-implemented' };

export type ApiOutcome<T> =
  | { available: true; data: T }
  | { available: false; reason: 'endpoint-missing' | 'not-implemented' };

function isNotAvailable(value: unknown): value is NotAvailable {
  return (
    typeof value === 'object' &&
    value !== null &&
    !('available' in value) &&
    'reason' in value &&
    ((value as NotAvailable).reason === 'endpoint-missing' ||
      (value as NotAvailable).reason === 'not-implemented')
  );
}

function outcome<T>(data: unknown, parse: (payload: unknown) => T): ApiOutcome<T> {
  if (isNotAvailable(data)) return { available: false, reason: data.reason };
  return { available: true, data: parse(data) };
}

/* ------------------------------------------------------------------ *
 * Core request plumbing
 * ------------------------------------------------------------------ */

export interface RequestOptions {
  /** Caller-initiated abort (component unmount). Takes precedence over timeout. */
  signal?: AbortSignal;
  /** Test hook; production callers should use the truthful default. */
  timeoutMs?: number;
}

interface FetchArgs {
  path: string;
  init?: RequestInit;
  options?: RequestOptions;
  /** Statuses that resolve to an `available: false` outcome. */
  notAvailableStatuses?: readonly (404 | 501)[];
}

/**
 * Merges the caller signal and the timeout into one controller. The timer
 * drives the abort; the caller signal cancels first if it fires.
 */
function makeLinkedSignal(options: RequestOptions): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS;

  const abortFromCaller = () => {
    controller.abort();
  };
  if (options.signal) {
    if (options.signal.aborted) abortFromCaller();
    else options.signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

function isAbortDomException(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Low-level request. Returns a `NotAvailable` marker only for pre-handled statuses. */
async function request({ path, init, options, notAvailableStatuses = [] }: FetchArgs): Promise<unknown | NotAvailable> {
  const linked = makeLinkedSignal(options ?? {});
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: linked.signal,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (error) {
    if (isAbortDomException(error)) {
      // Caller aborts rethrow; timeout aborts surface as ApiTimeoutError.
      if (options?.signal?.aborted) throw error;
      throw new ApiTimeoutError(error);
    }
    throw new ApiNetworkError(error instanceof Error ? error.message : 'Network error', {
      cause: error,
    });
  } finally {
    linked.cleanup();
  }

  if (!response.ok) {
    if (notAvailableStatuses.some((s) => s === response.status)) {
      // Internal marker (no `available` key) — outcome() lifts it to the
      // public ApiOutcome union.
      return { reason: response.status === 501 ? 'not-implemented' : 'endpoint-missing' };
    }
    throw new ApiHttpError(response.status, `API responded with HTTP ${response.status}`);
  }

  // 2xx: JSON is the only acceptable data shape. Classify non-JSON bodies by
  // Content-Type: a non-JSON document (typically the SPA fallback shading an
  // undeployed function) is "endpoint unavailable"; an unparseable body that
  // at least claims to be JSON keeps the honest malformed-payload error.
  const contentType = response.headers.get('content-type')?.trim().toLowerCase() ?? '';
  const isJsonContentType = contentType.split(';')[0]?.trim() === 'application/json';
  const text = await response.text();
  let parsed: unknown;
  let parseFailed = false;
  try {
    parsed = JSON.parse(text);
  } catch {
    parseFailed = true;
  }
  if (parseFailed) {
    if (!isJsonContentType) {
      throw new ApiUnavailableError(
        'The API answered 2xx with a non-JSON page (likely the site fallback) — the endpoint is not available here.',
      );
    }
    throw new ApiClientError('API returned a non-JSON body with a success status');
  }
  return parsed;
}

/* ------------------------------------------------------------------ *
 * Endpoint payloads
 * ------------------------------------------------------------------ */

/** GET /health — liveness + build identity (M1 function; no graph claims). */
export interface HealthInfo {
  ok?: boolean;
  service?: string;
  graph?: string;
  version?: string;
}

export async function getHealth(options?: RequestOptions): Promise<HealthInfo> {
  const data = await request({ path: apiRoutes.health, options });
  if (!data || typeof data !== 'object') {
    throw new ApiClientError('Health endpoint returned an unexpected payload');
  }
  return data as HealthInfo;
}

/**
 * GET /graph-probe — M2 read-only probe.
 * Server contract: `{ exists, seedVersion?, nodeCount? }`.
 * 404 is mapped to `exists: false` per the M2 brief (missing == unseeded).
 */
export interface SeedStatus {
  exists: boolean;
  seedVersion?: string;
  nodeCount?: number;
}

function parseProbePayload(payload: unknown): SeedStatus {
  if (!payload || typeof payload !== 'object') {
    throw new ApiClientError('Graph probe returned an unexpected payload');
  }
  const record = payload as Record<string, unknown>;
  if (record.exists !== true && record.exists !== false) {
    throw new ApiClientError('Graph probe response is missing the `exists` flag');
  }
  return {
    exists: record.exists === true,
    seedVersion: typeof record.seedVersion === 'string' ? record.seedVersion : undefined,
    nodeCount: typeof record.nodeCount === 'number' ? record.nodeCount : undefined,
  };
}

export async function getSeedStatus(options?: RequestOptions): Promise<SeedStatus> {
  let data: unknown;
  try {
    data = await request({ path: apiRoutes.graphProbe, options });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      // HTML-shaded 2xx (function not deployed): seed status is UNKNOWN.
      // Never exists:false — endpoint-missing is not unseeded.
      throw new ApiUnavailableError(
        'Overview API is not available in this deployment (function missing) — seed status unknown.',
        { cause: error },
      );
    }
    if (error instanceof ApiHttpError && error.status === 404) {
      return { exists: false };
    }
    throw error;
  }
  return parseProbePayload(data);
}

/**
 * POST /demo-seed — bodyless, idempotent, server-side guarded
 * (secret + rate limit). Returns `{ seeded, alreadySeeded, seedVersion }`
 * on success; 429 and other statuses arrive as ApiHttpError so the UI can
 * say "cooldown" or "API unavailable", never fake success.
 */
export interface DemoSeedResult {
  seeded: boolean;
  alreadySeeded: boolean;
  seedVersion?: string;
}

export async function ensureDemoSeed(options?: RequestOptions): Promise<DemoSeedResult> {
  let data: unknown;
  try {
    data = await request({
      path: apiRoutes.demoSeed,
      init: { method: 'POST' },
      options,
    });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      // HTML-shaded 2xx on the POST path: classify as endpoint-missing —
      // honest "nothing ran", never a seeded-looking success.
      throw new ApiUnavailableError(
        'Guided-demo seeding is not available in this deployment (function missing) — nothing ran.',
        { cause: error },
      );
    }
    throw error;
  }
  if (!data || typeof data !== 'object') {
    throw new ApiClientError('Demo seed endpoint returned an unexpected payload');
  }
  const body = data as Record<string, unknown>;
  if (body.seeded !== true && body.alreadySeeded !== true) {
    // Refuse to promote an ambiguous response into a success state.
    throw new ApiClientError('Demo seed response found neither `seeded` nor `alreadySeeded`');
  }
  return {
    seeded: body.seeded === true,
    alreadySeeded: body.alreadySeeded === true,
    seedVersion: typeof body.seedVersion === 'string' ? body.seedVersion : undefined,
  };
}

/**
 * GET /graph-edges — overview of records with provenance kinds
 * (`?limit=` caps size; `?nodeId=&depth=1|2` scopes a neighborhood).
 * This route is being wired by the M2 server wave; 404/501 resolve to
 * `available: false` instead of throwing, per the brief.
 */
export interface GraphNode {
  id: string;
  kind: string;
  provenanceKind?: string;
  isSynthetic?: boolean;
  syntheticLabel?: string;
  author?: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id?: string;
  type: string;
  fromId: string;
  toId: string;
  provenanceKind?: string;
  rationale?: string;
  sourcePointer?: string;
  reviewState?: string;
  properties?: Record<string, unknown>;
}

export interface GraphOverview {
  nodes: GraphNode[];
  edges: GraphEdge[];
  graphName?: string;
  seedVersion?: string;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function nodeKindOf(payload: Record<string, unknown>): string {
  return (stringField(payload.kind) ?? stringField(payload.label) ?? stringField(payload.type) ?? 'Unknown');
}

function parseNode(payload: unknown, fallbackId: string): GraphNode {
  if (!payload || typeof payload !== 'object') {
    return { id: fallbackId, kind: 'Unknown', properties: {} };
  }
  const source = payload as Record<string, unknown>;
  const id = stringField(source.id) ?? fallbackId;
  const kind = nodeKindOf(source);
  const { kind: _k, label: _l, type: _t, id: _id, ...rest } = source;
  const isSynthetic = typeof source.isSynthetic === 'boolean' ? source.isSynthetic : undefined;
  return {
    id,
    kind,
    provenanceKind: stringField(source.provenanceKind),
    isSynthetic,
    syntheticLabel:
      isSynthetic === true
        ? (stringField(source.syntheticLabel) ?? 'FICTIONAL / GUIDED DEMO')
        : undefined,
    properties: rest as Record<string, unknown>,
  };
}

function parseEdge(payload: unknown, index: number): GraphEdge | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const fromId = stringField(source.fromId) ?? stringField(source.from) ?? stringField(source.source);
  const toId = stringField(source.toId) ?? stringField(source.to) ?? stringField(source.target);
  const type = stringField(source.type) ?? stringField(source.rel) ?? stringField(source.relationship);
  if (!type || !fromId || !toId) return null;
  const { type: _t, fromId: _f, toId: _to, ...rest } = source;
  return {
    id: stringField(source.id) ?? `edge-${index}`,
    type,
    fromId,
    toId,
    provenanceKind: stringField(source.provenanceKind),
    rationale: stringField(source.rationale),
    sourcePointer: stringField(source.sourcePointer),
    reviewState: stringField(source.reviewState),
    properties: rest as Record<string, unknown>,
  };
}

/**
 * Parses the graph-records payload. Exported so tests and pages share one
 * normalization path — the client's only opinion about wire shape lives here
 * (flat graph records, mirror of the server fixture).
 */
export function parseGraphOverview(payload: unknown): GraphOverview {  if (!payload || typeof payload !== 'object') {
    throw new ApiClientError('Graph overview returned an unexpected payload');
  }
  const source = payload as Record<string, unknown>;
  const hasNodeList = Array.isArray(source.nodes);
  const hasEdgeList = Array.isArray(source.edges);
  if (!hasNodeList && !hasEdgeList) {
    throw new ApiClientError('Graph overview is missing both `nodes` and `edges` arrays');
  }
  const parsedNodes = (hasNodeList ? (source.nodes as unknown[]) : []).map((node, index) =>
    parseNode(node, `node-${index}`),
  );
  const parsedEdges = (hasEdgeList ? (source.edges as unknown[]) : [])
    .map((edge, index) => parseEdge(edge, index))
    .filter((edge): edge is GraphEdge => edge !== null);
  return {
    nodes: parsedNodes,
    edges: parsedEdges,
    graphName: stringField(source.graphName),
    seedVersion: stringField(source.seedVersion),
  };
}

export async function getGraphOverview(
  params: { limit?: number; nodeId?: string; depth?: 1 | 2 },
  options?: RequestOptions,
): Promise<ApiOutcome<GraphOverview>> {
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.nodeId !== undefined) search.set('nodeId', params.nodeId);
  if (params.depth !== undefined) search.set('depth', String(params.depth));
  const query = search.toString();
  const path = `${apiRoutes.graphEdges}${query ? `?${query}` : ''}`;
  let data: unknown;
  try {
    data = await request({
      path,
      options,
      notAvailableStatuses: [404, 501],
    });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      // SPA-shaded 2xx (function not deployed): same honest outcome as a
      // missing endpoint — "not available yet", never an error, never data.
      return { available: false, reason: 'endpoint-missing' };
    }
    throw error;
  }
  return outcome(data, parseGraphOverview);
}

/**
 * GET /documents — document list. Import routes land in M4; missing or
 * unimplemented endpoints resolve to `available: false` per the brief.
 */
export interface DocumentSummary {
  id: string;
  title?: string;
  fileName?: string;
  format?: string;
  importedAt?: string;
  versionId?: string;
}

export interface DocumentDetail extends DocumentSummary {
  createdAt?: string;
  sourceHash?: string;
  isSynthetic?: boolean;
  noticeLink?: string;
}

function asObjectList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
    );
  }
  if (payload && typeof payload === 'object') {
    const wrapper = payload as Record<string, unknown>;
    if (Array.isArray(wrapper.documents)) {
      return wrapper.documents.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
      );
    }
  }
  return [];
}

export async function getDemoDocuments(options?: RequestOptions): Promise<ApiOutcome<DocumentSummary[]>> {
  let data: unknown;
  try {
    data = await request({
      path: apiRoutes.documents,
      options,
      notAvailableStatuses: [404, 501],
    });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      return { available: false, reason: 'endpoint-missing' };
    }
    throw error;
  }
  return outcome(data, (payload) =>
    asObjectList(payload).map((element, index) => ({
      id: stringField(element.id) ?? `document-${index}`,
      title: stringField(element.title),
      fileName: stringField(element.fileName),
      format: stringField(element.format),
      importedAt: stringField(element.importedAt),
      versionId: stringField(element.versionId),
    })),
  );
}

/**
 * Analysis-run status (contract §4 stage list) — not wired yet (M4/M5);
 * the route targets the 501 stub `unimplemented?for=analyze&runId=…`,
 * so 404/501 resolve to `available: false` per the brief.
 */
export interface AnalysisRunInfo {
  runId: string;
  status?: string;
  stage?: string;
  completedAt?: string;
  error?: string;
}

export async function getAnalysisRun(
  runId: string,
  options?: RequestOptions,
): Promise<ApiOutcome<AnalysisRunInfo>> {
  let data: unknown;
  try {
    data = await request({
      path: apiRoutes.analysisRunStatus(runId),
      options,
      notAvailableStatuses: [404, 501],
    });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      return { available: false, reason: 'endpoint-missing' };
    }
    throw error;
  }
  return outcome(data, (payload) => {
    if (!payload || typeof payload !== 'object') {
      throw new ApiClientError('Analysis status endpoint returned an unexpected payload');
    }
    const source = payload as Record<string, unknown>;
    return {
      runId: stringField(source.runId) ?? runId,
      status: stringField(source.status),
      stage: stringField(source.stage),
      completedAt: stringField(source.completedAt),
      error: stringField(source.error),
    };
  });
}
