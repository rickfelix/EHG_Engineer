<!-- Archived from: C:/Users/rickf/.claude/plans/sd-venture-gate-unification.md -->
<!-- SD Key: SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 -->
<!-- Archived at: 2026-05-12T14:05:09.834Z -->

# Venture Gate Unification — DB single source of truth across all 26 stages

## Priority
high

## Description

The venture pipeline has four overlapping sources of truth for stage governance (gate type, review mode, hard-gate eligibility) and they disagree across 13 of 26 stages. This SD collapses them to one: the DB stage_config table.

Witnessed: NameSignal venture 57e2645a-8288-4b55-9a44-0805ad4a3df1 blocked at Stage 8 Business Model Canvas on 2026-05-12 because lib/eva/stage-execution-worker.js line 948 hardcoded REVIEW_MODE_STAGES = {7,8,9,11} ignores the per-stage UI toggle the user can flip in chairman_dashboard_config.stage_overrides. Stage 7 escaped the same block only because of an unrelated 135s stale-lock event that forced re-entry through a different codepath (_canAutoAdvance). The system is race-dependent for behavior the user thinks is configuration-driven.

Four current sources and the disagreement count:
1. EHG/src/config/venture-workflow.ts — UI source, post-redesign (S18-S26)
2. EHG_Engineer/lib/eva/gate-constants.js — worker code constants
3. DB chairman_dashboard_config.hard_gate_stages — user-facing toggle config
4. DB stage_config — read by getBlockingStagesFromDB() (legacy fallback, stale since 2026-04-21 redesign)

Audit results: 4 stages disagree on gate_type (S18, S19, S22, S25), 4 stages have hardcoded review-mode the UI cannot override (S7, S8, S9, S11), 1 stage has tooltip claim with no code enforcement (S16), 1 stage missing from stage_config entirely (S26), 13 stages have stale names in DB. Full matrix preserved in memory: project_venture_gate_unification_audit_2026_05_12.md.

Design: stage_config becomes the single canonical table. UI reads from it, worker reads from it (with in-process cache + realtime invalidation), code constants are removed. Per-stage user overrides flow through chairman_dashboard_config.stage_overrides and are honored uniformly. Review-mode becomes a default-pause but user-overridable semantic (matches what the per-stage UI toggle implies).

## Rationale

Real bug blocking active product work (NameSignal venture pipeline run). User explicitly authorized a proper fix: "I want to take the time to create a proper fix and not bandaids."

Prior related SDs:
- SD-LEO-FIX-EVA-STAGE-WORKER-001 — established hardcoded REVIEW_MODE_STAGES enforcement. This SD does NOT reverse the human-quality-control intent; it makes the same default opt-out-able via the UI toggle that already exists.
- SD-FDBK-INFRA-STAGE-CONFIG-PARITY-001 (2026-05-09, cancelled) — identified the DB stale-name drift, was cancelled without backfill. FR-1 here supersedes it.
- SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-A — original 2026-04-21 redesign that caused gate_type drift in stage_config.

## Scope (Functional Requirements)

FR-1: stage_config DB migration to V2 parity. Backfill stage names (13 corrections), gate_type fixes (S18=promotion, S19=promotion, S22=none, S25=promotion), add missing S26 row. Single forward migration with idempotent UPSERT + verification SELECT in same transaction. Supersedes cancelled SD-FDBK-INFRA-STAGE-CONFIG-PARITY-001.

FR-2: New lib/eva/stage-governance.js module. Replaces gate-constants.js exports. Exposes async getStageGovernance(supabase) returning {killStages, promotionStages, reviewStages, blockingStages, getStage(n)} — all derived from stage_config. In-process cache with 60s TTL + supabase realtime subscription to invalidate on UPDATE. Maintains same export names temporarily for migration; old constants removed in FR-3 callsite sweep.

FR-3: Worker callsite migration. Replace every REVIEW_MODE_STAGES.has(), CHAIRMAN_GATES.BLOCKING.has(), KILL_GATE_STAGES.has(), PROMOTION_GATE_STAGES.has() reference in stage-execution-worker.js, eva-orchestrator.js, stage-execution-engine.js, and any other consumers with await stageGov.isReviewStage(n) style calls. Worker _canAutoAdvance(stage) becomes the SOLE gating decision function. Remove getBlockingStagesFromDB() from gate-constants.js.

FR-4: stage_overrides opt-in-to-auto semantics. Currently useStageGovernance.toggleStageOverride only writes auto_proceed: false (pause) — toggling to auto-advance means deleting the key. For review-mode stages this is ambiguous (deletion = default = pause). FR-4 extends the schema: write {auto_proceed: true, set_by, set_at} when user explicitly opts a review-mode stage into auto-advance. Worker honors auto_proceed: true to bypass review-mode default-pause. Migration handles existing rows (no-op; all current entries are auto_proceed: false).

FR-5: UI consistency. StageSettingsSheet.tsx review-mode rows show "Default: pause for review" indicator; toggle ON means opt into auto-advance. useStageGovernance.toggleStageOverride writes auto_proceed: true for review-mode stages instead of deleting. S16 tooltip ("...except Stage 16 which always requires approval") becomes truthful — by FR-1+FR-3 S16 is gate_type=promotion, blocking. "Auto-advancing..." spinner state in useStageAutoAdvance.ts line 98 only renders when worker has actually approved (verify via gateApproved === true && hasArtifact); fix the false-positive that NameSignal hit.

FR-6: Test coverage. Vitest tests for all 26 stages × 4 governance permutations (master on/off × hard-gate yes/no × review-mode yes/no × stage_override null/true/false). At minimum: stage-governance.spec.js (FR-2 module) + worker-can-auto-advance.spec.js (FR-3 decision matrix) + use-stage-governance.spec.tsx (FR-5 UI behavior).

## Out of Scope

- venture-workflow.ts auto-generation from DB (pre-commit/CI sync check) — deferred to follow-up SD. The TS file becomes a documentation artifact that humans keep in sync; FR-1 migration is one-shot, drift risk is low.
- Taste-gate stages (TASTE_GATE_STAGES = {10,13,16}) — feature-flagged subsystem; out of scope for this unification. Constant remains in code.
- Stage 0 (Inception) — not in the 26-stage canonical list.
- Cross-venture decision propagation / per-venture stage overrides — current stage_overrides is global; this SD does not introduce per-venture overrides.

## Risk

- Worker behavior change: Ventures currently sitting at S7/S8/S9/S11 with pending decisions will be auto-advanced on next worker tick after deploy IF user has not paused them via per-stage toggle. NameSignal currently has S8 pending decision and stage_overrides={} → will auto-advance. Intended behavior; call out in retro.
- stage_config migration: 13 stages renamed + 4 gate_type changes + 1 new row. Risk of breaking any consumer that reads stage_config.stage_name by string match. Mitigation: full grep audit during PLAN phase + idempotent UPSERT.
- Realtime cache invalidation: New stage-governance.js cache needs to handle subscription failure gracefully (fall back to TTL-only refresh). Verified pattern from existing useStageGovernance.ts lines 59-85.

## Success Criteria

1. All 26 stages produce identical governance output across all 4 sources (no mismatches in audit matrix).
2. Worker _canAutoAdvance(n) is the only decision function for advance/block. No REVIEW_MODE_STAGES.has() callsites remain.
3. NameSignal venture mechanically unblocks (S8 pending decision resolves) when SD ships, validating the unified decision path.
4. Per-stage UI toggle round-trips correctly for review-mode stages: toggle off → pause; toggle on → auto-advance; matches behavior of non-review stages.
5. S16 enforcement: a venture reaching S16 with no chairman approval blocks at the gate (per UI tooltip + workflow.ts intent).
6. Tests: at least 80% line coverage on stage-governance.js; full 4×3×26 decision matrix in worker-can-auto-advance.spec.js.
7. CI gates green; at least 85% sub-agent confidence on TESTING + SECURITY (RLS unchanged) + DATABASE (migration shape).

## Estimated Effort

- Tier 3 SD
- LOC: ~350-500 src + ~400-500 test
- Touched files: ~12-15 across both repos
- 1 DB migration
- Target repos: EHG, EHG_Engineer

## Dependencies

None hard. NameSignal venture is the empirical witness but not a blocker on this SD's progression — venture stays paused at S8 during build; will auto-resolve when SD merges.

## Deletion Audit (Q8)

- Original proposal included FR-6: venture-workflow.ts sync check (pre-commit / CI guard fails if drift detected from stage_config). Removed — TS file becomes a documentation artifact; drift risk is low post-migration since the file is no longer authoritative for worker logic. Saved ~50-80 LOC + a CI workflow file. Scope reduction: ~15% of LOC.
- Original proposal included broader gate-constants.js deletion. Trimmed to "remove getBlockingStagesFromDB() only" — leaves TASTE_GATE_STAGES constant in place per Out-of-Scope. Saves ~30 LOC.

Total scope reduction from initial proposal: ~17% LOC and 1 FR.
