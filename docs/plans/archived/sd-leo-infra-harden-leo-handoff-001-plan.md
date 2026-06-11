<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/gate-reliability.md -->
<!-- SD Key: SD-LEO-INFRA-HARDEN-LEO-HANDOFF-001 -->
<!-- Archived at: 2026-06-08T23:56:38.035Z -->

# Harden LEO handoff-gate reliability — GATE4_WORKFLOW_ROI precheck/execute determinism + story_test_mappings query fix

## Type
infrastructure

## Priority
high

## Summary
Two LEO handoff-gate bugs Alpha verified live shipping SD-LEO-GEN-ENABLE-RLS-SERVICE-001 (PR #4401). BUG 1: GATE4_WORKFLOW_ROI is non-deterministic — PRECHECK reports PASS (89%, threshold 70%) but EXECUTE consistently FAILS at ~69% for the SAME SD (reproduced 4x), flaky-blocking validated work (SECURITY 97 / TESTING 95 / retro 89). BUG 2: story_test_mappings always-empty — acceptance-criteria-validation.js:84 queries by story_id but the table has no story_id column, so every user story scores the 70 no-test-mapping default regardless of coverage.

## Strategic Intent
Make the LEO gates trustworthy: a gate that passes precheck but fails execute, or silently ignores real test coverage, erodes confidence in the handoff pipeline and forces workers to retry validated work. Deterministic, schema-correct gates are foundational to the automation contract.

## Business Value
Removes a recurring flaky block (GATE4 precheck-PASS/execute-FAIL, reproduced 4x this session) + a systemic mis-score (acceptance-criteria blind to actual test mappings). Reclaims worker retry time and restores gate signal.

## Root Cause
BUG 1: precheck and execute score the same SD differently — likely non-deterministic LLM scoring (no temp=0/seed) and/or different inputs/code paths. BUG 2: acceptance-criteria-validation.js:84 joins story_test_mappings on a non-existent story_id column, so the lookup always returns empty.

## Success Criteria
- GATE4_WORKFLOW_ROI precheck and execute produce the SAME score for the same SD (deterministic); a precheck-PASS SD also passes execute.
- acceptance-criteria-validation.js joins story_test_mappings on the real FK so stories with mappings score on actual coverage, not the 70 default.
- Regression tests for both.

## Success Metrics
- GATE4 precheck/execute score divergence: from ~20pt (89 vs 69) to 0.
- User stories defaulting to 70 despite having mappings: from all to 0.

## Scope
- FR-1: fix the GATE4_WORKFLOW_ROI precheck/execute divergence under scripts/modules/handoff/executors/plan-to-lead/ — deterministic scoring (pin temp 0, mirror SD-FDBK-FIX-VISION-SCORER-DETERMINISM-001) + shared inputs/code path.
- FR-2: fix acceptance-criteria-validation.js:84 join to the real story_test_mappings FK.
- Regression tests.

## Related (deduped — none open cover these)
- SD-FDBK-FIX-VISION-SCORER-DETERMINISM-001 (precedent for FR-1).
- SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 / SD-FDBK-INFRA-PLAN-LEAD-PRECHECK-001 (completed; precheck infra, not the divergence).

## Notes
- Source: coordinator authoring task (EXECUTE), Alpha-verified on PR #4401. Adam-sourced 2026-06-08. Dogfooded.
