/**
 * Fictional sample manuscript for the Aftershock prototype.
 *
 * EVERYTHING in this file is invented. The manuscript, its authors, its
 * journal, its dataset and its results are fictional and exist only so the
 * prototype can demonstrate annotation geometry, evidence inspection and
 * review workflows against a real PDF.
 *
 * One real record is referenced from inside the fiction: the Mehra et al.
 * (2020) Lancet registry analysis and its 2020 retraction notice are genuine
 * publication records (see docs/DATA_CONTRACTS.md §6). The citation of it
 * inside this fictional manuscript is invented.
 *
 * This file is the single source of truth for both the generated PDF
 * (scripts/make-sample-manuscript.ts) and the reflowed reading mode, so the
 * two never drift apart.
 */

export interface TextBlock {
  kind: 'h1' | 'h2' | 'h3' | 'p';
  text: string;
}

export interface FigureBlock {
  kind: 'figure';
  /** Short label rendered inside the figure frame. */
  label: string;
  caption: string;
  /** Deterministic polyline series for the drawn figure. */
  series: number[][];
}

export interface TableBlock {
  kind: 'table';
  caption: string;
  columns: string[];
  rows: string[][];
}

export interface ReferenceBlock {
  kind: 'references';
  items: Array<{ label: string; text: string }>;
}

export type ManuscriptBlock = TextBlock | FigureBlock | TableBlock | ReferenceBlock;

export interface ManuscriptSection {
  id: string;
  heading?: string;
  blocks: ManuscriptBlock[];
  /** Number of text columns this section is laid out in. */
  columns?: 1 | 2;
  /** Force a new page before this section. */
  pageBreakBefore?: boolean;
}

export interface Manuscript {
  title: string;
  authors: string;
  affiliation: string;
  journalLine: string;
  banner: string;
  abstractLabel: string;
  keywords: string;
  sections: ManuscriptSection[];
}

export const manuscript: Manuscript = {
  title:
    'Adaptive Marker Panels for Early Sepsis Detection in Rural Emergency Cohorts: A Multicentre Registry Study',
  authors:
    'Ruth Aluko, MD · Nils Halloran, PhD · Petra Sørensen, MD · Joy Adeyemi, MPH · Luca Marchetti, MD',
  affiliation:
    'Northfield Rural Health Collaborative — Department of Emergency Medicine, Ellsworth Institute, Brindle Bay',
  journalLine: 'Journal of Applied Clinical Registries · Vol. 12, No. 4 · 2024 · pp. 118–131',
  banner: 'SAMPLE MANUSCRIPT — FICTIONAL. Generated for the Aftershock prototype; not a real publication.',
  abstractLabel: 'Abstract',
  keywords:
    'Keywords: sepsis · rural emergency medicine · triage gating · adaptive marker panel · registry methods',
  sections: [
    {
      id: 'abstract',
      heading: 'Abstract',
      blocks: [
        {
          kind: 'p',
          text: 'Background. Rural emergency departments face delayed escalation for sepsis because confirmatory laboratory results frequently arrive after the point at which antibiotics would have been administered. Interval time, rather than diagnostic uncertainty, appears to be the dominant contributor to preventable harm in these settings.',
        },
        {
          kind: 'p',
          text: 'Objective. We evaluated whether an adaptive sepsis marker panel used as a triage gate reduced time-to-therapeutic intervention in a multicentre rural cohort.',
        },
        {
          kind: 'p',
          text: 'Design, Setting, and Participants. We performed a retrospective registry study across eleven rural emergency departments between March 2021 and October 2023, using prospectively captured timestamps from the electronic record.',
        },
        {
          kind: 'p',
          text: 'Results. A total of 14,882 adults were included. Time-to-therapeutic intervention fell by 31% (95% CI 24% to 37%). Marker-panel gating was associated with lower 28-day in-hospital mortality in the adjusted analysis (adjusted hazard ratio 0.81, 95% CI 0.74 to 0.89).',
        },
        {
          kind: 'p',
          text: 'Conclusions. Adaptive marker panels may permit earlier escalation in settings where confirmatory testing is delayed. Confirmation in prospectively governed cohorts is required before the approach is recommended as a standard of care.',
        },
      ],
    },
    {
      id: 'introduction',
      heading: '1. Introduction',
      blocks: [
        {
          kind: 'p',
          text: 'Sepsis mortality in rural settings is driven less by an absence of clinical knowledge than by the interval between suspicion and intervention. Rural emergency departments depend on serial lactate measurements and blood-culture results that, in many hospitals, return after the moment at which antibiotics would have been given. The literature on sepsis bundles has focused on which interventions improve survival; comparatively little work has addressed the organisational delay that prevents them being applied.',
        },
        {
          kind: 'p',
          text: 'We designed an adaptive panel that re-evaluates a patient when the first marker set is inconclusive, rather than waiting for a complete laboratory panel. The panel is deliberately simple: three threshold rules applied at triage, with an explicit re-evaluation trigger. Prior work on triage gating in general populations suggests a reduction in time-to-antibiotics of roughly one third, and it is this prior literature that our own estimates are, in part, intended to extend to rural practice.',
        },
        {
          kind: 'p',
          text: 'Three questions structure the remainder of this report. First, does marker-panel gating alter time-to-therapeutic intervention in a rural cohort in which confirmatory testing is delayed? Second, is any such association detectable after adjustment for the case-mix differences that dominate rural emergency admissions? Third, can the association be separated from the shared-data and shared-review lineages that complicate much of the registry literature?',
        },
      ],
    },
    {
      id: 'methods',
      heading: '2. Methods',
      blocks: [
        {
          kind: 'h2',
          text: '2.1 Design, setting, and reporting',
        },
        {
          kind: 'p',
          text: 'This is a retrospective cohort study drawn from eleven rural emergency departments in four health regions. Reporting follows the RECORD statement for routinely collected health data. The study protocol, analysis plan, and the derived dataset specification were registered before extraction.',
        },
        {
          kind: 'h2',
          text: '2.2 Cohort definition',
        },
        {
          kind: 'p',
          text: 'Sampling was restricted to adult admissions coded with a suspected-infection diagnosis at triage, following the eligibility rules published by Lee et al. (2020). We applied the same exclusion logic as that report — no confirmed infection at 48 hours, no admission from a non-emergency setting, and no recorded care limitation at triage.',
        },
        {
          kind: 'p',
          text: 'The index admission was the first emergency presentation with a suspected-infection code. Encounters transferred between the participating hospitals were linked on a pseudonymous encounter identifier and counted once, at the receiving site.',
        },
        {
          kind: 'h2',
          text: '2.3 Outcome capture and risk adjustment',
        },
        {
          kind: 'p',
          text: 'We reused the outcome-capture interval and the risk-adjustment covariates defined by Okonjo et al. (2019), because those definitions align with the registry exports available at all eleven sites. Covariates were derived from structured fields only; no free-text narrative was read.',
        },
        {
          kind: 'h2',
          text: '2.4 Statistical analysis',
        },
        {
          kind: 'p',
          text: 'Time-to-therapeutic intervention was defined as the interval from triage decision to the administration of a guideline-concordant antimicrobial, truncated at 180 minutes. We used a Cox proportional-hazards model with site-level random intercepts, and a two-part model for the time component to accommodate the mass at the truncation boundary.',
        },
      ],
    },
    {
      id: 'results',
      heading: '3. Results',
      columns: 2,
      blocks: [
        {
          kind: 'p',
          text: 'Between March 2021 and October 2023, 19,431 eligible presentations were recorded across the eleven sites, of whom 14,882 met all cohort criteria. Site volume ranged from 604 to 3,102 eligible presentations. Baseline characteristics were materially similar between gated and ungated presentations, with the largest differences in age and systolic blood pressure at triage.',
        },
        {
          kind: 'p',
          text: 'Registry cohorts in comparable settings have reported a marked reduction in time-to-antibiotics when marker panels are used to gate escalation (Mehra et al., 2020). Our own estimates are consistent with that reported direction of effect, and the mechanism assumed in both analyses — that an earlier provisional marker result releases a decision before confirmatory testing completes — is the same.',
        },
        {
          kind: 'h3',
          text: '3.1 Primary outcome',
        },
        {
          kind: 'p',
          text: 'Median time-to-therapeutic intervention was 96 minutes in gated presentations and 138 minutes in ungated presentations. The adjusted hazard ratio for time-to-intervention was 0.69 (95% CI 0.66 to 0.72).',
        },
        {
          kind: 'h3',
          text: '3.2 Secondary outcomes',
        },
        {
          kind: 'p',
          text: '28-day in-hospital mortality was 6.1% in gated and 7.4% in ungated presentations (adjusted hazard ratio 0.81, 95% CI 0.74 to 0.89). Intensive-care admission within 72 hours was 3.9% and 4.6% respectively.',
        },
        {
          kind: 'p',
          text: 'A national analysis by Aldridge et al. (2021) reported a similar association between marker-panel gating and time-to-therapeutic intervention in a shared registry cohort. We did not have access to that analysis and could not independently reproduce its covariate specification.',
        },
        {
          kind: 'h3',
          text: '3.3 Cohort flow and missing data',
        },
        {
          kind: 'p',
          text: 'Screening logs were available for 19,431 of 21,406 eligible presentations; 1,975 could not be reconciled against the registry extract and were excluded before analysis. Missing laboratory values were uncommon: fewer than 2% of presentations lacked an initial lactate, and fewer than 4% lacked a documented systolic blood pressure.',
        },
        {
          kind: 'p',
          text: 'Time of presentation was missing in 0.8% of records. We did not impute missing covariate values; complete-case analysis was used throughout, and the primary result was unchanged under multiple imputation with chained equations as a post hoc check.',
        },
        {
          kind: 'h3',
          text: '3.4 Protocol fidelity',
        },
        {
          kind: 'p',
          text: 'Panel documentation was complete in 88% of gated presentations. Incomplete documentation clustered at three sites that introduced gating late in the recruitment window, and the primary estimate excluding those sites was 0.72 (95% CI 0.68 to 0.76).',
        },
        {
          kind: 'p',
          text: 'No interim analysis was performed and no outcome-adaptive design element was used. The analysis plan, the derived dataset specification, and the statistical code were frozen before the first outcome comparison was run.',
        },
      ],
    },
    {
      id: 'results-detail',
      heading: '3.5 Supplementary analyses',
      pageBreakBefore: true,
      blocks: [
        {
          kind: 'p',
          text: 'Results were stable across all prespecified sensitivity analyses. Restricting to presentations with a complete first marker set moved the adjusted hazard ratio from 0.69 to 0.71. Excluding the three largest-volume sites moved it to 0.70. Neither change alters the interpretation of the primary result.',
        },
        {
          kind: 'table',
          caption:
            'Table 1. Baseline characteristics of eligible presentations, stratified by marker-panel gating (n = 14,882).',
          columns: ['Characteristic', 'Gated (n = 7,214)', 'Ungated (n = 7,668)'],
          rows: [
            ['Age, mean (SD), y', '61.4 (18.2)', '64.9 (17.6)'],
            ['Female sex, No. (%)', '3,588 (49.7)', '3,912 (51.0)'],
            ['Systolic BP, mean (SD), mm Hg', '104 (21)', '99 (20)'],
            ['Respiratory rate, mean (SD), /min', '21 (6)', '22 (6)'],
            ['Comorbidity count, mean (SD)', '1.7 (1.4)', '1.9 (1.5)'],
            ['Time-to-intervention, median (IQR), min', '96 (61–128)', '138 (92–181)'],
            ['28-day in-hospital mortality, No. (%)', '440 (6.1)', '567 (7.4)'],
          ],
        },
        {
          kind: 'figure',
          label: 'Time-to-therapeutic intervention by month of presentation',
          caption:
            'Figure 1. Distribution of time-to-therapeutic intervention by month of presentation, gated (upper) and ungated (lower) presentations. Lines show the median; the shaded band shows the interquartile range.',
          series: [
            [64, 61, 58, 55, 57, 60, 63, 66, 68, 70, 73, 76],
            [102, 104, 107, 109, 112, 115, 117, 120, 123, 126, 128, 131],
          ],
        },
      ],
    },
    {
      id: 'discussion',
      heading: '4. Discussion',
      blocks: [
        {
          kind: 'p',
          text: 'In a rural cohort in which confirmatory testing is systematically delayed, gating escalation on an adaptive marker panel was associated with a shorter time-to-therapeutic intervention and lower 28-day mortality. The effect size was consistent across sensitivity analyses and across sites of very different baseline volumes.',
        },
        {
          kind: 'p',
          text: 'Several caveats bound this conclusion. Our design is observational, and gating was not randomised; sites that introduced gating may differ in ways that the recorded covariates do not capture. The mechanism by which earlier escalation is achieved is plausible but was not directly measured. And the wider registry literature on triage gating is itself uneven: the report by Mehra et al. (2020) was later withdrawn by the publisher after concerns were raised about its source data, so the extent to which our estimates inherit that lineage requires separate consideration rather than assumption.',
        },
        {
          kind: 'p',
          text: 'Our finding is therefore best read as a hypothesis about organisational delay that warrants prospective evaluation, not as a settled estimate of effect. A stepped-wedge trial, in which sites introduce gating in sequence, is the natural next design and would separate the intervention effect from secular trends in sepsis recognition.',
        },
      ],
    },
    {
      id: 'conclusions',
      heading: '5. Conclusions',
      blocks: [
        {
          kind: 'p',
          text: 'Taken together, these data support routine marker-panel gating in rural emergency departments, reducing time-to-therapeutic intervention by 31%. The effect was not explained by differences in case mix, and was stable when the analysis was restricted to sites that contributed fewer than one thousand eligible presentations.',
        },
        {
          kind: 'p',
          text: 'Prospective, prospectively governed evaluation is required. Until such evaluation is available, the present findings should be read as evidence that the question is worth asking, and not as evidence that gating is effective.',
        },
      ],
    },
    {
      id: 'references',
      heading: 'References',
      blocks: [
        {
          kind: 'references',
          items: [
            {
              label: '1.',
              text: 'Seymour CW, Liu VX, Iwashyna TJ, et al. Derivation, validation, and potential treatment implications of novel clinical phenotypes for sepsis. JAMA. 2016;315(20):2209-2219.',
            },
            {
              label: '2.',
              text: 'Gunning CM, Harmon JP, Jaeschke M. Epidemiology of sepsis in rural settings. Lancet Reg Health Eur. 2019;14:100-108.',
            },
            {
              label: '3.',
              text: 'Mehra MR, Desai SS, Ruschitzka F, Patel AN. Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis. Lancet. 2020;396(10245):2409-2410.',
            },
            {
              label: '4.',
              text: 'Lee H, Ferraro S, Novak D, et al. Eligibility criteria for suspected-infection registry cohorts. J Clin Epidemiol. 2020;124:88-97.',
            },
            {
              label: '5.',
              text: 'Okonjo T, Banerjee R, Whitfield M, et al. Outcome capture windows in rural registry datasets: a multicentre evaluation. BMJ Open. 2019;9:e028441.',
            },
            {
              label: '6.',
              text: 'Aldridge J, Nwosu C, Pemberton H, et al. Marker-panel gating and time-to-therapeutic intervention: a national registry cohort analysis. Lancet Digit Health. 2021;3(9):e612-e621.',
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Anchors used by the annotation system. `phrase` must appear verbatim in the
 * manuscript text; the generator verifies every anchor resolves against the
 * generated PDF before writing the fixture, and an unresolved anchor is a
 * hard failure (no fabricated highlight is ever produced).
 */
export interface AnchorSpec {
  id: string;
  phrase: string;
}

export const anchorSpecs: AnchorSpec[] = [
  {
    id: 'anchor-direct-support',
    phrase:
      'Registry cohorts in comparable settings have reported a marked reduction in time-to-antibiotics when marker panels are used to gate escalation (Mehra et al., 2020).',
  },
  {
    id: 'anchor-historical-mention',
    phrase: 'the report by Mehra et al. (2020) was later withdrawn by the publisher after concerns were raised about its source data',
  },
  {
    id: 'anchor-conclusion-dependency',
    phrase:
      'Taken together, these data support routine marker-panel gating in rural emergency departments, reducing time-to-therapeutic intervention by 31%.',
  },
  {
    id: 'anchor-unresolved-reference',
    phrase: 'following the eligibility rules published by Lee et al. (2020)',
  },
  {
    id: 'anchor-method-reuse',
    phrase: 'the risk-adjustment covariates defined by Okonjo et al. (2019)',
  },
  {
    id: 'anchor-shared-cohort',
    phrase:
      'A national analysis by Aldridge et al. (2021) reported a similar association between marker-panel gating and time-to-therapeutic intervention in a shared registry cohort.',
  },
];
