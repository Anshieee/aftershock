# @aftershock/server

Server-side-only ESM library for Aftershock (M2): FalkorDB graph connectivity,
idempotent synthetic fixture seeding, and core impact traversals. Plain
`.mjs` + JSDoc, no build step — Netlify functions import these modules
directly. The browser bundle never touches this code or any credential.

Authority chain: `docs/DATA_CONTRACTS.md` (§1–§7), `FALKORDB.md`,
`docs/decisions/0001-architecture.md`, `AGENTS.md`.

## Modules

| Module | Exports (summary) |
|---|---|
| `contract.mjs` | Contract enums + stable §6 fixture IDs (`PROVENANCE_KINDS`, `EDGE_TYPES`, `NODE_LABELS`, `CITATION_ROLES`, `RESOLUTION_STATES`, `NOTICE_TYPES`, `FIXTURE_IDS`, `REAL_RECORD`, `DEMO_GRAPH_NAME`, `PROTECTED_FOREIGN_GRAPHS`). Single source of truth shared with tests. |
| `graphClient.mjs` | `connectFromEnv()` → bound `GraphSession` (`roQuery`/`writeQuery`/`graphExists`/`ensureGraph`/`listGraphs`/`close`), `resolveCredentials()`, `assertParameterized()` (param-only enforcement), `buildQueryOptions()`, typed errors (`CredentialsError`, `ConnectionError`, `GraphQueryError`, `ParameterizationError`), `redactedEnvironmentView()`. |
| `seed.mjs` | `seedGraph(session, fixture?, {now})`, `buildSeedPlan(fixture)` (pure validation/compile), `defaultFixture()`, `expectedCountsFor()`, `readSeedMeta()`. |
| `impact.mjs` | `getSeedStatus(session)`, `verifiedNotices(session)`, `impactPathFromSupportedClaims(session)`, `historicalSafetyCheck(session)`, `unresolvedNonPropagationCheck(session, occurrenceId?)`, `deferReferenceOccurrence(session, id, {reason?, now?})`. |

## Connection

```js
import { connectFromEnv } from '@aftershock/server/graphClient.mjs'; // repo-relative in this repo

const session = await connectFromEnv({ graphName: 'aftershock:demo' });
await session.roQuery('MATCH (n:Publication) WHERE n.id = $id RETURN count(n) AS c', { id: 'pub-mehra-2020' });
await session.close();
```

- Credentials come from `FALKORDB_HOST/PORT/USER/PASSWORD` (or
  `FALKORDB_URL`) — server-side env only (Netlify/local `.env`). Errors name
  missing variables, never echo values; nothing in the library prints.
- Reads use `roQuery` (GRAPH.RO_QUERY); writes use `writeQuery`
  (GRAPH.QUERY). Every Cypher text is scanned by the parameterization guard:
  quoted string literals are rejected — all values must be `$param`s.
  (Clients serialize the params bag as `CYPHER key=value`; keys are bare.)
- Connect timeout 10 s, per-query server-side TIMEOUT 20 s (writes 60 s).
- `ensureGraph({ create: true })` bootstraps only a `SeedMeta` placeholder;
  real content always comes from `seedGraph`.

## Seed algorithm (idempotent, versioned, scoped)

1. `db.list()` first (convention; never creates implicitly before checking).
2. Read `meta-seed-version` (`SeedMeta.seedVersion`) if the graph exists.
3. If version matches the fixture **and** seeded node/edge counts match the
   fixture → **no-op** (returns `action:'noop'`; nothing is written).
4. Otherwise: wipe **only** `seeded = true` nodes/edges (`DETACH DELETE`), then
   recreate one UNWIND batch per label / per edge type, write the meta node
   last (fails before meta ⇒ stale state ⇒ next run reseeds; never advertises
   a version it did not finish writing).
5. FalkorDB stores primitives/arrays only — structured fields (e.g.
   `location`) are written as lossless JSON strings.

Foreign nodes (any node without `seeded = true`) survive reseeds; graphs other
than the session's target are never touched (`test_hosting` guarded structurally;
integration tests additionally verify `db.list()` before/after equality).

## Fixture

`fixtures/demo-fixture.json` implements DATA_CONTRACTS §6 exactly (16 nodes,
14 edges) — `pub-mehra-2020` (+ real retraction record and verified notice)
are `isSynthetic:false` with values verified live on 2026-10-18
(see `docs/research/mehra-notice-verification.md`); everything else is
`isSynthetic:true` labeled `FICTIONAL / GUIDED DEMO`. See
`fixtures/README.md` for full provenance rules, the announcement-vs-record
date distinction, and the related-but-never-merged Expression of Concern.

## Impact traversals

- `impactPathFromSupportedClaims` — verified notice → publication →
  `role='supporting'` citation use (with `CITATION_USE_SUPPORTS_CLAIM`) →
  claim → dependent conclusion (optional). Rows carry review flags
  (`direct_evidence_review` / `indirect_evidence_review` — always "needs
  review", never a verdict).
- `historicalSafetyCheck` — proves historical-discussion claims (role=
  `historical`, `MENTIONS_HISTORICALLY`) never leak into the flagged path,
  and no historical-role citation use also claims SUPPORT.
- `unresolvedNonPropagationCheck` — `ref-lee-2020` keeps `POSSIBLE_MATCH`
  only: zero confirmed matches, zero paths to claims/conclusions from the
  occurrence or its candidates. `deferReferenceOccurrence` records a Skip as
  `deferred`, which stays non-resolved and non-propagating.

## Tests

```bash
cd server
npm install
npm test                    # unit (47): no credentials, no network
AFTERSHOCK_ENV=/path/to/.env npm run test:integration   # live FalkorDB (6)
```

- Unit (credential-free): fixture↔contract §6 identity/enum/provenance
  validation, seed-plan compile + determinism + rejection cases, credential
  no-leak error guarantees, parameterization guard red/green, timeout policy,
  source-safety scans (no `test_hosting` references, no prints, env
  isolation).
- Integration (smoke graph `aftershock:demo-smoke` only): seed → counts →
  idempotent no-op → §7 invariants 1–3 → drift self-heal with foreign-node
  survival → cleanup with `db.list()` before/after equality. Skips
  gracefully when `FALKORDB_*` credentials are absent (CI).

## Environment variables (server-side only)

| Var | Meaning |
|---|---|
| `FALKORDB_HOST` | instance host (required unless `FALKORDB_URL`) |
| `FALKORDB_PORT` | instance port (default 6379; cloud uses 55370) |
| `FALKORDB_USER` | ACL user (default `falkordb`) |
| `FALKORDB_PASSWORD` | password (required unless embedded in `FALKORDB_URL`) |
| `FALKORDB_URL` | `redis://user:pass@host:port` fallback |

## M3 follow-ups (handoff)

- Live-bibliographic re-check automation (`POST /publications/:id/verify`)
  over the notice `sourceUrl`/PMC mirror; reconcile `titleStatusAsRecorded`.
- Unify synchronous verification pipeline stages (§4 stage list) so seeded
  fixture content transitions into M3 `AnalysisRun` records when the real
  analyzer runs.
- Review-case/decision layer (ReviewDecision, RevisionProposal) on top of
  these traversals; unreviewed seeded edges stay `reviewState:'unreviewed'`.
- Netlify `/seed` function should call `seedGraph(session)` with
  `graphName: 'aftershock:demo'`, guarded by server secret + rate limit +
  method guard (never expose raw Cypher/reset).
- Consider `matchConfidence` on `POSSIBLE_MATCH` when re-confirming
  candidates; confirmations must create `OCCURRENCE_MATCHES_PUBLICATION`,
  never weaken POSSIBLE_MATCH semantics.
