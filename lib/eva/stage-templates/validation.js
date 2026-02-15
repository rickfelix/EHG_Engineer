/**
 * Shared validation utilities for stage templates.
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * @module lib/eva/stage-templates/validation
 */

/**
 * Validate a string field meets minimum length.
 * @param {*} value
 * @param {string} fieldName
 * @param {number} minLength
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateString(value, fieldName, minLength = 1) {
  if (value === undefined || value === null) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  if (value.trim().length < minLength) {
    return { valid: false, error: `${fieldName} must be at least ${minLength} characters (got ${value.trim().length})` };
  }
  return { valid: true };
}

/**
 * Validate an integer in range [min, max].
 * @param {*} value
 * @param {string} fieldName
 * @param {number} min
 * @param {number} max
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateInteger(value, fieldName, min = 0, max = 100) {
  if (value === undefined || value === null) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (!Number.isInteger(value)) {
    return { valid: false, error: `${fieldName} must be an integer (got ${typeof value}: ${value})` };
  }
  if (value < min || value > max) {
    return { valid: false, error: `${fieldName} must be between ${min} and ${max} (got ${value})` };
  }
  return { valid: true };
}

/**
 * Validate a number >= min.
 * @param {*} value
 * @param {string} fieldName
 * @param {number} min
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateNumber(value, fieldName, min = 0) {
  if (value === undefined || value === null) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, error: `${fieldName} must be a finite number (got ${value})` };
  }
  if (value < min) {
    return { valid: false, error: `${fieldName} must be >= ${min} (got ${value})` };
  }
  return { valid: true };
}

/**
 * Validate an array field meets minimum items.
 * @param {*} value
 * @param {string} fieldName
 * @param {number} minItems
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateArray(value, fieldName, minItems = 1) {
  if (!Array.isArray(value)) {
    return { valid: false, error: `${fieldName} must be an array` };
  }
  if (value.length < minItems) {
    return { valid: false, error: `${fieldName} must have at least ${minItems} item(s) (got ${value.length})` };
  }
  return { valid: true };
}

/**
 * Validate an enum value.
 * @param {*} value
 * @param {string} fieldName
 * @param {string[]} allowed
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEnum(value, fieldName, allowed) {
  if (!allowed.includes(value)) {
    return { valid: false, error: `${fieldName} must be one of [${allowed.join(', ')}] (got '${value}')` };
  }
  return { valid: true };
}

/**
 * Collect validation errors from an array of results.
 * @param {{ valid: boolean, error?: string }[]} results
 * @returns {string[]}
 */
export function collectErrors(results) {
  return results.filter(r => !r.valid).map(r => r.error);
}

/**
 * Validate cross-stage contract: check that upstream stage data
 * contains the required fields with correct types/constraints.
 *
 * Contract spec format:
 *   { fieldName: { type: 'string'|'number'|'integer'|'array'|'object', required?: boolean, minLength?: number, min?: number, minItems?: number } }
 *
 * @param {Object} upstreamData - Data from the upstream stage
 * @param {Object} contractSpec - Required fields and their constraints
 * @param {string} stageLabel - Label for error messages (e.g., 'stage-01')
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCrossStageContract(upstreamData, contractSpec, stageLabel) {
  const errors = [];

  if (!upstreamData || typeof upstreamData !== 'object') {
    return { valid: false, errors: [`${stageLabel} data is required for cross-stage validation`] };
  }

  for (const [field, spec] of Object.entries(contractSpec)) {
    const value = upstreamData[field];
    const fieldLabel = `${stageLabel}.${field}`;
    const required = spec.required !== false;

    if (value === undefined || value === null) {
      if (required) {
        errors.push(`${fieldLabel} is required by cross-stage contract`);
      }
      continue;
    }

    switch (spec.type) {
      case 'string': {
        const r = validateString(value, fieldLabel, spec.minLength || 1);
        if (!r.valid) errors.push(r.error);
        break;
      }
      case 'number': {
        const r = validateNumber(value, fieldLabel, spec.min ?? 0);
        if (!r.valid) errors.push(r.error);
        break;
      }
      case 'integer': {
        const r = validateInteger(value, fieldLabel, spec.min ?? 0, spec.max ?? Number.MAX_SAFE_INTEGER);
        if (!r.valid) errors.push(r.error);
        break;
      }
      case 'array': {
        const r = validateArray(value, fieldLabel, spec.minItems ?? 1);
        if (!r.valid) errors.push(r.error);
        break;
      }
      case 'object': {
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`${fieldLabel} must be an object`);
        }
        break;
      }
      default:
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}
