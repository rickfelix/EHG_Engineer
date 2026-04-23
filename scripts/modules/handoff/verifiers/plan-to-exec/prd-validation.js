/**
 * PRD Validation for PLAN-TO-EXEC Verifier
 *
 * Validates PRD quality for execution phase handoff.
 *
 * Extracted from the legacy verify-handoff-plan-to-exec script (now removed) for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

/**
 * PRD Quality Requirements (LEO Protocol v4.1.2)
 */
export const PRD_REQUIREMENTS = {
  minimumScore: 100, // MAXIMUM standard - 100% completeness required
  requiredFields: [
    'executive_summary',
    'functional_requirements',
    'system_architecture',      // Updated from technical_requirements
    'acceptance_criteria',
    'test_scenarios',           // Updated from success_metrics
    'implementation_approach',  // Updated from constraints
    'risks'                     // Updated from risk_assessment
  ],
  minimumFunctionalReqs: 3,
  minimumTechnicalReqs: 2,
  minimumAcceptanceCriteria: 5
};

/**
 * Basic PRD validation fallback
 *
 * @param {Object} prd - PRD object
 * @returns {Object} - Validation result with valid, score, errors, warnings, percentage
 */
export function basicPRDValidation(prd) {
  const validation = {
    valid: true,
    score: 0,
    maxScore: 100,
    errors: [],
    warnings: []
  };

  // Check required fields
  PRD_REQUIREMENTS.requiredFields.forEach(field => {
    // Check direct field first, then metadata fallback for fields that may not exist as columns
    let value = prd[field];
    // Fallback to metadata if column value is missing OR is an empty array
    const isEmptyOrMissing = value === null || value === undefined || (Array.isArray(value) && value.length === 0);
    if (isEmptyOrMissing && prd.metadata && prd.metadata[field]) {
      value = prd.metadata[field];
    }
    const isPresent = value !== null && value !== undefined;

    if (!isPresent) {
      validation.valid = false;
      validation.errors.push(`Missing required field: ${field}`);
    } else {
      // For strings, check if non-empty after trim
      if (typeof value === 'string' && !value.trim()) {
        validation.valid = false;
        validation.errors.push(`Empty required field: ${field}`);
      } else if (Array.isArray(value) && value.length === 0) {
        validation.valid = false;
        validation.errors.push(`Empty array for required field: ${field}`);
      } else {
        validation.score += 10;
      }
    }
  });

  // Check functional requirements count
  if (prd.functional_requirements) {
    const funcReqs = Array.isArray(prd.functional_requirements)
      ? prd.functional_requirements
      : JSON.parse(prd.functional_requirements || '[]');

    if (funcReqs.length < PRD_REQUIREMENTS.minimumFunctionalReqs) {
      validation.errors.push(`Insufficient functional requirements: ${funcReqs.length}/${PRD_REQUIREMENTS.minimumFunctionalReqs}`);
      validation.valid = false;
    }
  }

  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 (PAT-HF-PLANTOEXEC-4c03f832 — 5 occurrences):
  // Previously validated PRESENCE of implementation_approach only. Thin stubs
  // (1-phase, no file refs) passed this gate but failed downstream quality rubrics.
  // Now also validate SHAPE: require either a substantive string (>=200 chars)
  // OR an object with phases[] containing >=2 entries.
  const implApproach = prd.implementation_approach
    ?? prd?.metadata?.implementation_approach
    ?? null;
  if (implApproach !== null && implApproach !== undefined) {
    const isThinString = typeof implApproach === 'string' && implApproach.trim().length < 200;
    const isThinObject = typeof implApproach === 'object'
      && !Array.isArray(implApproach)
      && (!Array.isArray(implApproach.phases) || implApproach.phases.length < 2);
    if (isThinString || isThinObject) {
      validation.warnings.push(
        `Thin implementation_approach: ${isThinString
          ? `string only ${implApproach.trim().length} chars (min 200)`
          : `object has ${implApproach?.phases?.length || 0} phases (min 2)`
        }. Downstream quality rubric may reject.`
      );
    }
  }

  validation.percentage = Math.round((validation.score / 70) * 100); // Adjust for available points
  return validation;
}

/**
 * PAT-PARENT-DET: Validate parent orchestrator PRD
 * Parent orchestrators have different requirements than implementation PRDs:
 * - Focus on decomposition structure and children coordination
 * - Don't need system_architecture or implementation_approach
 * - Need metadata.is_orchestrator_prd and decomposition_structure
 *
 * @param {Object} prd - PRD object
 * @returns {Object} - Validation result
 */
export function validateParentOrchestratorPRD(prd) {
  const validation = {
    valid: true,
    score: 0,
    maxScore: 100,
    errors: [],
    warnings: [],
    percentage: 0
  };

  // Required fields for parent orchestrator PRD
  const requiredFields = [
    'id',
    'title',
    'executive_summary',
    'functional_requirements'
  ];

  // Check required fields
  let fieldScore = 0;
  requiredFields.forEach(field => {
    const value = prd[field];
    const isPresent = value !== null && value !== undefined;

    if (!isPresent) {
      validation.errors.push(`Missing required field: ${field}`);
      validation.valid = false;
    } else if (typeof value === 'string' && !value.trim()) {
      validation.errors.push(`Empty required field: ${field}`);
      validation.valid = false;
    } else if (Array.isArray(value) && value.length === 0) {
      validation.errors.push(`Empty array for required field: ${field}`);
      validation.valid = false;
    } else {
      fieldScore += 20; // 20 points per field, 80 total for 4 fields
    }
  });

  // Check for orchestrator metadata
  if (prd.metadata?.is_orchestrator_prd === true) {
    fieldScore += 10;
  } else {
    validation.warnings.push('PRD metadata.is_orchestrator_prd not set to true');
  }

  // Check for decomposition_structure
  if (prd.metadata?.decomposition_structure) {
    fieldScore += 10;
  } else {
    validation.warnings.push('PRD metadata.decomposition_structure not present');
  }

  validation.score = fieldScore;
  validation.percentage = Math.min(100, fieldScore);

  // Parent orchestrator PRDs pass with 80% (functional requirements present)
  if (validation.percentage >= 80 || validation.errors.length === 0) {
    validation.valid = true;
  }

  return validation;
}
