# Aftershock guided-demo fixture — provenance

`demo-fixture.json` is the single source for the idempotent M2 seed (see
`../seed.mjs`). Stable IDs follow `docs/DATA_CONTRACTS.md §6`.

## What is real (authoritative records) — `isSynthetic` = false

| ID | What it is | Source of record |
|---|---|---|
| `pub-mehra-2020` | Publication record for Mehra MR, Desai SS, Ruschitzka F, Patel AN (2020), The Lancet, DOI `10.1016/S0140-6736(20)31180-6`, online 2020-05-22, PMID 32450107 | Crossref/PubMed/PMC record, verified live **2026-10-18** (`docs/research/mehra-notice-verification.md`, HIGH confidence) |
| `pub-mehra-retraction-2020` | Publication record for the retraction letter, DOI `10.1016/S0140-6736(20)31324-6`, Lancet 395(10240):1820, PMID 32511943 | Crossref/PubMed/PMC record, verified live 2026-10-18 |
| `notice-mehra-retraction-2020-06-04` | SourceNotice: retraction, `publishedDate = 2020-06-04` (= announcement date), `noticeRecordedDate = 2020-06-05` (record date), `verified = true`, `sourceUrl` = the retraction DOI | Contract §6 (corrected in main) + the live verification above |

These fields were verified against Crossref, PubMed, PMC and doi.org on
2026-10-18 (four independent authoritative systems agree). Retracted-state
records carry a literal `RETRACTED:` title prefix in Crossref/PubMed — the
fixture stores the clean article title plus the `retracted` state flag,
separately (the UI must never merge them). The *NEJM* Mehra paper
(`10.1056/NEJMoa2007621`) is a different work; its title is explicitly excluded
by contract and pinned by tests.

### Date distinction (kept machine-readable, never merged)

- The contract (corrected in main; see
  `docs/research/mehra-notice-verification.md`) distinguishes the retraction's
  **announcement date** `2020-06-04` (Lancet editorial statement; Retraction
  Watch post; preserves the fixture ID) from the **record date**
  `2020-06-05` (PubMed/PMC epub header; Crossref deposit). The fixture stores
  both (`noticeAnnouncementDate` = `publishedDate`, and
  `noticeRecordedDate`); tests pin both values and pin that they differ. M3
  automation must preserve the distinction rather than collapse the two
  into a single date.

### Related-but-never-merged record

- The Expression of Concern on the same paper
  (`10.1016/S0140-6736(20)31290-3`, PMID 32504543) is *declared* in the
  fixture (`relatedNeverMerged`) but NOT seeded as a node/edge. Contract §6
  forbids merging it with the retraction; tests assert no such node exists.

## What is synthetic — `isSynthetic` = true, `syntheticLabel = 'FICTIONAL / GUIDED DEMO'`

Everything else: the manuscript (`doc-demo-manuscript`,
`ver-demo-manuscript-v1`), its passages (`claim-A`, `claim-B`,
`conclusion-C`), the citation uses (`cu-A-supporting`, `cu-B-historical`), the
ambiguous reference (`ref-lee-2020`), its two fictional candidate publications
(`pub-lee-2020-candidate-a/b`), and the optional evidence family (`study-E`,
`review-F`, `dataset-X`).

- Synthetic *publications* use the non-routable DOI prefix `10.demo/` and
  `.example.invalid` URLs so they can never collide with or resolve to real
  records.
- No real study's result values are described anywhere in the synthetic text.
  The demo manuscript speaks about what the fictional document's authors claim
  and infer; the real Mehra record enters the graph only as a bibliographic
 /status anchor.
- The synthetic flag is enforced by tests
  (`server/test/unit/fixture.contract.test.mjs`), and the seeded graph carries
  `isSynthetic` on every node so real vs. fictional stays distinguishable
  directly from graph data (AGENTS.md scientific-integrity rules).

## Provenance semantics used by this fixture

`provenanceKind` values follow DATA_CONTRACTS §3 and are assigned per edge as
follows:

- `observed` — presence in the demo content: structural edges, quoting
  (`DOCUMENT_HAS_VERSION`, `DOCUMENT_HAS_REFERENCE`,
  `CLAIM_HAS_CITATION_USE`). The claim/citation bodies themselves are also
  `observed` nodes of the fictional document.
- `human_confirmed` — interpretive classifications curated into the fixture by
  a human author (citation role edges
  `CITATION_USE_SUPPORTS_CLAIM` / `MENTIONS_HISTORICALLY`,
  `CONCLUSION_DEPENDS_ON_CLAIM`, identity resolution edges
  `CITATION_USE_REFERENCES_PUBLICATION`, fictional evidence-family links).
- `source_verified` — real public-record facts (`PUBLICATION_HAS_NOTICE`).
- `unresolved` — `POSSIBLE_MATCH` edges only, explicitly unverifiable,
  non-propagating (invariant §7.3).

Every material edge also carries `rationale`, `sourcePointer` (a DOI URL for
record-backed edges, `fixture://aftershock-demo-fixture-v1#<elementId>`
otherwise), `analysisVersion = "seed-1"`, `createdAt` and
`reviewState = "unreviewed"` — a review flag means "needs human review", never
"disproven/proven".

## Why synthetic-only

FalkorDB Cloud Free has no TLS and no durable persistence. Real/private
manuscripts or sensitive notes must never pass through it (AGENTS.md hard
rule). The fixture is intentionally self-contained: any graph reset can be
recovered by re-running the seed.

## Sweeping guarantees

- The seed wipes and recreates **only** nodes/edges marked `seeded = true`
  within the graph it is called on. Foreign content in the same graph is left
  untouched; other graphs on the instance (`test_hosting`, etc.) are never
  touched by this library.
- Re-running `seedGraph` against a graph whose `SeedMeta.seedVersion`
  matches the fixture version is a no-op (idempotent).
- Fixture timestamps are baked (constant `fixtureTimestamp`) so wipes/reseeds
  of the same fixture version produce identical content exports; the meta node
  records a per-run `seededAt` wall-clock stamp.

## Graph-encoding notes

- FalkorDB property values can only be primitives or arrays of primitives.
  Structured fields (e.g. `location`) are written as lossless JSON strings
  under the same key by `buildSeedPlan` — deterministic across reseeds.
