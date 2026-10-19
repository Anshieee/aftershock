/**
 * @aftershock/server — Wave 4 read-only "independence groups" (GET
 * /.netlify/functions/independence-groups, contract logical route
 * `GET /independence/groups`).
 *
 * Two claims each supported by citation uses that reference the SAME
 * publication are NOT independent evidence for each other. This op surfaces
 * that same-publication fact as read-only groups so a reviewer can see it
 * BEFORE recording a review decision.
 *
 * Integrity invariants (Wave 4 spec / AGENTS.md / DATA_CONTRACTS.md):
 * 1. READ-ONLY: `roQuery` only. No new nodes, edges, properties, or writes
 *    anywhere — never a claim of independence or dependence beyond the
 *    same-publication fact, and never a review-state change.
 * 2. Relation-type discipline: ONLY `CITATION_USE_SUPPORTS_CLAIM` edges count
 *    toward support, belt-and-braces with `cu.role = 'supporting'`
 *    (consistent with server/impact.mjs usage). `MENTIONS_HISTORICALLY`,
 *    `POSSIBLE_MATCH`, and anything else never feed a group.
 * 3. All Cypher parameterized (`$param`) or literal-only label/groupings;
 *    `assertParameterized` guards the query text.
 * 4. Honest empties: an empty/no-support graph summarizes to REAL zeros —
 *    no invented groups. Unknown claims are never invented; every returned
 *    claim carries only the fields the graph actually has (text/status may
 *    be null).
 * 5. Grouping is computed server-side in JS from one flat row shape (keeps
 *    the Cypher simple, deterministic, and parameterized); DISTINCT ids are
 *    deduped so duplicate cu→claim rows cannot double-count.
 *
 * Seed-status semantics (consistency with existing read surfaces wins per the
 * Wave-4 spec "do not double-fetch" rule): the seeded demo surfaces
 * (demoApi.readGraphRecords / readDocuments) read seed identity from a single
 * `readSeedMeta` and answer with honest zeros when the graph does not exist.
 * `seeded` here = `Boolean(seedVersion)` — a SeedMeta node carries a
 * `seedVersion` only after a completed seed (seedGraph idempotency), so this
 * never advertises a half-wiped graph as seeded. getSeedStatus-style
 * node/edge histograms are deliberately NOT fetched for a read panel.
 *
 * Test seam: `independenceGroups(session)` takes an injected GraphSession —
 * no credentials, no real DB, no ESM stubbing (see server/demoApi.mjs).
 */

import { assertParameterized } from './graphClient.mjs';
import { readSeedMeta } from './seed.mjs';

/** Standing honesty string — must never be paraphrased client-side. */
export const INDEPENDENCE_CAVEAT =
  'Claims appearing in the same group share a supporting publication record. '
  + 'Sharing a supporting record means the claims are not independent evidence for each other — '
  + 'review them together at the paper itself. This alone never changes any review state.';

/** Honest v1 scope notes (server constant; mirrored verbatim, not invented). */
export const INDEPENDENCE_LIMITATIONS = Object.freeze([
  'Only same-publication sharing is detected in this tier; shared datasets, analyses, '
    + 'or review trees are not detected (Find Evidence responses disclose the same limitation).',
  'Historical mentions never contribute to these groups; only supporting citation uses do.',
]);

/** Wall-clock budget (ms) for the read — below the client's 10 s abort. */
export const INDEPENDENCE_READ_BUDGET_MS = 8_000;

/** The ONLY citation-use role that can ever feed a group (belt-and-braces filter). */
export const SUPPORTING_ROLE = 'supporting';

/** Empty summary — real zeros, never fabricated. */
function emptySummary() {
  return {
    supportingCitationUses: 0,
    publicationsSupportingClaims: 0,
    sharedGroups: 0,
  };
}

/**
 * Normalize an empty/absent string into `null` — a missing value is missing,
 * never an invented "". Non-strings other than `undefined`/`null` pass
 * through (the graph is the only source of field semantics).
 * @param {unknown} value
 * @returns {unknown}
 */
function orNull(value) {
  if (value === '' || value === undefined || value === null) return null;
  return value;
}

/**
 * One read-only traversal: every surviving supporting citation use, its claim,
 * and its referenced publication. Belt-and-braces discipline per the Wave-4
 * spec — the support edge type AND `cu.role = $supporting` must BOTH hold;
 * the ONLY other edge read is the citation-use→publication reference edge.
 * Deliberately NO SourceNotice/PROVENANCE_OF leg (explicitly excluded by the
 * Wave-4 spec) and no `MENTIONS_HISTORICALLY`/`POSSIBLE_MATCH` leg anywhere.
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<Array<Record<string, unknown>>>} flat rows ordered by
 *          publicationId, claimId
 */
async function readSupportRows(session) {
  const cypher = `MATCH (cu:CitationUse)-[support:CITATION_USE_SUPPORTS_CLAIM]->(claim:Claim)
   WHERE cu.role = $supporting
   MATCH (cu)-[:CITATION_USE_REFERENCES_PUBLICATION]->(pub:Publication)
   RETURN pub.id AS publicationId, pub.doi AS pubDoi, pub.title AS pubTitle,
          pub.isSynthetic AS pubIsSynthetic,
          claim.id AS claimId, claim.text AS claimText, claim.status AS claimStatus,
          support.provenanceKind AS supportProvenance,
          support.analysisVersion AS supportAnalysisVersion,
          cu.id AS citationUseId
   ORDER BY publicationId, claimId`;
  const params = { supporting: SUPPORTING_ROLE };
  assertParameterized(cypher, params);
  const res = await session.roQuery(cypher, params);
  return /** @type {Array<Record<string, unknown>>} */ (res.data ?? []);
}

/**
 * Compute the read-only independence-groups payload for the session's graph.
 * Honest shapes:
 * - Graph does not exist → `seeded:false`, `seedVersion:null`, all-zero
 *   summary, empty groups.
 * - Exists but no (or stale-zero) support links → real zeros, empty groups.
 * - Groups contain ONLY publications with `claimCount > 1` (singletons stay
 *   in the summary so zeros/ones remain visible without inflating the list).
 *
 * @param {import('./graphClient.mjs').GraphSession} session
 * @returns {Promise<{
 *   graphName: string,
 *   seeded: boolean,
 *   seedVersion: string | null,
 *   summary: { supportingCitationUses: number, publicationsSupportingClaims: number, sharedGroups: number },
 *   groups: Array<{
 *     publication: { id: string, doi: string | null, title: string | null, isSynthetic: boolean | null },
 *     citationUseIds: string[],
 *     claimCount: number,
 *     claims: Array<{ id: string, text: string | null, status: string | null }>,
 *   }>,
 *   caveat: string,
 *   limitations: string[],
 * }>}
 */
export async function independenceGroups(session) {
  const graphName = session.graphName;

  if (!(await session.graphExists())) {
    return {
      graphName,
      seeded: false,
      seedVersion: null,
      summary: emptySummary(),
      groups: [],
      caveat: INDEPENDENCE_CAVEAT,
      limitations: INDEPENDENCE_LIMITATIONS,
    };
  }

  const [meta, rows] = await Promise.all([
    readSeedMeta(session),
    readSupportRows(session),
  ]);

  /** Distinct support links actually seen (deduped). @type {Set<string>} */
  const seenSupportLinks = new Set();
  /** pubId → accumulator, keyed in first-seen (publicationId-ascending) order. */
  const acc = new Map();

  for (const row of rows) {
    const citationUseId = typeof row.citationUseId === 'string' && row.citationUseId !== ''
      ? row.citationUseId
      : null;
    const claimId = typeof row.claimId === 'string' && row.claimId !== '' ? row.claimId : null;
    if (!citationUseId || !claimId) continue; // cannot attribute a link lacking its endpoints

    // A support link is (citationUse → claim). Duplicate rows for the same
    // link are a safety-net dedupe — they count ONCE, never twice.
    const linkKey = `${citationUseId}\n${claimId}`;
    if (seenSupportLinks.has(linkKey)) continue;
    seenSupportLinks.add(linkKey);

    const publicationId = typeof row.publicationId === 'string' && row.publicationId !== ''
      ? row.publicationId
      : null;
    if (!publicationId) {
      // A support link exists but no attributed publication: counted in the
      // summary (the link IS seen), honestly outside any group.
      continue;
    }

    if (!acc.has(publicationId)) {
      acc.set(publicationId, {
        publication: {
          id: publicationId,
          doi: orNull(row.pubDoi),
          title: orNull(row.pubTitle),
          isSynthetic: orNull(row.pubIsSynthetic),
        },
        citationUseIds: [],
        claims: /** @type {Map<string, {id: string, text: string | null, status: string | null}>} */ (new Map()),
      });
    }
    const group = /** @type {{publication: {id: string, doi: string | null, title: string | null, isSynthetic: boolean | null}, citationUseIds: string[], claims: Map<string, {id: string, text: string | null, status: string | null}>}} */ (acc.get(publicationId));
    if (!group.citationUseIds.includes(citationUseId)) group.citationUseIds.push(citationUseId);
    if (!group.claims.has(claimId)) {
      group.claims.set(claimId, { id: claimId, text: orNull(row.claimText), status: orNull(row.claimStatus) });
    }
  }

  /** @type {Array<any>} */
  const groups = [];
  for (const group of acc.values()) {
    const claimCount = group.claims.size;
    if (claimCount > 1) {
      groups.push({
        publication: group.publication,
        citationUseIds: [...group.citationUseIds],
        claims: [...group.claims.values()],
        claimCount,
      });
    }
  }

  return {
    graphName,
    seeded: Boolean(meta.seedVersion),
    seedVersion: meta.seedVersion,
    summary: {
      supportingCitationUses: seenSupportLinks.size,
      publicationsSupportingClaims: acc.size,
      sharedGroups: groups.length,
    },
    groups,
    caveat: INDEPENDENCE_CAVEAT,
    limitations: INDEPENDENCE_LIMITATIONS,
  };
}
