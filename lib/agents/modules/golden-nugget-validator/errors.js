/**
 * Golden Nugget Validator - Error Classes Module
 *
 * Custom error types for validation failures.
 *
 * @module lib/agents/modules/golden-nugget-validator/errors
 */

/**
 * GoldenNuggetValidationException - Thrown when stage transition validation fails
 * SD-HARDENING-V2-004: Hard block on validation failure
 * THE LAW: No stage transition without passing Golden Nugget validation.
 */
export class GoldenNuggetValidationException extends Error {
  constructor(stageId, validationResults) {
    const summary = [
      `Stage ${stageId} validation FAILED:`,
      validationResults.missing_artifacts.length > 0 ? `  Missing artifacts: ${validationResults.missing_artifacts.join(', ')}` : null,
      validationResults.quality_failures.length > 0 ? `  Quality failures: ${validationResults.quality_failures.map(f => f.artifact_type).join(', ')}` : null,
      validationResults.epistemic_gaps.length > 0 ? `  Epistemic gaps: ${validationResults.epistemic_gaps.length}` : null,
      validationResults.gate_failures.length > 0 ? `  Gate failures: ${validationResults.gate_failures.map(f => f.gate_description).join(', ')}` : null,
      validationResults.semantic_failures?.length > 0 ? `  Semantic failures: ${validationResults.semantic_failures.map(f => f.reason).join(', ')}` : null
    ].filter(Boolean).join('\n');

    super(summary);
    this.name = 'GoldenNuggetValidationException';
    this.isRetryable = false;  // Fix the artifacts, don't retry blindly
    this.stageId = stageId;
    this.validationResults = validationResults;
  }
}
