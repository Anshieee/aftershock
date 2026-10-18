/**
 * @aftershock/server — M5 human review workflow: review decisions + revision proposals
 *
 * Implements DATA_CONTRACTS §5 (`POST /review/cases/:id/decide`, `/revision`) and §4
 * (orthogonal review case states). All graph writes go through `session.writeQuery`
 * with `$params`; `assertParameterized` guards every Cypher string. Values never
 * appear as inline literals.
 *
 * Scientific-integrity invariants (AGENTS.md / DATA_CONTRACTS §7):
 * - A review flag means "needs human review" — never "disproven/proven".
 * - Original claim/conclusion text is IMMUTABLE: decisions never SET node `text`.
 * - No automatic scientific validation, no automatic claim invalidation,
 *   no silent closure of downstream concerns.
 * - ReviewDecision / RevisionProposal nodes carry `provenanceKind`,
 *   `analysisVersion`, `createdAt`/`updatedAt` per contract §1/§2.
 *
 * Test seam: this module has no hardcoded graph/credentials and performs no I/O
 * of its own — it is driven by an injected `GraphSession`. Unit tests pass a
 * scripted fake session; they never stub ESM modules and never touch a real DB.
 */

import { randomUUID } from 'node:crypto';
import { assertParameterized } from './graphClient.mjs';
import { SEED_ANALYSIS_VERSION, SEED_EDGE_REVIEW_STATE } from './contract.mjs';

/* ------------------------------------------------------------------ *
 * Contract constants
 * ------------------------------------------------------------------ */

/** DATA_CONTRACTS §4 — review case states (orthogonal; a case may hold several). */
export const REVIEW_STATES = Object.freeze([
  'awaiting_review',
  'review_recorded',
  'further_investigation',
  'revision_pending',
  'draft_prepared',
  'reported_applied_externally',
  'resolved',
  'reopened_due_to_new_information',
]);

/** DATA_CONTRACTS §4 — ReviewDecision.outcome values. */
export const REVIEW_OUTCOMES = Object.freeze([
  'revision_needed',
  'more_evidence_needed',
  'not_affected',
  'evidence_updated',
]);

/** Terminal review states: once reached, no further decision may be recorded (409). */
export const TERMINAL_REVIEW_STATES = Object.freeze(['resolved', 'reported_applied_externally']);

/** Reviewable case node labels. A case is a Claim or a Conclusion. */
export const REVIEWABLE_LABELS = Object.freeze(['Claim', 'Conclusion']);

/**
 * Edge type linking a case node to its ReviewDecision node. Deliberately NOT one
 * of the existing EDGE_TYPES (§2) — it is a dedicated review-audit link, never
 * conflated with citation/dependency/notice relations.
 * @type {string}
 */
export const REVIEW_DECISION_EDGE_TYPE = 'HAS_REVIEW_DECISION';

/**
 * Outcome → follow-up flag(s) recorded on the case (orthogonal to reviewState).
 * `not_affected` / `evidence_updated` close the concern (no follow-up flag);
 * they are review_recorded, NOT scientific certification.
 * @type {Record<string, {flags: string[]}>}
 */
export const OUTCOME_FOLLOW_UP = Object.freeze({
  revision_needed: { flags: ['revision_pending'] },
  more_evidence_needed: { flags: ['further_investigation'] },
  not_affected: { flags: [] },
  evidence_updated: { flags: [] },
});

/* ------------------------------------------------------------------ *
 * Errors — each carries an HTTP status the handler maps verbatim.
 * ------------------------------------------------------------------ */

/**
 * Review-domain error with an attached HTTP status.
 * @param {string} message
 * @param {number} status
 */
export class ReviewRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ReviewRequestError';
    this.status = status;
  }
}

/** 400 — the request input is invalid or the case cannot be reviewed. */
export class ReviewValidationError extends ReviewRequestError {
  constructor(message) { super(message, 400); this.name = 'ReviewValidationError'; }
}

/** 404-equivalent surfaced as 400 (contract lists no 404) — no such case node. */
export class ReviewNotFoundError extends ReviewRequestError {
  constructor(message) { super(message, 400); this.name = 'ReviewNotFoundError'; }
}

/** 409 — the case is in a state that rejects another decision (e.g. terminal). */
export class ReviewConflictError extends ReviewRequestError {
  constructor(message) { super(message, 409); this.name = 'ReviewConflictError'; }
}

/* ------------------------------------------------------------------ *
 * Input validation
 * ------------------------------------------------------------------ */

/** caseId safe charset: letters, digits, underscore, hyphen only. Rejects
 *  enumeration probes (../, spaces, shell metacharacters) before any graph I/O. */
const CASE_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Max lengths (chars) for user-supplied review inputs. Oversized payloads are
 *  rejected with 400 before any graph I/O. */
const MAX_INPUT_LEN = Object.freeze({
  caseId: 100,
  reviewer: 200,
  explanation: 5000,
  proposedText: 5000,
  rationale: 1000,
});

/**
 * Validate + normalize a review-decision input. Throws ReviewValidationError
 * (400) on any problem; returns a normalized input object otherwise.
 * @param {unknown} input
 * @returns {{caseId: string, outcome: string, explanation: string, reviewer: string | undefined}}
 */
export function validateReviewDecisionInput(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ReviewValidationError('Request body must be a JSON object.');
  }
  const { caseId, outcome, explanation, reviewer } = input;
  if (typeof caseId !== 'string' || caseId.trim() === '') {
    throw new ReviewValidationError('caseId is required (non-empty string).');
  }
  const normalizedCaseId = caseId.trim();
  if (!CASE_ID_RE.test(normalizedCaseId)) {
    throw new ReviewValidationError('caseId may only contain letters, digits, underscores, and hyphens.');
  }
  if (!REVIEW_OUTCOMES.includes(outcome)) {
    throw new ReviewValidationError(`outcome must be one of ${REVIEW_OUTCOMES.join(', ')}.`);
  }
  if (typeof explanation !== 'string' || explanation.trim() === '') {
    throw new ReviewValidationError('explanation is required (non-empty string).');
  }
  if (reviewer !== undefined && reviewer !== null && typeof reviewer !== 'string') {
    throw new ReviewValidationError('reviewer must be a string when provided.');
  }
  if (normalizedCaseId.length > MAX_INPUT_LEN.caseId) {
    throw new ReviewValidationError(`caseId must be ${MAX_INPUT_LEN.caseId} characters or fewer.`);
  }
  if (explanation.trim().length > MAX_INPUT_LEN.explanation) {
    throw new ReviewValidationError(`explanation must be ${MAX_INPUT_LEN.explanation} characters or fewer.`);
  }
  if (typeof reviewer === 'string' && reviewer.trim().length > MAX_INPUT_LEN.reviewer) {
    throw new ReviewValidationError(`reviewer must be ${MAX_INPUT_LEN.reviewer} characters or fewer.`);
  }
  return {
    caseId: normalizedCaseId,
    outcome,
    explanation: explanation.trim(),
    reviewer: typeof reviewer === 'string' ? reviewer.trim() : undefined,
  };
}

/**
 * Validate + normalize a revision-proposal input. Throws ReviewValidationError
 * (400) on any problem; returns a normalized input object otherwise.
 * @param {unknown} input
 * @returns {{caseId: string, proposedText: string, rationale: string | undefined}}
 */
export function validateRevisionProposalInput(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ReviewValidationError('Request body must be a JSON object.');
  }
  const { caseId, proposedText, rationale } = input;
  if (typeof caseId !== 'string' || caseId.trim() === '') {
    throw new ReviewValidationError('caseId is required (non-empty string).');
  }
  const normalizedCaseId = caseId.trim();
  if (!CASE_ID_RE.test(normalizedCaseId)) {
    throw new ReviewValidationError('caseId may only contain letters, digits, underscores, and hyphens.');
  }
  if (typeof proposedText !== 'string' || proposedText.trim() === '') {
    throw new ReviewValidationError('proposedText is required (non-empty string).');
  }
  if (rationale !== undefined && rationale !== null && typeof rationale !== 'string') {
    throw new ReviewValidationError('rationale must be a string when provided.');
  }
  if (normalizedCaseId.length > MAX_INPUT_LEN.caseId) {
    throw new ReviewValidationError(`caseId must be ${MAX_INPUT_LEN.caseId} characters or fewer.`);
  }
  if (proposedText.trim().length > MAX_INPUT_LEN.proposedText) {
    throw new ReviewValidationError(`proposedText must be ${MAX_INPUT_LEN.proposedText} characters or fewer.`);
  }
  if (typeof rationale === 'string' && rationale.trim().length > MAX_INPUT_LEN.rationale) {
    throw new ReviewValidationError(`rationale must be ${MAX_INPUT_LEN.rationale} characters or fewer.`);
  }
  return {
    caseId: normalizedCaseId,
    proposedText: proposedText.trim(),
    rationale: typeof rationale === 'string' ? rationale.trim() : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** @returns {string} current UTC ISO-8601 timestamp. */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Read the current review state of a case node.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} caseId
 * @returns {{id: string, text: string, kind: string | undefined, reviewState: string, reviewFlags: string[]} | null}
 */
async function readCaseState(session, caseId) {
  const res = await session.roQuery(
    'MATCH (n) WHERE n.id = $caseId RETURN n.id AS id, n.text AS text, n.kind AS kind, n.reviewState AS reviewState, n.reviewFlags AS reviewFlags LIMIT 1',
    { caseId },
  );
  const row = res.data?.[0];
  if (!row) return null;
  return {
    id: /** @type {string} */ (row.id),
    text: typeof row.text === 'string' ? row.text : '',
    kind: typeof row.kind === 'string' ? row.kind : undefined,
    reviewState: typeof row.reviewState === 'string' && row.reviewState !== '' ? row.reviewState : 'awaiting_review',
    reviewFlags: Array.isArray(row.reviewFlags) ? [...row.reviewFlags] : [],
  };
}

/**
 * Compute the after-state for an outcome given the current case state.
 * @param {string} currentState
 * @param {string[]} currentFlags
 * @param {string} outcome
 * @returns {{reviewState: string, flags: string[]}}
 */
function computeAfterState(currentState, currentFlags, outcome) {
  const followUp = OUTCOME_FOLLOW_UP[outcome];
  let primaryState;
  if (outcome === 'not_affected' || outcome === 'evidence_updated') {
    // Concern closed (review_recorded) — never automatic scientific certification.
    primaryState = 'review_recorded';
  } else if (currentState === 'awaiting_review') {
    primaryState = 'review_recorded';
  } else {
    // A second (or later) decision re-opens the case for re-review.
    primaryState = 'reopened_due_to_new_information';
  }
  return { reviewState: primaryState, flags: [...followUp.flags] };
}

/* ------------------------------------------------------------------ *
 * Write operations
 * ------------------------------------------------------------------ */

/**
 * Record a human ReviewDecision for a case.
 *
 * - Creates a `ReviewDecision` node linked to the case via `HAS_REVIEW_DECISION`.
 * - Updates the case node: `reviewState` → `review_recorded` (first decision) or
 *   `reopened_due_to_new_information` (subsequent decision), plus outcome flags.
 * - Never touches the case node's `text` (immutability).
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{caseId: string, outcome: string, explanation: string, reviewer?: string}} input
 * @returns {Promise<{decisionId, caseId, outcome, explanation, reviewer?, decidedAt, beforeState, afterState}>}
 */
export async function recordReviewDecision(session, input) {
  const { caseId, outcome, explanation, reviewer } = validateReviewDecisionInput(input);

  const current = await readCaseState(session, caseId);
  if (!current) {
    throw new ReviewNotFoundError(`No reviewable case node found for caseId ${caseId}.`);
  }
  if (!REVIEWABLE_LABELS.includes(current.kind)) {
    throw new ReviewValidationError(`Case ${caseId} is a ${current.kind ?? 'unlabeled'} node, not a Claim or Conclusion.`);
  }
  if (TERMINAL_REVIEW_STATES.includes(current.reviewState)) {
    throw new ReviewConflictError(
      `Case ${caseId} is in terminal state ${current.reviewState}; no further decision can be recorded.`,
    );
  }

  const beforeState = { reviewState: current.reviewState, flags: [...current.reviewFlags] };
  const afterState = computeAfterState(current.reviewState, current.reviewFlags, outcome);

  const decidedAt = nowIso();
  const decisionId = randomUUID();

  // 1) Create the ReviewDecision node.
  const decisionCypher = 'CREATE (d:ReviewDecision) SET d.id = $id, d.caseId = $caseId, d.outcome = $outcome, d.explanation = $explanation, d.reviewer = $reviewer, d.decidedAt = $decidedAt, d.beforeState = $beforeState, d.afterState = $afterState, d.provenanceKind = $prov, d.analysisVersion = $av, d.createdAt = $ts, d.updatedAt = $ts, d.seeded = $seeded';
  const decisionParams = {
    id: decisionId,
    caseId,
    outcome,
    explanation,
    reviewer: reviewer ?? '',
    decidedAt,
    beforeState: JSON.stringify(beforeState),
    afterState: JSON.stringify(afterState),
    prov: 'human_confirmed',
    av: SEED_ANALYSIS_VERSION,
    ts: decidedAt,
    seeded: true,
  };
  assertParameterized(decisionCypher, decisionParams);
  await session.writeQuery(decisionCypher, decisionParams);

  // 2) Link case → decision and update the case node's orthogonal review state.
  const edgeId = randomUUID();
  const edgeCypher = `MATCH (c) WHERE c.id = $caseId MATCH (d:ReviewDecision) WHERE d.id = $decisionId CREATE (c)-[r:${REVIEW_DECISION_EDGE_TYPE}]->(d) SET r.id = $edgeId, r.caseId = $caseId, r.provenanceKind = $prov, r.rationale = $rationale, r.sourcePointer = $sourcePointer, r.createdAt = $ts, r.analysisVersion = $av, r.reviewState = $seedState, r.seeded = $seeded SET c.reviewState = $primaryState, c.reviewFlags = $flags, c.updatedAt = $ts`;
  const edgeParams = {
    caseId,
    decisionId,
    edgeId,
    prov: 'human_confirmed',
    rationale: 'Human review decision recorded for this case.',
    sourcePointer: 'function://review-decide',
    ts: decidedAt,
    av: SEED_ANALYSIS_VERSION,
    seedState: SEED_EDGE_REVIEW_STATE,
    seeded: true,
    primaryState: afterState.reviewState,
    flags: afterState.flags,
  };
  assertParameterized(edgeCypher, edgeParams);
  await session.writeQuery(edgeCypher, edgeParams);

  return {
    decisionId,
    caseId,
    outcome,
    explanation,
    ...(reviewer ? { reviewer } : {}),
    decidedAt,
    beforeState,
    afterState,
  };
}

/**
 * Create a RevisionProposal for a case. The original claim/conclusion text is
 * copied from the case node (immutable — this operation never modifies it).
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {{caseId: string, proposedText: string, rationale?: string}} input
 * @returns {Promise<{proposalId, caseId, originalText, proposedText, rationale?, status, createdAt}>}
 */
export async function createRevisionProposal(session, input) {
  const { caseId, proposedText, rationale } = validateRevisionProposalInput(input);

  const current = await readCaseState(session, caseId);
  if (!current) {
    throw new ReviewNotFoundError(`No reviewable case node found for caseId ${caseId}.`);
  }
  if (!REVIEWABLE_LABELS.includes(current.kind)) {
    throw new ReviewValidationError(`Case ${caseId} is a ${current.kind ?? 'unlabeled'} node, not a Claim or Conclusion.`);
  }

  const createdAt = nowIso();
  const proposalId = randomUUID();

  const proposalCypher = 'CREATE (p:RevisionProposal) SET p.id = $id, p.caseId = $caseId, p.originalText = $originalText, p.proposedText = $proposedText, p.rationale = $rationale, p.status = $status, p.createdAt = $ts, p.updatedAt = $ts, p.provenanceKind = $prov, p.analysisVersion = $av, p.seeded = $seeded';
  const proposalParams = {
    id: proposalId,
    caseId,
    originalText: current.text,
    proposedText,
    rationale: rationale ?? '',
    status: 'draft',
    ts: createdAt,
    prov: 'human_confirmed',
    av: SEED_ANALYSIS_VERSION,
    seeded: true,
  };
  assertParameterized(proposalCypher, proposalParams);
  await session.writeQuery(proposalCypher, proposalParams);

  return {
    proposalId,
    caseId,
    originalText: current.text,
    proposedText,
    ...(rationale ? { rationale } : {}),
    status: 'draft',
    createdAt,
  };
}

/**
 * Fetch all ReviewDecision nodes recorded against a case, newest-first is not
 * assumed; callers sort client-side if needed.
 * @param {import('./graphClient.mjs').GraphSession} session
 * @param {string} caseId
 * @returns {Promise<Array<{id, caseId, outcome, explanation, reviewer?, decidedAt, beforeState, afterState, provenanceKind, analysisVersion, createdAt, updatedAt}>>}
 */
export async function getReviewDecisionsForCase(session, caseId) {
  if (typeof caseId !== 'string' || caseId.trim() === '') {
    throw new ReviewValidationError('caseId is required (non-empty string).');
  }
  const decisionsCypher = 'MATCH (d:ReviewDecision) WHERE d.caseId = $caseId RETURN d.id AS id, d.caseId AS caseId, d.outcome AS outcome, d.explanation AS explanation, d.reviewer AS reviewer, d.decidedAt AS decidedAt, d.beforeState AS beforeState, d.afterState AS afterState, d.provenanceKind AS provenanceKind, d.analysisVersion AS analysisVersion, d.createdAt AS createdAt, d.updatedAt AS updatedAt ORDER BY d.decidedAt ASC';
  assertParameterized(decisionsCypher, { caseId });
  const res = await session.roQuery(decisionsCypher, { caseId });
  return (res.data ?? []).map((row) => ({
    id: row.id,
    caseId: row.caseId,
    outcome: row.outcome,
    explanation: row.explanation,
    ...(row.reviewer ? { reviewer: row.reviewer } : {}),
    decidedAt: row.decidedAt,
    beforeState: row.beforeState ? JSON.parse(row.beforeState) : null,
    afterState: row.afterState ? JSON.parse(row.afterState) : null,
    provenanceKind: row.provenanceKind,
    analysisVersion: row.analysisVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}
