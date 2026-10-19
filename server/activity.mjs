/**
 * @aftershock/server — P2 activity timeline data assembly (GET /activity).
 *
 * Assembles a chronological timeline of REAL recorded events from the graph:
 * review decisions (human review), source notices (publication status
 * changes) and analysis runs (analysis executions). Zero writes — this is
 * read-only audit assembly.
 *
 * Scientific-integrity invariants (AGENTS.md / DATA_CONTRACTS §7 /
 * RESEARCH_INTEGRITY.md — NONNEGOTIABLE):
 * - Never fabricate historical activity. Only nodes that exist in the graph
 *   become timeline events; an empty graph answers with an empty array.
 * - Timestamps stay distinct and are never merged: notice publishedDate
 *   (official announcement), detectedAt (first detection by Aftershock),
 *   lastVerifiedAt (most recent re-check), decidedAt (human review),
 *   startedAt/completedAt (analysis run window).
 * - A review decision means "needs human review" — never a scientific
 *   verdict; the timeline reports the recorded outcome, not its meaning.
 *
 * Test seam: `assembleActivityEvents(session)` takes an injected
 * GraphSession — no credentials, no real DB, no ESM stubbing (see
 * server/demoApi.mjs). The handler takes `deps` so unit tests are fully
 * offline.
 */

import { assertParameterized } from './graphClient.mjs';

/** Event types emitted by the activity timeline (DATA_CONTRACTS §5). */
export const ACTIVITY_EVENT_TYPES = Object.freeze([
  'review_decision',
  'source_notice',
  'analysis_run',
  'export_generated',
]);

/** Target kinds referenced by timeline events. */
const TARGET_REVIEW_CASE = 'case';
const TARGET_PUBLICATION = 'Publication';
const TARGET_DOCUMENT_VERSION = 'DocumentVersion';

/** Wall-clock budget (ms) for assembly — below the client's 10 s abort. */
export const ACTIVITY_READ_BUDGET_MS = 8_000;

/* ------------------------------------------------------------------ *
 * Graph reads (roQuery only; every Cypher string is $param-guarded)
 * ------------------------------------------------------------------ */

/**
 * All ReviewDecision nodes. No `seeded` filter: the timeline covers every
 * real decision, seed fixture or user-recorded alike.
 *
 * When `caseId` is provided (M7 Priority D per-case view, additive optional
 * GET /activity?caseId= read-only filter), the Cypher narrows to decisions
 * recorded against that case via a `$caseId` parameter — caseId never
 * appears as an inline literal.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string | undefined} [caseId]
 * @returns {Promise<Array<{id, caseId, outcome, explanation, reviewer?, decidedAt, beforeState?, afterState?, provenanceKind?, analysisVersion?}>>}
 */
async function readReviewDecisions(session, caseId = undefined) {
  const params = caseId === undefined ? {} : { caseId };
  const cypher = caseId === undefined
    ? `MATCH (d:ReviewDecision)
   RETURN d.id AS id, d.caseId AS caseId, d.outcome AS outcome, d.explanation AS explanation,
          d.reviewer AS reviewer, d.decidedAt AS decidedAt, d.beforeState AS beforeState,
          d.afterState AS afterState, d.provenanceKind AS provenanceKind,
          d.analysisVersion AS analysisVersion
   ORDER BY d.decidedAt`
    : `MATCH (d:ReviewDecision) WHERE d.caseId = $caseId
   RETURN d.id AS id, d.caseId AS caseId, d.outcome AS outcome, d.explanation AS explanation,
          d.reviewer AS reviewer, d.decidedAt AS decidedAt, d.beforeState AS beforeState,
          d.afterState AS afterState, d.provenanceKind AS provenanceKind,
          d.analysisVersion AS analysisVersion
   ORDER BY d.decidedAt`;
  assertParameterized(cypher, params);
  const res = await session.roQuery(cypher, params);
  return /** @type {Array<{id: string, caseId: string, outcome: string, explanation: string, reviewer?: string, decidedAt: string, beforeState?: string, afterState?: string, provenanceKind?: string, analysisVersion?: string}>} */ (res.data ?? []);
}

/**
 * All SourceNotice nodes joined to their publication so the event names the
 * publication whose status changed. publishedDate/noticeRecordedDate/
 * detectedAt/lastVerifiedAt are returned as distinct fields and never merged:
 * publishedDate = official announcement date, noticeRecordedDate = the
 * PubMed/PMC/Crossref indexing-system record date, detectedAt = when
 * Aftershock first recorded the notice, lastVerifiedAt = most recent re-check.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<Array<{id, noticeType, publishedDate, noticeRecordedDate?, detectedAt?, lastVerifiedAt?, sourceUrl?, verified?, publicationId?, publicationTitle?, provenanceKind?}>>}
 */
async function readSourceNotices(session) {
  const cypher = `MATCH (p:Publication)-[:PUBLICATION_HAS_NOTICE]->(n:SourceNotice)
   RETURN n.id AS id, n.noticeType AS noticeType, n.publishedDate AS publishedDate,
          n.noticeRecordedDate AS noticeRecordedDate,
          n.detectedAt AS detectedAt, n.lastVerifiedAt AS lastVerifiedAt,
          n.sourceUrl AS sourceUrl, n.verified AS verified,
          p.id AS publicationId, p.title AS publicationTitle, n.provenanceKind AS provenanceKind
   ORDER BY n.publishedDate`;
  assertParameterized(cypher, {});
  const res = await session.roQuery(cypher, {});
  return /** @type {Array<{id: string, noticeType: string, publishedDate: string, detectedAt?: string, lastVerifiedAt?: string, sourceUrl?: string, verified?: boolean, publicationId?: string, publicationTitle?: string, provenanceKind?: string}>} */ (res.data ?? []);
}

/**
 * All AnalysisRun nodes. timestamp = completedAt when the run finished,
 * otherwise startedAt.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<Array<{id, documentVersionId?, startedAt?, completedAt?, status, stage?, error?, provenanceKind?}>>}
 */
async function readAnalysisRuns(session) {
  const cypher = `MATCH (r:AnalysisRun)
   RETURN r.id AS id, r.documentVersionId AS documentVersionId, r.startedAt AS startedAt,
          r.completedAt AS completedAt, r.status AS status, r.stage AS stage,
          r.error AS error, r.provenanceKind AS provenanceKind
   ORDER BY r.startedAt`;
  assertParameterized(cypher, {});
  const res = await session.roQuery(cypher, {});
  return /** @type {Array<{id: string, documentVersionId?: string, startedAt?: string, completedAt?: string, status: string, stage?: string, error?: string, provenanceKind?: string}>} */ (res.data ?? []);
}

/**
 * caseId safe charset for the M7 per-case activity filter — mirrors the
 * review-domain pattern (server/reviewState.mjs `CASE_ID_RE` / max length):
 * letters, digits, underscore, hyphen only; bounding payloads and enumeration
 * probes before any graph I/O. Exported so the HTTP handler and unit tests
 * share one definition.
 */
export const MAX_ACTIVITY_CASE_ID_LEN = 100;

const ACTIVITY_CASE_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Validate the optional `?caseId=` filter value. Returns a normalized string
 * or undefined (no filter). Throws an `inputError`-class 400 error when
 * present but malformed — the handler maps this to a 400 body and no graph
 * I/O happens. The value reaches Cypher exclusively as a `$caseId`
 * parameter; it is never interpolated.
 * @param {unknown} raw
 * @returns {string | undefined}
 */
export function parseActivityCaseId(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('caseId filter must be a non-empty string.');
  }
  const caseId = raw.trim();
  if (!ACTIVITY_CASE_ID_RE.test(caseId)) {
    throw new Error('caseId may only contain letters, digits, underscores, and hyphens.');
  }
  if (caseId.length > MAX_ACTIVITY_CASE_ID_LEN) {
    throw new Error(`caseId must be ${MAX_ACTIVITY_CASE_ID_LEN} characters or fewer.`);
  }
  return caseId;
}

/**
 * Parse a beforeState/afterState JSON blob stored on a ReviewDecision node.
 * @param {unknown} value
 * @returns {object | null}
 */
function parseStateBlob(value) {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Assemble the unified activity timeline: one event per real graph record,
 * newest first, deduplicated by event id.
 *
 * M7 Priority D per-case view: when `options.caseId` is a validated case id,
 * the timeline narrows to review_decision events recorded against that case
 * only. Source notices (publication-scoped) and analysis runs (document
 * version-scoped) carry no caseId on their nodes — including them under a
 * caseId query would imply a case linkage that is not recorded, so they are
 * excluded rather than laundered into "case" events. An empty result is the
 * honest answer ("no recorded case events for this id").
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{caseId?: string}} [options]
 * @returns {Promise<Array<{id: string, type: string, actor?: string, action: string, timestamp: string, targetId?: string, targetType?: string, description: string, beforeState?: object | null, afterState?: object | null, provenanceKind: string | null, noticeRecordedDate?: string | null, detectedAt?: string | null, lastVerifiedAt?: string | null, startedAt?: string | null, completedAt?: string | null}>>}
 */
export async function assembleActivityEvents(session, options = {}) {
  const caseId = options.caseId !== undefined ? String(options.caseId) : undefined;
  const [decisions, notices, runs] = await Promise.all([
    readReviewDecisions(session, caseId),
    // Notices and runs are skipped entirely under a caseId filter — they are
    // not case-scoped records (see the doc comment above).
    caseId === undefined ? readSourceNotices(session) : Promise.resolve([]),
    caseId === undefined ? readAnalysisRuns(session) : Promise.resolve([]),
  ]);

  /** @type {Array<{id, type, actor?, action, timestamp, targetId?, targetType?, description, beforeState?, afterState?, provenanceKind, noticeRecordedDate?, detectedAt?, lastVerifiedAt?, startedAt?, completedAt?}>} */
  const events = [];

  for (const d of decisions) {
    if (!d.id || !d.decidedAt) continue; // an event without a time cannot be placed
    events.push({
      id: d.id,
      type: 'review_decision',
      ...(d.reviewer ? { actor: d.reviewer } : {}),
      action: d.outcome,
      timestamp: d.decidedAt,
      ...(d.caseId ? { targetId: d.caseId, targetType: TARGET_REVIEW_CASE } : {}),
      description: d.explanation ?? '',
      beforeState: parseStateBlob(d.beforeState),
      afterState: parseStateBlob(d.afterState),
      provenanceKind: d.provenanceKind ?? null,
    });
  }

  for (const n of notices) {
    if (!n.id || !n.publishedDate) continue;
    const publication = n.publicationTitle ?? n.publicationId ?? 'an unpublished publication';
    events.push({
      id: n.id,
      type: 'source_notice',
      action: 'published',
      timestamp: n.publishedDate,
      ...(n.publicationId ? { targetId: n.publicationId, targetType: TARGET_PUBLICATION } : {}),
      description: `${String(n.noticeType)} notice for ${publication}`,
      detectedAt: n.detectedAt ?? null,
      lastVerifiedAt: n.lastVerifiedAt ?? null,
      noticeRecordedDate: n.noticeRecordedDate ?? null,
      provenanceKind: n.provenanceKind ?? null,
    });
  }

  for (const r of runs) {
    if (!r.id) continue;
    const timestamp = r.completedAt ?? r.startedAt;
    if (!timestamp) continue;
    events.push({
      id: r.id,
      type: 'analysis_run',
      action: r.status,
      timestamp,
      ...(r.documentVersionId ? { targetId: r.documentVersionId, targetType: TARGET_DOCUMENT_VERSION } : {}),
      description: 'Analysis run for document version',
      startedAt: r.startedAt ?? null,
      completedAt: r.completedAt ?? null,
      provenanceKind: r.provenanceKind ?? null,
    });
  }

  // Dedup by event id (first occurrence wins). Graph node ids are unique,
  // so this is a safety net rather than an expectation of duplicates.
  const unique = [];
  const seen = new Set();
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    unique.push(event);
  }

  // Newest first. ISO-8601 strings sort chronologically; records without a
  // usable timestamp are kept but sort after timed records — nothing is
  // dropped or invented to fill a gap.
  unique.sort((a, b) => {
    const ta = a.timestamp;
    const tb = b.timestamp;
    if (!ta) return 1;
    if (!tb) return -1;
    return tb < ta ? -1 : tb > ta ? 1 : 0;
  });

  return unique;
}
