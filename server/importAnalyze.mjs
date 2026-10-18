/**
 * @aftershock/server — M4 import/analyze ops (metadata-only import tier)
 *
 * Ops behind the M4 Netlify functions (`import-document`, `analyze`,
 * `analyze-status`, `document-detail`). Follows the demoApi/seed patterns:
 * parameterized Cypher only, graph = the session's bound graphName (always
 * `FALKORDB_GRAPH_NAME` via the handlers' env seam), honest errors, no
 * fabricated counts.
 *
 * BINDING DATA-SAFETY DECISION (M4 sprint): the disposable no-TLS FalkorDB
 * Cloud Free graph must never receive private manuscript bytes. Raw file
 * content is therefore NEVER written anywhere server-side — the import reads
 * the upload once, computes its sha256 (`sourceHash`), and registers
 * METADATA ONLY (fileName, size, format, hash, timestamps, ids) with a
 * truthful `contentStored: false` flag. Content analysis is impossible
 * without storage and is refused honestly (422), except for the seeded demo
 * manuscript version whose "content" IS the synthetic fixture — for that one
 * version the analysis derives REAL findings from the graph via
 * `server/impact.mjs` traversals.
 *
 * Honesty rules honored here (AGENTS.md / DATA_CONTRACTS §4–§7):
 * - Unknown ids → 404-class errors, never fabricated rows.
 * - Unknown runId → 404; contentless version → 422 `content-not-stored`.
 * - findingsCount is always the real count of impact-path findings read from
 *   the graph (0 when the graph has none) — never invented.
 * - User-imported nodes carry `isSynthetic: false` (real user content) and
 *   are NOT marked `seeded: true`, so seedGraph's scoped wipe never deletes
 *   them and they never inflate the fixture's expected node accounting.
 *   HONEST LIMITATION: read surfaces that filter `seeded = true`
 *   (`GET /documents`, `/graph-edges`) intentionally do not show
 *   user-imported documents in this tier; they resolve via the import
 *   response + `/document-detail` instead.
 */

import { createHash, randomUUID } from 'node:crypto';
import { FIXTURE_IDS } from './contract.mjs';
import { impactPathFromSupportedClaims } from './impact.mjs';

/** Import formats accepted by `/import-document` (DATA_CONTRACTS §1). */
export const IMPORT_FORMATS = Object.freeze(['pdf', 'docx', 'txt']);

/** Hard byte ceiling for a single import upload (10 MB). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** Client-visible disclosure for the metadata-only demo tier (both routes). */
export const METADATA_ONLY_DISCLOSURE =
  'Demo tier: file content is not stored server-side; metadata-only registration. Content analysis arrives with persistent storage.';

/** analysisVersion stamped on import-registered nodes/edges. */
export const IMPORT_ANALYSIS_VERSION = 'import-1';

/** analysisVersion stamped on AnalysisRun nodes produced by this derivation. */
export const IMPACT_ANALYSIS_VERSION = 'impact-1';

/** The seeded demo manuscript version: the only analyzable version this tier. */
export const DEMO_MANUSCRIPT_VERSION_ID = FIXTURE_IDS.documentVersion;

/** Version label for the initial registered snapshot. */
export const INITIAL_VERSION_LABEL = 'Draft A';

/**
 * An op-level error that already carries its complete, honest HTTP body.
 * Handlers forward it verbatim; it must never embed request payloads or
 * credentials (same discipline as `errorBodyFor`).
 */
export class HonestApiError extends Error {
  /**
   * @param {number} status
   * @param {{error: string, message?: string, disclosure?: string}} body
   */
  constructor(status, body) {
    super(body.error);
    this.name = 'HonestApiError';
    this.status = status;
    this.body = body;
  }
}

/** @param {string} fileName */
function validFileName(fileName) {
  return typeof fileName === 'string' && fileName.trim() !== '';
}

/**
 * Register a document import: REAL user content, metadata only.
 * Creates ResearchDocument + DocumentVersion + DOCUMENT_HAS_VERSION with
 * fixed parameterized Cypher. The raw bytes are NEVER persisted — only the
 * precomputed hash/size travel into the graph as primitives.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{fileName: string, format: string, sizeBytes: number, sourceHash: string, now?: Date | string}} spec
 * @returns {Promise<{documentId: string, versionId: string, contentStored: boolean, disclosure: string}>}
 */
export async function registerDocumentImport(session, { fileName, format, sizeBytes, sourceHash, now = new Date() }) {
  if (!validFileName(fileName)) {
    throw new HonestApiError(400, { error: 'invalid-request', message: 'fileName is required and must be a non-empty string.' });
  }
  if (!IMPORT_FORMATS.includes(/** @type {string} */ (format))) {
    throw new HonestApiError(415, {
      error: 'unsupported-media-type',
      message: 'Only pdf, docx, and txt imports are supported in this tier.',
    });
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
    throw new HonestApiError(400, { error: 'invalid-request', message: 'sizeBytes must be a positive integer.' });
  }
  if (typeof sourceHash !== 'string' || sourceHash === '') {
    throw new HonestApiError(400, { error: 'invalid-request', message: 'sourceHash is required.' });
  }

  const ts = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const name = fileName.trim();
  const documentId = randomUUID();
  const versionId = randomUUID();

  // Metadata only: no content bytes, no extracted text, no page claims.
  await session.writeQuery(
    `CREATE (d:ResearchDocument)
     SET d.id = $id, d.title = $fileName, d.fileName = $fileName, d.format = $format,
         d.sizeBytes = $sizeBytes, d.sourceHash = $sourceHash, d.importedAt = $ts,
         d.versionId = $versionId, d.contentStored = $contentStored, d.isSynthetic = $isSynthetic,
         d.provenanceKind = $provenanceKind, d.analysisVersion = $analysisVersion,
         d.createdAt = $ts, d.updatedAt = $ts`,
    {
      id: documentId,
      fileName: name,
      format,
      sizeBytes,
      sourceHash,
      ts,
      versionId,
      contentStored: false,
      isSynthetic: false,
      provenanceKind: 'observed',
      analysisVersion: IMPORT_ANALYSIS_VERSION,
    },
  );

  await session.writeQuery(
    `CREATE (v:DocumentVersion)
     SET v.id = $id, v.documentId = $documentId, v.label = $label, v.sourceHash = $sourceHash,
         v.contentStored = $contentStored, v.isSynthetic = $isSynthetic,
         v.provenanceKind = $provenanceKind, v.analysisVersion = $analysisVersion,
         v.createdAt = $ts, v.updatedAt = $ts`,
    {
      id: versionId,
      documentId,
      label: INITIAL_VERSION_LABEL,
      sourceHash,
      contentStored: false,
      isSynthetic: false,
      provenanceKind: 'observed',
      analysisVersion: IMPORT_ANALYSIS_VERSION,
      ts,
    },
  );

  // Material edge per DATA_CONTRACTS §2: full provenance block, no conflation.
  await session.writeQuery(
    `MATCH (d:ResearchDocument), (v:DocumentVersion)
     WHERE d.id = $documentId AND v.id = $versionId
     CREATE (d)-[e:DOCUMENT_HAS_VERSION]->(v)
     SET e.id = $edgeId, e.provenanceKind = $provenanceKind, e.rationale = $rationale,
         e.sourcePointer = $sourcePointer, e.analysisVersion = $analysisVersion,
         e.reviewState = $reviewState, e.createdAt = $ts`,
    {
      documentId,
      versionId,
      edgeId: randomUUID(),
      provenanceKind: 'observed',
      rationale: 'Initial version registered by the M4 metadata-only import; file content was verified by hash only and not stored server-side.',
      sourcePointer: `sha256:${sourceHash}`,
      analysisVersion: IMPORT_ANALYSIS_VERSION,
      reviewState: 'unreviewed',
      ts,
    },
  );

  return { documentId, versionId, contentStored: false, disclosure: METADATA_ONLY_DISCLOSURE };
}

/**
 * Look up one DocumentVersion (id + contentStored flag). Read-only.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} versionId
 * @returns {Promise<{id: string, contentStored: unknown} | null>}
 */
export async function findDocumentVersion(session, versionId) {
  const res = await session.roQuery(
    'MATCH (v:DocumentVersion) WHERE v.id = $id RETURN v.id AS id, v.contentStored AS contentStored',
    { id: versionId },
  );
  const row = res.data?.[0];
  return row && typeof row.id === 'string'
    ? { id: row.id, contentStored: row.contentStored }
    : null;
}

/**
 * Run analysis for a document version. Without stored content analysis is
 * impossible — refused honestly — EXCEPT the seeded demo manuscript version,
 * whose content IS the fixture: there the REAL impact-path derivation
 * (`impactPathFromSupportedClaims`) runs against the graph and a completed
 * AnalysisRun node records the true findings count.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{documentVersionId: string, now?: Date | string}} spec
 * @returns {Promise<{runId: string}>}
 */
export async function runAnalysis(session, { documentVersionId, now = new Date() }) {
  if (typeof documentVersionId !== 'string' || documentVersionId.trim() === '') {
    throw new HonestApiError(400, { error: 'invalid-request', message: 'documentVersionId is required.' });
  }
  const id = documentVersionId.trim();
  const version = await findDocumentVersion(session, id);
  if (!version) {
    throw new HonestApiError(404, {
      error: 'version-not-found',
      message: 'No DocumentVersion with that id exists in the graph. Nothing was analyzed.',
    });
  }
  if (id !== DEMO_MANUSCRIPT_VERSION_ID) {
    // Every non-fixture version in this tier is contentless by construction.
    throw new HonestApiError(422, {
      error: 'content-not-stored',
      disclosure: METADATA_ONLY_DISCLOSURE,
    });
  }

  const startedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  // REAL derivation over the graph's actual content — empty graph ⇒ 0 findings,
  // never a synthesized result (AGENTS.md: no fabricated counts).
  const paths = await impactPathFromSupportedClaims(session);
  const indirect = paths.filter((p) => p.conclusion !== null).length;
  const findingsCount = paths.length + indirect;
  // One handler invocation ≈ one atomic analysis step: start and completion
  // share the injectable clock (deterministic in tests, honest on the wire).
  const completedAt = new Date(startedAt).toISOString();
  const runId = randomUUID();

  await session.writeQuery(
    `CREATE (r:AnalysisRun)
     SET r.id = $id, r.documentVersionId = $documentVersionId, r.status = $status,
         r.stage = $stage, r.startedAt = $startedAt, r.completedAt = $completedAt,
         r.findingsCount = $findingsCount, r.provenanceKind = $provenanceKind,
         r.analysisVersion = $analysisVersion, r.createdAt = $completedAt, r.updatedAt = $completedAt`,
    {
      id: runId,
      documentVersionId: id,
      status: 'completed',
      stage: 'completed',
      startedAt,
      completedAt,
      findingsCount,
      provenanceKind: 'observed',
      analysisVersion: IMPACT_ANALYSIS_VERSION,
    },
  );
  return { runId };
}

/**
 * Real AnalysisRun lookup by id. Read-only; null when unknown (handler 404s).
 * Fields the run does not carry are OMITTED from the response object (never
 * null-padded, never fabricated).
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} runId
 * @returns {Promise<{runId: string, stage?: string, findingsCount?: number, startedAt?: string, completedAt?: string} | null>}
 */
export async function readAnalysisRun(session, runId) {
  const res = await session.roQuery(
    'MATCH (r:AnalysisRun) WHERE r.id = $id RETURN r.id AS id, r.stage AS stage, r.findingsCount AS findingsCount, r.startedAt AS startedAt, r.completedAt AS completedAt',
    { id: runId },
  );
  const row = res.data?.[0];
  if (!row || typeof row.id !== 'string') return null;
  const result = { runId: row.id };
  if (typeof row.stage === 'string') result.stage = row.stage;
  if (typeof row.findingsCount === 'number') result.findingsCount = row.findingsCount;
  if (typeof row.startedAt === 'string') result.startedAt = row.startedAt;
  if (typeof row.completedAt === 'string') result.completedAt = row.completedAt;
  return result;
}

/**
 * Real Document lookup by id, including its versions (read-only).
 * Matches by id WITHOUT the `seeded` filter: user-imported documents are
 * deliberately not marked seeded, and they must resolve here.
 * Returns null when the document does not exist (handler 404s).
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} documentId
 * @returns {Promise<{document: Record<string, unknown>, versions: Array<Record<string, unknown>>} | null>}
 */
export async function readDocumentDetail(session, documentId) {
  const docRes = await session.roQuery(
    'MATCH (d:ResearchDocument) WHERE d.id = $id RETURN properties(d) AS doc',
    { id: documentId },
  );
  const docRow = docRes.data?.[0];
  if (!docRow || !docRow.doc || typeof docRow.doc !== 'object') return null;

  const verRes = await session.roQuery(
    'MATCH (d:ResearchDocument)-[:DOCUMENT_HAS_VERSION]->(v:DocumentVersion) WHERE d.id = $id RETURN properties(v) AS version ORDER BY v.createdAt',
    { id: documentId },
  );
  const versions = /** @type {Array<Record<string, unknown>>} */ (verRes.data ?? []).map((r) => r.version ?? {});
  return { document: /** @type {Record<string, unknown>} */ (docRow.doc), versions };
}

/**
 * Hash raw upload bytes for `sourceHash` (single hashing point so the bytes
 * are read once and dropped — they are never persisted or logged).
 * @param {Uint8Array} bytes
 * @returns {string} sha256 hex digest
 */
export function hashUploadBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
