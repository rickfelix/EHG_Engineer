<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/_rank1_seeding_plan.md -->
<!-- SD Key: SD-LEO-INFRA-SIZE-TIER-AWARE-001 -->
<!-- Archived at: 2026-06-09T16:50:13.346Z -->

# Plan: Size/tier-aware SD scaffolding seeding so fast bugfixes and QFs do not start sub-threshold

## Type
infrastructure

## Priority
high

## Summary
The SD-creation path auto-seeds a fixed set of ~6 boilerplate scope deliverables (e.g. "Development environment setup", "Documentation updated"), placeholder success_metrics with actual=N/A, and unvalidated user stories, regardless of the SD's size or tier. For a small fast SD (e.g. a 2-file bugfix) these boilerplate items put it at 4/6=67% — under the 80% SCOPE_AUDIT gate at PLAN-TO-LEAD; the placeholder success_metrics.actual=N/A blocks PLAN-TO-LEAD; and the unvalidated user stories block EXEC-TO-PLAN. Every fast SD pays this tax manually (flipping seeded deliverables to completed, backfilling metrics) and it is the single most recurrent friction class in the harness backlog (clears 7 backlog reports). One size/tier-aware seeding fix at SD creation makes the denominator match the actual work and clears the whole class across three gates.

## Scope
Make auto-seeding tier-aware in the SD-creation path:
- sd_scope_deliverables: seed a count proportional to the SD tier/size (a 2-file fix must not be measured against 6 boilerplate deliverables), or derive deliverables from the actual declared scope rather than a fixed boilerplate list.
- success_metrics: do not seed placeholder actual=N/A rows that hard-block PLAN-TO-LEAD; omit until measurable or seed with a satisfiable default.
- user-stories: scale/validate so a small SD's seeded-but-unvalidated stories do not block EXEC-TO-PLAN.
Touch points: scripts/leo-create-sd.js createSD scope-seeding; sd_scope_deliverables auto-seed; SCOPE_AUDIT gate (PLAN-TO-LEAD); SUCCESS_METRICS / GATE_SD_METRICS_SUFFICIENCY gate; auto-validate-user-stories-on-exec-complete.js (EXEC-TO-PLAN).

## Source
Groomed by Adam from 7 harness_backlog items (clusters 2,16,32,72,95,97,109; workflow wf_6d502ac4). Net-new vs SD-FDBK-ENH-SUCCESS-METRICS-GATE-001 — that SD fixes the success-metrics MATCHER logic; this fixes the SEEDING denominator that feeds three gates. Coordinator-approved belt item (advisory 6e715a19, rank 1).

## Risks
- Seeding changes affect EVERY new SD: must not break legitimately large SDs that genuinely need the full deliverable/metric/story set. Fail-safe default = seed the full set on ambiguity.
- Tier detection at creation time may be imprecise; lean conservative (over-seed rather than under-seed when size is unknown).
- The SCOPE_AUDIT and SUCCESS_METRICS gates read these seeds; the denominator change must be coordinated with the gate thresholds so the fix does not merely move the gap.
