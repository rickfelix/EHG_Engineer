/**
 * Gate Exports for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 */

export {
  validateTransitionReadiness,
  createTransitionReadinessGate
} from './transition-readiness.js';

export {
  validateTargetApplication,
  createTargetApplicationGate
} from './target-application.js';

export {
  validateSdType,
  createSdTypeValidationGate
} from './sd-type-validation.js';

export {
  checkBaselineDebt,
  createBaselineDebtGate
} from './baseline-debt.js';

export {
  validateSmokeTestSpecification,
  createSmokeTestSpecificationGate
} from './smoke-test-specification.js';

export {
  ensureSDBranchExists,
  createBranchPreparationGate
} from './branch-preparation.js';

export {
  validatePlaceholderContent,
  createPlaceholderContentGate,
  isPlaceholderText,
  analyzePlaceholderContent
} from './placeholder-content.js';

// Lead Evaluation Check Gate (SD-MAN-ORCH-IMPROVE-STEP-LEAD-002-A)
export {
  validateLeadEvaluation,
  createLeadEvaluationGate
} from './lead-evaluation-check.js';

// Vision Score Gate (SD-MAN-INFRA-VISION-SCORE-GATE-001)
export {
  validateVisionScore,
  createVisionScoreGate
} from './vision-score.js';

// Cross-Repo Consumer Impact Gate (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-048)
export {
  validateCrossRepoConsumerImpact,
  createCrossRepoConsumerImpactGate
} from './cross-repo-consumer-impact.js';

// Pre-PLAN Adversarial Critique Gate (SD-LEO-INFRA-PRE-PLAN-ADVERSARIAL-001)
// Advisory only — runs critiquePlanProposal and persists to plan_critiques.
export {
  validatePrePlanCritique,
  createPrePlanCritiqueGate
} from './pre-plan-critique.js';

// Semantic Validation Gates (SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002)
export { createScopeReductionVerificationGate } from './scope-reduction-verification.js';
export { createSdTypeCompatibilityGate } from './sd-type-compatibility.js';
export { createOverlappingScopeDetectionGate } from './overlapping-scope-detection.js';

// Architecture Phase Coverage Gate (SD-LEO-INFRA-ARCHITECTURE-PHASE-COVERAGE-001)
export { createPhaseCoverageGate } from './phase-coverage.js';

// SD Quality Gate (SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001-A)
export { validateSdQuality, createSdQualityGate } from './sd-quality-gate.js';

// Translation Fidelity Gate (SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001)
// LLM-powered comparison of architecture plan → SD to detect translation gaps
export { createTranslationFidelityGate } from './translation-fidelity.js';
