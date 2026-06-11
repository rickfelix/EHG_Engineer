<!-- Archived from: scripts/one-off/_plan-program.md -->
<!-- SD Key: SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001 -->
<!-- Archived at: 2026-06-07T17:27:45.486Z -->

# Post-build lifecycle redesign — sequence stages 21-26 and reconcile the Operations-mode handoff (ORCHESTRATOR PROGRAM)

## Type
feature

## Priority
medium

## Summary
The post-build lifecycle (stages 20-26) was walked end-to-end via the DataDistill pilot (2026-06-07) under a chairman lens. The walk established four structural issues: (1) the go-to-market sequence is mis-ordered (assets are created before the distribution/growth strategy that should drive them); (2) the Growth Playbook is positioned dead-last (after launch) instead of before launch where it belongs as a readiness criterion; (3) Stage 22 Distribution commits channel/budget spend with no chairman approval; (4) the relationship between the late stages (25 Post-Launch Review / 26 Growth Playbook) and the post-launch Operations mode is undefined, risking duplicated responsibility. This program redesigns stages 21-26 plus the Operations handoff into one coherent chairman journey: create assets -> approve spend -> final go/no-go -> launch -> operate. ORCHESTRATOR: decompose into the 3 children below (CONST-014: >=3 workstreams, cross-repo EHG+EHG_Engineer, >=8 FRs).

## Lifecycle model (context)
The 26 stages are only the "building" mode. Post-launch, a venture flows through pipeline_mode operations -> growth -> scaling -> exit_prep -> divesting -> sold (ventures.pipeline_mode; 7 modes). The EHG "Operations route" is the operations-mode dashboard (Health / Revenue / Economics / Risk Signals / AI Agents / Alerts / Customer Service + LAUNCHED hero + trigger decision cards + drill-back into completed stages). The staged pipeline is finite and ends at launch (~S24); Operations is the persistent steady-state after.

## In-flight foundation (Stage 21 cluster — already filed this session; prerequisites, not children of this program)
- SD-LEO-FIX-FIX-STAGE-DEPLOYMENT-001 (shipped) — S21 deployment_url resolver column-name fix.
- SD-LEO-FIX-FIX-STAGE-SKIP-001 (in-build) — S21 churn/mislabel + terminal-on-success.
- SD-LEO-FEAT-CONVERT-STAGE-VISUAL-001 (draft) — S21 manual creative gate (Continue + optional upload).

## Children to decompose
### Child 1 — Resequence the pre-launch GTM cluster
Reorder so Distribution -> Growth Playbook -> Visual Assets -> Launch Readiness (strategy drives creative). Generate the growth playbook PRE-launch. Add "Growth Playbook complete" and "Distribution plan complete" as required categories in the S23 Launch Readiness kill-gate checklist. Rationale: channels + growth-motion determine which assets are needed; today S21 hard-codes platform-specific assets (e.g. Instagram 1080x1080) before S22 sets the channel strategy. Repos: EHG + EHG_Engineer.
### Child 2 — Stage 22 Distribution chairman spend-approval gate
Convert Stage 22 from auto to a lightweight approve-before-spend gate: the machine drafts channels/budget/copy, the chairman approves / edits / continues before any budget is committed. Repos: EHG + EHG_Engineer.
### Child 3 — Define Building->Operations handoff + reconcile S25/S26 with Operations mode
Formalize the pipeline_mode building->operations transition at launch (~S24). Decide whether Post-Launch Review (25) and Growth (26, repurposed as post-launch Growth Refinement) are the final pipeline stages or the first operations-mode activities, and eliminate duplication with the Operations dashboard (Revenue/Health/Economics tabs already perform continuous post-launch review; the growth playbook becomes what is executed/refined in operations & growth modes). Repos: EHG + EHG_Engineer.

## Success Criteria
- Pre-launch sequence runs Distribution -> Growth -> Visual Assets; S23 Launch Readiness blocks on a missing Growth Playbook or Distribution plan.
- Stage 22 pauses for chairman spend-approval before committing budget.
- The building->operations handoff is explicitly defined; stages 25/26 and Operations mode have no duplicated responsibility.
- The end-to-end chairman journey (create assets -> approve spend -> final go/no-go -> launch -> operate) is coherent.

## Smoke Test Steps
- Decompose-level: each child carries its own smoke tests. Program-level: a venture taken through 21-26 follows the new order, the readiness gate enforces growth+distribution, and on launch it cleanly enters Operations mode with no duplicated review/growth artifacts.

## Success Metrics
- 0 sequencing inconsistencies (no stage assumes a downstream stage's output).
- Launch Readiness gate includes growth + distribution categories.
- Single clear owner (pipeline stage vs operations mode) for post-launch review and growth.

## Linkage
DataDistill pilot chairman-lens walk 2026-06-07. Foundation: SD-LEO-FIX-FIX-STAGE-DEPLOYMENT-001 / SD-LEO-FIX-FIX-STAGE-SKIP-001 / SD-LEO-FEAT-CONVERT-STAGE-VISUAL-001. Operations route: ehg OperationsMode.tsx + /chairman/operations (OperationsDashboard); useVentureMode (pipeline_mode, 7 modes).
