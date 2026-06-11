<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/view-rootcause.md -->
<!-- SD Key: SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001 -->
<!-- Archived at: 2026-06-08T19:53:29.555Z -->

# Fix v_sd_next_candidates root-cause: fn_sync_sd_to_baseline writes UUID instead of sd_key + broken object-shape deps_satisfied

## Type
infrastructure

## Priority
high

## Summary
The v_sd_next_candidates view (the worker self_claim source) silently drops baseline rows because the trigger fn_sync_sd_to_baseline() writes sd_baseline_items.sd_id as a UUID, while the view JOINs bi.sd_id = sd.sd_key (a text key). Live proof: the active baseline a75b0d8f currently holds ~954 UUID-shaped, non-joinable rows that the JOIN silently discards — the view only returns anything because the sd-baseline.js add-item workaround (SD-FDBK-INFRA-FLOW-IMPEDIMENT-COORDINATOR-001) injects sd_key-shaped rows. That workaround explicitly DEFERRED the trigger root cause, the stale-row reconciliation, and the object-shaped deps_satisfied bug to a sibling SD — this is that SD. Separately, v_sd_next_candidates.deps_satisfied is broken for object-shaped dependencies: it text-compares the JSON instead of resolving dependency sd_keys, so object-shaped deps mis-evaluate.

## Root Cause
fn_sync_sd_to_baseline() inserts NEW.id (UUID) into sd_baseline_items.sd_id instead of NEW.sd_key; the view JOIN key is sd_key, so UUID rows never join. The deps_satisfied column does a raw text compare rather than resolving dependency keys. sd-baseline.js createBaseline/rebaseline also carry a `|| sd.id` UUID fallback that re-introduces UUID rows.

## Success Criteria
- fn_sync_sd_to_baseline() writes NEW.sd_key (not the UUID) so new baseline rows join the view.
- The `|| sd.id` UUID fallback in sd-baseline.js createBaseline/rebaseline is removed so no new UUID-shaped rows are created.
- v_sd_next_candidates.deps_satisfied correctly resolves object-shaped dependencies (by sd_key) instead of text-comparing the JSON.
- The ~954 existing UUID-shaped baseline rows are RECONCILED to their sd_key form via a REVERSIBLE migration that snapshots the affected rows first (backup table or migration-down), so no data is lost and the change can be rolled back.
- Regression: a freshly-sourced SD added to the active baseline appears in v_sd_next_candidates at readiness=1 without the add-item workaround.

## Scope
- Migration: correct fn_sync_sd_to_baseline() to write sd_key; fix the deps_satisfied resolution in v_sd_next_candidates.
- Reconcile the existing UUID-shaped sd_baseline_items rows to sd_key form via a reversible, backed-up migration (snapshot the rows to a backup table or provide a migration-down before any row change — NO unguarded row removal).
- Remove the `|| sd.id` UUID fallback in sd-baseline.js createBaseline/rebaseline.
- Tests: trigger writes sd_key; object-shaped deps_satisfied resolves; reconciliation is reversible.

## Notes
- Backup plan: the row reconciliation MUST snapshot affected rows first and be reversible (migration-down). This is the documented backup plan for the data-touching step.
- Dedup-confirmed net-new (Adam belt-dedup wf_2194809a): FLOW-IMPEDIMENT-COORDINATOR-001 = workaround CLI only; AUTO-MAINTAIN-EXECUTION-001 = missing-baseline case; SELF-CLAIM-DEDUP-001 = JS in-flight guard; BASELINE-SYNC-001 = the trigger's origin not a fix. Primary feedback: ba0e4d5c, ff7b102a, 23ae0d46.
