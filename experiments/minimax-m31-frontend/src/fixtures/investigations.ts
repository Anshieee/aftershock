import type {
  ActivityEvent,
  DocumentRecord,
  Finding,
  ReviewDecisionRecord,
  RevisionProposalRecord,
} from './types';

/**
 * PREPARED SAMPLE DATA.
 *
 * Every record below is written for the prototype so that the interface can
 * be exercised end to end. Nothing here is the output of analysing any real
 * document, and the UI says so wherever these records are shown.
 */

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

export const documents: DocumentRecord[] = [
  {
    id: 'doc-demo-manuscript',
    title:
      'Adaptive Marker Panels for Early Sepsis Detection in Rural Emergency Cohorts: A Multicentre Registry Study',
    fileName: 'sample-manuscript.pdf',
    authors: 'Aluko R, Halloran N, Sørensen P, Adeyemi J, Marchetti L',
    venue: 'Journal of Applied Clinical Registries',
    year: 2024,
    status: 'example_investigation',
    importedAt: '2026-03-11T09:02:00.000Z',
    lastActivityAt: '2026-03-11T11:48:00.000Z',
    findingCount: 7,
    reviewedCount: 1,
    isSample: true,
    prepared: true,
    pageCount: 5,
  },
  {
    id: 'doc-aspirin-migraine',
    title: 'Aspirin for Acute Migraine Prophylaxis After Emergency Department Discharge',
    fileName: 'aspirin-migraine-prophylaxis.pdf',
    authors: 'Kaur S, Bergström L, Oduya N',
    venue: 'Journal of Headache and Pain Reports',
    year: 2023,
    status: 'awaiting_review',
    importedAt: '2026-03-04T14:20:00.000Z',
    lastActivityAt: '2026-03-09T16:05:00.000Z',
    findingCount: 3,
    reviewedCount: 0,
    isSample: false,
    prepared: true,
  },
  {
    id: 'doc-urban-heat',
    title: 'Urban Heat and Emergency Admissions for Heat-Related Illness, 2016–2023',
    fileName: 'urban-heat-admissions.pdf',
    authors: 'Delgado M, Nakamura R, Fenn B',
    venue: 'Environmental Epidemiology',
    year: 2025,
    status: 'analysis_complete',
    importedAt: '2026-02-26T08:41:00.000Z',
    lastActivityAt: '2026-03-02T10:12:00.000Z',
    findingCount: 2,
    reviewedCount: 2,
    isSample: false,
    prepared: true,
  },
  {
    id: 'doc-steroid-pneumonia',
    title: 'Corticosteroid Timing in Community-Acquired Pneumonia: A Registry Analysis',
    fileName: 'steroid-timing-cap.pdf',
    authors: 'Weiss A, Chaudhry R, Bello T',
    venue: 'Respiratory Medicine',
    year: 2022,
    status: 'imported',
    importedAt: '2026-03-10T11:55:00.000Z',
    lastActivityAt: '2026-03-10T11:55:00.000Z',
    findingCount: 0,
    reviewedCount: 0,
    isSample: false,
    prepared: true,
  },
];

/* ------------------------------------------------------------------ *
 * Findings — the guided example
 * ------------------------------------------------------------------ */

export const findings: Finding[] = [
  {
    id: 'finding-direct-support',
    documentId: 'doc-demo-manuscript',
    kind: 'direct',
    title: 'A supporting source was later retracted',
    plainExplanation:
      'This passage relies on a published registry analysis that was retracted by its publisher in June 2020. The supporting evidence for this passage may need to be reviewed. This does not establish that the claim itself is false.',
    anchorId: 'anchor-direct-support',
    locationLabel: '§3 Results, column 1',
    citationUseId: 'cu-A-supporting',
    publicationId: 'pub-mehra-2020',
    noticeId: 'notice-mehra-retraction-2020-06-04',
    nodeIds: ['claim-A', 'cu-A-supporting', 'pub-mehra-2020', 'notice-mehra-retraction-2020-06-04', 'pub-mehra-retraction-2020'],
    edgeIds: ['e-cu-a-supports', 'e-cu-a-refs', 'e-pub-mehra-notice'],
    actionHint: 'Read the notice, then decide whether this passage needs revision or more evidence.',
    prepared: true,
  },
  {
    id: 'finding-indirect-dependency',
    documentId: 'doc-demo-manuscript',
    kind: 'indirect',
    title: 'A conclusion depends on the affected passage',
    plainExplanation:
      'This conclusion restates the result reported in the passage flagged above, so it inherits the same evidence concern and needs review in its own right. It is affected indirectly — it does not cite the retracted work itself.',
    anchorId: 'anchor-conclusion-dependency',
    locationLabel: '§5 Conclusions',
    viaClaimId: 'claim-A',
    publicationId: 'pub-mehra-2020',
    nodeIds: ['conclusion-C', 'claim-A', 'cu-A-supporting', 'pub-mehra-2020'],
    edgeIds: ['e-conclusion-claim-a', 'e-cu-a-supports'],
    actionHint: 'Review together with the passage it depends on.',
    prepared: true,
  },
  {
    id: 'finding-historical-mention',
    documentId: 'doc-demo-manuscript',
    kind: 'historical',
    title: 'The same source is discussed, not relied upon',
    plainExplanation:
      'This passage discusses the withdrawal of the same publication as an example of why source verification matters. It is not offered as evidence for anything, so it is not compromised support.',
    anchorId: 'anchor-historical-mention',
    locationLabel: '§4 Discussion',
    citationUseId: 'cu-B-historical',
    publicationId: 'pub-mehra-2020',
    nodeIds: ['claim-B', 'cu-B-historical', 'pub-mehra-2020', 'notice-mehra-retraction-2020-06-04'],
    edgeIds: ['e-cu-b-historical', 'e-cu-b-refs'],
    actionHint: 'No action needed — a historical mention is not a vulnerable citation.',
    prepared: true,
  },
  {
    id: 'finding-unresolved-reference',
    documentId: 'doc-demo-manuscript',
    kind: 'unresolved',
    title: 'A reference could not be resolved to one publication',
    plainExplanation:
      'The citation “Lee et al. (2020)” matches more than one candidate publication. Until a person confirms which one is meant, this passage needs a decision, and the relationship between it and that work stays unresolved — it is not propagated to any conclusion.',
    anchorId: 'anchor-unresolved-reference',
    locationLabel: '§2.2 Cohort definition',
    citationUseId: 'cu-H-unresolved',
    nodeIds: ['claim-H', 'cu-H-unresolved', 'ref-lee-2020', 'pub-lee-2020-candidate-a', 'pub-lee-2020-candidate-b'],
    edgeIds: ['e-cu-h-unknown', 'e-ref-lee-cand-a', 'e-ref-lee-cand-b'],
    actionHint: 'Confirm the correct publication, or defer the reference and move on.',
    prepared: true,
  },
  {
    id: 'finding-no-notice',
    documentId: 'doc-demo-manuscript',
    kind: 'no_notice',
    title: 'No status notice recorded for this source',
    plainExplanation:
      'This passage relies on a national analysis for which no retraction, correction or expression of concern has been recorded. That is not a guarantee of reliability — it only means nothing adverse is known to the prepared dataset.',
    anchorId: 'anchor-shared-cohort',
    locationLabel: '§3 Results, column 2',
    citationUseId: 'cu-D-supporting',
    publicationId: 'pub-aldridge-2021',
    nodeIds: ['claim-D', 'cu-D-supporting', 'pub-aldridge-2021'],
    edgeIds: ['e-cu-d-supports', 'e-cu-d-refs'],
    actionHint: 'Optional: read the source and record whether the support holds.',
    prepared: true,
  },
  {
    id: 'finding-method-reuse',
    documentId: 'doc-demo-manuscript',
    kind: 'method_reuse',
    title: 'A method was reused, not a finding',
    plainExplanation:
      'This passage reuses an outcome-capture window and a covariate set defined elsewhere. Nothing here depends on that work’s results, so a change in its results would not change this sentence.',
    anchorId: 'anchor-method-reuse',
    locationLabel: '§2.3 Outcome capture',
    citationUseId: 'cu-F-method',
    publicationId: 'pub-okonjo-2019',
    nodeIds: ['claim-F', 'cu-F-method', 'pub-okonjo-2019', 'study-E', 'dataset-X'],
    edgeIds: ['e-cu-f-method', 'e-cu-f-refs'],
    actionHint: 'No action needed for support purposes — note the method lineage instead.',
    prepared: true,
  },
  {
    id: 'finding-shared-dataset',
    documentId: 'doc-demo-manuscript',
    kind: 'shared_dataset',
    title: 'Two supporting sources share the same cohort',
    plainExplanation:
      'Two of the analyses cited in this manuscript draw on the same underlying cohort. They are therefore not independent confirmation of one another, and this is visible in the evidence graph rather than in the text.',
    anchorId: null,
    locationLabel: 'Graph-level observation',
    publicationId: 'pub-aldridge-2021',
    nodeIds: ['study-E', 'dataset-X', 'pub-aldridge-2021', 'pub-okonjo-2019', 'review-F', 'review-G'],
    edgeIds: ['e-aldridge-study', 'e-okonjo-study', 'e-study-e-dataset-x', 'e-study-f-dataset-x'],
    actionHint: 'Read the two sources before treating them as independent agreement.',
    prepared: true,
  },

  /* ---- Other prepared investigations -------------------------------- */
  {
    id: 'finding-aspirin-direct',
    documentId: 'doc-aspirin-migraine',
    kind: 'direct',
    title: 'A supporting source carries an expression of concern',
    plainExplanation:
      'This passage relies on a trial report for which the journal has published an expression of concern. The supporting evidence may need review. This does not establish that the claim itself is false.',
    anchorId: null,
    locationLabel: '§2 Results',
    publicationId: 'pub-arrieta-2021',
    noticeId: 'notice-arrieta-eoc-2022',
    nodeIds: ['pub-arrieta-2021', 'notice-arrieta-eoc-2022'],
    edgeIds: ['e-pub-arrieta-notice'],
    actionHint: 'Read the expression of concern and decide what follows from it.',
    prepared: true,
  },
  {
    id: 'finding-aspirin-no-notice',
    documentId: 'doc-aspirin-migraine',
    kind: 'no_notice',
    title: 'No status notice recorded for this source',
    plainExplanation:
      'No retraction, correction or expression of concern has been recorded for this source in the prepared dataset. That is an absence of information, not a clean bill of health.',
    anchorId: null,
    locationLabel: '§2 Results',
    publicationId: 'pub-tanaka-2018',
    nodeIds: ['pub-tanaka-2018'],
    edgeIds: [],
    actionHint: 'Optional: verify the source directly.',
    prepared: true,
  },
  {
    id: 'finding-aspirin-unresolved',
    documentId: 'doc-aspirin-migraine',
    kind: 'unresolved',
    title: 'A reference is still awaiting resolution',
    plainExplanation:
      'One reference in this manuscript has two possible matches and has not been confirmed by a person. It needs a decision, stays unresolved, and is not counted anywhere else.',
    anchorId: null,
    locationLabel: '§2.1 Inclusion criteria',
    nodeIds: [],
    edgeIds: [],
    actionHint: 'Confirm the intended publication, or defer it.',
    prepared: true,
  },
  {
    id: 'finding-heat-no-notice',
    documentId: 'doc-urban-heat',
    kind: 'no_notice',
    title: 'No status notice recorded for this source',
    plainExplanation:
      'No adverse status notice has been recorded for this source. Absence of a notice is not evidence that the source is sound.',
    anchorId: null,
    locationLabel: '§3 Results',
    publicationId: 'pub-nkemelu-2022',
    nodeIds: ['pub-nkemelu-2022'],
    edgeIds: [],
    actionHint: 'Optional: verify the source directly.',
    prepared: true,
  },
  {
    id: 'finding-heat-shared',
    documentId: 'doc-urban-heat',
    kind: 'shared_dataset',
    title: 'Two sources share the same climate dataset',
    plainExplanation:
      'Two cited analyses use the same gridded climate dataset. Their agreement is not independent replication.',
    anchorId: null,
    locationLabel: 'Graph-level observation',
    nodeIds: ['pub-nkemelu-2022', 'pub-sorensen-2020'],
    edgeIds: [],
    actionHint: 'Treat the two results as one line of evidence.',
    prepared: true,
  },
];

/* ------------------------------------------------------------------ *
 * Review decisions
 * ------------------------------------------------------------------ */

export const reviewDecisions: ReviewDecisionRecord[] = [
  {
    id: 'review-historical-seeded',
    findingId: 'finding-historical-mention',
    outcome: 'not_affected',
    note: 'Checked the passage: the source is described as withdrawn, not relied upon. No change needed here.',
    reviewer: 'Sample reviewer',
    decidedAt: '2026-03-11T10:22:00.000Z',
    seeded: true,
  },
];

/* ------------------------------------------------------------------ *
 * Revision proposals
 * ------------------------------------------------------------------ */

export const revisionProposals: RevisionProposalRecord[] = [
  {
    id: 'proposal-direct-support',
    findingId: 'finding-direct-support',
    originalText:
      'Registry cohorts in comparable settings have reported a marked reduction in time-to-antibiotics when marker panels are used to gate escalation (Mehra et al., 2020). Our own estimates are consistent with that reported direction of effect, and the mechanism assumed in both analyses — that an earlier provisional marker result releases a decision before confirmatory testing completes — is the same.',
    proposedText:
      'Registry cohorts in comparable settings have reported reductions in time-to-antibiotics when marker panels are used to gate escalation, although the registry analysis most often cited for this effect was retracted by its publisher in June 2020 and cannot be used as support. Our own estimates are consistent with the direction of effect reported elsewhere, and the mechanism assumed in those analyses — that an earlier provisional marker result releases a decision before confirmatory testing completes — is the same.',
    rationale:
      'The cited analysis was retracted after concerns were raised about its source data. The sentence keeps the finding it relies on, attributes it to the wider literature rather than to the retracted analysis, and records the retraction explicitly. The underlying result of this study is unchanged; only the attribution is.',
    status: 'draft',
    createdAt: '2026-03-11T10:40:00.000Z',
  },
  {
    id: 'proposal-indirect-dependency',
    findingId: 'finding-indirect-dependency',
    originalText:
      'Taken together, these data support routine marker-panel gating in rural emergency departments, reducing time-to-therapeutic intervention by 31%.',
    proposedText:
      'Taken together, these data are consistent with routine marker-panel gating reducing time-to-therapeutic intervention by 31% in this cohort, though the wider evidence base for that association includes at least one analysis that has since been retracted and therefore warrants independent confirmation.',
    rationale:
      'The conclusion inherits the evidence concern of the passage it restates. The revision softens the generalisation from this cohort to routine practice and states the uncertainty rather than removing it.',
    status: 'draft',
    createdAt: '2026-03-11T10:44:00.000Z',
  },
];

/* ------------------------------------------------------------------ *
 * Activity
 * ------------------------------------------------------------------ */

export const activity: ActivityEvent[] = [
  {
    id: 'act-notice-announced',
    kind: 'publication_notice',
    label: 'Retraction notice published',
    detail:
      'The Lancet published a retraction notice for the hydroxychloroquine registry analysis (DOI 10.1016/S0140-6736(20)31324-6).',
    dateKind: 'announcement',
    timestamp: '2020-06-04T00:00:00.000Z',
    synthetic: false,
  },
  {
    id: 'act-notice-recorded',
    kind: 'indexing_record',
    label: 'Notice recorded by the indexing systems',
    detail:
      'PubMed, PubMed Central and Crossref recorded the retraction notice on the following day. The announcement date and the record date are kept separate.',
    dateKind: 'record',
    timestamp: '2020-06-05T00:00:00.000Z',
    synthetic: false,
  },
  {
    id: 'act-import',
    kind: 'analysis',
    label: 'Sample manuscript imported',
    detail:
      'The generated sample manuscript was imported as Draft A. No real manuscript was uploaded and no network service was called.',
    dateKind: 'system',
    timestamp: '2026-03-11T09:02:00.000Z',
    synthetic: true,
  },
  {
    id: 'act-analysis-prepared',
    kind: 'analysis',
    label: 'Example findings prepared',
    detail:
      'Prepared example findings for the sample manuscript were revealed progressively in the reader. These are not the output of a scientific analysis.',
    dateKind: 'system',
    timestamp: '2026-03-11T09:14:00.000Z',
    synthetic: true,
  },
  {
    id: 'act-review-historical',
    kind: 'review',
    label: 'Review recorded — historical mention',
    detail:
      'A seeded example review marked the historical mention as not affected. Human review is a workflow state, not a scientific verdict.',
    dateKind: 'human',
    timestamp: '2026-03-11T10:22:00.000Z',
    synthetic: true,
    findingId: 'finding-historical-mention',
  },
  {
    id: 'act-proposal-drafted',
    kind: 'analysis',
    label: 'Revision proposal drafted',
    detail:
      'A suggested revision was drafted for the affected passage and for the conclusion that depends on it. The original manuscript is unchanged.',
    dateKind: 'system',
    timestamp: '2026-03-11T10:40:00.000Z',
    synthetic: true,
    findingId: 'finding-direct-support',
  },
  {
    id: 'act-report-preview',
    kind: 'report',
    label: 'Report preview generated',
    detail:
      'An example evidence-impact report was configured and previewed. Exports are produced in the browser from the prepared records.',
    dateKind: 'system',
    timestamp: '2026-03-11T11:48:00.000Z',
    synthetic: true,
  },
];
