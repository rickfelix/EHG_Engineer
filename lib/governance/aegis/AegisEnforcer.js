/**
 * AegisEnforcer - Core enforcement engine for AEGIS governance system
 *
 * Features:
 * - Validates operations against loaded rules
 * - Supports multiple enforcement actions (BLOCK, WARN, AUDIT)
 * - Records violations to unified audit log
 * - Caches rules for performance
 * - Supports override with justification
 *
 * @module AegisEnforcer
 * @version 1.0.0
 */

import { AegisRuleLoader } from './AegisRuleLoader.js';
import { AegisViolationRecorder } from './AegisViolationRecorder.js';
import { FieldCheckValidator } from './validators/FieldCheckValidator.js';
import { ThresholdValidator } from './validators/ThresholdValidator.js';
import { RoleForbiddenValidator } from './validators/RoleForbiddenValidator.js';
import { CountLimitValidator } from './validators/CountLimitValidator.js';
import { CustomValidator } from './validators/CustomValidator.js';
import { AEGIS_ENFORCEMENT_ACTION, AEGIS_VALIDATION_TYPE } from './index.js';

/**
 * Custom error for AEGIS violations
 */
export class AegisViolationError extends Error {
  constructor(violations, constitution, context = {}) {
    const messages = violations.map(v => `[${v.severity}] ${v.rule_code}: ${v.message}`);
    super(`AEGIS Violation: ${messages.join('; ')}`);
    this.name = 'AegisViolationError';
    this.violations = violations;
    this.constitution = constitution;
    this.context = context;
    this.isBlocking = violations.some(v =>
      v.enforcement_action === AEGIS_ENFORCEMENT_ACTION.BLOCK ||
      v.enforcement_action === AEGIS_ENFORCEMENT_ACTION.BLOCK_OVERRIDABLE
    );
  }
}

/**
 * AegisEnforcer - Core enforcement engine
 */
export class AegisEnforcer {
  constructor(options = {}) {
    this.ruleLoader = options.ruleLoader || new AegisRuleLoader(options);
    this.violationRecorder = options.violationRecorder || new AegisViolationRecorder(options);
    this.supabase = options.supabase || this.ruleLoader.supabase;
    this._validators = new Map();

    // Initialize validators
    this._initializeValidators();
  }

  /**
   * Initialize validator instances
   * @private
   */
  _initializeValidators() {
    this._validators.set(AEGIS_VALIDATION_TYPE.FIELD_CHECK, new FieldCheckValidator());
    this._validators.set(AEGIS_VALIDATION_TYPE.THRESHOLD, new ThresholdValidator());
    this._validators.set(AEGIS_VALIDATION_TYPE.ROLE_FORBIDDEN, new RoleForbiddenValidator());
    this._validators.set(AEGIS_VALIDATION_TYPE.COUNT_LIMIT, new CountLimitValidator({ supabase: this.supabase }));
    this._validators.set(AEGIS_VALIDATION_TYPE.CUSTOM, new CustomValidator({ supabase: this.supabase }));
  }

  /**
   * Get validator for a validation type
   * @private
   */
  _getValidator(validationType) {
    return this._validators.get(validationType);
  }

  /**
   * Validate a single rule against context
   * @param {Object} rule - The rule to validate
   * @param {Object} context - The context to validate against
   * @returns {Promise<Object>} Validation result
   */
  async validateRule(rule, context) {
    const validator = this._getValidator(rule.validation_type);

    if (!validator) {
      console.warn(`[AegisEnforcer] No validator found for type: ${rule.validation_type}`);
      return {
        passed: true,
        rule,
        message: `Validator not found for type: ${rule.validation_type}`
      };
    }

    try {
      const result = await validator.validate(rule, context);
      return {
        ...result,
        rule,
        enforcement_action: rule.enforcement_action,
        severity: rule.severity
      };
    } catch (err) {
      console.error(`[AegisEnforcer] Error validating rule ${rule.rule_code}:`, err.message);
      return {
        passed: false,
        rule,
        message: `Validation error: ${err.message}`,
        error: err.message
      };
    }
  }

  /**
   * Validate all rules for a constitution against context
   * @param {string} constitutionCode - Constitution to validate against
   * @param {Object} context - The context to validate
   * @param {Object} options - Additional options
   * @param {boolean} [options.recordViolations=true] - Whether to record violations
   * @param {boolean} [options.incrementStats=true] - Whether to increment rule stats
   * @returns {Promise<Object>} Validation result
   */
  async validate(constitutionCode, context, options = {}) {
    const { recordViolations = true, incrementStats = true } = options;

    // Check if constitution is enforced
    const constitution = await this.ruleLoader.getConstitution(constitutionCode);
    if (!constitution) {
      return {
        passed: true,
        message: `Constitution ${constitutionCode} not found`,
        violations: [],
        constitution: null
      };
    }

    if (constitution.enforcement_mode === 'disabled') {
      return {
        passed: true,
        message: `Constitution ${constitutionCode} is disabled`,
        violations: [],
        constitution
      };
    }

    // Load rules in dependency order
    const rules = await this.ruleLoader.loadRulesWithDependencies(constitutionCode);

    const violations = [];
    const warnings = [];
    const auditEntries = [];

    // Validate each rule
    for (const rule of rules) {
      const result = await this.validateRule(rule, context);

      // Increment stats if enabled
      if (incrementStats && this.supabase) {
        this._incrementRuleStats(rule.id, !result.passed);
      }

      if (!result.passed) {
        const violation = {
          rule_id: rule.id,
          rule_code: rule.rule_code,
          rule_name: rule.rule_name,
          message: result.message,
          severity: rule.severity,
          enforcement_action: rule.enforcement_action,
          details: result.details || {}
        };

        // Categorize by enforcement action
        if (rule.enforcement_action === AEGIS_ENFORCEMENT_ACTION.BLOCK ||
            rule.enforcement_action === AEGIS_ENFORCEMENT_ACTION.BLOCK_OVERRIDABLE) {
          violations.push(violation);
        } else if (rule.enforcement_action === AEGIS_ENFORCEMENT_ACTION.WARN_AND_LOG) {
          warnings.push(violation);
        } else if (rule.enforcement_action === AEGIS_ENFORCEMENT_ACTION.AUDIT_ONLY) {
          auditEntries.push(violation);
        }

        // Record violation if enabled
        if (recordViolations) {
          await this.violationRecorder.recordViolation({
            rule_id: rule.id,
            constitution_id: constitution.id,
            violation_type: rule.validation_type,
            severity: rule.severity,
            message: result.message,
            payload: result.details,
            ...context
          });
        }
      }
    }

    const passed = violations.length === 0;
    const hasWarnings = warnings.length > 0;

    return {
      passed,
      constitution,
      violations,
      warnings,
      auditEntries,
      hasWarnings,
      rulesChecked: rules.length,
      violationCount: violations.length,
      warningCount: warnings.length,
      auditCount: auditEntries.length,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Enforce a constitution - throws on blocking violations
   * @param {string} constitutionCode - Constitution to enforce
   * @param {Object} context - The context to validate
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Validation result (if no blocking violations)
   * @throws {AegisViolationError} If blocking violations found
   */
  async enforce(constitutionCode, context, options = {}) {
    const result = await this.validate(constitutionCode, context, options);

    if (!result.passed) {
      throw new AegisViolationError(result.violations, result.constitution, context);
    }

    // Log warnings even when passed
    if (result.hasWarnings) {
      console.warn(`[AegisEnforcer] ${constitutionCode} passed with ${result.warningCount} warnings`);
      for (const warning of result.warnings) {
        console.warn(`  - [${warning.severity}] ${warning.rule_code}: ${warning.message}`);
      }
    }

    return result;
  }

  /**
   * Validate all enabled constitutions against context
   * @param {Object} context - The context to validate
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Combined validation result
   */
  async validateAll(context, options = {}) {
    const constitutions = await this.ruleLoader.loadConstitutions();
    const results = {};
    const allViolations = [];
    const allWarnings = [];

    for (const constitution of constitutions) {
      if (constitution.enforcement_mode === 'disabled') continue;

      const result = await this.validate(constitution.code, context, options);
      results[constitution.code] = result;

      if (!result.passed) {
        allViolations.push(...result.violations.map(v => ({
          ...v,
          constitution_code: constitution.code
        })));
      }

      if (result.hasWarnings) {
        allWarnings.push(...result.warnings.map(w => ({
          ...w,
          constitution_code: constitution.code
        })));
      }
    }

    return {
      passed: allViolations.length === 0,
      results,
      allViolations,
      allWarnings,
      constitutionsChecked: Object.keys(results).length,
      totalViolations: allViolations.length,
      totalWarnings: allWarnings.length,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Enforce all enabled constitutions
   * @param {Object} context - The context to validate
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Combined validation result
   * @throws {AegisViolationError} If any blocking violations found
   */
  async enforceAll(context, options = {}) {
    const result = await this.validateAll(context, options);

    if (!result.passed) {
      throw new AegisViolationError(result.allViolations, 'MULTIPLE', context);
    }

    return result;
  }

  /**
   * Check if an operation can be overridden
   * @param {Array} violations - Array of violations
   * @returns {boolean} True if all violations can be overridden
   */
  canOverride(violations) {
    return violations.every(v =>
      v.enforcement_action === AEGIS_ENFORCEMENT_ACTION.BLOCK_OVERRIDABLE ||
      v.enforcement_action === AEGIS_ENFORCEMENT_ACTION.WARN_AND_LOG
    );
  }

  /**
   * Override violations with justification
   * @param {Array} violationIds - IDs of violations to override
   * @param {string} justification - Justification for override
   * @param {string} overriddenBy - Who is overriding
   * @returns {Promise<Object>} Override result
   */
  async overrideViolations(violationIds, justification, overriddenBy) {
    if (!justification || justification.length < 10) {
      throw new Error('Override justification must be at least 10 characters');
    }

    const results = [];
    for (const id of violationIds) {
      const result = await this.violationRecorder.overrideViolation(id, justification, overriddenBy);
      results.push(result);
    }

    return {
      success: true,
      overriddenCount: results.length,
      results
    };
  }

  /**
   * Increment rule statistics
   * @private
   */
  async _incrementRuleStats(ruleId, wasBlocked) {
    if (!this.supabase) return;

    try {
      await this.supabase.rpc('aegis_increment_rule_stats', {
        p_rule_id: ruleId,
        p_was_blocked: wasBlocked
      });
    } catch (err) {
      // Non-critical, just log
      console.warn(`[AegisEnforcer] Failed to increment stats for rule ${ruleId}:`, err.message);
    }
  }

  /**
   * Clear rule cache
   */
  clearCache() {
    this.ruleLoader.clearCache();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let _instance = null;

/**
 * Get the AegisEnforcer singleton instance
 * @param {Object} options - Options for initialization
 * @returns {AegisEnforcer}
 */
export function getAegisEnforcer(options = {}) {
  if (!_instance) {
    _instance = new AegisEnforcer(options);
  }
  return _instance;
}

export default AegisEnforcer;
