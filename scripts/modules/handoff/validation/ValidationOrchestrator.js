/**
 * ValidationOrchestrator - Coordinates gate validations for handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Consolidates 7 duplicate gate validation patterns into a single orchestrator.
 * Provides consistent validation interface across all handoff types.
 */

import ResultBuilder from '../ResultBuilder.js';

export class ValidationOrchestrator {
  constructor(supabase, options = {}) {
    if (!supabase) {
      throw new Error('ValidationOrchestrator requires a Supabase client');
    }
    this.supabase = supabase;

    // Allow injection of validators for testing
    this.validators = options.validators || {};

    // Schema constraints cache
    this.constraintsCache = null;
    this.constraintsCacheExpiry = 0;
  }

  /**
   * Validate a single gate with consistent logging
   * @param {string} gateName - Gate identifier
   * @param {function} validator - Async validation function
   * @param {object} context - Validation context
   * @returns {Promise<object>} Validation result
   */
  async validateGate(gateName, validator, context = {}) {
    console.log(`\n🔍 Validating ${gateName}`);
    console.log('-'.repeat(50));

    try {
      const result = await validator(context);

      // Normalize result structure
      // FIX: Accept both 'pass' and 'passed' field names for compatibility
      // ROOT CAUSE: Some validators return { pass: true } while others return { passed: true }
      // This caused gates to fail even when validators returned pass: true (SD-VISION-V2-005 fix)
      const normalizedResult = {
        passed: result.passed ?? result.pass ?? (result.score >= (result.max_score || result.maxScore || 100)),
        score: result.score ?? 0,
        maxScore: result.max_score || result.maxScore || 100,
        issues: result.issues || [],
        warnings: result.warnings || [],
        details: result.details || result
      };

      ResultBuilder.logGateResult(gateName, normalizedResult, !normalizedResult.passed);

      return normalizedResult;
    } catch (error) {
      console.error(`\n❌ ${gateName} validation error: ${error.message}`);
      return {
        passed: false,
        score: 0,
        maxScore: 100,
        issues: [`Validation error: ${error.message}`],
        warnings: [],
        error: error.message
      };
    }
  }

  /**
   * Run multiple gates in sequence, stopping on first failure
   * @param {array} gates - Array of gate definitions
   * @param {object} context - Shared context
   * @returns {Promise<object>} Combined result with normalized scoring
   *
   * SCORING SYSTEM (Fixed: was summing scores, now uses weighted average)
   * - Each gate contributes a score (0-100) and optional weight
   * - Default weight is 1.0 for all gates
   * - normalizedScore = weighted average of all gate scores (0-100%)
   * - totalScore/totalMaxScore preserved for backward compatibility
   */
  async validateGates(gates, context = {}) {
    const results = {
      passed: true,
      totalScore: 0,           // Sum of raw scores (backward compat)
      totalMaxScore: 0,        // Sum of max scores (backward compat)
      normalizedScore: 0,      // NEW: Weighted average percentage (0-100)
      gateCount: 0,            // NEW: Number of gates evaluated
      gateResults: {},
      failedGate: null,
      issues: [],
      warnings: []
    };

    // Track weighted scores for normalization
    let weightedScoreSum = 0;
    let totalWeight = 0;

    for (const gate of gates) {
      // Check condition if provided
      if (gate.condition && !(await gate.condition(context))) {
        console.log(`⏭️  Skipping ${gate.name} (condition not met)`);
        continue;
      }

      const gateResult = await this.validateGate(gate.name, gate.validator, context);
      results.gateResults[gate.name] = gateResult;

      // Backward compat: sum raw scores
      results.totalScore += gateResult.score;
      results.totalMaxScore += gateResult.maxScore;
      results.gateCount++;

      // NEW: Calculate weighted contribution
      // Gate weight defaults to 1.0, can be customized per gate
      const gateWeight = gate.weight || 1.0;
      const gatePercentage = gateResult.maxScore > 0
        ? (gateResult.score / gateResult.maxScore) * 100
        : 0;
      weightedScoreSum += gatePercentage * gateWeight;
      totalWeight += gateWeight;

      results.warnings.push(...gateResult.warnings);

      if (!gateResult.passed && gate.required !== false) {
        results.passed = false;
        results.failedGate = gate.name;
        results.issues.push(...gateResult.issues);
        break; // Stop on first required failure
      }
    }

    // Calculate normalized score as weighted average (0-100%)
    results.normalizedScore = totalWeight > 0
      ? Math.round(weightedScoreSum / totalWeight)
      : 0;

    return results;
  }

  /**
   * Pre-validate data against database schema constraints
   * @param {string} tableName - Target table
   * @param {object} data - Data to validate
   * @returns {Promise<object>} Validation result
   */
  async preValidateData(tableName, data) {
    const result = { valid: true, errors: [], hints: [] };

    try {
      const constraints = await this.loadSchemaConstraints(tableName);

      if (!constraints || constraints.length === 0) {
        return result;
      }

      console.log(`🔍 Pre-validating ${Object.keys(data).length} fields against ${constraints.length} constraints for ${tableName}`);

      for (const constraint of constraints) {
        const fieldValue = data[constraint.column_name];

        if (fieldValue === undefined) {
          continue;
        }

        switch (constraint.constraint_type) {
          case 'check':
          case 'enum':
            if (constraint.valid_values && Array.isArray(constraint.valid_values)) {
              if (!constraint.valid_values.includes(fieldValue)) {
                result.valid = false;
                result.errors.push({
                  field: constraint.column_name,
                  value: fieldValue,
                  constraint: constraint.constraint_type,
                  message: `Invalid value '${fieldValue}' for ${constraint.column_name}`,
                  validValues: constraint.valid_values
                });
                if (constraint.remediation_hint) {
                  result.hints.push(constraint.remediation_hint);
                }
              }
            }
            break;

          case 'not_null':
            if (fieldValue === null || fieldValue === '') {
              result.valid = false;
              result.errors.push({
                field: constraint.column_name,
                value: fieldValue,
                constraint: 'not_null',
                message: `${constraint.column_name} cannot be null or empty`
              });
              if (constraint.remediation_hint) {
                result.hints.push(constraint.remediation_hint);
              }
            }
            break;
        }
      }

      if (!result.valid) {
        this._logPreValidationFailure(tableName, result);
      } else {
        console.log(`✅ Pre-validation passed for ${tableName}`);
      }

    } catch (error) {
      console.warn(`⚠️  Could not load constraints for ${tableName}: ${error.message}`);
    }

    return result;
  }

  /**
   * Load schema constraints from database (with caching)
   */
  async loadSchemaConstraints(tableName) {
    const now = Date.now();
    const CACHE_TTL_MS = 5 * 60 * 1000;

    if (this.constraintsCache && now < this.constraintsCacheExpiry) {
      return this.constraintsCache.filter(c => c.table_name === tableName);
    }

    const { data, error } = await this.supabase
      .from('leo_schema_constraints')
      .select('*')
      .order('table_name');

    if (error) {
      if (error.code === '42P01') {
        console.log('ℹ️  leo_schema_constraints table not yet created - skipping pre-validation');
        return [];
      }
      throw error;
    }

    this.constraintsCache = data || [];
    this.constraintsCacheExpiry = now + CACHE_TTL_MS;

    return this.constraintsCache.filter(c => c.table_name === tableName);
  }

  _logPreValidationFailure(tableName, result) {
    console.error('');
    console.error('❌ PRE-VALIDATION FAILED');
    console.error('='.repeat(60));
    console.error(`   Table: ${tableName}`);
    console.error(`   Errors: ${result.errors.length}`);
    console.error('');
    result.errors.forEach((err, idx) => {
      console.error(`   ${idx + 1}. ${err.field}: ${err.message}`);
      if (err.validValues) {
        console.error(`      Valid values: ${err.validValues.join(', ')}`);
      }
    });
    if (result.hints.length > 0) {
      console.error('');
      console.error('   HINTS:');
      result.hints.forEach(hint => console.error(`   - ${hint}`));
    }
    console.error('='.repeat(60));
  }

  clearCache() {
    this.constraintsCache = null;
    this.constraintsCacheExpiry = 0;
  }
}

export default ValidationOrchestrator;
