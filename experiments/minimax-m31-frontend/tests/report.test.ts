import { describe, expect, it } from 'vitest';
import { diffWords, summarise } from '../src/lib/diff';
import { buildReport, REPORT_SECTIONS } from '../src/lib/report';
import { buildReportHtml } from '../src/lib/exporters';
import { findings, reviewDecisions, revisionProposals } from '../src/fixtures';

describe('word diff', () => {
  it('reconstructs both sides from the tokens', () => {
    const original = 'The cited analysis was retracted in June 2020.';
    const revised = 'The analysis most often cited was retracted in June 2020.';
    const tokens = diffWords(original, revised);
    // Walk the tokens in order, keeping only the kinds that belong to one side.
    const originalSide = tokens
      .filter((token) => token.type !== 'insert')
      .map((token) => token.text)
      .join('');
    const revisedSide = tokens
      .filter((token) => token.type !== 'delete')
      .map((token) => token.text)
      .join('');
    expect(originalSide).toBe(original);
    expect(revisedSide).toBe(revised);
  });

  it('reports how much changed', () => {
    const summary = summarise(diffWords('one two three', 'one two three four'));
    expect(summary.inserted).toBe(1);
    expect(summary.deleted).toBe(0);
  });

  it('keeps the whitespace that separated a replaced phrase', () => {
    const tokens = diffWords('a marked reduction in time', 'reductions in time');
    const rendered = tokens.map((token) => token.text).join('');
    expect(rendered).toContain('reduction');
    expect(rendered).toContain('reductions');
  });
});

describe('report model', () => {
  const model = buildReport(
    'doc-demo-manuscript',
    Object.fromEntries(reviewDecisions.map((decision) => [decision.findingId, decision])),
    Object.fromEntries(revisionProposals.map((proposal) => [proposal.findingId, proposal])),
    findings,
  );

  it('counts the findings of the requested document only', () => {
    expect(model.summary.total).toBe(
      findings.filter((finding) => finding.documentId === 'doc-demo-manuscript').length,
    );
  });

  it('separates the announcement date from the indexing record date', () => {
    const notice = model.notices.find((item) => item.noticeType === 'retraction');
    expect(notice).toBeDefined();
    expect(notice!.publishedDate).toBe('2020-06-04');
    expect(notice!.recordedDate).toBe('2020-06-05');
    expect(notice!.publishedDate).not.toBe(notice!.recordedDate);
  });

  it('labels every timestamp with its kind', () => {
    for (const stamp of model.timestamps) {
      expect(['announcement', 'record', 'system', 'human']).toContain(stamp.kind);
    }
  });

  it('states the limitations the product owes the reader', () => {
    expect(model.limitations.length).toBeGreaterThan(4);
    expect(model.limitations.join(' ').toLowerCase()).toContain('never means the claim is false');
  });

  it('keeps the recorded review decision', () => {
    expect(model.reviews).toHaveLength(1);
    expect(model.reviews[0]!.decision.outcome).toBe('not_affected');
  });

  it('marks the revision proposals as suggestions', () => {
    expect(model.revisions).toHaveLength(2);
    for (const revision of model.revisions) {
      expect(revision.proposal.status).toBe('draft');
    }
  });
});

describe('report export', () => {
  const model = buildReport(
    'doc-demo-manuscript',
    Object.fromEntries(reviewDecisions.map((decision) => [decision.findingId, decision])),
    Object.fromEntries(revisionProposals.map((proposal) => [proposal.findingId, proposal])),
    findings,
  );

  it('produces a self-contained HTML document', () => {
    const html = buildReportHtml(model, {
      identity: true,
      summary: true,
      concerns: true,
      relationships: true,
      unresolved: true,
      review: true,
      notices: true,
      revisions: true,
      provenance: true,
      limitations: true,
      timestamps: true,
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Adaptive Marker Panels');
    expect(html).toContain('Example investigation');
  });

  it('omits the sections that were switched off', () => {
    const enabled = Object.fromEntries(REPORT_SECTIONS.map((section) => [section.id, false]));
    enabled.identity = true;
    const html = buildReportHtml(model, enabled);
    expect(html).toContain('Document identity');
    expect(html).not.toContain('Provenance');
  });
});
