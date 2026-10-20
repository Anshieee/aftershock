import type { GraphEdgeRecord, GraphNodeRecord } from './types';

/**
 * PREPARED SAMPLE GRAPH — the complete evidence network for the guided
 * example. Every node and edge is rendered from the start; the prototype
 * never expands the graph on click.
 *
 * Two real publication records are included (the Mehra et al. 2020 Lancet
 * registry analysis and its retraction notice) because their relationship is
 * the canonical demonstration of "a supporting source that later carried a
 * retraction notice". Everything else is invented and marked `isSynthetic`.
 */

const ANALYSIS_VERSION = 'm31-prototype-1.0.0';
const SEEDED_AT = '2026-03-11T09:14:00.000Z';

const node = (
  id: string,
  kind: GraphNodeRecord['kind'],
  label: string,
  isSynthetic: boolean,
  properties: GraphNodeRecord['properties'] = {},
): GraphNodeRecord => ({ id, kind, label, isSynthetic, properties });

export const graphNodes: GraphNodeRecord[] = [
  /* ---- The document under investigation --------------------------- */
  node('doc-demo-manuscript', 'ResearchDocument', 'Adaptive Marker Panels…', true, {
    title: 'Adaptive Marker Panels for Early Sepsis Detection in Rural Emergency Cohorts',
    fileName: 'sample-manuscript.pdf',
    format: 'pdf',
    importedAt: '2026-03-11T09:02:00.000Z',
    versionId: 'ver-demo-manuscript-v1',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('ver-demo-manuscript-v1', 'DocumentVersion', 'Draft A', true, {
    label: 'Draft A',
    sourceHash: 'sha256:prototype-sample-0001',
    pageCount: 5,
    createdAt: '2026-03-11T09:02:00.000Z',
  }),

  /* ---- Claims and the dependent conclusion ------------------------ */
  node('claim-A', 'Claim', 'Claim A · registry cohorts', true, {
    text:
      'Registry cohorts in comparable settings have reported a marked reduction in time-to-antibiotics when marker panels are used to gate escalation (Mehra et al., 2020).',
    location: { section: '3. Results', page: 3, offset: 0 },
    status: 'recorded',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('claim-B', 'Claim', 'Claim B · withdrawal discussed', true, {
    text:
      'The report by Mehra et al. (2020) was later withdrawn by the publisher after concerns were raised about its source data.',
    location: { section: '4. Discussion', page: 5, offset: 0 },
    status: 'recorded',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('claim-D', 'Claim', 'Claim D · national analysis', true, {
    text:
      'A national analysis by Aldridge et al. (2021) reported a similar association between marker-panel gating and time-to-therapeutic intervention in a shared registry cohort.',
    location: { section: '3. Results', page: 3, offset: 0 },
    status: 'recorded',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('claim-F', 'Claim', 'Claim F · method reuse', true, {
    text:
      'We reused the outcome-capture interval and the risk-adjustment covariates defined by Okonjo et al. (2019).',
    location: { section: '2.3 Outcome capture', page: 2, offset: 0 },
    status: 'recorded',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('claim-H', 'Claim', 'Claim H · eligibility rules', true, {
    text:
      'Sampling was restricted to adult admissions coded with a suspected-infection diagnosis at triage, following the eligibility rules published by Lee et al. (2020).',
    location: { section: '2.2 Cohort definition', page: 2, offset: 0 },
    status: 'recorded',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('claim-I', 'Claim', 'Claim I · background framing', true, {
    text:
      'Prior work on triage gating in general populations suggests a reduction in time-to-antibiotics of roughly one third.',
    location: { section: '1. Introduction', page: 1, offset: 0 },
    status: 'recorded',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('conclusion-C', 'Conclusion', 'Conclusion C · 31% reduction', true, {
    text:
      'Taken together, these data support routine marker-panel gating in rural emergency departments, reducing time-to-therapeutic intervention by 31%.',
    location: { section: '5. Conclusions', page: 5, offset: 0 },
    label: 'FICTIONAL / GUIDED DEMO',
  }),

  /* ---- Citation uses ---------------------------------------------- */
  node('cu-A-supporting', 'CitationUse', 'Mehra 2020 · supporting', true, {
    excerpt: '(Mehra et al., 2020)',
    role: 'supporting',
    location: { section: '3. Results', page: 3, offset: 0 },
    provenanceKind: 'observed',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('cu-B-historical', 'CitationUse', 'Mehra 2020 · historical', true, {
    excerpt: 'the report by Mehra et al. (2020) was later withdrawn by the publisher',
    role: 'historical',
    location: { section: '4. Discussion', page: 5, offset: 0 },
    provenanceKind: 'observed',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('cu-D-supporting', 'CitationUse', 'Aldridge 2021 · supporting', true, {
    excerpt: 'A national analysis by Aldridge et al. (2021)',
    role: 'supporting',
    location: { section: '3. Results', page: 3, offset: 0 },
    provenanceKind: 'observed',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('cu-F-method', 'CitationUse', 'Okonjo 2019 · method reuse', true, {
    excerpt: 'the risk-adjustment covariates defined by Okonjo et al. (2019)',
    role: 'method_reuse',
    location: { section: '2.3 Outcome capture', page: 2, offset: 0 },
    provenanceKind: 'observed',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('cu-H-unresolved', 'CitationUse', 'Lee 2020 · unresolved', true, {
    excerpt: 'following the eligibility rules published by Lee et al. (2020)',
    role: 'role_unknown',
    location: { section: '2.2 Cohort definition', page: 2, offset: 0 },
    provenanceKind: 'unresolved',
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('cu-I-background', 'CitationUse', 'Gunning 2019 · background', true, {
    excerpt: 'Sepsis mortality in rural settings is driven less by an absence of clinical knowledge',
    role: 'supporting',
    location: { section: '1. Introduction', page: 1, offset: 0 },
    provenanceKind: 'observed',
    label: 'FICTIONAL / GUIDED DEMO',
  }),

  /* ---- Reference occurrences -------------------------------------- */
  node('ref-mehra-2020', 'ReferenceOccurrence', 'Mehra et al., 2020', true, {
    rawText:
      'Mehra MR, Desai SS, Ruschitzka F, Patel AN. Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis. Lancet. 2020;396(10245):2409-2410.',
    resolutionState: 'resolved',
    location: { section: 'References', page: 5, offset: 0 },
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('ref-lee-2020', 'ReferenceOccurrence', 'Lee et al., 2020', true, {
    rawText:
      'Lee H, Ferraro S, Novak D, et al. Eligibility criteria for suspected-infection registry cohorts. J Clin Epidemiol. 2020;124:88-97.',
    resolutionState: 'unresolved',
    location: { section: 'References', page: 5, offset: 0 },
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('ref-okonjo-2019', 'ReferenceOccurrence', 'Okonjo et al., 2019', true, {
    rawText:
      'Okonjo T, Banerjee R, Whitfield M, et al. Outcome capture windows in rural registry datasets: a multicentre evaluation. BMJ Open. 2019;9:e028441.',
    resolutionState: 'resolved',
    location: { section: 'References', page: 5, offset: 0 },
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('ref-aldridge-2021', 'ReferenceOccurrence', 'Aldridge et al., 2021', true, {
    rawText:
      'Aldridge J, Nwosu C, Pemberton H, et al. Marker-panel gating and time-to-therapeutic intervention: a national registry cohort analysis. Lancet Digit Health. 2021;3(9):e612-e621.',
    resolutionState: 'resolved',
    location: { section: 'References', page: 5, offset: 0 },
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('ref-gunning-2019', 'ReferenceOccurrence', 'Gunning et al., 2019', true, {
    rawText:
      'Gunning CM, Harmon JP, Jaeschke M. Epidemiology of sepsis in rural settings. Lancet Reg Health Eur. 2019;14:100-108.',
    resolutionState: 'resolved',
    location: { section: 'References', page: 5, offset: 0 },
    label: 'FICTIONAL / GUIDED DEMO',
  }),
  node('ref-scymour-2016', 'ReferenceOccurrence', 'Seymour et al., 2016', true, {
    rawText:
      'Seymour CW, Liu VX, Iwashyna TJ, et al. Derivation, validation, and potential treatment implications of novel clinical phenotypes for sepsis. JAMA. 2016;315(20):2209-2219.',
    resolutionState: 'resolved',
    location: { section: 'References', page: 5, offset: 0 },
    label: 'FICTIONAL / GUIDED DEMO',
  }),

  /* ---- Real publication records ----------------------------------- */
  node('pub-mehra-2020', 'Publication', 'Mehra et al. 2020', false, {
    doi: '10.1016/S0140-6736(20)31180-6',
    title:
      'Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis',
    authors: 'Mehra MR, Desai SS, Ruschitzka F, Patel AN',
    journal: 'The Lancet',
    year: 2020,
    pmid: '32450107',
    url: 'https://doi.org/10.1016/S0140-6736(20)31180-6',
    publishedOnline: '2020-05-22',
  }),
  node('pub-mehra-retraction-2020', 'Publication', 'Retraction notice · Mehra 2020', false, {
    doi: '10.1016/S0140-6736(20)31324-6',
    title:
      'Retraction—Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis',
    authors: 'The Editors',
    journal: 'The Lancet',
    year: 2020,
    pmid: '32511943',
    volume: '395(10240)',
    pages: '1820',
    url: 'https://doi.org/10.1016/S0140-6736(20)31324-6',
    mirror: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7274621/',
  }),
  node('notice-mehra-retraction-2020-06-04', 'SourceNotice', 'Retraction · 4 Jun 2020', false, {
    noticeType: 'retraction',
    publishedDate: '2020-06-04',
    noticeAnnouncementDate: '2020-06-04',
    noticeRecordedDate: '2020-06-05',
    detectedAt: '2026-03-11T09:07:00.000Z',
    lastVerifiedAt: '2026-03-11T09:07:00.000Z',
    sourceUrl: 'https://doi.org/10.1016/S0140-6736(20)31324-6',
    verified: true,
  }),

  /* ---- Synthetic publication records ------------------------------ */
  node('pub-gunning-2019', 'Publication', 'Gunning et al. 2019', true, {
    doi: '10.0000/prototype.gunning.2019',
    title: 'Epidemiology of sepsis in rural settings',
    authors: 'Gunning CM, Harmon JP, Jaeschke M',
    journal: 'Lancet Regional Health — Europe',
    year: 2019,
    url: 'https://example.invalid/prototype/gunning-2019',
  }),
  node('pub-scymour-2016', 'Publication', 'Seymour et al. 2016', true, {
    doi: '10.0000/prototype.seymour.2016',
    title: 'Derivation, validation, and potential treatment implications of novel clinical phenotypes for sepsis',
    authors: 'Seymour CW, Liu VX, Iwashyna TJ, et al.',
    journal: 'JAMA',
    year: 2016,
    url: 'https://example.invalid/prototype/seymour-2016',
  }),
  node('pub-okonjo-2019', 'Publication', 'Okonjo et al. 2019', true, {
    doi: '10.0000/prototype.okonjo.2019',
    title: 'Outcome capture windows in rural registry datasets: a multicentre evaluation',
    authors: 'Okonjo T, Banerjee R, Whitfield M, et al.',
    journal: 'BMJ Open',
    year: 2019,
    url: 'https://example.invalid/prototype/okonjo-2019',
  }),
  node('pub-aldridge-2021', 'Publication', 'Aldridge et al. 2021', true, {
    doi: '10.0000/prototype.aldridge.2021',
    title:
      'Marker-panel gating and time-to-therapeutic intervention: a national registry cohort analysis',
    authors: 'Aldridge J, Nwosu C, Pemberton H, et al.',
    journal: 'The Lancet Digital Health',
    year: 2021,
    url: 'https://example.invalid/prototype/aldridge-2021',
  }),
  node('pub-varga-2020', 'Publication', 'Varga et al. 2020', true, {
    doi: '10.0000/prototype.varga.2020',
    title: 'Triage gating implementation in district emergency departments',
    authors: 'Varga L, Ncube T, Petrakis K',
    journal: 'Emergency Medicine Journal',
    year: 2020,
    url: 'https://example.invalid/prototype/varga-2020',
  }),
  node('pub-hartley-2017', 'Publication', 'Hartley et al. 2017', true, {
    doi: '10.0000/prototype.hartley.2017',
    title: 'Provisional marker panels and escalation thresholds in rural cohorts',
    authors: 'Hartley R, Okonwo B, Lindqvist A',
    journal: 'Journal of Rural Medicine',
    year: 2017,
    url: 'https://example.invalid/prototype/hartley-2017',
  }),
  node('pub-ibarra-2023', 'Publication', 'Ibarra et al. 2023', true, {
    doi: '10.0000/prototype.ibarra.2023',
    title: 'Time-to-antibiotics in eleven rural emergency departments',
    authors: 'Ibarra M, Castellanos R, Whitlock J',
    journal: 'Annals of Emergency Medicine',
    year: 2023,
    url: 'https://example.invalid/prototype/ibarra-2023',
  }),
  node('pub-lee-2020-candidate-a', 'Publication', 'Candidate A · Lee 2020', true, {
    doi: '10.0000/prototype.lee.2020.a',
    title: 'Eligibility criteria for suspected-infection registry cohorts (candidate match A)',
    authors: 'Lee H, Ferraro S, Novak D, et al.',
    journal: 'Journal of Clinical Epidemiology',
    year: 2020,
    url: 'https://example.invalid/prototype/lee-2020-a',
    matchConfidence: 'candidate',
  }),
  node('pub-lee-2020-candidate-b', 'Publication', 'Candidate B · Lee 2020', true, {
    doi: '10.0000/prototype.lee.2020.b',
    title: 'Cohort eligibility and infection coding in rural registries (candidate match B)',
    authors: 'Lee HJ, Tran M, Osei K',
    journal: 'BMC Health Services Research',
    year: 2020,
    url: 'https://example.invalid/prototype/lee-2020-b',
    matchConfidence: 'candidate',
  }),

  /* ---- Evidence family (shared data and shared reviews) ----------- */
  node('study-E', 'Study', 'Study E · shared rural cohort', true, {
    label: 'Study E',
    description: 'The shared eleven-site rural registry cohort analysed by more than one publication.',
    label2: 'FICTIONAL',
  }),
  node('study-F', 'Study', 'Study F · capture-window evaluation', true, {
    label: 'Study F',
    description: 'Method evaluation of outcome-capture windows.',
  }),
  node('study-G', 'Study', 'Study G · threshold derivation', true, {
    label: 'Study G',
    description: 'Derivation study for provisional marker thresholds.',
  }),
  node('dataset-X', 'Dataset', 'Dataset X · rural registry extract', true, {
    label: 'Dataset X',
    description: 'The registry extract shared by Study E and Study F.',
  }),
  node('dataset-Y', 'Dataset', 'Dataset Y · cohort extract', true, {
    label: 'Dataset Y',
    description: 'The cohort extract shared by Study G and the national analysis.',
  }),
  node('review-F', 'EvidenceReview', 'Review F · rural sepsis reviews', true, {
    label: 'Review F',
    description: 'A narrative review synthesising Studies E, F and G.',
  }),
  node('review-G', 'EvidenceReview', 'Review G · marker panel reviews', true, {
    label: 'Review G',
    description: 'A systematic review that synthesises Study E.',
  }),

  /* ---- Records belonging to the other prepared investigations ------ */
  node('pub-arrieta-2021', 'Publication', 'Arrieta et al. 2021', true, {
    doi: '10.0000/prototype.arrieta.2021',
    title: 'Low-dose aspirin after emergency discharge for acute migraine',
    authors: 'Arrieta M, Sandoval P, Whitmore R',
    journal: 'Journal of Headache and Pain Reports',
    year: 2021,
    url: 'https://example.invalid/prototype/arrieta-2021',
  }),
  node('notice-arrieta-eoc-2022', 'SourceNotice', 'Expression of concern · 2022', true, {
    noticeType: 'expression_of_concern',
    publishedDate: '2022-04-18',
    noticeAnnouncementDate: '2022-04-18',
    noticeRecordedDate: '2022-04-21',
    detectedAt: '2026-03-04T14:31:00.000Z',
    lastVerifiedAt: '2026-03-04T14:31:00.000Z',
    sourceUrl: 'https://example.invalid/prototype/arrieta-eoc-2022',
    verified: true,
  }),
  node('pub-tanaka-2018', 'Publication', 'Tanaka et al. 2018', true, {
    doi: '10.0000/prototype.tanaka.2018',
    title: 'Post-discharge migraine prophylaxis in a regional cohort',
    authors: 'Tanaka K, Ellis D, Moreau S',
    journal: 'Cephalalgia',
    year: 2018,
    url: 'https://example.invalid/prototype/tanaka-2018',
  }),
  node('pub-nkemelu-2022', 'Publication', 'Nkemelu et al. 2022', true, {
    doi: '10.0000/prototype.nkemelu.2022',
    title: 'Heat-related emergency admissions and gridded exposure models',
    authors: 'Nkemelu A, Duarte P, Lindholm A',
    journal: 'Environmental Epidemiology',
    year: 2022,
    url: 'https://example.invalid/prototype/nkemelu-2022',
  }),
  node('pub-sorensen-2020', 'Publication', 'Sørensen et al. 2020', true, {
    doi: '10.0000/prototype.sorensen.2020',
    title: 'Gridded temperature exposure and heat illness in urban admissions',
    authors: 'Sørensen T, Bakke H, Okonkwo C',
    journal: 'International Journal of Biometeorology',
    year: 2020,
    url: 'https://example.invalid/prototype/sorensen-2020',
  }),
];

const edge = (
  id: string,
  type: GraphEdgeRecord['type'],
  fromId: string,
  toId: string,
  rationale: string,
  sourcePointer: string,
  provenanceKind: GraphEdgeRecord['provenanceKind'] = 'observed',
  reviewState = 'unreviewed',
): GraphEdgeRecord => ({
  id,
  type,
  fromId,
  toId,
  provenanceKind,
  rationale,
  sourcePointer,
  analysisVersion: ANALYSIS_VERSION,
  reviewState,
  createdAt: SEEDED_AT,
});

export const graphEdges: GraphEdgeRecord[] = [
  /* ---- Document structure ----------------------------------------- */
  edge('e-doc-version', 'DOCUMENT_HAS_VERSION', 'doc-demo-manuscript', 'ver-demo-manuscript-v1', 'The imported PDF was frozen as Draft A at import time.', 'documentVersion.doc-demo-manuscript.v1'),
  edge('e-doc-ref-mehra', 'DOCUMENT_HAS_REFERENCE', 'doc-demo-manuscript', 'ref-mehra-2020', 'Reference-list entry 3 was extracted verbatim from the bibliography.', 'manuscript.p5.references[3]'),
  edge('e-doc-ref-lee', 'DOCUMENT_HAS_REFERENCE', 'doc-demo-manuscript', 'ref-lee-2020', 'Reference-list entry 4 was extracted verbatim from the bibliography.', 'manuscript.p5.references[4]'),
  edge('e-doc-ref-okonjo', 'DOCUMENT_HAS_REFERENCE', 'doc-demo-manuscript', 'ref-okonjo-2019', 'Reference-list entry 5 was extracted verbatim from the bibliography.', 'manuscript.p5.references[5]'),
  edge('e-doc-ref-aldridge', 'DOCUMENT_HAS_REFERENCE', 'doc-demo-manuscript', 'ref-aldridge-2021', 'Reference-list entry 6 was extracted verbatim from the bibliography.', 'manuscript.p5.references[6]'),
  edge('e-doc-ref-gunning', 'DOCUMENT_HAS_REFERENCE', 'doc-demo-manuscript', 'ref-gunning-2019', 'Reference-list entry 2 was extracted verbatim from the bibliography.', 'manuscript.p5.references[2]'),
  edge('e-doc-ref-seymour', 'DOCUMENT_HAS_REFERENCE', 'doc-demo-manuscript', 'ref-scymour-2016', 'Reference-list entry 1 was extracted verbatim from the bibliography.', 'manuscript.p5.references[1]'),

  /* ---- Reference resolution --------------------------------------- */
  edge('e-ref-mehra-match', 'OCCURRENCE_MATCHES_PUBLICATION', 'ref-mehra-2020', 'pub-mehra-2020', 'DOI and title in the reference entry match the bibliographic record exactly.', 'reference-occurrence:ref-mehra-2020', 'source_verified'),
  edge('e-ref-okonjo-match', 'OCCURRENCE_MATCHES_PUBLICATION', 'ref-okonjo-2019', 'pub-okonjo-2019', 'DOI and title in the reference entry match the bibliographic record exactly.', 'reference-occurrence:ref-okonjo-2019'),
  edge('e-ref-aldridge-match', 'OCCURRENCE_MATCHES_PUBLICATION', 'ref-aldridge-2021', 'pub-aldridge-2021', 'DOI and title in the reference entry match the bibliographic record exactly.', 'reference-occurrence:ref-aldridge-2021'),
  edge('e-ref-gunning-match', 'OCCURRENCE_MATCHES_PUBLICATION', 'ref-gunning-2019', 'pub-gunning-2019', 'DOI and title in the reference entry match the bibliographic record exactly.', 'reference-occurrence:ref-gunning-2019'),
  edge('e-ref-seymour-match', 'OCCURRENCE_MATCHES_PUBLICATION', 'ref-scymour-2016', 'pub-scymour-2016', 'DOI and title in the reference entry match the bibliographic record exactly.', 'reference-occurrence:ref-scymour-2016'),
  edge('e-ref-lee-cand-a', 'POSSIBLE_MATCH', 'ref-lee-2020', 'pub-lee-2020-candidate-a', 'Author surname, year and journal match; the title differs. Never confirmed.', 'reference-occurrence:ref-lee-2020', 'unresolved'),
  edge('e-ref-lee-cand-b', 'POSSIBLE_MATCH', 'ref-lee-2020', 'pub-lee-2020-candidate-b', 'Author surname and year match; venue differs. Never confirmed.', 'reference-occurrence:ref-lee-2020', 'unresolved'),

  /* ---- Citation use ↔ claim --------------------------------------- */
  edge('e-cu-a-on-claim', 'CLAIM_HAS_CITATION_USE', 'claim-A', 'cu-A-supporting', 'The citation marker appears inside the recorded passage of Claim A.', 'manuscript.p3.col0'),
  edge('e-cu-b-on-claim', 'CLAIM_HAS_CITATION_USE', 'claim-B', 'cu-B-historical', 'The citation appears inside the recorded passage of Claim B.', 'manuscript.p5'),
  edge('e-cu-d-on-claim', 'CLAIM_HAS_CITATION_USE', 'claim-D', 'cu-D-supporting', 'The citation marker appears inside the recorded passage of Claim D.', 'manuscript.p3.col1'),
  edge('e-cu-f-on-claim', 'CLAIM_HAS_CITATION_USE', 'claim-F', 'cu-F-method', 'The citation marker appears inside the recorded passage of Claim F.', 'manuscript.p2'),
  edge('e-cu-h-on-claim', 'CLAIM_HAS_CITATION_USE', 'claim-H', 'cu-H-unresolved', 'The citation marker appears inside the recorded passage of Claim H.', 'manuscript.p2'),
  edge('e-cu-i-on-claim', 'CLAIM_HAS_CITATION_USE', 'claim-I', 'cu-I-background', 'The citation marker appears inside the recorded passage of Claim I.', 'manuscript.p1'),

  /* ---- Relation roles (never conflated) --------------------------- */
  edge('e-cu-a-supports', 'CITATION_USE_SUPPORTS_CLAIM', 'cu-A-supporting', 'claim-A', 'The cited registry analysis is offered as evidence for the reduction reported in this passage.', 'manuscript.p3.col0'),
  edge('e-cu-b-historical', 'MENTIONS_HISTORICALLY', 'cu-B-historical', 'claim-B', 'The passage discusses the withdrawal as an example; it is not offered as support.', 'manuscript.p5'),
  edge('e-cu-d-supports', 'CITATION_USE_SUPPORTS_CLAIM', 'cu-D-supporting', 'claim-D', 'The national analysis is offered as evidence for the reported association.', 'manuscript.p3.col1'),
  edge('e-cu-f-method', 'USES_METHOD_FROM', 'cu-F-method', 'claim-F', 'The cited work is credited for a method definition, not for a finding.', 'manuscript.p2'),
  edge('e-cu-i-supports', 'CITATION_USE_SUPPORTS_CLAIM', 'cu-I-background', 'claim-I', 'The cited epidemiology review is offered as background support.', 'manuscript.p1'),
  edge('e-cu-h-unknown', 'ROLE_UNKNOWN', 'cu-H-unresolved', 'claim-H', 'The reference could not be resolved to a single publication, so the citation role is unknown.', 'manuscript.p2', 'unresolved'),

  /* ---- Citation use ↔ publication ---------------------------------- */
  edge('e-cu-a-refs', 'CITATION_USE_REFERENCES_PUBLICATION', 'cu-A-supporting', 'pub-mehra-2020', 'The citation resolves to the confirmed bibliographic match of reference entry 3.', 'reference-occurrence:ref-mehra-2020'),
  edge('e-cu-b-refs', 'CITATION_USE_REFERENCES_PUBLICATION', 'cu-B-historical', 'pub-mehra-2020', 'The citation resolves to the confirmed bibliographic match of reference entry 3.', 'reference-occurrence:ref-mehra-2020'),
  edge('e-cu-d-refs', 'CITATION_USE_REFERENCES_PUBLICATION', 'cu-D-supporting', 'pub-aldridge-2021', 'The citation resolves to the confirmed bibliographic match of reference entry 6.', 'reference-occurrence:ref-aldridge-2021'),
  edge('e-cu-f-refs', 'CITATION_USE_REFERENCES_PUBLICATION', 'cu-F-method', 'pub-okonjo-2019', 'The citation resolves to the confirmed bibliographic match of reference entry 5.', 'reference-occurrence:ref-okonjo-2019'),
  edge('e-cu-i-refs', 'CITATION_USE_REFERENCES_PUBLICATION', 'cu-I-background', 'pub-gunning-2019', 'The citation resolves to the confirmed bibliographic match of reference entry 2.', 'reference-occurrence:ref-gunning-2019'),

  /* ---- Notice linkage (verified, authoritative) -------------------- */
  edge('e-pub-mehra-notice', 'PUBLICATION_HAS_NOTICE', 'pub-mehra-2020', 'notice-mehra-retraction-2020-06-04', 'A retraction notice for this publication was confirmed against the publisher notice, PubMed and PMC records.', 'https://doi.org/10.1016/S0140-6736(20)31324-6', 'source_verified', 'confirmed'),
  edge('e-pub-mehra-retraction', 'PUBLICATION_HAS_NOTICE', 'pub-mehra-retraction-2020', 'notice-mehra-retraction-2020-06-04', 'The retraction notice is itself a publication record in the same journal issue.', 'https://doi.org/10.1016/S0140-6736(20)31324-6', 'source_verified', 'confirmed'),

  /* ---- Dependency -------------------------------------------------- */
  edge('e-conclusion-claim-a', 'CONCLUSION_DEPENDS_ON_CLAIM', 'conclusion-C', 'claim-A', 'The conclusion restates the reduction reported in the passage that cites the withdrawn analysis.', 'manuscript.p5.conclusions', 'observed', 'flagged'),

  /* ---- Evidence family -------------------------------------------- */
  edge('e-okonjo-study', 'PUBLICATION_REPORTS_STUDY', 'pub-okonjo-2019', 'study-E', 'The publication reports Study E.', 'publication:pub-okonjo-2019'),
  edge('e-aldridge-study', 'PUBLICATION_REPORTS_STUDY', 'pub-aldridge-2021', 'study-E', 'The publication reports the same Study E — it is not an independent replication.', 'publication:pub-aldridge-2021'),
  edge('e-ibarra-study', 'PUBLICATION_REPORTS_STUDY', 'pub-ibarra-2023', 'study-E', 'The publication draws on Study E.', 'publication:pub-ibarra-2023'),
  edge('e-varga-study', 'PUBLICATION_REPORTS_STUDY', 'pub-varga-2020', 'study-F', 'The publication reports Study F.', 'publication:pub-varga-2020'),
  edge('e-hartley-study', 'PUBLICATION_REPORTS_STUDY', 'pub-hartley-2017', 'study-G', 'The publication reports Study G.', 'publication:pub-hartley-2017'),
  edge('e-study-e-dataset-x', 'STUDY_USES_DATASET', 'study-E', 'dataset-X', 'Study E is drawn from Dataset X.', 'study:study-E'),
  edge('e-study-f-dataset-x', 'STUDY_USES_DATASET', 'study-F', 'dataset-X', 'Study F is drawn from the same Dataset X extract.', 'study:study-F'),
  edge('e-study-g-dataset-y', 'STUDY_USES_DATASET', 'study-G', 'dataset-Y', 'Study G is drawn from Dataset Y.', 'study:study-G'),
  edge('e-review-f-study-e', 'REVIEW_SYNTHESIZES_STUDY', 'review-F', 'study-E', 'Review F synthesises Study E.', 'review:review-F'),
  edge('e-review-f-study-f', 'REVIEW_SYNTHESIZES_STUDY', 'review-F', 'study-F', 'Review F synthesises Study F.', 'review:review-F'),
  edge('e-review-g-study-e', 'REVIEW_SYNTHESIZES_STUDY', 'review-G', 'study-E', 'Review G synthesises Study E.', 'review:review-G'),

  /* ---- Other prepared investigations -------------------------------- */
  edge('e-pub-arrieta-notice', 'PUBLICATION_HAS_NOTICE', 'pub-arrieta-2021', 'notice-arrieta-eoc-2022', 'An expression of concern for this publication was confirmed against the journal record.', 'https://example.invalid/prototype/arrieta-eoc-2022', 'source_verified', 'confirmed'),
];
