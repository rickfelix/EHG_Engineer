# Provenance Emission Audit Report

AI-provenance writer-surface coverage audit per Pocock pattern (SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F).

## Summary

- Total writer modules scanned: **291**
- Writer modules with in-scope INSERT/UPDATE call sites: **61**
- Total in-scope call sites: **125**
- Total provenance-emitting call sites: **3**
- Overall coverage: **2.4%**
- Offenders (coverage < 100%): **61**
- Excluded tables (heterogeneous existing provenance fields preserved): `sd_phase_handoffs`, `retrospectives`, `sub_agent_execution_results`

## Top 3 Lowest-Coverage Writers

| Rank | Writer | In-Scope Calls | Emits | Coverage | Recommendation |
|---:|--------|---------------:|------:|---------:|----------------|
| 1 | `scripts/modules/handoff/auto-approve-prd.js` | 1 | 0 | 0% | Wire readProvenanceFlag + formatAgent helpers into all in-scope INSERT/UPDATE call sites; keep kill-switch default OFF v1. |
| 2 | `scripts/modules/handoff/auto-complete-deliverables.js` | 1 | 0 | 0% | Wire readProvenanceFlag + formatAgent helpers into all in-scope INSERT/UPDATE call sites; keep kill-switch default OFF v1. |
| 3 | `scripts/modules/handoff/auto-proceed-resolver.js` | 2 | 0 | 0% | Wire readProvenanceFlag + formatAgent helpers into all in-scope INSERT/UPDATE call sites; keep kill-switch default OFF v1. |

## Full Audit Table

| Writer | Total Calls | Excluded | In-Scope | Emits | Coverage | Tables |
|--------|------------:|---------:|---------:|------:|---------:|--------|
| `scripts/modules/handoff/auto-approve-prd.js` | 1 | 0 | 1 | 0 | 0% | `product_requirements_v2` |
| `scripts/modules/handoff/auto-complete-deliverables.js` | 1 | 0 | 1 | 0 | 0% | `sd_scope_deliverables` |
| `scripts/modules/handoff/auto-proceed-resolver.js` | 2 | 0 | 2 | 0 | 0% | `claude_sessions` |
| `scripts/modules/handoff/auto-proceed-state.js` | 1 | 0 | 1 | 0 | 0% | `claude_sessions` |
| `scripts/modules/handoff/blocker-resolution.js` | 2 | 0 | 2 | 0 | 0% | `strategic_directives_v2`, `system_events` |
| `scripts/modules/handoff/bypass-rubric.js` | 2 | 0 | 2 | 0 | 0% | `validation_audit_log` |
| `scripts/modules/handoff/claim-swapper.js` | 2 | 0 | 2 | 0 | 0% | `claude_sessions` |
| `scripts/modules/handoff/cli/execution-helpers.js` | 3 | 0 | 3 | 0 | 0% | `strategic_directives_v2`, `validation_audit_log` |
| `scripts/modules/handoff/continuation-state.js` | 1 | 0 | 1 | 0 | 0% | `claude_sessions` |
| `scripts/modules/handoff/db/PRDRepository.js` | 1 | 0 | 1 | 0 | 0% | `product_requirements_v2` |
| `scripts/modules/handoff/db/SDRepository.js` | 1 | 0 | 1 | 0 | 0% | `strategic_directives_v2` |
| `scripts/modules/handoff/executors/BaseExecutor.js` | 1 | 0 | 1 | 0 | 0% | `claude_sessions` |
| `scripts/modules/handoff/executors/exec-to-plan/gates/deliverables-completeness.js` | 1 | 0 | 1 | 0 | 0% | `sd_scope_deliverables` |
| `scripts/modules/handoff/executors/exec-to-plan/gates/loc-threshold-validation.js` | 1 | 0 | 1 | 0 | 0% | `leo_error_log` |
| `scripts/modules/handoff/executors/exec-to-plan/gates/test-coverage-quality.js` | 1 | 0 | 1 | 0 | 0% | `gate_health_history` |
| `scripts/modules/handoff/executors/exec-to-plan/index.js` | 1 | 0 | 1 | 0 | 0% | `strategic_directives_v2` |
| `scripts/modules/handoff/executors/exec-to-plan/retrospective.js` | 2 | 2 | 0 | 0 | n/a | `retrospectives` |
| `scripts/modules/handoff/executors/exec-to-plan/state-transitions.js` | 3 | 0 | 3 | 0 | 0% | `product_requirements_v2`, `strategic_directives_v2`, `user_stories` |
| `scripts/modules/handoff/executors/lead-final-approval/helpers.js` | 4 | 0 | 4 | 0 | 0% | `agent_learning_outcomes`, `issue_patterns`, `protocol_improvement_queue`, `system_events` |
| `scripts/modules/handoff/executors/lead-final-approval/hooks/ship-review-findings-populator.js` | 2 | 0 | 2 | 0 | 0% | `audit_log`, `ship_review_findings` |
| `scripts/modules/handoff/executors/lead-final-approval/index.js` | 5 | 1 | 4 | 0 | 0% | `eva_vision_scores`, `feedback`, `leo_handoff_executions`, `sd_phase_handoffs`, `strategic_directives_v2` |
| `scripts/modules/handoff/executors/lead-to-plan/atomic-transitions.js` | 1 | 0 | 1 | 0 | 0% | _(none)_ |
| `scripts/modules/handoff/executors/lead-to-plan/gates/adrs-consulted.js` | 1 | 0 | 1 | 0 | 0% | `feedback` |
| `scripts/modules/handoff/executors/lead-to-plan/gates/branch-preparation.js` | 1 | 0 | 1 | 0 | 0% | `strategic_directives_v2` |
| `scripts/modules/handoff/executors/lead-to-plan/gates/grill-convergence.js` | 2 | 0 | 2 | 0 | 0% | `audit_log`, `feedback` |
| `scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js` | 1 | 0 | 1 | 0 | 0% | `plan_critiques` |
| `scripts/modules/handoff/executors/lead-to-plan/gates/sd-type-validation.js` | 3 | 0 | 3 | 0 | 0% | `strategic_directives_v2` |
| `scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js` | 3 | 0 | 3 | 0 | 0% | `strategic_directives_v2` |
| `scripts/modules/handoff/executors/lead-to-plan/gates/transition-readiness.js` | 2 | 1 | 1 | 0 | 0% | `sd_phase_handoffs`, `strategic_directives_v2` |
| `scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js` | 1 | 0 | 1 | 0 | 0% | `vision_scoring_audit_log` |
| `scripts/modules/handoff/executors/lead-to-plan/retrospective.js` | 2 | 2 | 0 | 0 | n/a | `retrospectives` |
| `scripts/modules/handoff/executors/lead-to-plan/state-transitions.js` | 3 | 0 | 3 | 0 | 0% | `strategic_directives_v2` |
| `scripts/modules/handoff/executors/plan-to-exec/gates/infrastructure-consumer-check.js` | 2 | 0 | 2 | 0 | 0% | `strategic_directives_v2`, `validation_audit_log` |
| `scripts/modules/handoff/executors/plan-to-exec/retrospective.js` | 2 | 2 | 0 | 0 | n/a | `retrospectives` |
| `scripts/modules/handoff/executors/plan-to-exec/state-transitions.js` | 4 | 0 | 4 | 0 | 0% | `product_requirements_v2`, `strategic_directives_v2` |
| `scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js` | 6 | 0 | 6 | 0 | 0% | `audit_log`, `eva_vision_scores` |
| `scripts/modules/handoff/executors/plan-to-lead/gates/success-metrics-gate.js` | 1 | 0 | 1 | 0 | 0% | `strategic_directives_v2` |
| `scripts/modules/handoff/executors/plan-to-lead/gates/success-metrics-gate.test.js` | 1 | 0 | 1 | 0 | 0% | _(none)_ |
| `scripts/modules/handoff/executors/plan-to-lead/index.js` | 1 | 0 | 1 | 0 | 0% | `strategic_directives_v2` |
| `scripts/modules/handoff/executors/plan-to-lead/state-transitions.js` | 7 | 2 | 5 | 0 | 0% | `product_requirements_v2`, `retrospectives`, `sd_phase_handoffs`, `strategic_directives_v2`, `user_stories` |
| `scripts/modules/handoff/extract-deliverables-from-prd.js` | 1 | 0 | 1 | 0 | 0% | `sd_scope_deliverables` |
| `scripts/modules/handoff/failure-pattern-capture.js` | 2 | 0 | 2 | 0 | 0% | `issue_patterns` |
| `scripts/modules/handoff/gates/auto-resolve-failures.js` | 1 | 1 | 0 | 0 | n/a | `sd_phase_handoffs` |
| `scripts/modules/handoff/gates/core-protocol-gate.js` | 1 | 0 | 1 | 0 | 0% | _(none)_ |
| `scripts/modules/handoff/gates/db-content-parity-gate.js` | 1 | 0 | 1 | 0 | 0% | `sd_verification_results` |
| `scripts/modules/handoff/gates/dfe-escalation-gate.js` | 1 | 0 | 1 | 0 | 0% | `governance_audit_log` |
| `scripts/modules/handoff/gates/multi-session-claim-gate.js` | 1 | 0 | 1 | 0 | 0% | `claude_sessions` |
| `scripts/modules/handoff/gates/subagent-evidence-gate.js` | 1 | 0 | 1 | 0 | 0% | `audit_log` |
| `scripts/modules/handoff/map-e2e-tests-to-stories.js` | 1 | 0 | 1 | 0 | 0% | `user_stories` |
| `scripts/modules/handoff/orchestrator-completion-guardian.js` | 7 | 3 | 4 | 0 | 0% | `issue_patterns`, `product_requirements_v2`, `retrospectives`, `sd_phase_handoffs`, `sd_scope_deliverables`, `strategic_directives_v2` |
| `scripts/modules/handoff/orchestrator-completion-hook.js` | 6 | 0 | 6 | 0 | 0% | `strategic_directives_v2`, `system_events` |
| `scripts/modules/handoff/pre-checks/pending-migrations-check.js` | 1 | 0 | 1 | 0 | 0% | _(none)_ |
| `scripts/modules/handoff/pre-checks/prerequisite-preflight.js` | 3 | 0 | 3 | 0 | 0% | `product_requirements_v2`, `strategic_directives_v2` |
| `scripts/modules/handoff/recording/HandoffRecorder.js` | 10 | 4 | 6 | 0 | 0% | `claude_sessions`, `leo_error_log`, `leo_handoff_executions`, `sd_phase_handoffs`, `validation_audit_log` |
| `scripts/modules/handoff/retrospective-enricher.js` | 1 | 1 | 0 | 0 | n/a | `retrospectives` |
| `scripts/modules/handoff/skip-and-continue.js` | 3 | 0 | 3 | 0 | 0% | `strategic_directives_v2`, `system_events` |
| `scripts/modules/handoff/validation/oiv/OIVGate.js` | 1 | 0 | 1 | 0 | 0% | `leo_integration_verification_results` |
| `scripts/modules/handoff/verifiers/plan-to-exec/PlanToExecVerifier.js` | 1 | 0 | 1 | 0 | 0% | `product_requirements_v2` |
| `scripts/modules/handoff/verifiers/plan-to-exec/rejection.js` | 1 | 0 | 1 | 0 | 0% | `leo_handoff_rejections` |
| `scripts/modules/handoff/verifiers/plan-to-exec/workflow-validation.js` | 1 | 1 | 0 | 0 | n/a | `sd_phase_handoffs` |
| `scripts/pocock/audit-provenance-emission.mjs` | 5 | 0 | 5 | 3 | 60% | _(none)_ |
| `scripts/pocock/auto-promote-glossary-term.mjs` | 2 | 0 | 2 | 0 | 0% | `pocock_glossary_terms`, `pocock_oos_findings` |
| `scripts/pocock/draft-adr-from-pivot.mjs` | 3 | 0 | 3 | 0 | 0% | `pocock_adrs`, `pocock_oos_findings` |
| `scripts/pocock/glossary-bypass-parity-check.mjs` | 1 | 0 | 1 | 0 | 0% | `feedback` |
| `scripts/pocock/grill-runner.mjs` | 3 | 0 | 3 | 0 | 0% | `grill_convergence_artifacts` |
| `scripts/pocock/regenerate-adr-docs.mjs` | 1 | 0 | 1 | 0 | 0% | _(none)_ |
| `scripts/pocock/weekly-deepening-report.mjs` | 3 | 0 | 3 | 0 | 0% | `architectural_prevention_findings`, `feedback`, `strategic_directives_v2` |

## Methodology

Scans `scripts/modules/handoff/`, `scripts/pocock/`, and `scripts/modules/validation/` for `.insert(`, `.update(`, and `.upsert(` call sites.
A call site is **in-scope** when its preceding `.from("<table>")` clause references a table NOT in the EXCLUDE_TABLES set.
A call site **emits** provenance when either the literal `provenance_source:` key OR a string matching the agent/human format regex appears within the 600 chars following the call.
Phase 1 is warn-only: this report is informational. Phase 2 cutover criteria are defined in the parent SD metadata.

Generator: `scripts/pocock/audit-provenance-emission.mjs`
