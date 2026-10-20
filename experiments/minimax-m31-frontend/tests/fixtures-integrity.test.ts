import { describe, expect, it } from 'vitest';
import {
  EDGE_LABEL,
  edgeById,
  edgeFamily,
  findings,
  graphEdges,
  graphNodes,
  nodeById,
  anchorSpecs,
  manuscript,
} from '../src/fixtures';

/**
 * The prototype fixture must keep the production acceptance invariants
 * (docs/DATA_CONTRACTS.md §7). These are the rules that keep a research
 * integrity tool honest, so they are asserted rather than assumed.
 */

describe('prepared graph — record integrity', () => {
  it('gives every node a stable id, a kind and a label', () => {
    for (const node of graphNodes) {
      expect(node.id).toBeTruthy();
      expect(node.kind).toBeTruthy();
      expect(node.label).toBeTruthy();
    }
  });

  it('never reuses a node id', () => {
    const ids = graphNodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries provenance on every material edge', () => {
    for (const edge of graphEdges) {
      expect(edge.provenanceKind).toBeTruthy();
      expect(edge.rationale.length).toBeGreaterThan(10);
      expect(edge.sourcePointer.length).toBeGreaterThan(0);
      expect(edge.analysisVersion).toBeTruthy();
      expect(edge.createdAt).toBeTruthy();
      expect(edge.reviewState).toBeTruthy();
    }
  });

  it('only links records that exist', () => {
    for (const edge of graphEdges) {
      expect(nodeById.has(edge.fromId)).toBe(true);
      expect(nodeById.has(edge.toId)).toBe(true);
    }
  });

  it('keeps relation types distinct — supports is not mentions', () => {
    const support = graphEdges.find((edge) => edge.type === 'CITATION_USE_SUPPORTS_CLAIM');
    const historical = graphEdges.find((edge) => edge.type === 'MENTIONS_HISTORICALLY');
    const method = graphEdges.find((edge) => edge.type === 'USES_METHOD_FROM');
    const uncertain = graphEdges.find((edge) => edge.type === 'POSSIBLE_MATCH');
    expect(support).toBeDefined();
    expect(historical).toBeDefined();
    expect(method).toBeDefined();
    expect(uncertain).toBeDefined();
    // The same publication is involved in three of them — the relation
    // type is what carries the meaning, so they must never be merged.
    expect(edgeFamily(support!.type)).not.toBe(edgeFamily(historical!.type));
    expect(edgeFamily(method!.type)).not.toBe(edgeFamily(support!.type));
    expect(edgeFamily(uncertain!.type)).not.toBe(edgeFamily(historical!.type));
    expect(EDGE_LABEL[support!.type]).not.toBe(EDGE_LABEL[historical!.type]);
  });
});

describe('prepared graph — acceptance invariants', () => {
  it('invariant 1: a verified notice produces a direct-support finding', () => {
    const notice = nodeById.get('notice-mehra-retraction-2020-06-04');
    expect(notice?.properties['verified']).toBe(true);
    const direct = findings.find(
      (finding) => finding.kind === 'direct' && finding.documentId === 'doc-demo-manuscript',
    );
    expect(direct).toBeDefined();
    expect(direct!.publicationId).toBe('pub-mehra-2020');
    expect(direct!.noticeId).toBe('notice-mehra-retraction-2020-06-04');
  });

  it('invariant 2: a historical mention is never flagged as compromised support', () => {
    const historical = findings.find((finding) => finding.kind === 'historical');
    expect(historical).toBeDefined();
    expect(historical!.publicationId).toBe('pub-mehra-2020');
    // The same publication, but the finding is explicitly *not* a support
    // concern, and it carries the historical relation only.
    const relations = historical!.edgeIds.map((id) => edgeById.get(id)!.type);
    expect(relations).toContain('MENTIONS_HISTORICALLY');
    expect(relations).not.toContain('CITATION_USE_SUPPORTS_CLAIM');
  });

  it('invariant 3: an unresolved reference keeps candidate edges unverified', () => {
    const unresolved = findings.find((finding) => finding.kind === 'unresolved');
    expect(unresolved).toBeDefined();
    const candidateEdges = unresolved!.edgeIds
      .map((id) => edgeById.get(id)!)
      .filter((edge) => edge.type === 'POSSIBLE_MATCH');
    expect(candidateEdges.length).toBeGreaterThan(0);
    for (const edge of candidateEdges) {
      expect(edge.provenanceKind).toBe('unresolved');
    }
    // The unresolved reference must not propagate to a conclusion.
    const propagated = graphEdges.filter(
      (edge) =>
        edge.type === 'CONCLUSION_DEPENDS_ON_CLAIM' &&
        unresolved!.nodeIds.includes(edge.fromId),
    );
    expect(propagated).toHaveLength(0);
  });

  it('invariant 4: shared data is visible as a relationship, not as agreement', () => {
    const shared = findings.find((finding) => finding.kind === 'shared_dataset');
    expect(shared).toBeDefined();
    const edges = shared!.edgeIds.map((id) => edgeById.get(id)!.type);
    expect(edges).toContain('STUDY_USES_DATASET');
  });

  it('invariant 5: the absence of a notice is not treated as a positive signal', () => {
    const noNotice = findings.find((finding) => finding.kind === 'no_notice');
    expect(noNotice).toBeDefined();
    expect(noNotice!.noticeId).toBeUndefined();
    expect(noNotice!.plainExplanation.toLowerCase()).toContain('not a guarantee');
  });
});

describe('prepared findings', () => {
  it('only references records that exist', () => {
    for (const finding of findings) {
      for (const id of finding.nodeIds) expect(nodeById.has(id)).toBe(true);
      for (const id of finding.edgeIds) expect(edgeById.has(id)).toBe(true);
      if (finding.publicationId) expect(nodeById.has(finding.publicationId)).toBe(true);
      if (finding.noticeId) expect(nodeById.has(finding.noticeId)).toBe(true);
    }
  });

  it('never asserts that a claim is false, proven or invalid', () => {
    const forbidden = ['disproven', 'disproved', 'refuted', 'proven false', 'proven true'];
    for (const finding of findings) {
      const text = finding.plainExplanation.toLowerCase();
      for (const word of forbidden) {
        expect(text).not.toContain(word);
      }
      // When falsity is mentioned at all, it is mentioned as a negation.
      let index = text.indexOf('false');
      while (index !== -1) {
        const before = text.slice(Math.max(0, index - 40), index);
        expect(before).toMatch(/not |never /);
        index = text.indexOf('false', index + 1);
      }
      // A flag must always be framed as needing review. Findings that are
      // explicitly *not* concerns (a historical mention, a reused method)
      // say so instead, and are checked separately.
      if (finding.kind === 'direct' || finding.kind === 'indirect' || finding.kind === 'unresolved') {
        expect(text.includes('review') || text.includes('need')).toBe(true);
      }
    }
  });

  it('marks every finding as prepared sample data', () => {
    for (const finding of findings) expect(finding.prepared).toBe(true);
  });
});

describe('manuscript content and anchors', () => {
  it('gives every anchor a phrase that exists in the manuscript', () => {
    const text = JSON.stringify(manuscript);
    for (const anchor of anchorSpecs) {
      const compact = anchor.phrase.replace(/\s+/g, ' ');
      const haystack = text.replace(/\\n|\\"/g, ' ').replace(/\s+/g, ' ');
      expect(haystack).toContain(compact);
    }
  });

  it('anchors the six passages the demonstration depends on', () => {
    const ids = anchorSpecs.map((anchor) => anchor.id).sort();
    expect(ids).toEqual(
      [
        'anchor-conclusion-dependency',
        'anchor-direct-support',
        'anchor-historical-mention',
        'anchor-method-reuse',
        'anchor-shared-cohort',
        'anchor-unresolved-reference',
      ].sort(),
    );
  });

  it('leaves the graph-level finding without an inline highlight', () => {
    const shared = findings.find((finding) => finding.kind === 'shared_dataset');
    expect(shared!.anchorId).toBeNull();
  });
});
