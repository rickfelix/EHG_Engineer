<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/sd-orch-lastchild-claim.md -->
<!-- SD Key: SD-LEO-INFRA-ORCHESTRATOR-LAST-CHILD-001 -->
<!-- Archived at: 2026-05-30T15:45:01.545Z -->

# Orchestrator last-child completion: parent-rollup handoff blocked by working-on trigger

## Type
infrastructure

## Target Application
EHG_Engineer

## Priority
medium

## Goal
When the LAST child of an orchestrator SD completes its LEAD-FINAL-APPROVAL, handoff.js rolls up the parent orchestrator by creating a parent PLAN-TO-LEAD handoff. That insert is rejected by the `enforce_is_working_on_for_handoffs` trigger with "LEO Protocol Violation: Cannot create handoff for SD without active session claim" because the parent has `is_working_on=false`. The parent cannot be claimed the normal way: `sd-start` on an orchestrator routes to leaf children and refuses to claim the parent ("No unclaimed leaf work items available"). Observed live on SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-F (df06faf7, 2026-05-30); worked around by a manual `UPDATE strategic_directives_v2 SET is_working_on=true` on the parent, which is a band-aid, not a fix. Verified root cause: `enforce_is_working_on_for_handoffs` does NOT recognize the `ORCHESTRATOR_AUTO_COMPLETE` created_by bypass that the sibling `enforce_handoff_system` trigger already allows (alongside UNIFIED-HANDOFF-SYSTEM, SYSTEM_MIGRATION, ADMIN_OVERRIDE, PCVP_EMERGENCY_BYPASS).

## Changes
- Reconcile the orchestrator-completion bypass across the handoff-enforcement triggers: teach `enforce_is_working_on_for_handoffs` to skip the working-on requirement when the handoff is an orchestrator parent-rollup (e.g. created_by='ORCHESTRATOR_AUTO_COMPLETE', matching `enforce_handoff_system`'s allow-list), so the last-child rollup succeeds without a manual claim.
- Have handoff.js create the parent-rollup handoff with created_by='ORCHESTRATOR_AUTO_COMPLETE' (or the dedicated `complete_orchestrator_sd` path) so the bypass actually applies.
- Optionally give sd-start an explicit orchestrator-parent claim path (e.g. --orchestrator / --complete-parent) for the cases where a human does need to drive the parent.
- This is a fail-closed trigger on handoff creation: change it behind tests + a regression that asserts a normal (non-orchestrator) handoff for an unclaimed SD is STILL rejected, and that a last-child rollup now succeeds.

## Objectives
- Completing the final child of an orchestrator rolls the parent to completed automatically, with no manual is_working_on UPDATE.
- The working-on protection remains intact for ordinary handoffs (no new bypass hole).
- The orchestrator-completion bypass is consistent across all handoff-enforcement triggers.

## Acceptance Criteria
- AC-1: completing the last child of an orchestrator advances + completes the parent without any manual claim/UPDATE.
- AC-2: a non-orchestrator handoff created for an SD with is_working_on=false is still rejected (no regression in the guard).
- AC-3: the parent-rollup handoff is created with the orchestrator bypass created_by, and `enforce_is_working_on_for_handoffs` honors it.
- AC-4: a regression test reproduces the original failure (last-child rollup on an unclaimed parent) and asserts it now passes.

## Demo
1. Build a tiny orchestrator + 2 children; complete child 1 (parent stays, no rollup).
2. Complete the last child → parent auto-completes, no manual claim needed.
3. Attempt a normal handoff for an unrelated unclaimed SD → still rejected.
