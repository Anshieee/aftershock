# M7 — Research Workflow Refinement — Execution Plan (2026-10-19)

Design of record for M7. Written by the orchestrator from a full read-only inventory of
frontend + backend (commit `a397c0e`) and a re-read of `docs/MILESTONES.md` and
`docs/KNOWN_LIMITATIONS.md`. M7's goal: make existing capabilities work together as a
coherent research process — no unrelated tools, no UI redesign, no invented data.

## Hard integrity constraints (unchanged, binding)

- No fabricated passages, page layouts, snapshots, or "discovered" results. The manuscript
  full text is NOT stored anywhere (`contentStored:false`); the only passage records are
  the demo graph's `Claim`/`Conclusion`/`CitationUse`/`ReferenceOccurrence` nodes with
  recorded `location` metadata. The Reader shows **these**, labeled as such — never a
  reconstruction of the original PDF.
- Reader is **read-only**. No state modification, no graph writes.
- Find Evidence stays read-only: candidates never persist; nothing becomes "support".
  No researcher-assessment recording in v1 — no safe, auditable persistence path exists
  for Crossref candidates (documented; see KNOWN_LIMITATIONS §Find Evidence).
- Exports remain genuine snapshots of recorded information; never block on unfinished
  review; never regenerate or overwrite original manuscripts.
- Date semantics stay separate (fixture `dateDistinctions` rule): notice publication
  (`publishedDate`) vs notice record date (`noticeRecordedDate`) vs `detectedAt` (first
  recorded by Aftershock — in the demo this is the seed timestamp; never call it "live
  discovery") vs review `decidedAt` vs analysis `startedAt/completedAt` vs export
  `generatedAt`.
- `EvidenceAssessment`/`EvidenceSource` labels are contract-only (zero instantiation, no
  read/write paths). M7 does not write graph nodes for external bibliographic records.
- No new shared-file churn without ownership (below).

## Priority A — Evidence Reader (full reflow), read-only

**Data reality:** no new endpoint required. `GET /graph-edges` already returns every
seeded node with its properties (claim/conclusion texts, citation-use `excerpt` +
`role`, reference-occurrence `rawText` + `resolutionState`, provenance fields), and
`src/lib/demoImpact.ts` already derives flagged (direct + indirect) / historical /
unresolved determinations client-side. Reuse both; do not reimplement flagging logic.

**Deliverable:** new route `/reader` (page `EvidenceReaderPage.tsx`), reachable as a
destination (not a sixth primary nav area — IA rule in `Layout.tsx`).

Acceptance criteria:
1. Shows the demo manuscript (`DEMO_MANUSCRIPT_DOCUMENT_ID`) as an ordered reflow: entries
   grouped by recorded section, ordered by recorded page then recorded offset. Locations
   the graph does not record are placed last, clearly grouped, never assigned invented
   positions. Honest header line discloses the basis (e.g., "Ordered from recorded
   section/page/offset metadata — a reflow of recorded passages, not page-perfect
   layout").
2. Flagged passages carry amber "evidence review needed" treatment; conclusions depending
   on flagged claims show the indirect path (`viaClaimId`) alongside; review-decided state
   (sage) renders only from recorded review state. Historical mentions never inherit flag
   styling (excluded, per contract).
3. Selecting a citation use / reference occurrence opens a read-only inspector (reuse
   `ContextInspector` patterns) showing: the cited publication (verified-real record
   badge when `isSynthetic:false`), the verified publication notice linkage
   (`PUBLICATION_HAS_NOTICE` → notice type, publishedDate, sourceUrl), and the specific
   relation type (supports / mentions historically / possible match) — relation types
   never conflated.
4. Each flagged passage links to its Review Queue state (`/review-queue` case; reuse
   existing caseId = node id) and the reader link required in AC-1 returns to the queue
   item.
5. Reading-position return: opening the reader with `#p-<node-id>` or `?focus=<node-id>`
   scrolls to and briefly highlights that passage; "back" affordances use browser history
   so the position persists on return where practical (no session-storage persistence
   claim beyond what works).
6. Public synth labeling: `FICTIONAL / GUIDED DEMO` disclosure on the manuscript and all
   synthetic content, real-record attribution on real records; honest load/empty/error
   states (no fabricated fallbacks).
7. Focused unit tests (ordering determinism, flagged/indirect/historical/unresolved
   rendering, disclosure text, focus-scroll behavior, tolerance for string-vs-object
   `location` JSON) + new `e2e/reader.spec.ts` (route mount, disclosures, flag semantics,
   review-queue linkage presence). Honesty regexes/tests NOT weakened.

## Priority B — Find Evidence ↔ review workflow connection

**Data reality:** `findEvidence(claimId)` prepare mode already returns claim text,
concern summary/direction, `manuscriptId`, `suggestedQuery` — no API change.

Deliverables:
1. `FindEvidencePanel` gains an **origin context**: opening from a non-review location
   (DemoResultsPage affected-claim rows) shows "From: <claim/conclusion label> · Return"
   context header, and on close restores the originating focus (scroll/back-stop) where
   practical.
2. Panel header links back to the Review Queue for the same case (claimId = caseId) —
   same institution as the queue page's own links.
3. Panel content requirements (already largely true — verify + keep verbatim): original
   claim + concern visible alongside candidate list; per-candidate `relevanceBasis`
   shown where present; relationship `unverified` fixed-status row unchanged; DOI links
   out; no "add/confirm/record" affordances; empty/timeout/429/503 honest states.
4. Unit tests for the origin header + return behavior; extend e2e coverage with the
   results-page mount (stubbed functions per existing spec pattern). No api.ts change.

## Priority C — Revision Pack & report refinement (server-side)

Files of record: `server/reportExport.mjs` (+ handler tests). DOCX/PDF render polish
inside existing binaries handled in the same files. No new endpoints, no new persistence.

1. Revision Pack (DOCX): clearer original-vs-proposed side-by-side (distinct labeled
   blocks: "Original (recorded, immutable)" vs "Proposed revision (draft)"),
   `acceptanceStatus` (draft until human action; never implied as applied), rationale, review decision trail,
   unresolved-reference count + list, snapshot/version block (`analysisVersion:export-1`,
   `seedVersion`, `generatedAt`), limitations verbatim.
2. Report (PDF): readability improvements (heading hierarchy, spacing, section ordering)
   without changing data sections; verbiage must remain guard-clean (no verdict words).
3. Verify (and keep) correct analyses: report/revision-pack version details props already
   assembled are rendered (correct analysisVersion, snapshot dates, review-state status).
4. Explicit limitations + incomplete coverage stay prominent (no rewording that implies
   completeness).
5. Unit coverage: snapshot block ordering, revision-pack section presence, absence-of-
   proposal honest rendering, unchanged data contract.

## Priority D — Impact Replay & historical comparison (modest, honest)

**Data reality:** `/activity` events already carry the five distinct date kinds and
review before/after states; there are NO historical graph snapshots or export history —
must not be invented.

1. Activity page: explicit **date-kind labeling** — every event shows its kind ("Notice
   published", "First recorded by Aftershock", "Human review recorded", "Analysis", etc.)
   with provenance where carried; demo `detectedAt` = seed time must be labeled "First
   recorded by Aftershock (demo seed)" — never implies scanning.
2. Review-decision events render before → after state (data already present) in both the
   event list and (nice-to-have) a per-case filter.
3. A short "Report snapshots": the export payload's `generatedAt`/`snapshotTakenAt` are
   shown AT export time on the Export page result (they already are) — no historical list
   is fabricated; the page discloses that no prior-export history is persisted.
4. If the workflow requires case filtering server-side, extend `GET /activity`
   (optional `caseId` read-only filter) — propose a data-contract note for orchestrator
   review first; no write paths. Otherwise keep client-side filtering.

## Priority E — Workflow cohesion (woven into A + B, not a separate redesign)

- `/reader` entry: Investigations page card affordance for the demo manuscript; Review
  Queue/Results already cover other hops; reader header offers Flow path to
  Review Queue and (loop) back.
- Nav: Reader surface appears in the/shared "explore/destination" area per the existing
  IA rule; `/overview` remains deliberately untouched (backlog item).
- Each page that generates results carries an honest next-step link within the existing
  flow (Reader → Review Queue → Find Evidence (from B) → Export).
- NO broad redesign, no new nav group, no changing the existing 5+1 layout.

## Wave 1 — assignments (parallel, isolated worktrees)

| Agent | Tier (model) | Branch / worktree | Owned files (exhaustive) | Depends on |
|---|---|---|---|---|
| A — Evidence Reader | MEDIUM (`glm-5.3-flash-free`) | `feat/m7-evidence-reader` / `aftershock-wt-m7-reader` | `src/pages/EvidenceReaderPage.tsx` (new), `src/pages/__tests__/*reader*` (new), `src/App.tsx`, `src/components/Layout.tsx`, `src/lib/demoImpact.ts` (pure helpers only; keep existing exports byte-compatible), `src/pages/InvestigationsPage.tsx`, `e2e/reader.spec.ts` (new) | none |
| B — Find Evidence origin | MEDIUM (`glm-5.3-flash-free`) | `feat/m7-findevidence-origin` / `aftershock-wt-m7-findevidence` | `src/components/FindEvidencePanel.tsx`, `src/components/FindEvidencePanel.test.tsx`, `src/pages/DemoResultsPage.tsx`, `e2e/find-evidence.spec.ts` | A's reader exists only for integration; B does not depend on it (panel + results first), then wires reader linkout branch |
| C — Export refinement | MEDIUM (`glm-5.3-flash-free`) | `feat/m7-export-refinement` / `aftershock-wt-m7-export` | `server/reportExport.mjs`, `netlify/functions/export-*.mjs` (if needed), `server/__tests__/*` for export suites, server `ExportPage.tsx` only if copy needs the snapshot refs AC | none (server-only) |
| W — Replay dates + activity | MEDIUM (`glm-5.3-flash-free`) | `feat/m7-replay-dates` / `aftershock-wt-m7-replay` | `src/pages/ActivityPage.tsx`, `src/pages/__tests__/*activity*`, `server/activity.mjs`, `netlify/functions/activity.mjs` (+ tests), `src/lib/api.ts` (+ typed parse tests) **only** if `GET /activity?caseId` filter is required (board variant D-4) | D-4 optional; else server untouched |
| D — QA/Integrity review | reviewer | on main after branches land | read-only review, focus: integrity language guard (`VERDICT_LANGUAGE`), synthetic/real attribution, relation-type discipline, honesty states, a11y of new surfaces | A·B·C·W |

Shared-file NOT touched by anyone in wave 1 (orchestrator owns integration): `tailwind.config.js`,
`netlify.toml`, `falkordb/` connection code, DATA_CONTRACTS (unless W does D-4, which must propose a
diff for my review), `package.json`.

No agent copies `.env` into a worktree; unit tests skip graph integration without it
(integration runs at the orchestrator's gate from the main repo). No agent deploys,
merges, or force-pushes; branch commits only.

## Wave 2 (after wave 1 lands + review): 
- Review Queue reader-mode links (`/reader#p-<caseId>` and to find evidence from queue
  items is already there), Graph "Context Inspector → reader" hop, `/library`-analyze
  cross-links, per-case activity filter (only if D-4 was not done), replay before/after
  prompts, KNOWN_LIMITATIONS updates, e2e UX regression additions.

## Integration gate (orchestrator, after wave 1)
- Merge order: A → B → W → C (frontend-first minimizes conflicts; C is disjoint).
- Full gates from main repo: unit suites (root + server), typecheck, build, toml guard,
  hosted-acceptance e2e vs local static harness (temporary `#static` pin recipe; pin must
  be reverted + guard re-run), real-graph integration smoke + production deploy, then
  prod verification + screenshots + BUILD_STATUS/MILESTONES/KNOWN_LIMITATIONS updates.
- NO production deploy of a wave without the full gate; docs-only pushes don't deploy.
