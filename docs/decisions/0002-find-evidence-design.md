# ADR 0002 — Find Evidence v1 (Crossref-backed, read-only, honest-by-default)

## Status
- Implemented and deployed 2026-10-19 (main `61c26df`, production deploy `6ad5aeeb5d9eeb73735e1bf2`).

## Decision
- **One endpoint, two modes:** `POST /evidence-find?claimId=` (deploy-path name; contract logical name `POST /evidence/find`).
  - **Prepare mode** (no body): no external fetch. Returns the stored claim context (`claimText`, `label`, `manuscriptId`, concern summary/direction), a `suggestedQuery` derived from the claim text (`queryEditable: true`), the provider roster, and the standing caveats.
  - **Search mode** (body `{ query }`): runs the user-edited query against Crossref and returns ranked candidates; nothing else changes.
- **Provider:** Crossref REST (`api.crossref.org`). A `mailto=` polite-pool parameter is appended only when the server-side `CROSSREF_CONTACT_EMAIL` env var is set; without it the client degrades gracefully (identical results, no polite-pool attribution).
- **Candidate fields (honest-by-default):** DOI, title, authors, container-title, published year, type, publisher, `is-referenced-by-count`, DOI link — plus fixed unknown disclosures: `retractionStatus: "unknown"`, `evidenceRelationship: "unverified"`, `independence: "unknown"`, `fullTextAvailability: "unknown"`. `providersStatus` reports each provider's outcome (e.g. `{id:"crossref", status:"ok"}`), so partial provider failure is visible instead of papered over.
- **No graph writes.** Candidates are never persisted; the endpoint cannot create citations, evidence edges, review states, or records. The search surface and the graph-mutation surface are strictly separated.
- **Safeguards:** per-IP rate budget tighter than the write routes (cooldown 60 s, ≤10 per 10 min window) and a separate per-claim budget, since this path spends external fetch budget; per-attempt Crossref abort ~6 s with ≤1 retry inside a whole-provider-leg deadline that stays under the 8 s session budget (the client aborts at 10 s).
- **UI:** the FindEvidencePanel lives on the review queue, presents the caveats README-style before searching, lets the user edit the query, and renders every result as a candidate-for-human-review — never as support. DOI links open the paper; the panel itself never flips a review state.
- Design-of-record for the API contract and payloads: `/tmp/opencode/p4-spec.md` (canonical contract note added to `docs/DATA_CONTRACTS.md` §5).

## Why
- The review workflow needs a legitimate way to *find* candidate papers, but every candidate must remain un-assessed until a human reads the paper. Automating "relevance → support" would violate the relation-type honesty rules (cites ≠ supports) and the review-flag semantics.
- Metadata-only is the correct v1 scope for the demo's infrastructure: no full-text fetches, no retraction scraping, no persistence — nothing that could fabricate an assessment or violate the synthetic-only graph data boundary.
- Crossref was chosen over PubMed/OpenAlex for v1 because the demo claim fixture cites a DOI-bearing 2020 paper and Crossref's REST API needs no credentials, keeping the $0/no-secrets posture intact.

## Consequences
- Every candidate provably starts at "unknown/unverified"; the product needs no synthetic shortcuts for this surface.
- Real bibliographic records returned by live searches stay OUT of the graph (they are session-scoped responses), consistent with the synthetic-only boundary for the no-TLS free graph.
- Next-step scope for a future wave: retraction/status notice checks per candidate DOI, identical-work grouping (shared datasets/analyses), optional persisted evidence candidates under a secure storage tier (requires the ADR 0001 migration: TLS graph + durability).
