/**
 * Golden Nugget Validator - Content Quality Validation for Stage Transitions
 *
 * SD-HARDENING-V2-003: Golden Nugget Validation
 * SD-HARDENING-V2-004: Heuristic to Hard Gates
 * - Validates artifact CONTENT against stages_v2.yaml requirements
 * - Enforces quality gates: existence is NOT enough
 * - BLOCKS stage transitions when artifacts don't meet minimum quality standards
 *
 * THE LAW: Existence is NOT enough. Quality is MANDATORY for transition.
 * THE LAW v2: Gate failures are BLOCKERS, not warnings.
 *
 * Modularized: See lib/agents/modules/golden-nugget-validator/ for implementation.
 */

// Re-export all functionality from modularized modules
export {
  // Error Classes
  GoldenNuggetValidationException,

  // Semantic Validation
  checkSemanticEntropy,
  validateSemanticKeywords,
  checkEpistemicClassification,

  // Design Fidelity
  checkDesignFidelity,

  // Stage Configuration
  getStageRequirements,
  reloadStagesConfig,
  getStagesConfig,
  getStagesById,

  // Artifact Validation
  validateArtifactQuality,

  // Exit Gate Validation
  validateExitGate
} from './modules/golden-nugget-validator/index.js';

// Import for local use
import { getStageRequirements } from './modules/golden-nugget-validator/stage-config.js';
import { validateArtifactQuality } from './modules/golden-nugget-validator/artifact-validation.js';
import { validateExitGate } from './modules/golden-nugget-validator/exit-gate-validation.js';

/**
 * Validate Golden Nuggets - artifact CONTENT quality
 * THE LAW: Existence is NOT enough. Quality is MANDATORY for transition.
 *
 * Validation checks:
 * 1. Required artifacts exist in handoff package
 * 2. Artifact content is not empty
 * 3. Artifact content meets minimum length requirements
 * 4. Special artifacts have required fields (e.g., hypothesis structure)
 * 5. Exit gates are satisfied
 * 6. Epistemic classification if required
 *
 * @param {number} stageId - Stage being transitioned FROM
 * @param {Array} artifacts - Artifacts in handoff package
 * @returns {Promise<Object>} Validation results {passed, missing_artifacts, quality_failures, epistemic_gaps}
 */
export async function validateGoldenNuggets(stageId, artifacts) {
  console.log(`\n[GoldenNuggetValidator] Validating Golden Nuggets for stage ${stageId}`);

  const stageRequirements = getStageRequirements(stageId);
  const validationResults = {
    passed: true,
    missing_artifacts: [],
    quality_failures: [],
    epistemic_gaps: [],
    gate_failures: []
  };

  console.log(`   Stage: ${stageRequirements.stage_title || stageId}`);
  console.log(`   Required artifacts: ${stageRequirements.required_outputs.length}`);
  console.log(`   Exit gates: ${stageRequirements.exit_gates.length}`);

  // Check each required artifact exists and has quality content
  for (const requiredType of stageRequirements.required_outputs) {
    const artifact = artifacts.find(a => a.type === requiredType);

    if (!artifact) {
      console.log(`   Missing required artifact: ${requiredType}`);
      validationResults.missing_artifacts.push(requiredType);
      validationResults.passed = false;
    } else {
      // Validate artifact quality
      const qualityCheck = validateArtifactQuality(artifact, requiredType);
      if (!qualityCheck.valid) {
        console.log(`   Quality failure for ${requiredType}: ${qualityCheck.reason}`);
        validationResults.quality_failures.push({
          artifact_type: requiredType,
          reason: qualityCheck.reason,
          details: qualityCheck.details
        });
        validationResults.passed = false;
      } else {
        console.log(`   Artifact ${requiredType}: ${qualityCheck.details.content_length} chars`);
      }
    }
  }

  // Check epistemic classification if required
  if (stageRequirements.epistemic_required) {
    console.log(`   Epistemic classification REQUIRED for stage ${stageId}`);

    // Look for epistemic_classification artifact or metadata
    const epistemicArtifact = artifacts.find(a =>
      a.type === 'epistemic_classification' ||
      a.metadata?.epistemic_classification
    );

    if (!epistemicArtifact) {
      console.log('   Missing epistemic classification (Four Buckets: Facts/Assumptions/Simulations/Unknowns)');
      validationResults.epistemic_gaps.push({
        stage_id: stageId,
        requirement: 'All claims must be classified as Facts, Assumptions, Simulations, or Unknowns',
        found: false
      });
      validationResults.passed = false;
    } else {
      console.log('   Epistemic classification provided');
    }
  }

  // Validate exit gates (if any are explicitly checkable)
  // SD-HARDENING-V2-004: Gate failures are BLOCKERS, not warnings
  for (const gate of stageRequirements.exit_gates) {
    const gateCheck = validateExitGate(gate, artifacts);
    if (!gateCheck.passed) {
      console.log(`   Exit gate BLOCKED: ${gate}`);
      console.log(`      Reason: ${gateCheck.reason}`);
      validationResults.gate_failures.push({
        gate_description: gate,
        reason: gateCheck.reason
      });
      // SD-HARDENING-V2-004: Gate failures are BLOCKERS
      validationResults.passed = false;
    }
  }

  if (validationResults.passed) {
    console.log('   All Golden Nugget validations PASSED');
  } else {
    console.log('   Golden Nugget validation FAILED');
    console.log(`      Missing: ${validationResults.missing_artifacts.length}`);
    console.log(`      Quality issues: ${validationResults.quality_failures.length}`);
    console.log(`      Epistemic gaps: ${validationResults.epistemic_gaps.length}`);
  }

  return validationResults;
}
