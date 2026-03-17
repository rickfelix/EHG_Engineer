/**
 * Input Validation Utilities for Express Routes
 * SD-LEO-FIX-API-ROUTE-AUTH-001
 *
 * Provides reusable validators for common input patterns:
 * - UUID format validation for IDs
 * - String length limits
 * - Enum validation
 */

/** UUID v4 regex pattern */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID v4 format.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Express middleware that validates req.params.id as a UUID.
 * Returns 400 if invalid.
 * @param {string} [paramName='id'] - The parameter name to validate
 */
export function validateUuidParam(paramName = 'id') {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!value || !isValidUuid(value)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Invalid ${paramName} format. Expected UUID.`,
        code: 'INVALID_UUID'
      });
    }
    next();
  };
}

/**
 * Validate that a string is within length bounds.
 * @param {string} value
 * @param {number} [maxLength=1000]
 * @returns {boolean}
 */
export function isValidStringLength(value, maxLength = 1000) {
  return typeof value === 'string' && value.length <= maxLength;
}

/**
 * Validate that a value is one of the allowed enum values.
 * @param {string} value
 * @param {string[]} allowedValues
 * @returns {boolean}
 */
export function isValidEnum(value, allowedValues) {
  return allowedValues.includes(value);
}

/**
 * Validate a positive integer within bounds.
 * @param {*} value
 * @param {number} [min=1]
 * @param {number} [max=100]
 * @returns {number|null} parsed integer or null if invalid
 */
export function parsePositiveInt(value, min = 1, max = 100) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
