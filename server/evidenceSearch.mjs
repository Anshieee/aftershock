/**
 * @aftershock/server — P4 "Find Evidence" ops (read-only graph + bounded provider search)
 *
 * Implements DATA_CONTRACTS §5 `POST /evidence/find` (deploy path = function
 * filename `evidence-find`, `?claimId=` query param) per the P4 design of
 * record. No graph writes anywhere in v1: search results are exploratory and
 * are never persisted (no citations, review states, or manuscript are touched).
 *
 * Scientific-integrity invariants (AGENTS.md / DATA_CONTRACTS §7):
 * - Claim text is read verbatim from the graph; the client can never inject it.
 * - `direction` is mapped ONLY from what the graph actually stores
 *   (label Claim → 'direct', Conclusion → 'indirect'); no linkage is claimed
 *   unless a stored path exists.
 * - Concern summaries distinguish STORED PUBLICATION_HAS_NOTICE linkage from
 *   its absence — absence is stated, never papered over.
 * - Crossref `searchCrossref` returns REAL retrieved provider metadata only
 *   (`isSynthetic:false`). Provider failure/timeout ⇒ honest providersStatus
 *   entry; empty results stay empty. Nothing is fabricated from stale data.
 * - Every Cypher statement is parameterized; `assertParameterized` guards.
 * - The external fetch is time-boxed with ≤1 retry and never echoes the query
 *   text into error messages (content-redacted logging rule).
 *
 * Test seam: driven by an injected `GraphSession` (unit tests pass a scripted
 * fake) and an injected `fetch` (via `deps.fetch`) with synthetic fixtures that
 * live only in the test files. No ESM stubbing, no credentials anywhere here.
 */

import { createHash } from 'node:crypto';
import { assertParameterized } from './graphClient.mjs';

/* ------------------------------------------------------------------ *
 * Errors — each carries the HTTP status the handler maps verbatim
 * (same pattern as server/reviewState.mjs).
 * ------------------------------------------------------------------ */

export class EvidenceRequestError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   */
  constructor(message, status) {
    super(message);
    this.name = 'EvidenceRequestError';
    this.status = status;
  }
}

/** 400 — request input invalid (bad claimId charset/length or bad query). */
export class EvidenceValidationError extends EvidenceRequestError {
  constructor(message) { super(message, 400); this.name = 'EvidenceValidationError'; }
}

/** 404 — no Claim/Conclusion node with that id exists in the graph. */
export class EvidenceNotFoundError extends EvidenceRequestError {
  constructor(message) { super(message, 404); this.name = 'EvidenceNotFoundError'; }
}

/* ------------------------------------------------------------------ *
 * Input validation
 * ------------------------------------------------------------------ */

/** claimId safe charset — P4 spec: `^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$`. */
export const CLAIM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/** Search-query hard bounds (post-normalization length). */
export const SEARCH_QUERY_LIMITS = Object.freeze({ min: 1, max: 400 });

/** Suggested-query cap (chars). */
export const SUGGESTED_QUERY_MAX = 300;

/**
 * Validate + normalize claimId. Throws EvidenceValidationError (400) on any
 * problem. The id is never interpolated into Cypher — it travels as `$param`.
 * @param {unknown} claimId
 * @returns {string}
 */
export function validateClaimId(claimId) {
  if (typeof claimId !== 'string' || claimId.trim() === '') {
    throw new EvidenceValidationError('claimId is required (non-empty string).');
  }
  const normalized = claimId.trim();
  if (!CLAIM_ID_RE.test(normalized)) {
    throw new EvidenceValidationError('claimId may only contain letters, digits, dots, underscores, colons, and hyphens (max 64 chars).');
  }
  return normalized;
}

/**
 * Validate + normalize the search query: must be a string; control chars
 * (U+0000–U+001F and U+007F) are stripped outright, then trimmed. After
 * stripping, length must be 1..400. Throws EvidenceValidationError (400).
 * @param {unknown} raw
 * @returns {string} the query that will actually be used (and echoed back)
 */
export function validateSearchQuery(raw) {
  if (typeof raw !== 'string') {
    throw new EvidenceValidationError('query must be a string when provided.');
  }
  const stripped = // eslint-disable-next-line no-control-regex
    raw.replace(/[\u0000-\u001f\u007f]+/g, '');
  const trimmed = stripped.trim();
  if (trimmed.length < SEARCH_QUERY_LIMITS.min) {
    throw new EvidenceValidationError('query must contain at least one printable character.');
  }
  if (trimmed.length > SEARCH_QUERY_LIMITS.max) {
    throw new EvidenceValidationError(`query must be ${SEARCH_QUERY_LIMITS.max} characters or fewer.`);
  }
  return trimmed;
}

/**
 * Deterministic suggested-query text: strips a leading "Claim X:" /
 * "Passage X:" prefix, collapses all whitespace runs to single spaces,
 * trims, and caps at 300 chars. Pure — same input ⇒ same output.
 * @param {string} claimText
 * @returns {string}
 */
export function buildSuggestedQuery(claimText) {
  if (typeof claimText !== 'string') return '';
  const withoutPrefix = claimText.replace(/^[ \t\n\r]*\b(?:Claim|Passage)\s+[^\s:]+:[ \t\n\r]*/i, '');
  return withoutPrefix.replace(/\s+/g, ' ').trim().slice(0, SUGGESTED_QUERY_MAX);
}

/* ------------------------------------------------------------------ *
 * Fixed wire vocabulary (prepare/providers/caveats) — verbatim from spec
 * ------------------------------------------------------------------ */

/** Providers advertised in prepare mode. Only real, live providers — ever. */
export const EVIDENCE_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'crossref',
    displayName: 'Crossref',
    scopeNote: 'public bibliographic metadata',
    landingUrl: 'https://www.crossref.org',
  }),
]);

/** Fixed caveat strings surfaced with every response (spec-exact). */
export const EVIDENCE_CAVEATS = Object.freeze([
  'Candidates come from public bibliographic metadata (Crossref). Relevance ranking is the provider’s bibliographic relevance — not a statement that a paper supports the claim.',
  'Finding a publication never proves a claim; assessing support/contrast is human work done at the paper itself.',
  'Independence between candidates is not verified by this search: different DOIs can still share datasets, analyses or review trees.',
  'Full text is not fetched. Only bibliographic metadata and a DOI link are returned.',
  'This search does not modify citations, review states, or the manuscript.',
]);

/** Honest concern summaries (mutually exclusive states, both disclosed). */
export const CONCERN_SUMMARIES = Object.freeze({
  noticeLinked:
    'Stored graph linkage ties this item to cited support that carries a publication-status notice (a stored PUBLICATION_HAS_NOTICE edge); the candidates below remain unverified metadata and require human support/contrast review at the paper itself.',
  fallback:
    'No verified publication-status linkage is stored for this item yet; the search below reflects only the item’s own text.',
});

/* ------------------------------------------------------------------ *
 * Graph context (prepare leg) — roQuery only, parameterized only
 * ------------------------------------------------------------------ */

const ALLOWED_ITEM_LABELS = /** @type {const} */ (['Claim', 'Conclusion']);

const DIRECTION_BY_LABEL = Object.freeze({ Claim: 'direct', Conclusion: 'indirect' });

/**
 * Load the claim context for the Find-Evidence UI from the graph (read-only).
 * Returns `null` when no Claim/Conclusion node with that id exists (404), or
 * when the node's own label identity is not actually stored (honesty: never
 * guess a linkage, never guess a label).
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} claimId already validated (charset enforced by validateClaimId)
 * @returns {Promise<{
 *   claimId: string,
 *   claimText: string,
 *   label: string,
 *   direction: 'direct' | 'indirect' | 'unknown',
 *   documentVersionId?: string,
 *   manuscriptId?: string,
 *   concern: { summary: string, direction: 'direct' | 'indirect' | 'unknown' },
 *   hasNoticeLinkage: boolean,
 * } | null>}
 */
export async function loadEvidenceFindContext(session, claimId) {
  // Label predicates are fixed contract enums (interpolated) — verified live on
  // FalkorDB (`labels()` + `(c:Claim) OR (c:Conclusion)` filter shape).
  const cypher =
    'MATCH (c) WHERE c.id = $claimId AND ((c:Claim) OR (c:Conclusion))'
    + ' RETURN labels(c) AS labels, c.kind AS kind, c.text AS text, c.documentVersionId AS documentVersionId LIMIT 1';
  assertParameterized(cypher, { claimId });
  const res = await session.roQuery(cypher, { claimId });
  const row = res.data?.[0];
  if (!row) return null;

  const label = resolveLabel(row);
  if (!label) return null;
  const direction = /** @type {'direct' | 'indirect' | 'unknown'} */ (DIRECTION_BY_LABEL[label] ?? 'unknown');

  const documentVersionId =
    typeof row.documentVersionId === 'string' && row.documentVersionId !== ''
      ? row.documentVersionId
      : undefined;

  // Manuscript linkage is optional and only reported when the stored version
  // node actually links back to a ResearchDocument (never claimed otherwise).
  const manuscriptId = documentVersionId ? await resolveManuscriptId(session, documentVersionId) : undefined;

  const hasNoticeLinkage = await hasStoredNoticeLinkage(session, claimId, label);

  return {
    claimId,
    claimText: typeof row.text === 'string' ? row.text : '',
    label,
    direction,
    ...(documentVersionId ? { documentVersionId } : {}),
    ...(manuscriptId ? { manuscriptId } : {}),
    concern: {
      summary: hasNoticeLinkage ? CONCERN_SUMMARIES.noticeLinked : CONCERN_SUMMARIES.fallback,
      direction,
    },
    hasNoticeLinkage,
  };
}

/**
 * Determine the item label from stored graph data only: the fixture's `kind`
 * property when it matches an allowed label, else the stored label set.
 * @param {Record<string, unknown>} row
 * @returns {string | null}
 */
function resolveLabel(row) {
  if (typeof row.kind === 'string' && ALLOWED_ITEM_LABELS.includes(row.kind)) {
    return row.kind;
  }
  if (Array.isArray(row.labels)) {
    const found = row.labels.find((l) => ALLOWED_ITEM_LABELS.includes(l));
    if (typeof found === 'string') return found;
  }
  return null;
}

/**
 * ResearchDocument id linked to a DocumentVersion — only when the stored
 * DOCUMENT_HAS_VERSION edge exists. Parameterized; read-only.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} documentVersionId
 * @returns {Promise<string | undefined>}
 */
async function resolveManuscriptId(session, documentVersionId) {
  const cypher =
    'MATCH (d:ResearchDocument)-[:DOCUMENT_HAS_VERSION]->(v:DocumentVersion)'
    + ' WHERE v.id = $versionId RETURN d.id AS docId LIMIT 1';
  assertParameterized(cypher, { versionId: documentVersionId });
  const res = await session.roQuery(cypher, { versionId: documentVersionId });
  const docId = res.data?.[0]?.docId;
  return typeof docId === 'string' && docId !== '' ? docId : undefined;
}

/**
 * Stored publication-status linkage check. TRUE only when a curated graph
 * path from this item reaches a SourceNotice through PUBLICATION_HAS_NOTICE:
 * - Claims: own CitationUse links (CLAIM_HAS_CITATION_USE), and inbound
 *   review-edge CitationUses (CITATION_USE_SUPPORTS_CLAIM | MENTIONS_HISTORICALLY |
 *   CONTRASTS_CLAIM | USES_METHOD_FROM | ROLE_UNKNOWN).
 * - Conclusions: the dependent Claim's own CitationUse links
 *   (CONCLUSION_DEPENDS_ON_CLAIM → …). Relation types are never conflated: the
 *   check only EXISTS-tests stored linkage; it does not infer support.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} claimId
 * @param {string} label
 * @returns {Promise<boolean>}
 */
async function hasStoredNoticeLinkage(session, claimId, label) {
  const checks = [
    session.roQuery(
      'MATCH (c)-[:CLAIM_HAS_CITATION_USE]->(cu:CitationUse)'
      + '-[:CITATION_USE_REFERENCES_PUBLICATION]->(:Publication)-[:PUBLICATION_HAS_NOTICE]->(:SourceNotice)'
      + ' WHERE c.id = $claimId RETURN count(cu) AS n',
      { claimId },
    ),
    session.roQuery(
      'MATCH (cu:CitationUse)-[:CITATION_USE_SUPPORTS_CLAIM|MENTIONS_HISTORICALLY|CONTRASTS_CLAIM|USES_METHOD_FROM|ROLE_UNKNOWN]->(c)'
      + ' WHERE c.id = $claimId'
      + ' AND (cu)-[:CITATION_USE_REFERENCES_PUBLICATION]->(:Publication)-[:PUBLICATION_HAS_NOTICE]->(:SourceNotice)'
      + ' RETURN count(cu) AS n',
      { claimId },
    ),
  ];
  if (label === 'Conclusion') {
    checks.push(
      session.roQuery(
        'MATCH (c)-[:CONCLUSION_DEPENDS_ON_CLAIM]->(:Claim)-[:CLAIM_HAS_CITATION_USE]->(:CitationUse)'
        + '-[:CITATION_USE_REFERENCES_PUBLICATION]->(:Publication)-[:PUBLICATION_HAS_NOTICE]->(:SourceNotice)'
        + ' WHERE c.id = $claimId RETURN count(*) AS n',
        { claimId },
      ),
    );
  }
  const results = await Promise.all(checks);
  return results.some((r) => Number(r.data?.[0]?.n ?? 0) > 0);
}

/* ------------------------------------------------------------------ *
 * Crossref search leg (bounded, ≤1 retry, honest failure modes)
 * ------------------------------------------------------------------ */

/**
 * Crossref `select` field list — VERIFIED LIVE against
 * `https://api.crossref.org/works?query.bibliographic=…&select=<list>` on
 * 2026-10-19: every one of these names echoes back on each returned item
 * (`DOI,title,author,container-title,published,type,publisher,
 * is-referenced-by-count,update-to`). `update-to` is the provider's explicit
 * update/retraction linkage array — the ONLY basis this module ever uses for
 * `retractionStatus: 'notice_present'`.
 */
export const CROSSREF_SELECT_FIELDS = 'DOI,title,author,container-title,published,type,publisher,is-referenced-by-count,update-to';

/** Hard caps (spec: rows=8, ≤8 candidates, DOI (lowercase) dedupe). */
export const CROSSREF_LIMITS = Object.freeze({ rows: 8, maxCandidates: 8 });

/** Per-attempt fetch abort budget and the total search-leg budget (ms). */
export const CROSSREF_BUDGETS = Object.freeze({ attemptMs: 6_000, legBudgetMs: 6_600 });

const CROSSREF_API_BASE = 'https://api.crossref.org/works';

/**
 * Build the bounded Crossref request URL. The query text travels in
 * `query.bibliographic`, URL-encoded. `mailto` (polite pool) is appended only
 * when `CROSSREF_CONTACT_EMAIL` is configured server-side — never logged.
 * @param {string} query validated query text
 * @param {string | undefined} mailto
 * @returns {string}
 */
export function buildCrossrefUrl(query, mailto) {
  let url = `${CROSSREF_API_BASE}?query.bibliographic=${encodeURIComponent(query)}`
    + `&rows=${CROSSREF_LIMITS.rows}&select=${CROSSREF_SELECT_FIELDS}`;
  if (mailto) url += `&mailto=${encodeURIComponent(mailto)}`;
  return url;
}

/**
 * Search Crossref for real bibliographic metadata.
 *
 * Failure honesty contract:
 * - timeout/delivery errors are NEVER HTTP-500-style exceptions here — they
 *   become `{ status: 'timeout' | 'error', candidates: [] }` so the handler can
 *   reply HTTP 200 with a truthful providersStatus entry.
 * - `retried: true` marks an actually-executed retry (≤1, network/timeout only).
 * - Error messages name the failure class; they never include the query text
 *   (content-redacted logging) or any secret.
 *
 * @param {string} query validated, already-normalized query text
 * @param {{
 *   fetch?: typeof fetch,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   timeoutMs?: number,
 *   budgetMs?: number,
 * }} [deps]
 * @returns {Promise<{
 *   status: 'ok' | 'empty' | 'timeout' | 'error',
 *   candidates: Array<Record<string, unknown>>,
 *   retried?: boolean,
 *   message?: string,
 * }>}
 */
export async function searchCrossref(query, deps = {}) {
  const fetchFn = deps.fetch ?? (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
  if (!fetchFn) {
    return { status: 'error', candidates: [], message: 'No fetch implementation is available server-side; no provider call was made. Nothing was fabricated.' };
  }
  const env = deps.env ?? {};
  const mailto =
    typeof env.CROSSREF_CONTACT_EMAIL === 'string' && env.CROSSREF_CONTACT_EMAIL.trim() !== ''
      ? env.CROSSREF_CONTACT_EMAIL.trim()
      : undefined;
  const attemptMs = Math.max(1, Math.floor(deps.timeoutMs ?? CROSSREF_BUDGETS.attemptMs));
  const budgetMs = Math.max(attemptMs, Math.floor(deps.budgetMs ?? CROSSREF_BUDGETS.legBudgetMs));
  const url = buildCrossrefUrl(query, mailto);

  const legStartedAt = Date.now();
  const remainingMs = () => Math.max(0, budgetMs - (Date.now() - legStartedAt));

  /** @type {{status: 'timeout' | 'error', message: string} | null} */
  let lastFailure = null;
  let retried = false;

  for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
    if (attemptIndex > 0) retried = true;
    const attemptBudget = Math.min(attemptMs, remainingMs());
    if (attemptBudget <= 0) {
      return finalTimeoutOutcome(lastFailure, retried, true);
    }

    const outcome = await runAttempt(fetchFn, url, attemptBudget);
    if (!outcome.ok) {
      lastFailure = { status: outcome.kind, message: outcome.message };
      if (outcome.kind === 'error' && outcome.noRetry) break;
      continue; // transient network error / timeout → single retry
    }

    let body;
    try {
      body = await outcome.res.json();
    } catch /* parse failure or abort mid-body */ {
      lastFailure = { status: 'error', message: 'Crossref returned an unreadable response body. Nothing was fabricated.' };
      continue;
    }
    return parseCrossrefReply(body, query, retried);
  }

  return honestFailureOutcome(lastFailure, retried);
}

/**
 * Run one abort-band attempt of the Crossref fetch. Deliberately kept small:
 * everything is bounded by the per-attempt AbortController, including the
 * response-body read (aborting the signal interrupts body delivery too).
 * @param {typeof fetch} fetchFn
 * @param {string} url never logged
 * @param {number} attemptBudget
 * @returns {Promise<
 *   { ok: true, res: Response } |
 *   { ok: false, kind: 'timeout' | 'error', message: string, noRetry?: boolean }
 * >}
 */
async function runAttempt(fetchFn, url, attemptBudget) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), attemptBudget);
  try {
    const res = await fetchFn(url, { signal: abort.signal });
    if (!res.ok) {
      // A delivered provider response (any HTTP status) is NOT a network
      // failure: per spec, the single retry applies to network errors and
      // timeouts only, so HTTP-error replies are never retried.
      return {
        ok: false,
        kind: 'error',
        noRetry: true,
        message: `Crossref responded with HTTP ${res.status}; no candidate list was fabricated from it.`,
      };
    }
    return { ok: true, res };
  } catch (err) {
    const name = err instanceof Error ? err.name : String(err);
    if (name === 'AbortError' || name === 'TimeoutError') {
      return { ok: false, kind: 'timeout', message: 'The Crossref call was aborted before it completed (time-boxed fetch with at most one retry).' };
    }
    return { ok: false, kind: 'error', message: `The Crossref call failed before returning a response (${name}).` };
  } finally {
    clearTimeout(timer);
  }
}

/** Honest terminal outcomes after all allowed attempts. */
function finalTimeoutOutcome(lastFailure, retried, budgetExhausted) {
  return {
    status: 'timeout',
    candidates: [],
    ...(retried ? { retried: true } : {}),
    message: budgetExhausted && lastFailure?.status === 'error'
      ? 'The overall search budget was exhausted after a failed attempt; no further provider call was made.'
      : `The provider search did not complete within the bounded window${retried ? ' and its single retry' : ''}. No candidates and no fabricated ones — providersStatus reports this honestly.`,
  };
}

function honestFailureOutcome(lastFailure, retried) {
  if (!lastFailure) {
    return {
      status: 'timeout',
      candidates: [],
      ...(retried ? { retried: true } : {}),
      message: 'The provider search did not complete within the bounded window. No candidates and no fabricated ones.',
    };
  }
  return {
    status: lastFailure.status,
    candidates: [],
    ...(retried ? { retried: true } : {}),
    ...{ message: lastFailure.message },
  };
}

/**
 * Parse + normalize a successful Crossref reply into spec EvidenceCandidates:
 * trim/flatten fields, dedupe by lowercase DOI (provider order preserved),
 * cap at 8. `retractionStatus` is 'notice_present' ONLY when this specific
 * record carries an explicit `update-to` linkage; otherwise 'unknown'.
 * @param {unknown} body parsed JSON
 * @param {string} query used for the relevanceBasis line only
 * @param {boolean} retried
 */
function parseCrossrefReply(body, query, retried) {
  const root = /** @type {Record<string, unknown>} */ (body && typeof body === 'object' ? body : {});
  const message = /** @type {Record<string, unknown>} */ (
    root['message'] && typeof root['message'] === 'object' ? root['message'] : {}
  );
  if (root['status'] !== 'ok' || !Array.isArray(message.items)) {
    return {
      status: 'error',
      candidates: [],
      ...(retried ? { retried: true } : {}),
      message: 'Crossref responded with an unexpected payload shape; nothing was fabricated from it.',
    };
  }

  const relevanceBasis =
    'Retrieved by Crossref bibliographic relevance for '
    + `'${query}' — a metadata match only; support/contrast relationships are unverified.`;

  /** @type {Set<string>} */
  const seenDois = new Set();
  /** @type {Array<Record<string, unknown>>} */
  const candidates = [];
  for (const rawItem of /** @type {unknown[]} */ (message.items)) {
    if (candidates.length >= CROSSREF_LIMITS.maxCandidates) break;
    const item = /** @type {Record<string, unknown>} */ (
      rawItem && typeof rawItem === 'object' && !Array.isArray(rawItem) ? rawItem : {}
    );

    const doi = typeof item['DOI'] === 'string' && item['DOI'].trim() !== '' ? item['DOI'].trim() : undefined;
    if (doi) {
      const key = doi.toLowerCase();
      if (seenDois.has(key)) continue;
      seenDois.add(key);
    }

    candidates.push(normalizeItem(item, doi, relevanceBasis));
  }

  return {
    status: candidates.length > 0 ? 'ok' : 'empty',
    candidates,
    ...(retried ? { retried: true } : {}),
  };
}

/**
 * Map one Crossref work item to the spec EvidenceCandidate (real provider
 * metadata, `isSynthetic:false`).
 * @param {Record<string, unknown>} item
 * @param {string | undefined} doi
 * @param {string} relevanceBasis
 */
function normalizeItem(item, doi, relevanceBasis) {
  const title = firstString(item.title);
  const authors = normalizeAuthors(item.author);
  const year = yearOf(item.published);
  const container = firstString(item['container-title']);
  const publicationType = typeof item.type === 'string' ? item.type : undefined;
  const publisher = typeof item.publisher === 'string' && item.publisher.trim() !== '' ? item.publisher : undefined;

  const updateLinkage = Array.isArray(item['update-to']) && item['update-to'].length > 0;
  const retractionStatus = updateLinkage ? 'notice_present' : 'unknown';

  const candidateId = doi
    ? `doi:${doi.toLowerCase()}`
    : `fa:${createHash('sha1').update(`${title}::${authors[0] ?? ''}`, 'utf8').digest('hex')}`;

  return {
    candidateId,
    ...(doi ? { doi } : {}),
    title,
    authors,
    ...(year !== undefined ? { year } : {}),
    ...(container ? { container } : {}),
    ...(publicationType ? { publicationType } : {}),
    ...(publisher ? { publisher } : {}),
    isSynthetic: false,
    retractionStatus,
    evidenceRelationship: 'unverified',
    independence: 'unknown',
    fullTextAvailability: 'unknown',
    relevanceBasis,
    ...(doi ? { urls: { sourceUrl: `https://doi.org/${doi}` } } : {}),
  };
}

/** First non-empty string entry of a provider field (string | string[]). */
function firstString(value) {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (Array.isArray(value)) {
    const found = value.find((v) => typeof v === 'string' && v.trim() !== '');
    if (typeof found === 'string') return found.trim();
  }
  return '';
}

/** ["Family","Given"] as provider returns them, joined for display; [] if none. */
function normalizeAuthors(value) {
  if (!Array.isArray(value)) return [];
  const authors = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = /** @type {Record<string, unknown>} */ (raw);
    const family = typeof entry.family === 'string' && entry.family.trim() !== '' ? entry.family.trim() : '';
    const given = typeof entry.given === 'string' && entry.given.trim() !== '' ? entry.given.trim() : '';
    const joined = family + (family && given ? ', ' : '') + given;
    if (joined !== '') {
      authors.push(joined);
    } else {
      const name = typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name.trim() : '';
      if (name !== '') authors.push(name);
    }
  }
  return authors;
}

/** Crossref `published.date-parts[0][0]` → number, else undefined. */
function yearOf(published) {
  if (typeof published !== 'object' || published === null) return undefined;
  const dateParts = /** @type {Record<string, unknown>} */ (published)['date-parts'];
  if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) return undefined;
  const year = dateParts[0][0];
  if (typeof year === 'number' && Number.isFinite(year)) return year;
  if (typeof year === 'string' && /^\d{4}$/.test(year)) return Number(year);
  return undefined;
}
