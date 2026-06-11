<!-- Archived from: .claude/plans/2026-05-27-consolidate-dual-detection.md -->
<!-- SD Key: SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 -->
<!-- Archived at: 2026-05-27T23:41:53.675Z -->

# Plan: Consolidate dual-detection drift — single source of truth for 3 classifier clusters

## Priority
high

## Type
infrastructure

## Goal

Mirror the SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 (PR #4021) `lib/handoff/parent-detection.js` pattern across three more dual-detection clusters where the same condition is checked in N ad-hoc places that silently diverge. Each cluster currently has multiple paths producing different verdicts on edge cases — invisible drift that surfaces as gate mismatches under inputs that trigger only some paths.

**Cluster A — SD-type detection.** "Is this SD a venture? Is it an orchestrator? Is it an infra meta-SD?" gets answered by checking `sd_type` enum, `metadata.is_*` flags (`is_parent`, `is_orchestrator`, `is_venture`), `category` text, `sd_key` prefix matching (`SD-LEO-*`, `SD-FDBK-*`, `SD-VENTURE-*`), and the `LEGITIMATE_NO_VENTURE_SD_TYPES` set. Each call site picks 1-2 signals; combinations differ. Already-confirmed dual-detection: `metadata?.is_parent === true` shows up in 10 files outside `lib/handoff/parent-detection.js` (the very helper that was supposed to consolidate it). Pattern recurs for other type classifications.

**Cluster B — Claim ownership detection.** "Who currently holds this SD?" is checked against `claude_sessions.claiming_session_id`, `claude_sessions.active_session_id`, `claude_sessions.is_working_on`, `strategic_directives_v2.active_session_id`, and at least one places-where-sd_key-is-set-on-the-session inverse-read. 30+ files reference these fields. Liveness (300s vs 600s thresholds from `SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001`) layers additional ambiguity. Without a unified read path, sweep/dashboard/sd-start each compute "is claimed" differently.

**Cluster C — Gate-skip detection.** "Should this gate run for this SD?" is decided by `gate.condition` callbacks, ad-hoc `context.skipGate` injection, `sd.metadata.skip_*` flags, and SD-type detection (overlap with Cluster A). Multiple gates make their own skip decisions; some honor the metadata flag, others ignore it.

This SD ships three unified helpers in `lib/sd-type-detection.js`, `lib/claim/ownership-detection.js`, and `lib/handoff/gate-skip-detection.js`, plus migrates 15-20 known call sites. Each helper follows the same WeakMap-cached, OR-merged-signals, sync-and-async-variants shape as `parent-detection.js`. Includes the F12-second-writer instance (`lib/sub-agents/modules/stories/execute.js:296` was already resolved by QF-20260527-530 — referenced as worked example of the recurring pattern, not as new fix work).

## Steps

- [ ] LEAD: 8-question strategic gate; confirm scope reduction (parent-detection precedent already proves the approach; this SD applies it 3 more times)
- [ ] LEAD: invoke validation-agent (LEAD evidence), risk-agent (migration risk for 15-20 call sites), design-agent (helper API consistency across 3 clusters)
- [ ] LEAD-TO-PLAN: handoff via handoff.js execute
- [ ] PLAN: write PRD; FR-1 audit deliverable, FR-2 sd-type helper, FR-3 claim-ownership helper, FR-4 gate-skip helper, FR-5 migrate N call sites
- [ ] PLAN: invoke design-agent (final API for 3 helpers), database-agent (no schema change but verify reader queries are index-aware), testing-agent (unit tests for each helper covering OR-merge edge cases)
- [ ] PLAN-TO-EXEC: handoff via handoff.js execute
- [ ] EXEC Phase 1 (audit): write `scripts/one-off/_audit-dual-detection-clusters.mjs` that grep-enumerates all detection paths for each cluster; produce `docs/audits/sd-leo-infra-consolidate-dual-detection-001-audit.md` with file:line table
- [ ] EXEC Phase 2: create `lib/sd-type-detection.js` (isOrchestrator, isVenture, isInfraNoVenture, etc.) mirroring parent-detection.js shape; migrate 4-8 call sites
- [ ] EXEC Phase 3: create `lib/claim/ownership-detection.js` (getClaimHolder, isClaimedBy, getLiveClaimHolders); migrate 4-8 call sites
- [ ] EXEC Phase 4: create `lib/handoff/gate-skip-detection.js` (shouldSkipGate); migrate 3-5 call sites
- [ ] EXEC Phase 5: migrate remaining `metadata?.is_parent === true` ad-hoc sites to `isParentOrchestrator()` from existing helper (cleanup carry-over from PR #4021 where new helper landed but call sites weren't all migrated)
- [ ] EXEC: tests in tests/unit/sd-type-detection/, tests/unit/claim-ownership-detection/, tests/unit/gate-skip-detection/
- [ ] EXEC-TO-PLAN: handoff via handoff.js execute (TESTING evidence required)
- [ ] PLAN-TO-LEAD: handoff via handoff.js execute
- [ ] LEAD-FINAL-APPROVAL: handoff via handoff.js execute, retrospective generated
- [ ] PR: create + auto-merge

## Acceptance

- Three new helper modules exist and export both async (full signal merge) and sync (metadata-flag-only) variants
- All 10 known ad-hoc `metadata?.is_parent === true` sites in production code (not archive/, not tests/) migrated to `isParentOrchestrator()`
- ≥15 total call sites migrated across the 3 new clusters
- Audit report `docs/audits/sd-leo-infra-consolidate-dual-detection-001-audit.md` exists with file:line table for each cluster
- All new helpers have ≥6 unit tests each covering: metadata-flag-only, DB-only, OR-merge, cache hit/miss, missing inputs, error path
- No regression in existing handoff/gate pipeline (smoke: re-run a previously-PASS handoff on a representative SD)

## Scope

~ lib/handoff/parent-detection.js — extend with `_clearCache()` real implementation if needed for tests
+ lib/sd-type-detection.js — new helper (isOrchestrator, isVenture, isInfraNoVenture, isLegitimateNoVentureType)
+ lib/claim/ownership-detection.js — new helper (getClaimHolder, isClaimedBy, getLiveClaimHolders)
+ lib/handoff/gate-skip-detection.js — new helper (shouldSkipGate)
~ scripts/modules/handoff/verifiers/plan-to-exec/PlanToExecVerifier.js:84 — use helper
~ scripts/modules/handoff/orchestrator-completion-guardian.js:81 — use helper
~ scripts/modules/handoff/executors/plan-to-exec/parent-orchestrator.js:133 — use helper
~ scripts/modules/parent-orchestrator-handler.js:60 — use helper
~ scripts/lib/handoff-preflight.js:163,294 — use helper (2 sites)
~ scripts/modules/decomposition-gate.js:107 — use helper
~ scripts/phase-preflight.js:261 — use helper
+ scripts/one-off/_audit-dual-detection-clusters.mjs — audit tooling
+ docs/audits/sd-leo-infra-consolidate-dual-detection-001-audit.md — audit deliverable
+ tests/unit/sd-type-detection/sd-type-detection.test.js
+ tests/unit/claim-ownership-detection/claim-ownership-detection.test.js
+ tests/unit/gate-skip-detection/gate-skip-detection.test.js

## Risks

- Migrating 15-20 call sites risks subtle behavior change if any call site relied on a specific signal NOT being merged. Mitigation: each migration commit covers ≤3 sites with a test that locks the prior behavior at the helper boundary.
- The 3 new helpers must keep their async/sync API consistent or call-site refactors will confuse readers. Mitigation: design-agent reviews the 3 helper APIs side-by-side before EXEC Phase 2 starts.
- Audit phase may surface 4th/5th clusters not in the original scope. Mitigation: chairman review at end of Phase 1 audit; scope-out additional clusters to a follow-up SD if found.

## Target Application
EHG_Engineer

## Origin
- Pattern surfaced in SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 (PR #4021) retrospective: `parent-detection.js` consolidated 3 ad-hoc paths but 10 more ad-hoc paths remain in production code; pattern recurs for other classifiers.
- F12-second-writer instance (already resolved by QF-20260527-530) is a recent example of the recurring pattern on user_stories status writers.
- Campaign brief from chairman 2026-05-27: pattern-application campaign across 5 reusable patterns.
