/**
 * Gate Exports Index for PLAN-TO-LEAD
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * Re-exports all gate creators for PLAN-TO-LEAD handoff
 */

export { createPrerequisiteCheckGate } from './prerequisite-check.js';
export { createSubAgentOrchestrationGate } from './sub-agent-orchestration.js';
export { createRetrospectiveQualityGate } from './retrospective-quality.js';
export { createGitCommitEnforcementGate } from './git-commit-enforcement.js';
export { createTraceabilityGate, createWorkflowROIGate, requiresTraceabilityGates } from './traceability-gates.js';
export { createUserStoryExistenceGate } from './user-story-existence.js';
export { createDocumentationLinkValidationGate } from './documentation-link-validation.js';
export { createHealBeforeCompleteGate } from './heal-before-complete.js';
export { createAcceptanceCriteriaValidationGate } from './acceptance-criteria-validation.js';
// SD-LEO-INFRA-MERGE-REDUNDANT-HANDOFF-001: Merged SUCCESS_METRICS gates
export { createSuccessMetricsGate, createSuccessMetricsAchievementGate, createSuccessMetricsVerificationGate } from './success-metrics-gate.js';
// SD-LEO-INFRA-MERGE-REDUNDANT-HANDOFF-001: vision-completion-score merged into heal-before-complete (advisory section)
// createVisionCompletionScoreGate removed — heal-before-complete already checks vision advisory
export { createArchitecturePlanValidationGate } from './architecture-plan-validation.js';
export { createSmokeTestEvidenceGate } from './smoke-test-evidence.js';
export { createFailureChainOrderingGate } from './failure-chain-ordering.js';

// Semantic Validation Gates (SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002)
export { createScopeAuditGate } from './scope-audit.js';
export { createChildScopeCoverageGate } from './child-scope-coverage.js';

// Acceptance Criteria Traceability (SD-MAN-INFRA-FIX-ORCHESTRATOR-CHILD-001-B)
export { createAcceptanceCriteriaTraceabilityGate } from './acceptance-criteria-traceability.js';

// Vision Fidelity Gate (SD-LEO-INFRA-VISION-FIDELITY-GATE-001 FR-2)
// Compares wireframe elements (eva_vision_documents.extracted_dimensions) against
// implementation evidence (PRD acceptance_criteria + git diff) via the
// vision-fidelity sub-agent. Severity tiering per sd_type — see severity-policy.js.
export { createVisionFidelityGate } from './vision-fidelity.js';

// RCA Feedback-Loop Enforcement (SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-G)
// Reuses the EXEC-TO-PLAN gate creator — readEnforcementMode + Pocock
// /diagnose Phase-1 discipline applies to RCA results emitted in either phase.
// sibling-import-allowed: re-exports the ENTIRE canonical gate factory — same implementation at two phases, no policy fork to drift (SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001)
export { createRcaFeedbackLoopGate } from '../../exec-to-plan/gates/rca-feedback-loop-gate.js';

// Cross-Repo Stage-Config Drift (SD-FDBK-INFRA-SYSTEMIC-CROSS-REPO-001)
// Makes the venture_stages SSOT -> sibling ehg venture-workflow.ts byte-parity drift VISIBLE
// to LEO at PLAN-TO-LEAD. Scoped-block (only a stage-config-relevant SD's real drift),
// WARN on unrelated pre-existing drift, fail-open on execution error.
export { createCrossRepoStageConfigDriftGate } from './cross-repo-stage-config-drift.js';

// Operator Contract Gate (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001, D8 build-vs-run)
// Blocks a CREATOR (new table/writer/flag/detector) that lacks its OPERATOR TRIPLE
// (consumer + armed cadence + reaper) unless a dated, audit-logged waiver applies.
// Fail-open on execution error — only an unambiguous incomplete-triple hard-blocks.
export { createOperatorContractGate } from '../../../../../../lib/gates/operator-contract/harness-adapter.js';
