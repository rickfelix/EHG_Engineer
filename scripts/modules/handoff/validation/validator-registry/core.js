/**
 * ValidatorRegistry Core Class
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 *
 * Core registry methods without builtin validators.
 * Validators are registered by gate modules.
 */

/**
 * ValidatorRegistry - Maps database rule_name to validator functions
 */
export class ValidatorRegistry {
  constructor() {
    /** @type {Map<string, {validate: Function, description: string}>} */
    this.validators = new Map();

    /** @type {Map<string, Function>} */
    this.fallbackValidators = new Map();
  }

  /**
   * Register a validator for a specific rule_name
   * @param {string} ruleName - The rule_name from leo_validation_rules
   * @param {Function} validatorFn - The validation function
   * @param {string} [description] - Optional description
   */
  register(ruleName, validatorFn, description = '') {
    if (typeof validatorFn !== 'function') {
      throw new Error(`Validator for ${ruleName} must be a function`);
    }

    this.validators.set(ruleName, {
      validate: validatorFn,
      description: description || ruleName
    });
  }

  /**
   * Get a validator by rule_name
   * @param {string} ruleName - The rule_name to look up
   * @returns {Function|null} The validator function or null if not found
   */
  get(ruleName) {
    const entry = this.validators.get(ruleName);
    if (entry) {
      return entry.validate;
    }

    // Check for fallback
    if (this.fallbackValidators.has(ruleName)) {
      return this.fallbackValidators.get(ruleName);
    }

    return null;
  }

  /**
   * Check if a validator exists for the given rule_name
   * @param {string} ruleName - The rule_name to check
   * @returns {boolean}
   */
  has(ruleName) {
    return this.validators.has(ruleName) || this.fallbackValidators.has(ruleName);
  }

  /**
   * Get all registered rule names
   * @returns {string[]}
   */
  getRegisteredRules() {
    return Array.from(this.validators.keys());
  }

  /**
   * Create a fallback validator that passes with a warning
   * @param {string} ruleName - The rule_name
   * @param {string} reason - Why this is a fallback
   * @returns {Function}
   */
  createFallbackValidator(ruleName, reason = 'Validator not implemented') {
    return async () => {
      console.warn(`Warning: Fallback validator for ${ruleName}: ${reason}`);
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`${ruleName}: ${reason} - auto-passing`],
        details: {
          isFallback: true,
          reason
        }
      };
    };
  }

  /**
   * Get or create a validator (with fallback if not registered)
   * @param {string} ruleName - The rule_name
   * @param {object} ruleConfig - Rule configuration from database
   * @returns {Function}
   */
  getOrCreateFallback(ruleName, ruleConfig = {}) {
    const validator = this.get(ruleName);
    if (validator) {
      return validator;
    }

    // Create and cache a fallback
    const fallback = this.createFallbackValidator(
      ruleName,
      `No validator registered for ${ruleConfig.validator_module || 'unknown module'}.${ruleConfig.validator_function || ruleName}`
    );
    this.fallbackValidators.set(ruleName, fallback);

    return fallback;
  }

  /**
   * Normalize validator result to standard format
   * @param {object} result - Raw validator result
   * @returns {object} Normalized result
   */
  normalizeResult(result) {
    // Handle both 'passed' and 'pass' field names
    const passed = result.passed ?? result.pass ?? (result.score >= (result.max_score || result.maxScore || 100));

    return {
      passed,
      score: result.score ?? 0,
      max_score: result.max_score ?? result.maxScore ?? 100,
      issues: result.issues || [],
      warnings: result.warnings || [],
      details: result.details || result
    };
  }

  /**
   * Get registration statistics
   * @returns {object}
   */
  getStats() {
    const stats = {
      totalRegistered: this.validators.size,
      totalFallbacks: this.fallbackValidators.size,
      byCategory: {}
    };

    // Categorize by prefix
    for (const ruleName of this.validators.keys()) {
      const prefix = ruleName.replace(/[A-Z].*/, '');
      stats.byCategory[prefix] = (stats.byCategory[prefix] || 0) + 1;
    }

    return stats;
  }
}
