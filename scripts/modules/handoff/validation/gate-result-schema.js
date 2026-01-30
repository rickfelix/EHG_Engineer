/**
 * Gate Result Schema Validation
 * SD-LEO-INFRA-HARDENING-001: Enforces consistent gate result structure
 *
 * Validates that all gate results conform to the expected schema,
 * catching malformed results early before they cause downstream issues.
 */

/**
 * Required fields in a gate result
 */
const GATE_RESULT_SCHEMA = {
  required: ['passed', 'score', 'maxScore'],
  optional: ['issues', 'warnings', 'details', 'error', 'skipReason', 'skipDetails'],
  types: {
    passed: 'boolean',
    score: 'number',
    maxScore: 'number',
    issues: 'array',
    warnings: 'array',
    details: 'object',
    error: 'string',
    skipReason: 'string',
    skipDetails: 'string'
  },
  defaults: {
    passed: false,
    score: 0,
    maxScore: 100,
    issues: [],
    warnings: [],
    details: {}
  }
};

/**
 * Validation error class for gate results
 */
export class GateResultValidationError extends Error {
  constructor(gateName, errors) {
    super(`Gate result validation failed for ${gateName}: ${errors.join('; ')}`);
    this.name = 'GateResultValidationError';
    this.gateName = gateName;
    this.validationErrors = errors;
  }
}

/**
 * Validate a gate result against the expected schema
 * @param {Object} result - The gate result to validate
 * @param {string} gateName - Name of the gate (for error messages)
 * @param {Object} options - Validation options
 * @param {boolean} options.strict - Throw error on validation failure (default: false)
 * @param {boolean} options.autoFix - Auto-fix missing fields with defaults (default: true)
 * @returns {Object} Validated and normalized result
 */
export function validateGateResult(result, gateName = 'unknown', options = {}) {
  const { strict = false, autoFix = true } = options;
  const errors = [];
  const warnings = [];

  // Handle null/undefined result
  if (result === null || result === undefined) {
    errors.push('Gate result is null or undefined');
    if (strict) {
      throw new GateResultValidationError(gateName, errors);
    }
    return autoFix ? { ...GATE_RESULT_SCHEMA.defaults } : null;
  }

  // Validate it's an object
  if (typeof result !== 'object' || Array.isArray(result)) {
    errors.push(`Gate result must be an object, got ${typeof result}`);
    if (strict) {
      throw new GateResultValidationError(gateName, errors);
    }
    return autoFix ? { ...GATE_RESULT_SCHEMA.defaults } : result;
  }

  // Create normalized result
  const normalized = { ...result };

  // Handle 'pass' vs 'passed' field (common inconsistency)
  if (normalized.pass !== undefined && normalized.passed === undefined) {
    normalized.passed = normalized.pass;
    delete normalized.pass;
    warnings.push("Used 'pass' instead of 'passed' - auto-corrected");
  }

  // Handle 'max_score' vs 'maxScore' (snake_case vs camelCase)
  if (normalized.max_score !== undefined && normalized.maxScore === undefined) {
    normalized.maxScore = normalized.max_score;
    delete normalized.max_score;
    warnings.push("Used 'max_score' instead of 'maxScore' - auto-corrected");
  }

  // Validate required fields
  for (const field of GATE_RESULT_SCHEMA.required) {
    if (normalized[field] === undefined) {
      if (autoFix && GATE_RESULT_SCHEMA.defaults[field] !== undefined) {
        normalized[field] = GATE_RESULT_SCHEMA.defaults[field];
        warnings.push(`Missing required field '${field}' - set to default: ${JSON.stringify(GATE_RESULT_SCHEMA.defaults[field])}`);
      } else {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Validate field types
  for (const [field, expectedType] of Object.entries(GATE_RESULT_SCHEMA.types)) {
    if (normalized[field] === undefined) continue;

    const actualValue = normalized[field];
    const actualType = Array.isArray(actualValue) ? 'array' : typeof actualValue;

    if (actualType !== expectedType) {
      // Attempt type coercion for common cases
      if (autoFix) {
        if (expectedType === 'boolean' && typeof actualValue === 'number') {
          normalized[field] = actualValue > 0;
          warnings.push(`Coerced ${field} from number to boolean`);
        } else if (expectedType === 'number' && typeof actualValue === 'string') {
          const parsed = parseFloat(actualValue);
          if (!isNaN(parsed)) {
            normalized[field] = parsed;
            warnings.push(`Coerced ${field} from string to number`);
          } else {
            errors.push(`Field '${field}' expected ${expectedType}, got ${actualType} (could not coerce)`);
          }
        } else if (expectedType === 'array' && actualType !== 'array') {
          normalized[field] = [actualValue];
          warnings.push(`Wrapped ${field} in array`);
        } else {
          errors.push(`Field '${field}' expected ${expectedType}, got ${actualType}`);
        }
      } else {
        errors.push(`Field '${field}' expected ${expectedType}, got ${actualType}`);
      }
    }
  }

  // Validate score is within maxScore bounds
  if (typeof normalized.score === 'number' && typeof normalized.maxScore === 'number') {
    if (normalized.score < 0) {
      if (autoFix) {
        normalized.score = 0;
        warnings.push('Score was negative, set to 0');
      } else {
        errors.push('Score cannot be negative');
      }
    }
    if (normalized.score > normalized.maxScore) {
      if (autoFix) {
        normalized.score = normalized.maxScore;
        warnings.push(`Score exceeded maxScore, capped at ${normalized.maxScore}`);
      } else {
        errors.push(`Score (${normalized.score}) exceeds maxScore (${normalized.maxScore})`);
      }
    }
    if (normalized.maxScore <= 0) {
      if (autoFix) {
        normalized.maxScore = 100;
        warnings.push('maxScore was <= 0, set to 100');
      } else {
        errors.push('maxScore must be positive');
      }
    }
  }

  // Ensure passed aligns with score (unless explicitly set)
  if (autoFix && normalized.passed === undefined) {
    normalized.passed = normalized.score >= normalized.maxScore * 0.6; // 60% default threshold
    warnings.push(`Inferred 'passed' from score: ${normalized.passed}`);
  }

  // Attach validation metadata
  normalized._validation = {
    validated: true,
    gateName,
    errors,
    warnings,
    autoFixed: autoFix && (errors.length > 0 || warnings.length > 0)
  };

  if (strict && errors.length > 0) {
    throw new GateResultValidationError(gateName, errors);
  }

  // Log warnings if any
  if (warnings.length > 0) {
    console.log(`   ⚠️  Gate ${gateName} result normalized with ${warnings.length} fix(es)`);
  }

  return normalized;
}

/**
 * Validate all gate results in a batch
 * @param {Object} gateResults - Map of gate name -> result
 * @param {Object} options - Validation options
 * @returns {Object} Validated gate results with summary
 */
export function validateGateResultsBatch(gateResults, options = {}) {
  const validated = {};
  const summary = {
    totalGates: 0,
    validGates: 0,
    fixedGates: 0,
    invalidGates: 0,
    errors: [],
    warnings: []
  };

  for (const [gateName, result] of Object.entries(gateResults)) {
    summary.totalGates++;

    try {
      const normalizedResult = validateGateResult(result, gateName, options);
      validated[gateName] = normalizedResult;

      if (normalizedResult._validation?.autoFixed) {
        summary.fixedGates++;
        summary.warnings.push(...normalizedResult._validation.warnings.map(w => `${gateName}: ${w}`));
      }

      if (normalizedResult._validation?.errors?.length > 0) {
        summary.invalidGates++;
        summary.errors.push(...normalizedResult._validation.errors.map(e => `${gateName}: ${e}`));
      } else {
        summary.validGates++;
      }
    } catch (error) {
      summary.invalidGates++;
      summary.errors.push(`${gateName}: ${error.message}`);
      validated[gateName] = {
        passed: false,
        score: 0,
        maxScore: 100,
        issues: [`Validation failed: ${error.message}`],
        warnings: [],
        _validation: { validated: false, error: error.message }
      };
    }
  }

  return { validated, summary };
}

/**
 * Quick check if a result is valid (without auto-fixing)
 * @param {Object} result - The gate result to check
 * @returns {boolean} True if valid
 */
export function isValidGateResult(result) {
  if (!result || typeof result !== 'object') return false;

  const passed = result.passed ?? result.pass;
  if (typeof passed !== 'boolean') return false;

  const score = result.score;
  if (typeof score !== 'number' || score < 0) return false;

  const maxScore = result.maxScore ?? result.max_score ?? 100;
  if (typeof maxScore !== 'number' || maxScore <= 0) return false;

  return true;
}

export { GATE_RESULT_SCHEMA };
