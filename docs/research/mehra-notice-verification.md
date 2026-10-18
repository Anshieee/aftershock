# Mehra retraction-notice verification — real seed record (M3)

Verified: 2026-10-18 (all fetches live HTTP; list below). Target per handoff §12: DOI pair
`10.1016/S0140-6736(20)31180-6` (original) / `10.1016/S0140-6736(20)31324-6` (retraction notice).

## Primary finding: canonical record for the handoff's DOI pair

The handoff's DOIs resolve to the **The Lancet hydroxychloroquine paper** (the intended demo target —
"multinational registry analysis concerning hydroxychloroquine/chloroquine"). Its canonical,
verified title is **not** "Cardiovascular disease, drug therapy, and mortality in Covid-19"
(that title belongs to a different, also-retracted Mehra et al. paper in *NEJM*,
`10.1056/NEJMoa2007621`, retracted via `10.1056/NEJMc2021225`). Seed records must use the values
below, never the NEJM title.

## VERIFIED FIELD VALUES (Crossref + PubMed + PMC agree on every value)

### `pub-mehra-2020` (retracted original)
- `title`: "Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis" (retracted-state bibliographic records carry a "RETRACTED:" prefix; UI shows clean title + retraction state separately)
- `authors`: Mehra MR, Desai SS, Ruschitzka F, Patel AN
- `journal`: The Lancet · `year`: 2020 · `type`: journal-article
- `publishedDate`: **2020-05-22** (online ahead of print; no print vol/pages ever assigned)
- `doi`: 10.1016/S0140-6736(20)31180-6 · `pmid`: 32450107 · `pmc`: PMC7255293 · `pii`: S0140673620311806
- `retracted`: true (Crossref `update-to` retraction; PubMed pubtype "Retracted Publication")
- `sourceUrls`: https://doi.org/10.1016/S0140-6736(20)31180-6 ; https://linkinghub.elsevier.com/retrieve/pii/S0140673620311806

### `notice-mehra-retraction-2020-06-04` (retraction notice; ID keeps announcement date)
- `noticeType`: retraction (Crossref relation; PubMed pubtype "Retraction Notice")
- `title`: "Retraction—Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis"
- `authors` (notice's own): Mehra MR, Ruschitzka F, Patel AN (Desai not on the notice)
- `journal`: The Lancet · `year`: 2020 · `volumeIssuePage`: 395(10240):1820 · PMC7274621 · PMID 32511943
- `noticeDOI`: 10.1016/S0140-6736(20)31324-6 · `pii`: S0140673620313246
- **Date distinction (keep both)**: `noticeAnnouncementDate` **2020-06-04** (Lancet editorial statement; Retraction Watch post) — used for the fixture ID and `publishedDate`; `noticeRecordedDate` **2020-06-05** (PubMed epubdate; PMC header "2020 Jun 5"; Crossref deposit 2020-06-05)
- Linkage notice→original asserted bidirectionally by 4 independent systems: Crossref `relation.retraction` + `update-to` (`associatedlink`), PubMed "Retraction in" ↔ "Retraction of" (32450107 ↔ 32511943), PMC header line, doi.org citation
- `sourceUrls`: https://doi.org/10.1016/S0140-6736(20)31324-6 ; https://linkinghub.elsevier.com/retrieve/pii/S0140673620313246 ; open official mirror https://pmc.ncbi.nlm.nih.gov/articles/PMC7274621/
- `verified`: true (authoritative Crossref/PubMed/PMC/doi.org retrievals succeeded)

### Related notices on the same original (do NOT merge with the retraction)
- Expression of Concern: DOI 10.1016/S0140-6736(20)31290-3, PMID 32504543
- Additional retraction-linked record: DOI 10.1016/S0140-6736(20)31528-2, PMID 32653079 (Lancet 2020 Jul 18;396(10245):e2-e3)

## Source evidence table
| Source | URL | Retrieval | Establishes |
|---|---|---|---|
| Crossref works | api.crossref.org/works/10.1016/S0140-6736(20)31180-6 | OK | original metadata; `update-to` retraction record with notice DOI |
| Crossref works | api.crossref.org/works/10.1016/S0140-6736(20)31324-6 | OK | notice title/vol/page; `relation.retraction → original DOI` |
| PubMed esummary | eutils id=32450107 | OK | "RETRACTED:" title, epub 2020-05-22, Retraction-in → 32511943 |
| PubMed esummary | eutils id=32511943 | OK | notice epub 2020-06-05, "Retraction-of" → 32450107 |
| PMC | pmc.ncbi.nlm.nih.gov/articles/PMC7274621/ | OK | official open mirror; header retracts DOI …31180-6 |
| doi.org resolver | doi.org/10.1016/S0140-6736(20)31324-6 | OK | resolves; Lancet 395(10240):1820 |
| Elsevier resolver | linkinghub.elsevier.com/retrieve/pii/S0140673620313246 | OK (redirect stub) | official publisher resolver |
| thelancet.com | …/article/S0140-6736(20)31324-6/fulltext | 403 (bot protection) | direct fetch blocked; corroborated via RW + Crossref `content-domain` |
| Retraction Watch (secondary) | retractionwatch.com/2020/06/04/lancet-retracts-controversial-hydroxychloroquine-study/ | OK | announcement 2020-06-04; editors' audit statement |
| Wikidata | Q95177432 (paper), none for notice | OK / none | paper item w/ DOI P356; no notice item exists |

Incorrect earlier assumptions, discarded:
- The title "Cardiovascular disease, drug therapy, and mortality in Covid-19" is the NEJM paper's — do not use it for this DOI.
- "12 May 2020" was wrong; the online date is 2020-05-22.
- PMID 32473127 belongs to an unrelated *Cell* paper (Grifoni et al.); the correct original PMID is 32450107 (notice: 32511943).

## Attribution note
Linking a retraction notice to its target and storing bibliographic metadata (title, authors,
journal, dates, DOIs, status, links, provenance) is standard permitted practice — this is exactly
how Crossref, PubMed ("Retraction in/of") and Wikidata model retractions. We store only structured
fields + URLs — **no article or notice body text** (© Elsevier; PMC hosts the notice under
Elsevier's COVID-19 resource licence). Synthetic demo content stays `isSynthetic: true` and
labeled; this pair is `isSynthetic: false`.

## Confidence
HIGH for the Lancet pair (4 independent authoritative systems agree; RW secondary concurs).
Direct thelancet.com fetch remains blocked (403) — its existence corroborated indirectly.
No Wikidata item exists for the notice itself. Fetch log: 2 Crossref, 6 eutils, 1 doi.org,
1 PMC, 1 RW, 5 Wikidata calls, 1 linkinghub, 1 failed thelancet.com (403). No credentials used.
