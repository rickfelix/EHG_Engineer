/**
 * SD Creation Validator
 * LEO Protocol v4.4 - Shift-Left Validation
 *
 * Prevents "hollow" SDs from being created by enforcing
 * strategic field requirements at creation time.
 *
 * ROOT CAUSE FIX: SD-STAGE-ARCH-001-P4 discovered that child SDs
 * were created without strategic fields, causing repeated handoff failures.
 * This module validates fields at creation time rather than handoff time.
 *
 * Usage:
 *   import { validateSDCreation, SD_FIELD_REQUIREMENTS } from './modules/sd-creation-validator.js';
 *   const result = validateSDCreation(sdData);
 *   if (!result.valid) { console.error(result.errors); process.exit(1); }
 *
 * @module sd-creation-validator
 * @version 1.0.0
 */

/**
 * Field requirements for SD creation validation
 * These match LEAD-TO-PLAN handoff requirements from LeadToPlanExecutor.js
 */
export const SD_FIELD_REQUIREMENTS = {
  // Strategic fields (LEAD-owned) - must exist at creation for child SDs
  strategic: {
    success_metrics: {
      required: true,
      minItems: 3,
      itemSchema: ['metric', 'target'],
      optionalFields: ['unit', 'baseline'],
      errorMessage: 'success_metrics must have 3+ items with {metric, target}'
    },
    key_principles: {
      required: true,
      minItems: 2,
      itemSchema: ['principle'],
      optionalFields: ['description'],
      // Also accepts string arrays for backward compatibility
      acceptsStringArray: true,
      errorMessage: 'key_principles must have 2+ items with {principle} or as strings'
    },
    strategic_objectives: {
      required: true,
      minItems: 2,
      itemSchema: ['objective'],
      optionalFields: ['metric'],
      acceptsStringArray: true,
      errorMessage: 'strategic_objectives must have 2+ items'
    },
    success_criteria: {
      required: true,
      minItems: 3,
      itemSchema: ['criterion'],
      optionalFields: ['measure'],
      acceptsStringArray: true,
      errorMessage: 'success_criteria must have 3+ items'
    },
    risks: {
      required: true,
      minItems: 0, // Can be empty array for low-risk SDs
      itemSchema: ['risk', 'severity', 'mitigation'],
      optionalFields: ['probability', 'impact', 'category'],
      errorMessage: 'risks must be defined (can be empty array [])'
    }
  },

  // Core fields (always required)
  core: {
    title: {
      required: true,
      minLength: 10,
      errorMessage: 'title must be at least 10 characters'
    },
    description: {
      required: true,
      minLength: 50,
      errorMessage: 'description must be at least 50 characters'
    },
    scope: {
      required: true,
      minLength: 30,
      errorMessage: 'scope must be at least 30 characters'
    },
    rationale: {
      required: true,
      minLength: 20,
      errorMessage: 'rationale must be at least 20 characters'
    },
    category: {
      required: true,
      validValues: ['feature', 'infrastructure', 'database', 'security', 'documentation', 'refactor', 'bug_fix', 'tech_debt'],
      errorMessage: 'category must be one of: feature, infrastructure, database, security, documentation, refactor, bug_fix, tech_debt'
    },
    priority: {
      required: true,
      validValues: ['critical', 'high', 'medium', 'low'],
      errorMessage: 'priority must be one of: critical, high, medium, low'
    }
  }
};

/**
 * Check if a value is a JSON string that should be an array
 * This catches the common mistake of using JSON.stringify() on JSONB fields
 * @param {any} value - The value to check
 * @returns {boolean} True if value is a stringified JSON array/object
 */
function isStringifiedJson(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  // Check if it looks like a JSON array or object
  return (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
         (trimmed.startsWith('{') && trimmed.endsWith('}'));
}

/**
 * Validate an array field against schema requirements
 * @param {Array} value - The array to validate
 * @param {Object} rules - Validation rules
 * @returns {Object} { valid: boolean, message: string }
 */
function validateArrayField(value, rules) {
  // CRITICAL: Catch JSON.stringify() misuse on JSONB fields
  // This is a common mistake that causes validation failures at handoff time
  if (isStringifiedJson(value)) {
    return {
      valid: false,
      message: 'is a JSON string instead of an array. Remove JSON.stringify() - Supabase handles JSONB natively'
    };
  }

  if (!Array.isArray(value)) {
    return { valid: false, message: 'must be an array' };
  }

  if (value.length < rules.minItems) {
    return { valid: false, message: `needs ${rules.minItems}+ items (got ${value.length})` };
  }

  // If array is empty and that's allowed, pass validation
  if (value.length === 0 && rules.minItems === 0) {
    return { valid: true };
  }

  // Check first item for schema compliance
  if (rules.itemSchema && value.length > 0) {
    const firstItem = value[0];

    // Accept string arrays if allowed
    if (rules.acceptsStringArray && typeof firstItem === 'string') {
      return { valid: true };
    }

    // Check for required schema fields
    if (typeof firstItem === 'object') {
      const missingKeys = rules.itemSchema.filter(k => !Object.prototype.hasOwnProperty.call(firstItem, k));
      if (missingKeys.length > 0) {
        return {
          valid: false,
          message: `items should have ${rules.itemSchema.join(', ')} (missing: ${missingKeys.join(', ')})`
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validate a string field against requirements
 * @param {string} value - The string to validate
 * @param {Object} rules - Validation rules
 * @returns {Object} { valid: boolean, message: string }
 */
function validateStringField(value, rules) {
  if (!value || typeof value !== 'string') {
    return { valid: false, message: 'is required' };
  }

  if (rules.minLength && value.length < rules.minLength) {
    return { valid: false, message: `must be at least ${rules.minLength} characters (got ${value.length})` };
  }

  if (rules.validValues && !rules.validValues.includes(value)) {
    return { valid: false, message: `must be one of: ${rules.validValues.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Calculate completion score for an SD
 * @param {Object} sdData - Strategic Directive data
 * @returns {number} Score 0-100
 */
function calculateCompletionScore(sdData) {
  let score = 0;
  const maxScore = 100;

  // Strategic fields: 60 points
  if (sdData.success_metrics?.length >= 3) score += 15;
  else if (sdData.success_metrics?.length >= 1) score += 5;

  if (sdData.key_principles?.length >= 2) score += 10;
  else if (sdData.key_principles?.length >= 1) score += 5;

  if (sdData.strategic_objectives?.length >= 2) score += 15;
  else if (sdData.strategic_objectives?.length >= 1) score += 5;

  if (sdData.success_criteria?.length >= 3) score += 10;
  else if (sdData.success_criteria?.length >= 1) score += 5;

  if (sdData.risks !== undefined) score += 10;

  // Core fields: 40 points
  if (sdData.title?.length >= 10) score += 10;
  if (sdData.description?.length >= 100) score += 10;
  else if (sdData.description?.length >= 50) score += 5;
  if (sdData.scope?.length >= 50) score += 10;
  else if (sdData.scope?.length >= 30) score += 5;
  if (sdData.rationale?.length >= 30) score += 5;
  if (sdData.category) score += 5;

  return Math.round((score / maxScore) * 100);
}

/**
 * Main validation function for SD creation
 *
 * @param {Object} sdData - Strategic Directive data to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.isChildSD - Whether this is a child SD (stricter validation)
 * @param {boolean} options.allowWarnings - Allow warnings but continue (default: true)
 * @returns {Object} { valid: boolean, canCreate: boolean, errors: [], warnings: [], score: number }
 */
export function validateSDCreation(sdData, options = {}) {
  const { isChildSD = !!sdData?.parent_sd_id, allowWarnings = true } = options;

  const errors = [];
  const warnings = [];

  // Validate core fields (always required)
  for (const [field, rules] of Object.entries(SD_FIELD_REQUIREMENTS.core)) {
    const value = sdData[field];
    const result = validateStringField(value, rules);
    if (!result.valid) {
      errors.push(`${field}: ${rules.errorMessage}`);
    }
  }

  // Validate strategic fields
  // For child SDs, these are required; for standalone SDs, they're warnings
  for (const [field, rules] of Object.entries(SD_FIELD_REQUIREMENTS.strategic)) {
    const value = sdData[field];

    // Check presence
    if (value === undefined || value === null) {
      if (field === 'risks') {
        // risks must be defined but can be empty
        if (isChildSD) {
          errors.push(`${field}: Must be defined (use [] for low-risk SDs)`);
        } else {
          warnings.push(`${field}: Should be defined (use [] for low-risk SDs)`);
        }
      } else {
        if (isChildSD) {
          errors.push(`${field}: ${rules.errorMessage}`);
        } else {
          warnings.push(`${field}: ${rules.errorMessage} (recommended for handoff success)`);
        }
      }
      continue;
    }

    // Validate array structure
    const result = validateArrayField(value, rules);
    if (!result.valid) {
      if (isChildSD) {
        errors.push(`${field}: ${result.message}`);
      } else {
        warnings.push(`${field}: ${result.message}`);
      }
    }
  }

  const score = calculateCompletionScore(sdData);
  const valid = errors.length === 0;
  const canCreate = valid || (allowWarnings && errors.length === 0);

  return {
    valid,
    canCreate,
    errors,
    warnings,
    score,
    isChildSD,
    summary: generateValidationSummary(sdData, errors, warnings, score)
  };
}

/**
 * Generate a human-readable validation summary
 */
function generateValidationSummary(sdData, errors, warnings, score) {
  const lines = [];
  lines.push(`SD Creation Validation: ${errors.length === 0 ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push(`Score: ${score}%`);

  if (errors.length > 0) {
    lines.push(`\nBlocking Errors (${errors.length}):`);
    errors.forEach(e => lines.push(`  ❌ ${e}`));
  }

  if (warnings.length > 0) {
    lines.push(`\nWarnings (${warnings.length}):`);
    warnings.forEach(w => lines.push(`  ⚠️  ${w}`));
  }

  return lines.join('\n');
}

/**
 * Quick validation check (returns boolean only)
 * @param {Object} sdData - Strategic Directive data
 * @returns {boolean} True if SD can be created
 */
export function canCreateSD(sdData) {
  const result = validateSDCreation(sdData);
  return result.canCreate;
}

/**
 * Get the list of missing required fields for a child SD
 * @param {Object} sdData - Strategic Directive data
 * @returns {string[]} List of missing field names
 */
export function getMissingChildFields(sdData) {
  const missing = [];

  for (const [field, rules] of Object.entries(SD_FIELD_REQUIREMENTS.strategic)) {
    const value = sdData[field];

    if (value === undefined || value === null) {
      missing.push(field);
      continue;
    }

    if (Array.isArray(value) && value.length < rules.minItems) {
      missing.push(`${field} (needs ${rules.minItems}+ items)`);
    }
  }

  return missing;
}

export default {
  validateSDCreation,
  canCreateSD,
  getMissingChildFields,
  SD_FIELD_REQUIREMENTS
};
