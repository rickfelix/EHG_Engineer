/**
 * Gate Exports Index
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * Re-exports all gate creators for PLAN-TO-EXEC handoff
 */

export { createPrerequisiteCheckGate } from './prerequisite-check.js';
export { createPrdExistsGate, createArchitectureVerificationGate } from './prd-gates.js';
export { createContractComplianceGate } from './contract-gates.js';
export { createDesignDatabaseGate, shouldValidateDesignDatabase } from './design-database-gates.js';
export { createExplorationAuditGate, validateExplorationAudit, MINIMUM_FILES, ADEQUATE_FILES, COMPREHENSIVE_FILES } from './exploration-audit.js';
export { createDeliverablesPlanningGate, validateDeliverablesPlanning } from './deliverables-planning.js';
export { createBranchEnforcementGate } from './branch-enforcement.js';
export { createInfrastructureConsumerCheckGate, generateFollowUpSD, REASON_CODES } from './infrastructure-consumer-check.js';
export { createIntegrationSectionValidationGate, REQUIRED_SUBSECTIONS, SUBSECTION_NAMES, BLOCKING_SD_TYPES, WARNING_SD_TYPES, SKIP_SD_TYPES, ERROR_CODE_PREFIX } from './integration-section-validation.js';
export { createMigrationDataVerificationGate } from './migration-data-verification.js';
export { createArchitecturalPatternChecklistGate } from './architectural-pattern-checklist.js';
export { createPlanningCompletenessGate, validatePlanningCompleteness, BLOCKING_SD_TYPES as PLANNING_BLOCKING_SD_TYPES, ADVISORY_SD_TYPES } from './planning-completeness.js';

// Semantic Validation Gates (SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002)
export { createVisionDimensionCompletenessGate } from './vision-dimension-completeness.js';
export { createArchitectureRequirementTraceGate } from './architecture-requirement-trace.js';

// Wireframe Gates (SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001)
export { createWireframeRequiredGate } from './wireframe-required.js';

// Translation Fidelity Gate — PLAN-TO-EXEC (SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001)
// Second invocation: catches drift after PRD/planning work
export { createTranslationFidelityGate } from './translation-fidelity.js';

// Bugfix Coverage Preflight — advisory only, shifts EXEC-TO-PLAN discovery left
// Part of SD-LEARN-FIX-ADDRESS-PAT-EXECTOPLAN-001 (FR-3) addressing PAT-HF-EXECTOPLAN-a14ec7de
export { createBugfixCoveragePreflightGate } from './bugfix-coverage-preflight.js';

// Cross-SD File-Overlap Temporal Gate (SD-LEO-INFRA-CROSS-FILE-OVERLAP-001 FR-2a)
// Detects file overlap with SDs shipped within the configured window
// (default 48h) using PRD target_files as the oracle.
export { createCrossSdFileOverlapTemporalGate } from './cross-sd-file-overlap-temporal.js';
