# AFTERSHOCK — MASTER OPENCODE BUILD HANDOFF

**Status:** Approved product direction; begin execution.  
**Prepared:** 18 October 2026.  
**Recipient:** Existing OpenCode `orchestrator` primary agent, running the user's configured **GLM Flash 5.3** route.  
**Mission:** Design the technical implementation and autonomously deliver a working, publicly deployed, scientifically honest **Aftershock** hackathon application through the user's already-configured OpenCode subagents and MCPs.  
**This file is an execution brief, not a request for more product brainstorming.**

---

## 0. START HERE — INSTRUCTIONS TO THE ORCHESTRATOR

You are the lead engineer, technical architect, integration owner, and task coordinator. **Start building.** The product and UX choices in this document are the source of truth. Do not restart UX discovery, pitch alternative products, switch away from FalkorDB, or wait for another grand planning exercise. Choose sensible implementation details autonomously, document material technical decisions, and execute milestones with working deployed proofs.

The user confirms the OpenCode environment and MCP setup are complete, including Netlify and FalkorDB MCP. **Do not ask the user to repeat setup or paste credentials.** Verify actual tool connectivity, agent names, relevant skills and the current working repository safely. If a connection is broken, diagnose it within your access. Ask only when a secret, login, payment, public deployment approval, or a truly consequential unresolved choice requires direct human action. A user saying everything is set up is not authorization for billable provisioning or sharing private data.

**Fixed operational decisions:**

- One primary OpenCode session, using the configured **GLM Flash 5.3** model route as orchestrator. Do not substitute Astra as orchestrator.
- Existing named OpenCode subagents have **independent child sessions and contexts**, visible within OpenCode. Separate terminal/desktop windows are **not required**. The user does not need to inspect every child session.
- Parallel subagents are useful, but independently owned code and limited concurrency matter more than agent count. Start with at most **three** implementation tasks at once.
- Use the user's existing `planner`, `researcher`, `coder`, `frontend`, `backend`, `database`, `devops`, `docs`, `reviewer`, `security`, and `tester` agents; map assignments to their current capabilities instead of overwriting the global definitions.
- Use established community **skills** when appropriate rather than creating a new suite of elaborate prompt packs. Preserve project-specific scientific and product invariants in short, authoritative project instructions and executable tests.
- **GitHub** is the canonical source-control and collaboration system. Prefer the configured GitHub MCP for issues, branch/PR actions and supported file operations; use ordinary Git where necessary for reliable worktree synchronization or conflict resolution. Do not overwrite stale remote work.
- **Netlify** is confirmed frontend host and its MCP is configured. Deploy a working skeleton early and verify each milestone against hosted previews. Do not defer hosting to the very end.
- **FalkorDB Cloud Free** is the chosen graph service and MCP is configured. **No Railway, paid graph tier, new paid hosting, or additional permanent infrastructure by default.** A separate paid service requires explicit user approval.
- MCP inspection of FalkorDB may be read-only. The application must use its own correctly authorized server-side write path for real graph mutation. **Never replace FalkorDB with a mocked or decorative graph.**
- Don't require a constantly running local backend or local database. Local unit tests, static checks, disposable build tools and worktrees are fine; deploy remotely at each integration checkpoint.
- All application stack choices beyond the fixed hosts/database are yours to research and select pragmatically. Record concise architecture decisions; avoid overengineering.
- No fabricated scientific studies, nonexistent paper passages, invented graph edges, pretend successful scans, simulated production responses or false test claims. A guided synthetic manuscript is explicitly permitted if labeled.
- Keep the primary UI exceptionally approachable: one clear next action, progressive disclosure, accessible interfaces, and a sophisticated research graph available on demand.

**Beginning of work (do in order):**

1. Audit the repository, available agent invocation methods, global instructions, existing installed skills, and usable MCP names **without dumping private configurations or secrets to logs**.
2. Confirm Netlify and FalkorDB tool reachability, the deployment site's status, the GitHub repository, free-tier constraints, and whether FalkorDB is empty; do **not** print credentials.
3. Write `docs/decisions/0001-architecture.md` explaining the minimum viable application stack, Netlify function/job strategy, FalkorDB connectivity, connection security and demo-only restrictions. In case of known free-tier connectivity restrictions, implement a clear and safe fallback/status rather than pretending secure production support.
4. Write the shared entity/edge schema, API and event/status contracts, synthetic demo fixtures, scientific acceptance tests, and milestones before large parallel implementation.
5. Delegate bounded tasks to child-session specialists. Integrate in small PRs; ensure real running hosted checkpoints.
6. Proceed autonomously to a tested P0 end-to-end demonstration; build P1 as time/resources permit. Report concrete evidence, deployed URLs and honest limitations.

## 1. PRODUCT MISSION & POSITIONING

**Name:** Aftershock (formerly Citation Aftershock).  
**Category:** Evidence-integrity and research-impact workspace.  
**Audience:** Professors, thesis writers, literature-review authors, students, research assistants and teams.

Aftershock detects official changes to scientific publications, examines how a researcher's own documents cite those publications, and traverses **claim-level evidence dependencies** to identify passages and downstream conclusions requiring human review. It presents the reasoning and sources in a real FalkorDB knowledge graph and helps the researcher decide how to respond. AI may propose analysis, find relevant publications and draft suggested revisions, but **humans control consequential scientific decisions**.

Differentiation versus a generic retraction badge or citation-alert service:

> **An official source change → its specific citation use in my manuscript → the affected claim → dependent conclusions → human-reviewed outcome → clear report.**

Do not confuse *cites*, *discusses*, *supports*, *contrasts*, *reuses data from*, *depends on*, and *has a publication-status notice*. The product **does not certify the scientific truth** of a claim. A retracted paper may be cited historically without compromising the citing document.

Principles:

1. **Accuracy over drama:** Transparent uncertainty and inspectable provenance. A flagged review is not a finding of falsity.
2. **Researcher control:** Source documents remain read-only; AI drafts are suggestions; consequential decisions require humans.
3. **Graph is the product's reasoning substrate:** Real stored records, traversals and source-linked relationships, not a cosmetic constellation.
4. **Simple by default, powerful on demand:** One task at a time, nontechnical wording, readable documents and obvious recovery paths.
5. **Historical honesty:** Preserve what was known, when notices were published/discovered, when analysis ran and when a human decided.
6. **No hidden limitations:** Missing full text, ambiguous matching, unavailable services and incomplete coverage are explicitly shown.

## 2. FIXED VISUAL & UX DESIGN LANGUAGE

- **Editorial, retro-academic aesthetic**, inspired by the user's Advercase typography reference: expressive licensed serif for brand/logo/display titles; readable modern sans-serif for paragraphs, controls, graph labels and dense information. Verify licenses; use legal substitutes if necessary.
- Warm paper/cream backgrounds, charcoal/dark-ink text, restrained purple/indigo for navigation/brand/focus, amber for review work, muted red for verified formal source notices, subtle muted blue for uncertainty and **sage green `#658C79` for human-reviewed states** (e.g. pale green surface `#E2EFE7`). Green must **not** imply the claim was verified true or a pending manuscript change applied.
- High contrast, careful spacing and hierarchy, light-mode first; optional Obsidian-inspired dark theme if it doesn't displace critical features.
- Avoid generic AI-dashboard visual clichés, excessive KPI cards, glassmorphism, fake data, distracting animations, visually noisy graphs or dense three-column default layouts.
- Aim for WCAG 2.2 AA where applicable: clear labels; 16–18px comfortable reading text; keyboard and screen-reader accessibility; visible focus; generous targets; no hover-only functionality; motion reduction; accessible alternatives to graph and PDFs.
- **Never create an age-based “simple mode.”** The ordinary interface should be intuitive for an infrequent professor and efficient for experienced students. Use progressive disclosure, optional compact density and keyboard shortcuts.
- Responsive: a laptop gets one focused claim by default; compare view is optional; sidebar/inspector collapses; narrow screens get accessible tabbed/stacked reading.

## 3. INFORMATION ARCHITECTURE

Primary sidebar areas (**exactly five**):

1. **Overview** — Attention, recent meaningful source changes, continuation of unfinished work, import prompt, concise review coverage.
2. **Investigations** — Focused citation/claim-impact path, graph-based evidence reasoning, source inspection and transitions to review.
3. **Library** — Imported research documents, bibliographies, DOI entries, publications, document versions, optional collections, references and unresolved items.
4. **Review Queue** — Human tasks, risk-based prioritization, Review Overview, focused Evidence Reader, alternatives and revision workflow.
5. **Activity** — Human-readable history, document versions, source-change dates, audit events, reports and Impact Replay.

Visible secondary navigation destination: **Knowledge Graph**, with full global view. Investigations contains its own focused graph. The Evidence Reader is a **shared workspace**, not a sixth primary sidebar area. Export is accessible from Review Overview, Investigations and Library rather than another primary page.

Universal **Context Inspector**: selecting a document, publication, claim, citation use, graph edge or conclusion opens the same conceptual inspector with exact source and passage, notice state, citation role, impact reasoning, verified vs inferred origin, links, status and context-specific next action. Never allow contradictory interpretations across different pages.

Research collections: optional. Generate a sensible name on initial import; All Research and collection filters; publications can appear in multiple collections. Collections should not be mandatory before first import. Preserve document-version and collection associations.

## 4. FIRST-RUN IMPORT & ANALYSIS — ACCEPTED BEHAVIOR

**User selections already final:** First-run landing = `import`; after import = `automatic`; review prioritization = `risk`.

Landing:
- Attractive, simple import-first page: **Choose a document** primary; drag-and-drop also supported; **Bibliography** and **Single DOI** secondary; **Try guided example** visible without requiring an account.
- Do not advertise that importing only a DOI or bibliography produces passage-level dependencies for the user's own claims. For claim-level impact, original research text/citation contexts are needed.
- Proposed inputs: PDF, DOCX and TXT only as truly supported; clearly indicate format and size limits rather than overpromise.
- Show selected file name/size/format, replace/cancel controls. Use native file picker for accessibility.
- Near the upload action, explain that analysis starts automatically; the source remains unchanged; clearly disclose real processing/third-party transmission, retention, privacy and limitations based on the implemented deployment. **No fictional privacy assurances.** Additional sharing or provider authorization, if any, requires explicit consent.

Separate stages:
1. File selected/validated.
2. Uploading (true progress or honest indeterminate state; cancel upload).
3. Uploaded (analysis automatically begins).
4. Parsing document and locating references.
5. Resolving identifiers and checking verified notices.
6. Classifying citation uses and proposing evidence dependencies.
7. Writing inspectable provenance-backed graph records and preparing tasks.
8. Results, including verified matches, uncertain matches, affected claims and partial failures.

All steps must have truthful status. No fabricated percentages, fake streaming AI logs or invented availability. Browser navigation should not silently destroy completed work if storage permits; any lack of durability on FalkorDB Free must be disclosed.

**Research Results**: show detected/matched/unmatched count, verified notices, attention requiring human review, and what remains unknown. Primary CTA **Review affected evidence**; secondary **Explore graph**, **View library**. “No notice found” must never imply scientific reliability or complete global coverage.

**Skip for now** on an ambiguous citation:
- Preserve original citation text and document location, candidate records and uncertainty; mark reference **Unresolved / Deferred**.
- Do not select either candidate, do not produce a confirmed citation edge and do not claim the selected candidate's retraction affects the manuscript.
- Analysis proceeds for other references; unresolved item appears in Library references, Review Queue source matching and the graph as an **unresolved reference** linked only by appropriately marked candidate relationships.
- A potentially retracted candidate may elevate *matching priority* but must be labeled **possible source-status issue — verification required**.
- Later actions: compare candidates, confirm one with provenance, choose none, or leave unresolved. On confirmation, re-evaluate only relevant claims/graph paths; preserve human choice history.

Failures: unreadable PDF, partial extraction, missing references, wrong or multiple DOI matches, external source unavailable, no authorized full text, interpretation uncertain, duplicate import, interrupted process, free graph reset. Preserve reliable partial information and offer targeted retry; never turn these into a bogus success or silently lose context.

## 5. OVERVIEW AND LIBRARY

**Overview:** Important attention card and continuation rather than KPI-dense dashboard. A new user sees import; a returning user sees **Continue your work**, changed publication notices, outstanding review tasks and honest scan limitations. Important material new findings appear here rather than requiring an Activity-log search.

**Library:** Clear cards/list for research documents and publication records; import provenance; status, versions, collections, citations and unresolved reference filters. Selecting a document can lead to Review Overview, annotated manuscript, investigations or the focused inspector. A DOI-only record should not masquerade as a parsed manuscript.

Reimported Draft B can be linked to Draft A after user confirmation. Avoid concluding an issue is resolved just because a passage disappeared; reassess semantically equivalent claims and citations. Original versions remain distinct where durable history is supported.

## 6. KNOWLEDGE GRAPH — CENTRAL DIFFERENTIATOR

The graph must be **actual FalkorDB data**. Suggested high-level entity types (architect may refine names/contracts while preserving meaning):

- `ResearchDocument`, `DocumentVersion`, `Collection`
- `ReferenceOccurrence` (exact local text and location), `Publication` (DOI and canonical identity), `SourceNotice` (notice type, date and verified URL)
- `Claim`, `Conclusion`, `CitationUse` (specific citing passage + role)
- `EvidenceAssessment`, `ReviewDecision`, `RevisionProposal`, `AnalysisRun`, `EvidenceSource`
- Where verifiable: `Dataset`/`Study`/`EvidenceFamily` for provenance and reused data.

Example conceptual edges (never conflate them):
- `DOCUMENT_HAS_REFERENCE`, `OCCURRENCE_MATCHES_PUBLICATION` **confirmed**, `POSSIBLE_MATCH` **explicitly unverified**
- `PUBLICATION_HAS_NOTICE` verified using authoritative record
- `CLAIM_HAS_CITATION_USE`, `CITATION_USE_REFERENCES_PUBLICATION`
- `CITATION_USE_SUPPORTS_CLAIM`, `CONTRASTS_CLAIM`, `MENTIONS_HISTORICALLY`, `USES_METHOD_FROM` or `ROLE_UNKNOWN`
- `CONCLUSION_DEPENDS_ON_CLAIM` with evidence, scope and confidence/provenance (not automatic truth)
- `STUDY_USES_DATASET`, `PUBLICATION_REPORTS_STUDY`, `REVIEW_SYNTHESIZES_STUDY` only when verified/qualified.

**Every material edge needs** stable identifiers, origin/source URL or file location where permitted, supporting excerpt or evidence pointer, `provenance_kind` (observed, source-verified, human-confirmed, model-proposed, unresolved etc.), classification rationale, timestamps, analysis-version and review state. Confidence scores, if ever used internally, are not reliability certifications. Don't promote AI-proposed relations into confirmed facts on display.

Source notices are different from reviewer decisions and scientific claim validity. Graph visualization must have legends and clear styles for direct support, contextual historical mention, indirect dependency and uncertainty. No graph association solely for visual effect. Show actual graph records upon clicking nodes/edges.

Graph UX: spatial zoom/pan, filter, search, focus and local/global modes; expand one/two hops, highlight evidence path and inspect every edge. Use a readable equivalent list/table and universal inspector for keyboard/screen-reader users. Prefer sober movement and reduced-motion support. Historical graph replay uses recorded state, or explicitly labeled reconstruction, never invented past database snapshots.

Core graph acceptance test: verified retracted study → **direct supporting** citation → Claim A → dependent Conclusion C flags reviews; a *historical-discussion* citation to same study must NOT falsely flag its associated Claim B; unresolved Lee et al. reference must NOT become a confirmed publication connection.

## 7. REVIEW OVERVIEW + ANNOTATED PAPER

**Default Review Overview** is a calm entry point: “Two passages need your attention,” prioritization and easy **Start reviewing**, with a prominent secondary **Read annotated paper** card. Show progress and a small paper minimap, not overwhelming analytics. Separate scientific evidence tasks from reference-matching tasks. Risk prioritization favors impactful dependencies and ambiguous critical links, without blocking routine work.

**Full-paper annotated viewer** is the bird's-eye view:
- Read original manuscript from start to finish with exact passage-aligned highlights and a narrow colored page/section minimap.
- Offer **both** `Original PDF` layout with overlays and `Accessible Reading` reflowed mode. They share source passages and annotations, but original document bytes remain unchanged. Preserve page coordinates when reliable; disclose extraction/OCR limitations instead of placing inaccurate highlights.
- Modes `All annotations`, `Needs attention`, `Clean reading`; next/previous issue controls; section outline and page jumps. No flood of green highlights across untouched text.
- Highlight taxonomy: amber = needs review; muted blue/dotted = uncertain; muted red = verified notice on source; **sage green `#658C79` = human reviewed**. A green reviewed marker may coexist with amber **revision pending**.
- Hover/focus displays 1–2 sentence summary; click/tap/Enter opens context inspector and **Review this claim**. Never make hover the only explanation.
- Opened focused review returns to same scroll/selection in the paper. A flagged passage means **needs review**, not necessarily **needs to change**.

## 8. FOCUSED EVIDENCE READER

**Read-only document. One claim. One explanation. One decision.** The accepted redesign deliberately rejects the previous cluttered always-visible three-column workstation.

Default flow:
1. Display original passage and useful surrounding context.
2. Explain briefly why it needs attention, citing real publication notice, precise citation use and provenance.
3. Show three clear human decisions (below).
4. Save, show success and **Next issue**; do not auto-navigate without user choice.

Under **Inspect evidence**, progressively expose source metadata and authorized text excerpts, official notices and dates, exact relation path, direct vs indirect effect, inspection of alternate evidence and a one-click **Show in graph**. Rich optional **Compare sources** presents two resizable readable panes; reading and evidence-trail views offer concentrated/accessibility alternatives. A universal inspector stays consistent across these.

If no authorized full text, show metadata, notice and publisher link; no invented quotes. Highlight exact source span only if recovered from source material reliably.

Read-only means NEVER rewrite or save changes into original uploaded PDF/DOCX. Proposed revisions are separate drafts and must be labeled as such.

## 9. REVIEW DECISIONS, REVISIONS & ALTERNATIVE EVIDENCE

Primary review outcomes:
- **Revision needed:** Reviewer recommends changing the passage. Human review recorded, follow-up **revision pending**; optional AI-assisted editable suggestion draft.
- **More evidence needed:** Reviewer records investigation task; case remains open and uncertain. Offer common missing-evidence reasons plus notes.
- **Not affected:** Reviewer explains why this specific citation use isn't compromised (e.g. historical discussion). **Explanation required**; close only the relevant concern, not certify the claim.
- **Evidence updated:** Contextual outcome after inspecting and attaching independently assessed evidence; sources, provenance and reviewer assessment required. Attaching a candidate by itself doesn't close a review.

Keep orthogonal states separate: `awaiting_review`, `review_recorded`, `further_investigation`, `revision_pending`, `draft_prepared`, `reported_applied_externally`, `resolved`, and possible `reopened_due_to_new_information`. One case may be green **reviewed** while amber **revision pending**. Copying a draft is NOT applying it. A declaration “I updated my manuscript elsewhere” is user-reported, not independently verified. New imports can be compared and rechecked.

AI-suggested revision process: show original and proposed passages with clear evidence rationale; researcher may edit **suggestion only**, copy or export, discard, later report external application. Never invent evidence, claim a contradiction is solved, or change original wording without explicit action. Suggest qualification/removal when no sound independent support exists.

**Find Evidence** (not an overwhelming chatbot): select the exact claim, confirm whether searching for evidence on the broader question or verifying the historical original study, then show candidate publications with short relevance explanation. Show supporting, contrasting, context-only and uncertain candidates; no one-click “trusted” citation or bogus credibility percentage. The user inspects outcomes, populations, methods, full-text availability, shared dataset/provenance and official status; attaches **assessments**, not proof. Return to the original review with context intact.

Independence is not established by different paper titles or absence of a graph edge. Review articles, preprints, duplicate reports and primary studies reusing the same dataset can be grouped into **evidence families** only on sourced or qualified relationships. Never count five papers as five independent confirmations without verifying data origins. If no relevant results, state the search coverage and limitations; don't assert no evidence exists.

## 10. REPORTS & EXPORTS

Offer three user-facing deliverables, accessible from review, investigation and Library:

1. **Evidence Impact Report** (default PDF; optionally editable format): executive summary, scope/coverage, verified notices, direct and downstream claim impacts, human decisions, pending actions, unresolved citations, provenance, and date distinctions. Concise first page, readable appendix.
2. **Revision Pack** (DOCX preferred; PDF optional): original passage, location, proposed replacement, rationale, supporting/contrasting sources, reviewer notes and explicit **NOT APPLIED** state. Original manuscript untouched.
3. **Annotated Manuscript**: separate export preserving original PDF layout with annotation references, and an accessible text/reflowed alternative (e.g. accessible HTML/PDF as feasible). Consistent marker legend and non-color explanations. Disclose limitations of unavailable structural extraction.

Advanced optional **Audit/Research Data Export** can carry detailed source and edge provenance; avoid claiming the screenshot itself contains full graph proof.

**Never block export just because work is unfinished.** All exports must prominently disclose overall review status, unresolved counts, last source-check timestamps, open follow-up tasks and relevant extraction/search limitations. Users may hide detailed appendices but not the existence of unresolved work. “Review workflow completed” is not “scientifically certified.” Record export snapshot/version; don't silently change old exported files when new research appears.

Privacy: report preview identifies whether manuscript excerpts, notes, reviewer identities or other sensitive content are included; detailed private notes are opt-in. Respect third-party content licenses and permissions. If an export format cannot be correctly produced, disable it honestly instead of downloading a fake file.

## 11. ACTIVITY, TEMPORAL HONESTY & LIFECYCLE

Activity default = human-readable timeline: research imports, verified source notices, first detection, analysis outcomes, human decisions, revisions prepared/reported applied, unresolved matches, document versions and exports. Click event to inspect the original source, passage, review or graph path. Avoid noise from routine metadata refresh.

Important timestamps must remain distinct:
- Source notice's **actual publication date**.
- **First detected** by Aftershock.
- **Last verified/checked** against source.
- **Human decision date**.
- **Export generated date**.

**Impact Replay** lets researchers compare snapshots of what workspace knew, what review decisions existed and what graph relationships were stored, or a separately labeled reconstruction of historical published events. Do not pretend Aftershock had 2020 workspace snapshots when imported in 2026.

A later material notice can create a follow-up human review, showing what changed and retaining earlier decisions. Routine irrelevant metadata updates don't reopen everything. Reopening is non-destructive and audit-aware. Document version Draft B may be linked to Draft A after user confirmation; previous reports remain historical. Removal must explain real deletion/retention behavior; do not promise irreversible deletion on uncontrolled third-party systems.

## 12. REAL-WORLD GUIDED DEMO — FIXED FIXTURE

Use a **genuine historical publication-status notice**:

- Mehra et al. (2020), *The Lancet*, multinational registry analysis concerning hydroxychloroquine/chloroquine for COVID-19.
- Original publication DOI: `10.1016/S0140-6736(20)31180-6`.
- Retraction notice DOI: `10.1016/S0140-6736(20)31324-6`.
- Journal retraction published **4 June 2020**, following inability to complete an independent audit/verify underlying Surgisphere data.
- Official source links: `https://doi.org/10.1016/S0140-6736(20)31180-6` and `https://doi.org/10.1016/S0140-6736(20)31324-6`.
- **Verify publication metadata and notice content from primary or authoritative records during implementation.** If authoritative retrieval fails, display that limitation; don't synthesize a successful retrieval.

Synthetic research passages (label **FICTIONAL / GUIDED DEMO** in UI and fixture):
- Passage A **supporting**: a fictional author's draft relies directly on findings of Mehra et al. as evidence for a treatment-outcome statement → **direct evidence review**.
- Passage B **historical**: mentions the Mehra retraction as an example of research-data verification → **not flagged as compromised supporting evidence**.
- Conclusion C explicitly **depends on Passage A** → **indirect review required**, not automatically false.
- Reference D `Lee et al., 2020` is **ambiguously matched** → user can **Skip for now**; no candidate becomes verified.
- Optional Study E / Review F / Dataset X **synthetic evidence family** shows how two publications may share the same dataset; use only explicitly fictional labels unless replaced by independently verified real sources.

Expected demo steps: import or **Try example** → automatic transparent analysis → verified notice + graph traversal → differentiate supporting/historical/unknown → Review Overview → annotated full paper → focused reader → human revision recommendation → green reviewed + amber pending → honest report export → Activity and replay. At least one graph path must demonstrably come from the actual hosted FalkorDB database; reading seeded JSON alone is NOT fulfillment.

**Real scholarly source records and synthetic document claims must be visually and semantically separated.** Don't attribute synthetic sentences to real authors.

## 13. DEPLOYMENT, SECURITY & FREE-TIER BOUNDARIES

**Required initial footprint:**

- Frontend: **Netlify**, deployed via existing connected MCP and GitHub integration.
- Bounded server-side API/processing: prefer **Netlify Functions** if viable; the orchestrator chooses exact backend approach after checking current limits, package compatibility and service availability. Long-running work might require a staged/degraded demo path if it exceeds Netlify limits; do not silently add billable infrastructure.
- Graph: **FalkorDB Cloud Free** (already set up). Use the real service, not local-only graph or browser direct DB connection.
- Repository: GitHub; reproducible synthetic fixtures, tests, CI, deployment configs.
- No Railway, Fly.io, paid FalkorDB upgrade, Supabase billing, cloud VM or new persistent external service by default.

**CRITICAL FREE-TIER SECURITY/DURABILITY RESTRICTIONS:** FalkorDB's official Free comparison lists **NO TLS**, **NO continuous persistence**, **NO automated backups**, **NO HA**. Treat the graph as **disposable**, public-demo **synthetic data only**. Don't route private manuscripts, real unpublished research, sensitive source passages, private review notes, authentication secrets or confidential user documents through this unencrypted graph connection. Ensure the website does not misrepresent uploads as secure and durable personal research. Use a conspicuous **demo / synthetic-only** constraint and disable or guard unsafe user-upload paths on the public instance until secure storage and transport are available. Ordinary credentials are still used to connect to the graph; assess interception and exposure risk of any publicly reachable unencrypted connection before launch, minimize privileges/exposure, never log credentials, and document residual risk.

Graph data loss on restart is possible: implement an **idempotent fixture seeding/rebuild** strategy using versioned, non-sensitive fixtures and controlled server-side actions. Verify the displayed graph has actual FalkorDB records before presenting a completed demo. Don't put real/private manuscripts into GitHub as seed data. Do not claim durable personal Review Queue/Activity behavior on the disposable instance; demonstrate these workflows with live session state and/or explicitly demo-only reproducible synthetic data. Any persistence beyond the free tier must be justified and approved if it incurs cost.

Do **not** connect FalkorDB directly from the browser. Secrets belong in server-side protected environment configuration, not repo, client bundles, screenshots or issue text. Apply CORS, abuse controls, payload/rate bounds, input validation, safe database querying, third-party request timeouts, and logs devoid of document content. Sentry must be scrubbed for private text. Public launch must not include an open unauthenticated graph-write endpoint, seed/reset destructive endpoint or arbitrary Cypher execution accessible to visitors.

The product specification describes a more secure full product. The free demo is a **limited deployment**, not a replacement for those requirements. If safe hosted database connectivity cannot be achieved within the $0 footprint, **surface a clear blocker** with evidence and ask for authorization to change the deployment—do not bypass safety or fabricate a functioning graph.

Consult current official limits, especially Netlify Functions and FalkorDB Cloud pricing/feature matrix, before promising behavior. Netlify doesn't run an always-on graph server. Official references: `https://www.falkordb.com/plans/`, `https://docs.netlify.com/build/functions/configuration/`, `https://github.com/FalkorDB/falkordb-mcp`.

**Licensing:** Inspect font licenses, imported components, third-party publication content permissions and applicable FalkorDB licensing obligations before publicly presenting features. Do not copy commercial design assets or source PDFs without authorization.

## 14. EXISTING OPENCODE ENVIRONMENT: USE, DON'T REBUILD

The user's supplied `OPENCODE_GUIDE.md` describes:

- Global configuration `~/.config/opencode/opencode.json`; global agents `~/.config/opencode/agents/*.md`; shared skills `~/.agents/skills/*/SKILL.md`.
- Primary default `orchestrator`; subagents: `planner`, `researcher`, `coder`, `frontend`, `backend`, `database`, `devops`, `docs`, `reviewer`, `security`, `tester`.
- Already installed global skills include `interview`, `ste`, `better-ui`, `animate`, `agentation`, `codex` and other skills.
- Configured MCPs include `21st`, `appwizzy_projects`, `chrome-devtools`, `filesystem`, `github`, `memory`, `playwright`, `postgres`, `puppeteer`, `sentry`, `sqlite` (previously disabled), `supabase`, and other tools; user confirms **Netlify and FalkorDB MCP are now configured**.

**Reinspect actual current config and tool availability safely**, since the guide may be older than the live environment. Preserve global settings and existing agent files. Prefer project-scoped instructions/skills. Do not modify or disclose the user's unrelated projects. Model route stays user's `GLM Flash 5.3` selection; check the actual OpenCode provider slug when invoking agents rather than guessing.

### 14.1 Delegation and context contract

Each assignment must be a **self-contained child-session task**, containing:

- Precise goal, accepted user journey and why it matters.
- Target branch/worktree, owned directories/files and forbidden shared files.
- Required upstream entity and API contracts, links to relevant sections of this spec, sample fixture IDs.
- Expected tests, safety cases, deployed verification target and measurable definition of done.
- Limits on tools and data; prohibition on private/unrelated files.
- Expected output: changed files/commit or PR, tests actually run with results, deployment link if relevant, evidence of graph query/browser behavior, blockers and next steps.

Subagents must **not** inherit/copy the orchestrator's huge chat transcript. Give a compact requirements excerpt and repo docs. Treat model context as a finite budget (user reports ~262K tokens for GLM): checkpoints in GitHub issues/PRs/docs, short status messages, new child sessions for bounded tasks, and summary handoffs for long work. Require specialists to search code/contracts instead of hallucinating missing facts.

### 14.2 Concurrency and work ownership

- Maximum **three** concurrent implementing specialists initially, only on independent contracts and worktrees/branches.
- Planner/researcher may run read-only tasks; reviewer/security/tester operate independently and should not edit the code they're approving, unless specifically assigned a follow-up fix in a new worktree.
- No concurrent edits to shared contracts/config without orchestration; Astra is NOT involved, the existing `orchestrator` integrates the changes.
- Use GitHub MCP for issue tracking, PRs, branch actions and supported file publication. For large local diffs/binaries, use Git normally where necessary; avoid the unrealistic rule that GitHub MCP replaces all Git transport.
- Integrate frequently; do not let branches drift for hours. Every PR must pass CI before merge. No force-push to shared main or destructive history rewriting.
- Track dependencies, blockers, verification and deployment URLs in a durable `docs/BUILD_STATUS.md` or GitHub project issue, not only in the parent agent's memory.

### 14.3 Suggested assignment mapping

| Existing agent | Primary tasks |
|---|---|
| `planner` | Milestones, interface contracts, task dependencies, scope risk |
| `researcher` | API/source verification, rights/licensing, publication notice research, hosting docs |
| `frontend` | Accessible editorial UI, graph interactions, import/review/annotation experience |
| `backend` | Netlify API, import/analysis flow, publication records, server-side graph integration |
| `database` | FalkorDB entity design, Cypher traversals, seeded fixtures, provenance/read-only MCP audit |
| `coder` | Small cross-area features, glue and fixes with explicit ownership |
| `devops` | GitHub Actions, Netlify deployment/previews, secrets, observability and limits |
| `docs` | Architecture decisions, source attribution, product/operations docs |
| `tester` | CI/browser/a11y workflows, real hosted acceptance tests |
| `reviewer` | Read-only code/architecture review, PR quality gate |
| `security` | Read-only privacy/secret/exposure review and public-demo restrictions |

Scientific integrity auditing is a **mandatory test/reviewer responsibility**; reuse the existing reviewer/researcher/tester/security agents rather than adding yet another elaborate agent unless it demonstrably improves independence.

### 14.4 MCP tool policy

- **GitHub MCP:** canonical issue/PR and repository workflow; publish no secrets or confidential research.
- **Netlify MCP:** deployed site and preview management; do not alter unrelated sites or enable billing.
- **FalkorDB MCP:** read-only verification of actual schema, nodes, edges and query paths. Application writes occur through controlled server-side logic.
- **Playwright MCP:** external browser acceptance tests on deployed Netlify preview/production site.
- **Chrome DevTools MCP:** investigate actual console/network/performance failures.
- **21st Dev:** optional frontend composition references; verify licenses, don't let component kits dictate the editorial design.
- **Sentry:** optional operational errors with PII/manuscript-content scrubbing, if already connected and allowed.
- **Context7:** install only if required for current version-specific API docs and not already available; never blindly use outdated snippets.
- **Memory MCP:** non-authoritative scratch knowledge only; decisions live in versioned docs/issues.
- **Filesystem:** restrict access to relevant project areas where configurable. The guide's `/home/ansh` allowance is overbroad for a project agent. Don't browse unrelated user files.
- **Postgres/Supabase/SQLite/Puppeteer/Appwizzy/AWS MCP:** don't automatically involve in Aftershock; enable only for explicit selected need. Avoid extra services without justification and consent.

Before adding more MCP servers, audit what is already present. Every added server increases capability and exposure, so choose minimal access per specialist. Test dangerous permissions with harmless dry-run denials.

### 14.5 Reuse established public skills, selective installation

Inspect the existing skill inventory first; **do not reinstall globally if already present**. Review versions/licenses and install only useful missing skills, ideally project-scoped. Suggested established collections:

- `anthropics/skills`: `frontend-design`, `webapp-testing`, `pdf`, `docx`.
- `vercel-labs/agent-skills`: `web-design-guidelines`; `vercel-react-best-practices` only **if** choosing React.
- `mattpocock/skills`: `domain-modeling`, `tdd`.
- `obra/superpowers`: `using-git-worktrees`, `dispatching-parallel-agents`, `systematic-debugging`, `verification-before-completion`.
- `netlify/context-and-tools`: `netlify-deploy`, `netlify-functions`, `netlify-config`.

Skill popularity is not a trust guarantee. Inspect a skill's instructions/scripts and pin/reproduce versions where practical; never execute arbitrary install-time instructions that leak secrets or change unrelated globals. Avoid duplicate or contradictory global `better-ui` and `frontend-design` instructions. Keep the accepted Aftershock UX spec superior to any generic skill recommendation.

Create **only** short Aftershock-specific `AGENTS.md`/project rules and test fixtures to encode scientific requirements. Avoid constructing eight complex proprietary skills unnecessarily.

## 15. REQUIRED MILESTONES — DEPLOY EARLY

| Stage | Required outcome and gate |
|---|---|
| **M0 — Environment and architecture** | Confirm tools, repo, $0 footprint and free-tier limitations. Choose app stack pragmatically, document constraints, create shared data/API contracts and CI skeleton. No unauthorized paid changes. |
| **M1 — Live walking skeleton** | Real Netlify URL + health check + GitHub CI + first UI shell using accepted design. No fake connected feature labels. |
| **M2 — Real FalkorDB and demo seed** | Server-side authenticated connectivity, idempotent synthetic fixture seeding, read/write verified; UI graph/inspector queries live FalkorDB rather than static JSON. Protect seed/reset and credentials. |
| **M3 — Source verification and impact** | Real Mehra publication/notice verification; actual citation-use and claim-dependency graph paths; distinguish support, historical and unresolved; test provenance. |
| **M4 — Import and transparent analysis** | Guided sample first, actual supported demo-safe document import next; automatic analysis, true state, errors/retry, partial results, skip ambiguous match. No private research through free unencrypted graph. |
| **M5 — Review UX** | Review Overview → annotated manuscript → focused Evidence Reader → human review outcome → correct green/amber states; back-navigation and keyboard support. Both PDF and accessible reading **in the accepted product**, with honest MVP coverage. |
| **M6 — Reports & Activity** | Functional Evidence Impact Report export, auditable review event history for the demo, source/date distinctions, unresolved issues preserved and displayed. Never fake download. |
| **M7 — P1 enhancements as feasible** | Find Evidence candidate assessment, grouped shared-data dependencies, richer revision pack, graph explorer controls, historical replay, full arbitrary PDF reflow and expanded export. Only after P0 passes. |
| **M8 — Independent final audit** | Hosted end-to-end test, synthetic-vs-real attribution, graph and data verification, security/privacy check, accessibility, smoke under graph reset, all limitations documented. |

At every checkpoint: record URL, commit/PR, tests run, findings and failures. Fix P0 regressions before starting unrelated polish. An attractive UI without a live real graph and scientific correctness is not a successful handoff.

**P0 vs P1 clarity:** Full PDF/reflow support for arbitrary documents and sophisticated alternative evidence discovery are significant work. Preserve both in the **product requirements**. For hackathon P0 deliver a polished, verifiable **guided example** and an honestly scoped real import path; do not falsely label sample-only support as arbitrary-document support. If full dual-mode arbitrary-document support is feasible, implement it. The initial P0 essentials are real source notice, real FalkorDB traversal, clear review overview/reader, human decision, honest report and deployed site.

## 16. ACCEPTANCE TEST MATRIX (AUTOMATE)

Every check must have reproducible fixture(s), automated test(s) and a real hosted smoke check where appropriate.

### Research integrity

1. A real source notice links to correct DOI/date and retrievable authoritative record; external retrieval failures are disclosed.
2. Synthetic Passage A uses retracted publication as **supporting evidence** → direct **needs review**; label is NOT “claim disproven.”
3. Synthetic Passage B **historically discusses** same retraction → must NOT become compromised supporting evidence.
4. Synthetic Conclusion C depends on Passage A → indirect evidence review with inspectable path; don't infer automatic falsity.
5. `Lee et al., 2020` ambiguous → remains unresolved after **Skip for now**, candidate edges uncertain and non-propagating.
6. Shared dataset/derivative papers aren't counted as independent confirmations without verified evidence.
7. No known notice, inaccessible full text or empty candidate search never implies scientific reliability/completeness.
8. Every graph path shown corresponds to FalkorDB queryable records and sourced/proposed relationship states.

### UI and workflow

9. New user can open guided demo and understand first next action with no mandatory account or collection setup.
10. Actual selected/uploaded file has honest processing status; analysis automatically starts where enabled and recovers partial failures.
11. Review Overview is clear, low-clutter; full annotated paper accessible via visible secondary action.
12. Highlights have descriptive text, keyboard/touch equivalents to hover, same scroll context upon return.
13. Original PDF presentation and accessible reflowed view are separately selectable where supported; limitations marked.
14. Evidence Reader default is a **single focused claim**, not a mandatory dense three-panel display.
15. Human review → green sage recorded marker; if revision needed, amber pending work remains.
16. Suggested revision editable only as a separate draft; copying doesn't imply applied; original bytes unchanged.
17. An unsupported claim of “not affected” requires written explanation; previous decisions remain inspectable.
18. User returns from graph/Library/reader without losing the selected claim and filter/position.

### Outputs and history

19. Evidence Impact Report actually downloads/opens, shows notices, direct/indirect claims, reviewer outcome, dates and unresolved counts.
20. Report marked incomplete if open tasks remain, even if detailed open-issues appendix is omitted.
21. Past exported report isn't silently rewritten; history distinguishes notice published vs discovered/check dates.
22. Reopened review does not silently overwrite historical reviewer assessment.

### Cloud, security, delivery

23. Live Netlify URL works in a clean browser; CI and deploy preview operational.
24. Real server-side FalkorDB read **and write** are demonstrated by test/query; browser bundle contains no DB secrets.
25. Free-tier graph loss can be recovered through safe idempotent **synthetic** fixture reseed; live demo validates graph existence before results.
26. Public endpoints have input limits and cannot expose arbitrary graph query/reset/admin actions. No private document allowed over insecure free graph link.
27. Error telemetry/logging redacts sensitive text and credentials; no paid provisioning occurred without approval.
28. Tester and independent reviewer can reproduce pass/fail evidence rather than relying on self-reported completion.

### Definition of done

A feature is **done** only with implementation, relevant automated tests, a reviewed diff/PR, real hosted behavior, documentation and an explicit list of remaining limitations. The project is **P0 complete** only when the fully deployed, scientifically honest guided scenario works end to end with **real FalkorDB** and a functioning report. If blocked, report exact observed state and minimal required user decision, never claim success prematurely.

## 17. AUTONOMY, APPROVALS & COMMUNICATION

Proceed automatically with code edits inside the project, safe CI configuration, bounded graph queries/fixture data, existing no-cost service setup and deployment to an explicitly designated **Aftershock demo** project/site. Before any publicly visible deployment, verify synthetic-only data and proper access restrictions. The user's instruction to deploy from the start is permission to deploy this project in the existing approved Netlify workflow—not to publish private data or take over unrelated sites.

**Seek user approval first** for:

- Billable hosting, paid quotas or credit-consuming experiments beyond expected existing allowances.
- New production/private-data storage or processing infrastructure, changed security posture, credentials that aren't already connected, or publication of real user documents.
- Destructive removal of user data, shared repository history or unrelated resources.
- Major scope reductions that hide a core scientific requirement or render the real graph optional.

Progress updates from primary agent: after each milestone, concise report of deployed URL, completed tasks, validation, open blockers and next step. No long inner monologue or child-session transcripts. Agents shouldn't spin in loops: after two repeated failed approaches to the same blocker, diagnose systematically, document evidence and change the plan or escalate. Avoid context bloat by writing concise state to repository and starting targeted new child sessions.

**Required repo deliverables by project close:**

- Source code, reproducible setup instructions, `AGENTS.md`, test fixtures, run/deploy config, GitHub Actions workflows.
- `docs/PRODUCT_REQUIREMENTS.md` (this accepted vision condensed without losing details), `docs/decisions/*`, `docs/DATA_PROVENANCE.md`, `docs/RESEARCH_INTEGRITY.md`, `docs/DEPLOYMENT.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/BUILD_STATUS.md`.
- Live Netlify site and direct link; GitHub repository, final relevant branch/PR, actual test outputs, verified FalkorDB graph data, walkthrough checklist.
- Clear **security disclaimer** and future migration requirements for a secure, durable production deployment. Do not imply that the $0 demo can safely retain real private research.

## 18. FINAL DIRECTIVE

**Begin execution immediately.** Inspect the existing setup, choose/document a minimal implementation stack, establish and deploy the smallest end-to-end walking skeleton, then build the core Aftershock graph-and-review journey through well-scoped independent OpenCode subagent contexts. Use real FalkorDB and Netlify, popular trusted skills, GitHub MCP and tests. Keep UX exceptionally understandable; preserve scientific and historical integrity. Do not replace missing capabilities with decorative demos or claim functionality you haven't verified. Work autonomously within existing free and safe resources, escalating only on genuine permission/cost/security blockers.

**Success is a working, accessible, reproducible, publicly hosted research-integrity demonstration with real graph-backed claim-level impact, not an impressive plan or collection of mock screens.**
