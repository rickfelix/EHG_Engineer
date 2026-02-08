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
