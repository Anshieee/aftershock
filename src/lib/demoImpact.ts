/**
 * Client-side derivation of the guided-demo impact story from REAL graph
 * API data (src/lib/api.ts `getGraphOverview`).
 *
 * Hard rules honored:
 * - Uses only returned node/edge records — no fixture constants drive the
 *   numbers displayed, only their interpretation. If the API is silent the
 *   UI shows "not recorded", never an invented count (AGENTS.md integrity).
 * - Never conflates relation types: supporting ≠ historical ≠ possible
 *   match ≠ status notice (DATA_CONTRACTS §2).
 * - A flag always means "needs human review", never "disproven" (§7).
 */

import type { GraphEdge, GraphNode, GraphOverview } from './api';

/* ------------------------------------------------------------------ *
 * M7 Priority A — read-only Evidence Reader helpers. PURE ADDITIVE:
 * every export above stays byte-compatible (DemoResultsPage and its
 * tests depend on it). These helpers only ORDER and TOLERANTLY PARSE
 * what the returned records already carry — they never invent
 * locations, page numbers or pagination (AGENTS.md integrity).
 * ------------------------------------------------------------------ */

/**
 * Recorded location of one passage, as the returned record states it.
 * Every field is optional: the reader renders only the pieces that are
 * actually recorded and groups anything else as unlocatable.
 */
export interface RecordedLocation {
  section?: string;
  page?: number;
  offset?: number;
  /**
   * Verbatim recorded string when the location arrived in an
   * unstructured form (a non-JSON string). Shown as-is, never parsed
   * into a position.
   */
  raw?: string;
}

/**
 * Tolerant `location` reader. The seeded graph normalizes structural
 * values to JSON strings (seed.mjs `normalizeValue`), so the same
 * metadata can arrive as an object OR as a JSON string; it may also be
 * a plain recorded string (e.g. "p.12"). Never throws — any value the
 * helper cannot read becomes `null`, which the reader treats as
 * unlocatable rather than guessing a position.
 * Accepted keys: `section` (string), `page` (finite number),
 * `offset`/`excerptOffset` (finite number).
 */
export function parseRecordedLocation(value: unknown): RecordedLocation | null {
  if (value === null || value === undefined || value === false) return null;
  let source: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        source = JSON.parse(trimmed);
      } catch {
        // Not JSON — keep the string verbatim; it is still a recorded
        // location statement, just not one we can order by.
        return { raw: trimmed };
      }
    } else {
      return { raw: trimmed };
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  const section =
    typeof record['section'] === 'string' && record['section'].trim().length > 0
      ? record['section'].trim()
      : undefined;
  const page = typeof record['page'] === 'number' && Number.isFinite(record['page']) ? record['page'] : undefined;
  const offsetCandidate = 'offset' in record ? record['offset'] : record['excerptOffset'];
  const offset =
    typeof offsetCandidate === 'number' && Number.isFinite(offsetCandidate)
      ? offsetCandidate
      : undefined;
  if (section === undefined && page === undefined && offset === undefined) return null;
  return { section, page, offset };
}

export interface ReaderOrderedEntry<T> {
  item: T;
  id: string;
  /** True when the record carries at least one usable location piece. */
  located: boolean;
  section?: string;
  page?: number;
  offset?: number;
  /** Verbatim recorded string for unstructured locations (sorted last). */
  rawLocation?: string;
}

const SECTION_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'variant' });

/**
 * Deterministic ordering of passages for the read-only reader: records
 * WITH usable recorded location metadata first — primary key recorded
 * section (entries with no recorded section keep their recorded
 * page/offset and sort after all sectioned entries), then recorded
 * page, then recorded offset, then record id (full-determinism
 * tie-break). Records WITHOUT usable location metadata keep their
 * returned order and come last in their own unlocatable group. No
 * positions are ever invented for the unlocatable group.
 */
export function orderRecordedEntries<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  locationValueOf: (item: T) => unknown,
): ReaderOrderedEntry<T>[] {
  const entries: ReaderOrderedEntry<T>[] = items.map((item) => {
    const id = idOf(item);
    const location = parseRecordedLocation(locationValueOf(item));
    if (!location) return { item, id, located: false };
    return {
      item,
      id,
      located: true,
      section: location.section,
      page: location.page,
      offset: location.offset,
      rawLocation: location.raw,
    };
  });
  const sorted = entries.filter((entry) => entry.located);
  const unlocated = entries.filter((entry) => !entry.located);
  sorted.sort((a, b) => {
    // Section-less (but still located) entries form the last located group.
    if ((a.section !== undefined) !== (b.section !== undefined)) {
      return a.section !== undefined ? -1 : 1;
    }
    if (a.section !== undefined && b.section !== undefined && a.section !== b.section) {
      return SECTION_COLLATOR.compare(a.section, b.section) || (a.section < b.section ? -1 : 1);
    }
    const aPage = a.page ?? Number.POSITIVE_INFINITY;
    const bPage = b.page ?? Number.POSITIVE_INFINITY;
    if (aPage !== bPage) return aPage - bPage;
    const aOffset = a.offset ?? Number.POSITIVE_INFINITY;
    const bOffset = b.offset ?? Number.POSITIVE_INFINITY;
    if (aOffset !== bOffset) return aOffset - bOffset;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return [...sorted, ...unlocated];
}

export interface VerifiedNoticeItem {
  noticeId: string;
  noticeType: string;
  verified: boolean | undefined;
  publishedDate?: string;
  noticeAnnouncementDate?: string;
  noticeRecordedDate?: string;
  sourceUrl?: string;
  publicationId?: string;
  title?: string;
}

export interface AffectedItem {
  id: string;
  kind: 'claim' | 'conclusion';
  /** Direct support of the retracted source, or indirect via a depended claim. */
  reviewKind: 'direct_evidence_review' | 'indirect_evidence_review';
  /** The verified-notice publication triggering this review. */
  viaPublicationId: string;
  /** Citation use whose supporting role connects the claim to the publication. */
  viaCitationUseId?: string;
  /** For indirect reviews: the flagged claim the conclusion depends on. */
  viaClaimId?: string;
  text?: string;
}

export interface HistoricalItem {
  id: string;
  text?: string;
  viaCitationUseId?: string;
  viaPublicationId: string;
}

export interface UnresolvedItem {
  id: string;
  text?: string;
  resolutionState?: string;
  candidateIds: string[];
  /** True when every candidate connection is an unverified POSSIBLE_MATCH edge. */
  onlyPossibleMatches: boolean;
}

export interface DemoImpact {
  /** Counts describe exactly what the server returned, nothing more. */
  nodeCount: number;
  edgeCount: number;
  seedVersion?: string;
  /** Title of the manuscript under investigation, if recorded in the returned graph. */
  manuscriptTitle?: string;
  verifiedNotices: VerifiedNoticeItem[];
  affected: AffectedItem[];
  historical: HistoricalItem[];
  unresolved: UnresolvedItem[];
  syntheticEntityCount: number;
  realEntityCount: number;
}

function prop(node: GraphNode, key: string): unknown {
  return node.properties[key];
}

function optionalText(node: GraphNode, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = node.properties[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Derives the demo impact story. This is a graph traversal over the returned
 * records mirroring the server-side impact module semantics:
 * verified notice → publication → supporting citation use → claim →
 * dependent conclusion, while historical mentions and unresolved possible
 * matches never join the flagged set.
 */
export function deriveDemoImpact(overview: GraphOverview): DemoImpact {
  const { nodes, edges } = overview;

  const manuscriptNode = nodes.find((node) => node.kind === 'ResearchDocument');
  const manuscriptTitle =
    manuscriptNode ? optionalText(manuscriptNode, ['title']) : undefined;

  const nodeById = new Map<string, GraphNode>(nodes.map((node) => [node.id, node]));

  const isEdgeOfType = (edge: GraphEdge, type: string) => edge.type === type;

  // §7.1 step 1: notices attached to publications via PUBLICATION_HAS_NOTICE,
  // treated as verified only when the notice record itself is marked verified.
  const verifiedNotices: VerifiedNoticeItem[] = [];
  const verifiedPublications = new Set<string>();
  for (const edge of edges) {
    if (!isEdgeOfType(edge, 'PUBLICATION_HAS_NOTICE')) continue;
    const notice = nodeById.get(edge.toId);
    if (!notice || notice.kind !== 'SourceNotice') continue;
    const verified = prop(notice, 'verified');
    if (verified === true) {
      if (edge.fromId) verifiedPublications.add(edge.fromId);
      verifiedNotices.push({
        noticeId: notice.id,
        noticeType: String(prop(notice, 'noticeType') ?? 'unknown'),
        verified: true,
        publishedDate: optionalText(notice, ['publishedDate']),
        noticeAnnouncementDate: optionalText(notice, ['noticeAnnouncementDate']),
        noticeRecordedDate: optionalText(notice, ['noticeRecordedDate']),
        sourceUrl: optionalText(notice, ['sourceUrl']),
        publicationId: edge.fromId,
        title: optionalText(notice, ['title']),
      });
    }
  }

  // §7.1 step 2–3: affected claims come only from a citation use whose
  // CITATION_USE_SUPPORTS_CLAIM edge lands on the claim AND whose referenced
  // publication carries a verified notice.
  const affected: AffectedItem[] = [];
  const affectedClaimIds = new Set<string>();
  const referencesPublication = new Map<string, string>(); // citationUseId -> publicationId
  for (const edge of edges) {
    if (!isEdgeOfType(edge, 'CITATION_USE_REFERENCES_PUBLICATION')) continue;
    if (!edge.fromId || !edge.toId) continue;
    // Only target publications with a verified notice — does not conflate
    // any other edge semantics into this map.
    referencesPublication.set(edge.fromId, edge.toId);
  }

  for (const edge of edges) {
    if (!isEdgeOfType(edge, 'CITATION_USE_SUPPORTS_CLAIM')) continue;
    const citationUse = nodeById.get(edge.fromId);
    const claim = nodeById.get(edge.toId);
    if (!citationUse || citationUse.kind !== 'CitationUse') continue;
    if (!claim || claim.kind !== 'Claim') continue;
    const publicationId = referencesPublication.get(citationUse.id);
    if (!publicationId || !verifiedPublications.has(publicationId)) continue;
    if (affectedClaimIds.has(claim.id)) continue;
    affectedClaimIds.add(claim.id);
    affected.push({
      id: claim.id,
      kind: 'claim',
      reviewKind: 'direct_evidence_review',
      viaPublicationId: publicationId,
      viaCitationUseId: citationUse.id,
      text: optionalText(claim, ['text', 'excerpt']),
    });
  }

  // §7.2: historical mentions of the same publication must NOT flag their claim.
  const historical: HistoricalItem[] = [];
  const historicalClaimIds = new Set<string>(); // dedupe: one entry per claim node
  for (const edge of edges) {
    if (!isEdgeOfType(edge, 'MENTIONS_HISTORICALLY')) continue;
    const citationUse = nodeById.get(edge.fromId);
    const claim = nodeById.get(edge.toId);
    if (!citationUse || citationUse.kind !== 'CitationUse') continue;
    if (!claim || claim.kind !== 'Claim') continue;
    if (affectedClaimIds.has(claim.id)) continue; // integrity guard
    const publicationId = referencesPublication.get(citationUse.id);
    if (!publicationId || !verifiedPublications.has(publicationId)) continue;
    // Dedupe by claim node id (keep first occurrence, deterministic edge order):
    // two historical citation uses may both hit the same claim, and the
    // results list keys on this id — a duplicate would collide its React key.
    if (historicalClaimIds.has(claim.id)) continue;
    historicalClaimIds.add(claim.id);
    historical.push({
      id: claim.id,
      text: optionalText(claim, ['text', 'excerpt']),
      viaCitationUseId: citationUse.id,
      viaPublicationId: publicationId,
    });
  }

  // §7.1 step 4: conclusions depending on a flagged claim inherit an
  // indirect review requirement — never automatic falsity.
  const affectedConclusionIds = new Set<string>(); // dedupe: one entry per conclusion node
  for (const edge of edges) {
    if (!isEdgeOfType(edge, 'CONCLUSION_DEPENDS_ON_CLAIM')) continue;
    const conclusion = nodeById.get(edge.fromId);
    const claim = nodeById.get(edge.toId);
    if (!conclusion || conclusion.kind !== 'Conclusion') continue;
    if (!claim || !affectedClaimIds.has(claim.id)) continue;
    // Dedupe by conclusion node id (keep first occurrence, deterministic edge
    // order): a conclusion depending on two flagged claims must surface once,
    // because the results list keys on this id.
    if (affectedConclusionIds.has(conclusion.id)) continue;
    affectedConclusionIds.add(conclusion.id);
    const publicationId =
      affected.find((item) => item.kind === 'claim' && item.id === claim.id)?.viaPublicationId ??
      '';
    affected.push({
      id: conclusion.id,
      kind: 'conclusion',
      reviewKind: 'indirect_evidence_review',
      viaPublicationId: publicationId,
      viaClaimId: claim.id,
      text: optionalText(conclusion, ['text']),
    });
  }

  // §7.3: unresolved reference occurrences with their candidate records.
  const unresolved: UnresolvedItem[] = [];
  for (const node of nodes) {
    if (node.kind !== 'ReferenceOccurrence') continue;
    const resolutionState = prop(node, 'resolutionState');
    const isUnresolvedState = resolutionState === 'unresolved' || resolutionState === 'deferred';
    const candidateIds: string[] = [];
    let hasConfirmedMatch = false;
    for (const edge of edges) {
      if (edge.fromId !== node.id) continue;
      if (isEdgeOfType(edge, 'POSSIBLE_MATCH')) {
        candidateIds.push(edge.toId);
      } else if (isEdgeOfType(edge, 'OCCURRENCE_MATCHES_PUBLICATION')) {
        // A confirmed match edge means this is resolved, not unresolved.
        hasConfirmedMatch = true;
      }
    }
    if (hasConfirmedMatch && !isUnresolvedState) continue;
    // Every kind of unresolved state here relies on possible matches only.
    if (isUnresolvedState || candidateIds.length > 0) {
      unresolved.push({
        id: node.id,
        text: optionalText(node, ['rawText', 'text']),
        resolutionState: typeof resolutionState === 'string' ? resolutionState : undefined,
        candidateIds,
        onlyPossibleMatches: hasConfirmedMatch === false,
      });
    }
  }

  // Synthetic-vs-real attribution stays explicit on every record family.
  let syntheticEntityCount = 0;
  let realEntityCount = 0;
  for (const node of nodes) {
    if (node.kind === 'SeedMeta') continue;
    if (node.isSynthetic === true) syntheticEntityCount += 1;
    else if (node.isSynthetic === false) realEntityCount += 1;
  }

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    seedVersion: overview.seedVersion,
    manuscriptTitle,
    verifiedNotices,
    affected,
    historical,
    unresolved,
    syntheticEntityCount,
    realEntityCount,
  };
}
