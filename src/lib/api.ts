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
 * - M4 additions (fixed contract with the server wave): document import and
 *   analysis start expose honest typed outcomes — a contentless registration
 *   is a distinct truthful result, never a fake analysis success.
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
 *
 * M4 wired routes (fixed contract with the parallel server wave — do not
 * rename): `importDocument`, `analyze`, `analysisStatus`, `documentDetail`.
 * The two `unimplemented?for=` entries above stay byte-identical: parallel
 * agents and the deployed M2 wave still resolve through them.
 */
export const apiRoutes = {
  health: '/health',
  graphProbe: '/graph-probe',
  demoSeed: '/demo-seed',
  graphEdges: '/graph-edges',
  documents: '/documents',
  documentsImported: '/documents-imported',
  document: (id: string) => '/unimplemented?for=document&id=' + encodeURIComponent(id),
  analysisRunStatus: (runId: string) => '/unimplemented?for=analyze&runId=' + encodeURIComponent(runId),
  importDocument: '/import-document',
  analyze: '/analyze',
  analysisStatus: '/analyze-status',
  documentDetail: '/document-detail',
  // M5 — human review decisions + revision proposals (fixed contract, §5).
  // Each route carries its dynamic `caseId` as a query param; the caller
  // appends encodeURIComponent(caseId) to the leading `?caseId=` prefix.
  reviewDecide: (_caseId: string) => '/review-decide?caseId=',
  reviewRevision: (_caseId: string) => '/review-revision?caseId=',
  // M6 — export endpoints (fixed contract, §5). Binary responses (PDF/DOCX);
  // dynamic parameters live in the query string. 404/501 → available:false.
  exportReport: '/export-report',
  exportRevisionPack: '/export-revision-pack',
  exportAnnotatedManuscript: '/export-annotated-manuscript',
  // M7 — activity timeline (contract §5, §11). GET /activity returns the
  // real chronological event list; 404/501 → available:false ("not available
  // yet", never fabricated history).
  activity: '/activity',
  // P4 — Find Evidence. POST /evidence-find?claimId= (deploy path = function
  // filename `evidence-find`; the DATA_CONTRACTS §5 logical name is
  // `POST /evidence/find` per the dash-path mapping convention, same as
  // review-decide). Fixed contract with the parallel P4 server wave.
  evidenceFind: '/evidence-find',
} as const;

/**
 * Client-side import guard — mirrors the server's bounded payload so an
 * oversized file is rejected BEFORE any byte leaves the browser.
 */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** Guided-demo manuscript IDs — fixed synthetic fixture IDs (contract §6). */
export const DEMO_MANUSCRIPT_DOCUMENT_ID = 'doc-demo-manuscript';
export const DEMO_MANUSCRIPT_VERSION_ID = 'ver-demo-manuscript-v1';

/** Import formats the M4 pipeline accepts (contract §1: pdf|docx|txt). */
export type ImportFormat = 'pdf' | 'docx' | 'txt';

/**
 * Derives the pipeline format from a file. A recognized extension decides;
 * the MIME type is trusted only for files with NO extension at all (a
 * present-but-unrecognized extension is rejected regardless of MIME, so a
 * mislabeled or double-extension file can never slip through). Returns null
 * for anything outside the accepted set — callers must reject BEFORE
 * uploading, never after.
 */
export function importFormatOf(fileName: string, mimeType?: string): ImportFormat | null {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase();
  if (extension) {
    return extension === 'pdf' || extension === 'docx' || extension === 'txt' ? extension : null;
  }
  const mime = (mimeType ?? '').trim().toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }
  if (mime === 'text/plain') return 'txt';
  return null;
}

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
  /** Read the 2xx body as a raw Blob (binary export endpoints) instead of JSON. */
  blobBody?: boolean;
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

/**
 * Shared 2xx body reader: JSON is the only acceptable data shape. Classifies
 * non-JSON bodies by Content-Type — a non-JSON document (typically the SPA
 * fallback shading an undeployed function) is "endpoint unavailable"; an
 * unparseable body that at least claims to be JSON keeps the honest
 * malformed-payload error.
 */
async function readJsonBody(response: Response): Promise<unknown> {
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

/** Low-level request. Returns a `NotAvailable` marker only for pre-handled statuses. */
async function request({ path, init, options, notAvailableStatuses = [], blobBody = false }: FetchArgs): Promise<unknown | NotAvailable> {
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

  // 2xx: binary endpoints return a Blob; JSON endpoints go through readJsonBody
  // (content-type classification — identical logic to the original inline block).
  if (blobBody) {
    const contentType = response.headers.get('content-type')?.trim().toLowerCase() ?? '';
    const mainType = contentType.split(';')[0]?.trim();
    const isBinaryDocument =
      mainType === 'application/pdf' ||
      mainType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mainType === 'application/octet-stream';
    // An HTML page or JSON document shading a missing function is not a real
    // export — treat as endpoint-unavailable so the caller says "not available yet".
    if (!isBinaryDocument) {
      throw new ApiUnavailableError(
        'The export endpoint answered 2xx with a non-binary document (likely the site fallback) — the endpoint is not available here.',
      );
    }
    return response.blob();
  }
  return readJsonBody(response);
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
  /**
   * M4 import truth: the server may register a document without storing its
   * text content. Absent means "not reported by this payload" — never guessed.
   */
  contentStored?: boolean;
  /** Server-provided disclosure for registered-but-contentless documents. */
  disclosure?: string;
  isSynthetic?: boolean;
  syntheticLabel?: string;
  /** Size in bytes of the imported file — shown verbatim, never guessed. */
  sizeBytes?: number;
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
      contentStored:
        typeof element.contentStored === 'boolean' ? element.contentStored : undefined,
      disclosure: stringField(element.disclosure),
      isSynthetic: typeof element.isSynthetic === 'boolean' ? element.isSynthetic : undefined,
      syntheticLabel: stringField(element.syntheticLabel),
      sizeBytes: typeof element.sizeBytes === 'number' ? element.sizeBytes : undefined,
    })),
  );
}

/**
 * GET /documents-imported — user-imported documents (non-seeded,
 * contentStored: false). These do not appear in the seeded /documents list.
 * 404/501 resolve to `available: false` ("not available yet", never an error).
 */
export async function getImportedDocuments(
  options?: RequestOptions,
): Promise<ApiOutcome<DocumentSummary[]>> {
  let data: unknown;
  try {
    data = await request({
      path: apiRoutes.documentsImported,
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
      contentStored:
        typeof element.contentStored === 'boolean' ? element.contentStored : undefined,
      disclosure: stringField(element.disclosure),
      isSynthetic: typeof element.isSynthetic === 'boolean' ? element.isSynthetic : undefined,
      syntheticLabel: stringField(element.syntheticLabel),
      sizeBytes: typeof element.sizeBytes === 'number' ? element.sizeBytes : undefined,
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

/** Shared parse for both the M2 stub route and the wired M4 status route. */
function parseAnalysisInfo(payload: unknown, fallbackRunId: string): AnalysisRunInfo {
  if (!payload || typeof payload !== 'object') {
    throw new ApiClientError('Analysis status endpoint returned an unexpected payload');
  }
  const source = payload as Record<string, unknown>;
  return {
    runId: stringField(source.runId) ?? fallbackRunId,
    status: stringField(source.status),
    stage: stringField(source.stage),
    completedAt: stringField(source.completedAt),
    error: stringField(source.error),
  };
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
  return outcome(data, (payload) => parseAnalysisInfo(payload, runId));
}

/* ------------------------------------------------------------------ *
 * M4 — document import + analysis start (fixed server contract).
 * The client performs the size/format guards BEFORE any request; the
 * server re-checks and answers 413/415/400 as typed HTTP errors.
 * ------------------------------------------------------------------ */

export interface ImportDocumentInfo {
  documentId: string;
  versionId: string;
  /**
   * False in this build: the file bytes register a document record but the
   * text content is not stored, so analysis of it would honestly refuse.
   */
  contentStored: boolean;
  /** Server's disclosure for the contentless registration — shown verbatim. */
  disclosure?: string;
  /**
   * Wave 3 (additive, optional): in-memory session-scoped extraction of
   * candidate reference DOIs, computed by the server from the already-read
   * bytes during the SAME single import pass. NEVER persisted, NEVER written
   * to the graph, and its contents are UNVERIFIED pattern-match output —
   * detected DOIs are candidate identifiers only, never verified citations,
   * never support for any claim, never content stored anywhere.
   *
   * The member may be absent entirely (older deploys); absence is tolerated
   * and must never be guessed into a state.
   */
  extraction?: ImportExtraction;
}

/**
 * One detected DOI candidate. Unverified by definition: this is shallow
 * pattern-match output on a bounded excerpt of the file, not reference
 * validation and not an assertion that the identifier resolves.
 */
export interface ImportDetectedDoi {
  /** Display-form DOI string the pattern matched — unverified. */
  doi: string;
  /** Occurrences of the normalized DOI within the scanned excerpt. */
  occurrences: number;
  /** Short excerpt around the FIRST occurrence, if the server includes one. */
  snippet?: string;
}

/** Bounded scan shape reported alongside detected candidates (attempted=true). */
export interface ImportExtractionByteSelection {
  scannedBytes: number;
  maxBytes: number;
  truncated: boolean;
}

/** The optional `extraction` member of the import response (design of record). */
export interface ImportExtraction {
  attempted: boolean;
  format: ImportFormat;
  /** Present when attempted=true — the bounded-scan selection shape. */
  byteSelection?: ImportExtractionByteSelection;
  /** Present when attempted=true; may be an EMPTY list (no candidate found). */
  dois?: ImportDetectedDoi[];
  /** Present when attempted=false — stable, honest, human-readable reason. */
  reason?: string;
  /** Server's standing honesty caveat, shown verbatim when present. */
  caveat?: string;
}

/**
 * Tolerant parse of the optional `extraction` member (Wave 3). Absence
 * (older deploys) or a malformed member cleanly drops to `undefined` —
 * it is never guessed into an extraction state and never fails the parse
 * of the rest of the import response.
 */
function parseImportExtraction(value: unknown): ImportExtraction | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const src = value as Record<string, unknown>;
  if (typeof src.attempted !== 'boolean') return undefined;
  // A missing/unknown format is a malformed member, not a guess target —
  // drop it entirely (never fabricate a format).
  if (src.format !== 'pdf' && src.format !== 'docx' && src.format !== 'txt') return undefined;
  const format: ImportFormat = src.format;

  let byteSelection: ImportExtractionByteSelection | undefined;
  const bs = src.byteSelection;
  if (bs && typeof bs === 'object') {
    const shape = bs as Record<string, unknown>;
    if (
      typeof shape.scannedBytes === 'number' &&
      typeof shape.maxBytes === 'number' &&
      typeof shape.truncated === 'boolean'
    ) {
      byteSelection = {
        scannedBytes: shape.scannedBytes,
        maxBytes: shape.maxBytes,
        truncated: shape.truncated,
      };
    }
  }

  let dois: ImportDetectedDoi[] | undefined;
  if (Array.isArray(src.dois)) {
    dois = src.dois
      .filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
      )
      .filter((item) => stringField(item.doi) !== undefined)
      .map((item) => ({
        doi: item.doi as string,
        occurrences: typeof item.occurrences === 'number' ? item.occurrences : 1,
        snippet: stringField(item.snippet),
      }));
  }

  return {
    attempted: src.attempted,
    format,
    byteSelection,
    dois,
    reason: stringField(src.reason),
    caveat: stringField(src.caveat),
  };
}

export type ImportDocumentOutcome = ApiOutcome<ImportDocumentInfo>;

function parseImportDocumentInfo(payload: unknown): ImportDocumentInfo {
  if (!payload || typeof payload !== 'object') {
    throw new ApiClientError('Import endpoint returned an unexpected payload');
  }
  const body = payload as Record<string, unknown>;
  const documentId = stringField(body.documentId);
  const versionId = stringField(body.versionId);
  if (!documentId || !versionId) {
    throw new ApiClientError('Import response is missing `documentId` or `versionId`');
  }
  if (typeof body.contentStored !== 'boolean') {
    throw new ApiClientError('Import response is missing the `contentStored` flag');
  }
  const info: ImportDocumentInfo = {
    documentId,
    versionId,
    contentStored: body.contentStored,
    disclosure: stringField(body.disclosure),
  };
  // Optional member: silently absent on older deploys; malformed → dropped,
  // never guessed. Required import fields above still gate success.
  const extraction = parseImportExtraction(body.extraction);
  if (extraction) info.extraction = extraction;
  return info;
}

/**
 * POST /import-document?fileName=&format= — raw file bytes as the body.
 * Client-side guards run first (format + ≤10 MB) and reject WITHOUT any
 * network request. 413/415/400 arrive as ApiHttpError so the UI can show a
 * typed honest message; 404/501 resolve to `available: false` (import not
 * wired on this deployment) — never a fabricated registration.
 */
export async function importDocument(
  file: File,
  options?: RequestOptions,
): Promise<ImportDocumentOutcome> {
  const format = importFormatOf(file.name, file.type);
  if (!format) {
    throw new ApiClientError('Only PDF, DOCX and TXT files are accepted. Nothing was uploaded.');
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ApiClientError(
      `This file is larger than the 10 MB limit (${describeBytes(file.size)}). Nothing was uploaded.`,
    );
  }
  const search = new URLSearchParams({ fileName: file.name, format });
  let data: unknown;
  try {
    data = await request({
      path: `${apiRoutes.importDocument}?${search.toString()}`,
      init: { method: 'POST', body: file },
      options,
      notAvailableStatuses: [404, 501],
    });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      // SPA-shaded 2xx (function missing): same honest outcome as 404/501.
      return { available: false, reason: 'endpoint-missing' };
    }
    throw error;
  }
  return outcome(data, parseImportDocumentInfo);
}

export function describeBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${bytes} bytes`;
}

/**
 * Outcome of POST /analyze. A 422 `{error:'content-not-stored', disclosure}`
 * is a legitimate, expected refusal for registered-only documents — parsed
 * into a DISTINCT truthful outcome, not a generic error and not a fake start.
 */
export type StartAnalysisOutcome =
  | { started: true; runId: string }
  | { started: false; reason: 'content-not-stored'; disclosure: string };

/**
 * POST /analyze — JSON body `{ documentVersionId }`. 200 returns the real
 * `{ runId }`; 422 content-not-stored parses into the distinct honest
 * outcome; 5xx (and every other non-OK status) throws a typed error so the
 * UI can say "API unavailable" — never a simulated run.
 */
export async function startAnalysis(
  documentVersionId: string,
  options?: RequestOptions,
): Promise<StartAnalysisOutcome> {
  const linked = makeLinkedSignal(options ?? {});
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${apiRoutes.analyze}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentVersionId }),
      signal: linked.signal,
    });
  } catch (error) {
    linked.cleanup();
    if (isAbortDomException(error)) {
      // Caller aborts rethrow; timeout aborts surface as ApiTimeoutError.
      if (options?.signal?.aborted) throw error;
      throw new ApiTimeoutError(error);
    }
    throw new ApiNetworkError(error instanceof Error ? error.message : 'Network error', {
      cause: error,
    });
  }
  linked.cleanup();

  if (response.status === 422) {
    // Lenient read: the distinct outcome requires the exact marker plus a
    // disclosure; anything else stays a typed HTTP error (no guessing).
    let body: unknown = null;
    try {
      body = JSON.parse(await response.text());
    } catch {
      body = null;
    }
    const fields = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    const disclosure = fields ? stringField(fields.disclosure) : undefined;
    if (fields && fields.error === 'content-not-stored' && disclosure) {
      return { started: false, reason: 'content-not-stored', disclosure };
    }
    throw new ApiHttpError(
      422,
      'Analysis refused to start (HTTP 422) without a readable content-not-stored reason',
    );
  }

  if (!response.ok) {
    throw new ApiHttpError(response.status, `API responded with HTTP ${response.status}`);
  }
  const parsed = await readJsonBody(response);
  if (!parsed || typeof parsed !== 'object') {
    throw new ApiClientError('Analysis start endpoint returned an unexpected payload');
  }
  const runId = stringField((parsed as Record<string, unknown>).runId);
  if (!runId) {
    throw new ApiClientError('Analysis start response is missing `runId` — no run is claimed');
  }
  return { started: true, runId };
}

/**
 * GET /analyze-status?runId= — wired M4 route for analysis-run status.
 * 404/501 resolve to `available: false` (status polling not deployed) and a
 * SPA-shaded 2xx to endpoint-missing — never a guessed run state.
 */
export async function getAnalysisStatus(
  runId: string,
  options?: RequestOptions,
): Promise<ApiOutcome<AnalysisRunInfo>> {
  const search = new URLSearchParams({ runId });
  let data: unknown;
  try {
    data = await request({
      path: `${apiRoutes.analysisStatus}?${search.toString()}`,
      options,
      notAvailableStatuses: [404, 501],
    });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      return { available: false, reason: 'endpoint-missing' };
    }
    throw error;
  }
  return outcome(data, (payload) => parseAnalysisInfo(payload, runId));
}

/**
 * GET /document-detail?id= — single-document detail. Same honesty rules as
 * the list route: 404/501/SPA-shaded 2xx resolve to `available: false`.
 */
export async function getDocumentDetail(
  id: string,
  options?: RequestOptions,
): Promise<ApiOutcome<DocumentDetail>> {
  const search = new URLSearchParams({ id });
  let data: unknown;
  try {
    data = await request({
      path: `${apiRoutes.documentDetail}?${search.toString()}`,
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
      throw new ApiClientError('Document detail endpoint returned an unexpected payload');
    }
    const element = payload as Record<string, unknown>;
    return {
      id: stringField(element.id) ?? id,
      title: stringField(element.title),
      fileName: stringField(element.fileName),
      format: stringField(element.format),
      importedAt: stringField(element.importedAt),
      versionId: stringField(element.versionId),
      createdAt: stringField(element.createdAt),
      sourceHash: stringField(element.sourceHash),
      isSynthetic: typeof element.isSynthetic === 'boolean' ? element.isSynthetic : undefined,
      syntheticLabel: stringField(element.syntheticLabel),
      noticeLink: stringField(element.noticeLink),
      contentStored:
        typeof element.contentStored === 'boolean' ? element.contentStored : undefined,
      disclosure: stringField(element.disclosure),
    };
  });
}

/* ------------------------------------------------------------------ *
 * Activity event type (contract §5 GET /activity, §11).
 * Timestamps are ISO-8601 UTC and must never be merged: a source_notice
 * event's timestamp is the notice's actual publication date, an
 * analysis_run event's is first detection, a review_decision's is the
 * human decision date, and an export_generated's is the export date.
 * ------------------------------------------------------------------ */

export type ActivityEventType =
  | 'review_decision'
  | 'source_notice'
  | 'analysis_run'
  | 'export_generated';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  /** ISO-8601 UTC — the event time, distinct per type (see §11). */
  timestamp: string;
  actor?: string;
  /** Human-visible verb phrase describing what happened. */
  action: string;
  description?: string;
  /** Prior state (e.g. pre-decision review state). */
  beforeState?: string;
  /** Resulting state (e.g. post-decision review state). */
  afterState?: string;
  /** True when the event describes synthetic/demo content. */
  isSynthetic?: boolean;
  syntheticLabel?: string;
}

function isActivityEventType(value: unknown): value is ActivityEventType {
  return (
    value === 'review_decision' ||
    value === 'source_notice' ||
    value === 'analysis_run' ||
    value === 'export_generated'
  );
}

function parseActivityEvent(payload: unknown, index: number): ActivityEvent {
  if (!payload || typeof payload !== 'object') {
    // Never fabricate an event from an unparsable record.
    return {
      id: `activity-${index}`,
      type: 'analysis_run',
      timestamp: '',
      actor: 'system',
      action: 'Unparsable activity record',
      description:
        'The server returned an activity entry that could not be interpreted. It is not treated as a verified event.',
    };
  }
  const source = payload as Record<string, unknown>;
  return {
    id: stringField(source.id) ?? `activity-${index}`,
    type: isActivityEventType(source.type) ? source.type : 'analysis_run',
    timestamp: stringField(source.timestamp) ?? '',
    actor: stringField(source.actor),
    action: stringField(source.action) ?? 'Activity recorded',
    description: stringField(source.description),
    beforeState: stringField(source.beforeState),
    afterState: typeof source.afterState === 'string' ? source.afterState : undefined,
    isSynthetic: typeof source.isSynthetic === 'boolean' ? source.isSynthetic : undefined,
    syntheticLabel: stringField(source.syntheticLabel),
  };
}

/**
 * GET /activity — chronological timeline events.
 * 404/501 (and a SPA-shaded 2xx) resolve to `available: false` — honest
 * "not available yet", never a fabricated history. Any other non-OK status
 * throws a typed error so the UI can report the failure honestly.
 */
export async function getActivity(
  options?: RequestOptions,
): Promise<ApiOutcome<ActivityEvent[]>> {
  let data: unknown;
  try {
    data = await request({
      path: apiRoutes.activity,
      options,
      notAvailableStatuses: [404, 501],
    });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      return { available: false, reason: 'endpoint-missing' };
    }
    throw error;
  }
  return outcome(
    data,
    (payload) =>
      (Array.isArray(payload) ? payload : []).map((element, index) => parseActivityEvent(element, index)),
  );
}

/* ------------------------------------------------------------------ *
 * M5 — human review decisions + revision proposals (fixed contract).
 * These endpoints are part of the fixed M5 server contract (§5), so a
 * non-OK status is a typed error — never a fabricated decision or proposal.
 * ------------------------------------------------------------------ */

export type ReviewOutcome =
  | 'revision_needed'
  | 'more_evidence_needed'
  | 'not_affected'
  | 'evidence_updated';

export interface ReviewDecisionRequest {
  outcome: ReviewOutcome;
  /** Human-visible rationale for the decision; required before submit. */
  explanation: string;
  /** Optional human name attributed to the decision. */
  reviewer?: string;
}

export interface ReviewDecisionResult {
  decisionId: string;
  caseId: string;
  outcome: ReviewOutcome;
  explanation: string;
  reviewer?: string;
  decidedAt: string;
  beforeState: string;
  afterState: string;
}

function parseReviewDecisionResult(payload: unknown): ReviewDecisionResult {
  if (!payload || typeof payload !== 'object') {
    throw new ApiClientError('Review decision endpoint returned an unexpected payload');
  }
  const body = payload as Record<string, unknown>;
  const decisionId = stringField(body.decisionId);
  const caseId = stringField(body.caseId);
  const outcome = body.outcome;
  const explanation = stringField(body.explanation);
  const reviewer = stringField(body.reviewer);
  const decidedAt = stringField(body.decidedAt);
  const beforeState = stringField(body.beforeState);
  const afterState = stringField(body.afterState);
  if (
    !decisionId ||
    !caseId ||
    !explanation ||
    decidedAt === undefined ||
    beforeState === undefined ||
    afterState === undefined
  ) {
    throw new ApiClientError('Review decision response is missing required fields');
  }
  if (
    outcome !== 'revision_needed' &&
    outcome !== 'more_evidence_needed' &&
    outcome !== 'not_affected' &&
    outcome !== 'evidence_updated'
  ) {
    throw new ApiClientError('Review decision response has an invalid outcome');
  }
  return {
    decisionId,
    caseId,
    outcome,
    explanation,
    reviewer,
    decidedAt,
    beforeState,
    afterState,
  };
}

/**
 * POST /review-decide?caseId= — record a human review decision.
 * 200 → the recorded decision. 400/409/503 → typed HTTP error. Never simulates
 * a decision on failure.
 */
export async function reviewDecide(
  caseId: string,
  payload: ReviewDecisionRequest,
  options?: RequestOptions,
): Promise<ReviewDecisionResult> {
  const data = await request({
    path: `${apiRoutes.reviewDecide(caseId)}${encodeURIComponent(caseId)}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    options,
  });
  return parseReviewDecisionResult(data);
}

export interface RevisionProposalRequest {
  /** Suggested replacement text (the original is immutable and sent separately by the server). */
  proposedText: string;
  rationale?: string;
}

export interface RevisionProposalResult {
  proposalId: string;
  caseId: string;
  originalText: string;
  proposedText: string;
  rationale?: string;
  status: 'draft';
  createdAt: string;
}

function parseRevisionProposalResult(payload: unknown): RevisionProposalResult {
  if (!payload || typeof payload !== 'object') {
    throw new ApiClientError('Review revision endpoint returned an unexpected payload');
  }
  const body = payload as Record<string, unknown>;
  const proposalId = stringField(body.proposalId);
  const caseId = stringField(body.caseId);
  const originalText = stringField(body.originalText);
  const proposedText = stringField(body.proposedText);
  const status = stringField(body.status);
  const createdAt = stringField(body.createdAt);
  if (!proposalId || !caseId || !originalText || !proposedText || status !== 'draft' || !createdAt) {
    throw new ApiClientError('Review revision response is missing required fields');
  }
  return {
    proposalId,
    caseId,
    originalText,
    proposedText,
    rationale: stringField(body.rationale),
    status: 'draft',
    createdAt,
  };
}

/**
 * POST /review-revision?caseId= — create a revision proposal (status: draft).
 * 200 → the draft proposal. 400/503 → typed HTTP error. A draft is a proposal
 * only; it is not applied and not validated until a human accepts it.
 */
export async function reviewRevision(
  caseId: string,
  payload: RevisionProposalRequest,
  options?: RequestOptions,
): Promise<RevisionProposalResult> {
  const data = await request({
    path: `${apiRoutes.reviewRevision(caseId)}${encodeURIComponent(caseId)}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    options,
  });
  return parseRevisionProposalResult(data);
}

/* ------------------------------------------------------------------ *
 * M6 — export endpoints (fixed server contract, §5). Binary responses
 * (PDF / DOCX). 404/501 → available:false ("not available yet", never
 * fabricated bytes); 400/503 throw typed errors so the UI can report the
 * failure honestly. ------------------------------------------------------------------ */

/** Format a report export is rendered in. */
export type ExportFormat = 'pdf' | 'docx';

/**
 * Outcome of POST /export-report, /export-revision-pack or
 * /export-annotated-manuscript. 2xx → a binary Blob the caller downloads;
 * 404/501 → honest "not available yet".
 */
export type ExportOutcome =
  | { available: true; data: Blob }
  | { available: false; reason: 'endpoint-missing' | 'not-implemented' };

function parseExportBlob(payload: unknown): Blob {
  if (!(payload instanceof Blob)) {
    throw new ApiClientError('Export endpoint returned a non-blob body');
  }
  return payload;
}

/**
 * POST /export-report?caseId=&format= — Evidence Impact Report (PDF).
 * Returns a PDF Blob the caller downloads; 404/501 → available:false.
 */
export async function exportReport(
  caseId: string,
  format: ExportFormat = 'pdf',
  options?: RequestOptions,
): Promise<ExportOutcome> {
  const search = new URLSearchParams({ caseId, format });
  let data: unknown;
  try {
    data = await request({
      path: `${apiRoutes.exportReport}?${search.toString()}`,
      init: { method: 'POST', headers: { Accept: 'application/pdf' } },
      options,
      notAvailableStatuses: [404, 501],
      blobBody: true,
    });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      return { available: false, reason: 'endpoint-missing' };
    }
    throw error;
  }
  return outcome(data, parseExportBlob);
}

/**
 * POST /export-revision-pack?caseId= — Revision Pack (DOCX).
 * Returns a DOCX Blob the caller downloads; 404/501 → available:false.
 */
export async function exportRevisionPack(
  caseId: string,
  options?: RequestOptions,
): Promise<ExportOutcome> {
  const search = new URLSearchParams({ caseId });
  let data: unknown;
  try {
    data = await request({
      path: `${apiRoutes.exportRevisionPack}?${search.toString()}`,
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      },
      options,
      notAvailableStatuses: [404, 501],
      blobBody: true,
    });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      return { available: false, reason: 'endpoint-missing' };
    }
    throw error;
  }
  return outcome(data, parseExportBlob);
}

/**
 * POST /export-annotated-manuscript?caseId= — Annotated Manuscript.
 * Returns a binary manuscript Blob the caller downloads; 404/501 → available:false.
 */
export async function exportAnnotatedManuscript(
  caseId: string,
  options?: RequestOptions,
): Promise<ExportOutcome> {
  const search = new URLSearchParams({ caseId });
  let data: unknown;
  try {
    data = await request({
      path: `${apiRoutes.exportAnnotatedManuscript}?${search.toString()}`,
      init: { method: 'POST', headers: { Accept: 'application/pdf' } },
      options,
      notAvailableStatuses: [404, 501],
      blobBody: true,
    });
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      return { available: false, reason: 'endpoint-missing' };
    }
    throw error;
  }
  return outcome(data, parseExportBlob);
}

/* ------------------------------------------------------------------ *
 * P4 — Find Evidence (fixed contract with the parallel server wave;
 * /tmp/opencode/p4-spec.md is the design of record).
 *
 * Honesty rules encoded here:
 * - The endpoint has two modes on ONE route: an empty `{}` body asks for
 *   the prepare read (claim + suggested query, NO external fetch); a body
 *   `{ query }` asks for the provider search. The mode is decided by the
 *   SERVER response (`mode` field), never guessed by the client.
 * - Candidates are exploratory provider metadata only. They never modify
 *   citations, review states, or the manuscript, and nothing is persisted.
 * - Provider outages are NOT HTTP errors: a 200 with `providersStatus`
 *   timeout/error and (possibly zero) candidates is the honest contract.
 * - A non-OK status (400 invalid query / 404 claim-not-found / 429 rate
 *   limit / 503 graph unreachable) throws a typed error. Never bluffed.
 * ------------------------------------------------------------------ */

/**
 * Client-side query bound — mirrors the server's 1..400 validation so the
 * panel can disable Search BEFORE any request is sent.
 */
export const MAX_EVIDENCE_QUERY_CHARS = 400;

/** How the prepared concern relates evidence to the claim (contract union). */
export type EvidenceConcernDirection = 'direct' | 'indirect' | 'unknown';

/** Per-provider run status (200-level search contract; NOT an HTTP status). */
export type EvidenceProviderRunStatus = 'ok' | 'empty' | 'timeout' | 'error';

/** Retraction status carried by the provider record itself, nothing more. */
export type EvidenceRetractionStatus = 'unknown' | 'notice_present';

export interface EvidenceProviderInfo {
  id: string;
  displayName: string;
  scopeNote?: string;
  landingUrl?: string;
}

export interface EvidenceConcern {
  summary: string;
  direction: EvidenceConcernDirection;
}

/** One provider's run status for a search — honest provider outage reporting. */
export interface EvidenceProviderStatus {
  id: string;
  status: EvidenceProviderRunStatus;
  /** Short honest note verbatim from the server, shown to the user. */
  message?: string;
  /** True when the handler already retried this provider once. */
  retried?: boolean;
}

/**
 * One external publication candidate. Bibliographic metadata ONLY — no
 * abstracts, no findings, no effect sizes ever exist on this shape.
 */
export interface EvidenceCandidate {
  candidateId: string;
  /** Display-form DOI as the provider returned it (omitted when absent). */
  doi?: string;
  title: string;
  authors: string[];
  year?: number;
  /** Journal/venue; omission means "not recorded", never guessed. */
  container?: string;
  /** Provider type value verbatim (e.g. journal-article). */
  publicationType?: string;
  publisher?: string;
  /** Retrieved live records are real metadata (isSynthetic: false). */
  isSynthetic?: boolean;
  retractionStatus: EvidenceRetractionStatus;
  /** Constants in v1 — relationship is `unverified`. */
  evidenceRelationship?: string;
  independence?: string;
  fullTextAvailability?: string;
  /** Honest provenance line of why this record was returned. */
  relevanceBasis?: string;
  urls?: { sourceUrl: string };
}

/** Prepare response — claim read + suggested query, NO external fetch. */
export interface EvidenceFindPrepare {
  mode: 'prepare';
  claimId: string;
  /** Verbatim text of the claim node from the graph (never client-supplied). */
  claimText: string;
  label: string;
  manuscriptId?: string;
  concern: EvidenceConcern;
  /** Deterministic suggested query (trimmed, ≤300 chars) or absent. */
  suggestedQuery?: string;
  queryEditable?: boolean;
  providers: EvidenceProviderInfo[];
  caveats: string[];
}

/** Search response — all prepare fields PLUS the search extras. */
export interface EvidenceFindSearch extends Omit<EvidenceFindPrepare, 'mode' | 'suggestedQuery'> {
  mode: 'search';
  /** The query actually used (the `query` from the request body, trimmed). */
  query: string;
  candidates: EvidenceCandidate[];
  providersStatus: EvidenceProviderStatus[];
  searchedAt?: string;
}

export type EvidenceFindResult = EvidenceFindPrepare | EvidenceFindSearch;

function isEvidenceDirection(value: unknown): value is EvidenceConcernDirection {
  return value === 'direct' || value === 'indirect' || value === 'unknown';
}

function isProviderRunStatus(value: unknown): value is EvidenceProviderRunStatus {
  return value === 'ok' || value === 'empty' || value === 'timeout' || value === 'error';
}

function parseEvidenceProviders(payload: unknown): EvidenceProviderInfo[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const source = entry as Record<string, unknown>;
    const id = stringField(source.id);
    const displayName = stringField(source.displayName);
    if (!id || !displayName) return [];
    return [
      {
        id,
        displayName,
        scopeNote: stringField(source.scopeNote),
        landingUrl: stringField(source.landingUrl),
      },
    ];
  });
}

function parseEvidenceCaveats(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function parseEvidenceCandidate(payload: unknown, index: number): EvidenceCandidate | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const title = stringField(source.title);
  // A provider record without a usable title is not displayable; filtering
  // it beats rendering a guessed heading. Never invents a substitute.
  if (!title) return null;
  const retractionStatus =
    source.retractionStatus === 'notice_present' ? 'notice_present' : 'unknown';
  const urlsRaw =
    source.urls && typeof source.urls === 'object' ? (source.urls as Record<string, unknown>) : null;
  const sourceUrl = urlsRaw ? stringField(urlsRaw.sourceUrl) : undefined;
  return {
    candidateId: stringField(source.candidateId) ?? `candidate-${index}`,
    doi: stringField(source.doi),
    title,
    authors: Array.isArray(source.authors)
      ? source.authors.filter((entry): entry is string => typeof entry === 'string')
      : [],
    year: typeof source.year === 'number' ? source.year : undefined,
    container: stringField(source.container),
    publicationType: stringField(source.publicationType),
    publisher: stringField(source.publisher),
    isSynthetic: typeof source.isSynthetic === 'boolean' ? source.isSynthetic : undefined,
    retractionStatus,
    evidenceRelationship: stringField(source.evidenceRelationship),
    independence: stringField(source.independence),
    fullTextAvailability: stringField(source.fullTextAvailability),
    relevanceBasis: stringField(source.relevanceBasis),
    urls: sourceUrl ? { sourceUrl } : undefined,
  };
}

function parseEvidenceProviderStatus(payload: unknown): EvidenceProviderStatus | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const id = stringField(source.id);
  if (!id || !isProviderRunStatus(source.status)) return null;
  return {
    id,
    status: source.status,
    message: stringField(source.message),
    retried: typeof source.retried === 'boolean' ? source.retried : undefined,
  };
}

function parseEvidenceFindResult(payload: unknown, fallbackClaimId: string): EvidenceFindResult {
  if (!payload || typeof payload !== 'object') {
    throw new ApiClientError('Evidence-find endpoint returned an unexpected payload');
  }
  const body = payload as Record<string, unknown>;
  if (body.mode !== 'prepare' && body.mode !== 'search') {
    throw new ApiClientError('Evidence-find response is missing a known `mode`');
  }
  const usedQuery = stringField(body.query);
  if (body.mode === 'search' && usedQuery === undefined) {
    throw new ApiClientError('Evidence-find search response is missing the used `query`');
  }
  const claimText = stringField(body.claimText);
  if (claimText === undefined) {
    // The verbatim claim text is the core of both modes; without it nothing
    // displayable or honest can be built.
    throw new ApiClientError('Evidence-find response is missing `claimText`');
  }
  const concernRaw =
    body.concern && typeof body.concern === 'object' ? (body.concern as Record<string, unknown>) : null;
  const concern: EvidenceConcern = {
    summary: concernRaw ? (stringField(concernRaw.summary) ?? '') : '',
    direction: isEvidenceDirection(concernRaw?.direction) ? concernRaw.direction : 'unknown',
  };

  if (body.mode === 'search') {
    return {
      mode: 'search',
      claimId: stringField(body.claimId) ?? fallbackClaimId,
      claimText,
      label: stringField(body.label) ?? 'Claim',
      manuscriptId: stringField(body.manuscriptId),
      concern,
      query: usedQuery as string,
      candidates: (Array.isArray(body.candidates) ? body.candidates : [])
        .map((entry, index) => parseEvidenceCandidate(entry, index))
        .filter((entry): entry is EvidenceCandidate => entry !== null),
      providersStatus: (Array.isArray(body.providersStatus) ? body.providersStatus : [])
        .map((entry) => parseEvidenceProviderStatus(entry))
        .filter((entry): entry is EvidenceProviderStatus => entry !== null),
      providers: parseEvidenceProviders(body.providers),
      caveats: parseEvidenceCaveats(body.caveats),
      searchedAt: stringField(body.searchedAt),
    };
  }
  return {
    mode: 'prepare',
    claimId: stringField(body.claimId) ?? fallbackClaimId,
    claimText,
    label: stringField(body.label) ?? 'Claim',
    manuscriptId: stringField(body.manuscriptId),
    concern,
    suggestedQuery: stringField(body.suggestedQuery),
    queryEditable: typeof body.queryEditable === 'boolean' ? body.queryEditable : undefined,
    providers: parseEvidenceProviders(body.providers),
    caveats: parseEvidenceCaveats(body.caveats),
  };
}

/**
 * POST /evidence-find?claimId=<encoded> — one route, two modes.
 *
 * `opts.query` provided → search mode: JSON body `{ query }`.
 * `opts.query` absent → prepare mode: JSON body `{}` (claim read only, the
 * server performs no external fetch). The truth of BOTH modes is whatever
 * the server actually returns (`mode` field) — this client never upgrades a
 * prepare answer into a search result or vice versa.
 *
 * 400 (invalid query / claimId charset), 404 (claim-not-found), 429 (rate
 * limited) and 503 (graph unreachable) arrive as typed ApiHttpError.
 */
export async function findEvidence(
  claimId: string,
  opts?: { query?: string; signal?: AbortSignal },
): Promise<EvidenceFindResult> {
  const data = await request({
    path: `${apiRoutes.evidenceFind}?claimId=${encodeURIComponent(claimId)}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts && opts.query !== undefined ? { query: opts.query } : {}),
    },
    options: { signal: opts?.signal },
  });
  return parseEvidenceFindResult(data, claimId);
}
