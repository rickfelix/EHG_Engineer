/**
 * BaseValidator - Abstract base class for AEGIS validators
 *
 * All validators must implement the validate() method.
 *
 * @module BaseValidator
 * @version 1.0.0
 */

export class BaseValidator {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Validate a rule against context
   * @abstract
   * @param {Object} rule - The rule to validate (includes validation_config)
   * @param {Object} context - The context to validate against
   * @returns {Promise<Object>} Validation result { passed, message, details }
   */
  async validate(rule, context) {
    throw new Error('validate() must be implemented by subclass');
  }

  /**
   * Get a nested value from an object using dot notation
   * @param {Object} obj - The object to search
   * @param {string} path - Dot-notation path (e.g., 'user.name')
   * @returns {*} The value at the path, or undefined
   */
  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Format a validation result
   * @param {boolean} passed - Whether validation passed
   * @param {string} message - Result message
   * @param {Object} [details] - Additional details
   * @returns {Object} Formatted result
   */
  formatResult(passed, message, details = {}) {
    return {
      passed,
      message,
      details,
      validator: this.constructor.name
    };
  }
}

export default BaseValidator;
