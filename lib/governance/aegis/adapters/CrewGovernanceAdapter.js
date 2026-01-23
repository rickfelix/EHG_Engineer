/**
 * AEGIS Adapter: Crew Governance
 *
 * Backward-compatible wrapper that routes Crew Governance
 * enforcement through the AEGIS unified governance system.
 *
 * Rules migrated:
 * - CREW-001: Venture ID required for crew execution
 * - CREW-002: PRD ID required (except meta-operations)
 * - CREW-003: Budget validation before execution
 * - CREW-004: Budget monitoring during execution
 * - CREW-005: Semantic validation of crew outputs
 *
 * @module aegis/adapters/CrewGovernanceAdapter
 * @implements SD-AEGIS-GOVERNANCE-001
 */

import { getAegisEnforcer } from '../AegisEnforcer.js';
import { AEGIS_CONSTITUTIONS } from '../index.js';

// =============================================================================
// EXCEPTIONS (for backward compatibility)
// =============================================================================

export class CrewGovernanceViolation extends Error {
  constructor(ruleCode, message, details = {}) {
    super(`CREW_GOVERNANCE_VIOLATION [${ruleCode}]: ${message}`);
    this.name = 'CrewGovernanceViolation';
    this.ruleCode = ruleCode;
    this.details = details;
    this.isRetryable = false;
  }
}

// =============================================================================
// CREW GOVERNANCE ADAPTER
// =============================================================================

export class CrewGovernanceAdapter {
  constructor(supabase = null) {
    this.supabase = supabase;
    this.aegisEnforcer = null;
    // AEGIS validation not yet fully wired up - use legacy logic by default
    // Set to true once AEGIS validators are complete
    this.useAegis = process.env.USE_AEGIS === 'true' || false;
    this._initPromise = null;

    // Configuration from original CrewGovernanceWrapper
    this.config = {
      requirePrdId: true,
      encourageSdId: true,
      budgetKillThreshold: 0,
      budgetWarningThreshold: 0.2,
      metaOperations: [
        'health_check',
        'status_report',
        'eva_scan',
        'system_diagnostic'
      ]
    };
  }

  /**
   * Initialize AEGIS enforcer lazily
   * @private
   */
  async _ensureInitialized() {
    if (this.aegisEnforcer) return;

    if (this._initPromise) {
      await this._initPromise;
      return;
    }

    this._initPromise = (async () => {
      try {
        // Only pass supabase if it's truthy, otherwise let getAegisEnforcer use defaults
        const options = this.supabase ? { supabase: this.supabase } : {};
        this.aegisEnforcer = await getAegisEnforcer(options);
      } catch (err) {
        console.warn('[CrewGovernanceAdapter] AEGIS initialization failed:', err.message);
        this.aegisEnforcer = null;
      }
    })();

    await this._initPromise;
  }

  /**
   * Toggle AEGIS mode
   * @param {boolean} enabled - Whether to use AEGIS
   */
  setAegisMode(enabled) {
    this.useAegis = enabled;
  }

  /**
   * Validate venture ID requirement
   *
   * @param {Object} params - Execution context
   * @param {string} params.ventureId - Venture ID
   * @param {string} params.executionId - Execution ID for tracking
   * @returns {Promise<Object>} Validation result
   */
  async validateVentureRequired(params) {
    const { ventureId, executionId } = params;

    if (!this.useAegis) {
      return this._legacyValidateVentureRequired(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateVentureRequired(params);
    }

    const context = {
      venture_id: ventureId,
      execution_id: executionId,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'CREW-001',
      context,
      { constitution: AEGIS_CONSTITUTIONS.CREW_GOVERNANCE }
    );

    return {
      valid: result.passed,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy venture required validation
   * @private
   */
  _legacyValidateVentureRequired(params) {
    const { ventureId } = params;
    const issues = [];

    if (!ventureId) {
      issues.push('venture_id is MANDATORY for crew execution (GOVERNED-ENGINE-v5.1.0)');
    }

    return {
      valid: issues.length === 0,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Validate PRD ID requirement
   *
   * @param {Object} params - Execution context
   * @param {string} params.prdId - PRD ID
   * @param {string} params.operationType - Operation type
   * @param {string} params.ventureId - Venture ID
   * @returns {Promise<Object>} Validation result
   */
  async validatePrdRequired(params) {
    const { prdId, operationType, ventureId } = params;

    if (!this.useAegis) {
      return this._legacyValidatePrdRequired(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidatePrdRequired(params);
    }

    const context = {
      prd_id: prdId,
      operation_type: operationType,
      venture_id: ventureId,
      meta_operations: this.config.metaOperations,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'CREW-002',
      context,
      { constitution: AEGIS_CONSTITUTIONS.CREW_GOVERNANCE }
    );

    return {
      valid: result.passed,
      isMetaOperation: this.config.metaOperations.includes(operationType),
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy PRD required validation
   * @private
   */
  _legacyValidatePrdRequired(params) {
    const { prdId, operationType } = params;
    const issues = [];

    const isMetaOperation = this.config.metaOperations.includes(operationType);

    if (this.config.requirePrdId && !prdId && !isMetaOperation) {
      issues.push('prd_id is REQUIRED for crew execution (GOVERNED-ENGINE-v5.1.0)');
    }

    return {
      valid: issues.length === 0,
      isMetaOperation,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Validate budget before execution
   *
   * @param {Object} params - Budget parameters
   * @param {string} params.ventureId - Venture ID
   * @param {number} params.budgetRemaining - Remaining budget
   * @param {number} params.budgetAllocated - Allocated budget
   * @returns {Promise<Object>} Validation result
   */
  async validateBudget(params) {
    const { ventureId, budgetRemaining, budgetAllocated } = params;

    if (!this.useAegis) {
      return this._legacyValidateBudget(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateBudget(params);
    }

    const context = {
      venture_id: ventureId,
      budget_remaining: budgetRemaining,
      budget_allocated: budgetAllocated,
      kill_threshold: this.config.budgetKillThreshold,
      warning_threshold: this.config.budgetWarningThreshold,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'CREW-003',
      context,
      { constitution: AEGIS_CONSTITUTIONS.CREW_GOVERNANCE }
    );

    const budgetPercentage = budgetAllocated > 0 ? budgetRemaining / budgetAllocated : 0;

    return {
      valid: result.passed,
      budgetExhausted: budgetRemaining <= this.config.budgetKillThreshold,
      shouldWarn: budgetPercentage < this.config.budgetWarningThreshold,
      budgetPercentage,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy budget validation
   * @private
   */
  _legacyValidateBudget(params) {
    const { budgetRemaining, budgetAllocated } = params;
    const issues = [];

    const budgetExhausted = budgetRemaining <= this.config.budgetKillThreshold;
    const budgetPercentage = budgetAllocated > 0 ? budgetRemaining / budgetAllocated : 0;
    const shouldWarn = budgetPercentage < this.config.budgetWarningThreshold;

    if (budgetExhausted) {
      issues.push(`Budget exhausted: ${budgetRemaining} tokens remaining`);
    }

    return {
      valid: !budgetExhausted,
      budgetExhausted,
      shouldWarn,
      budgetPercentage,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Validate SD ID encouragement (warning only)
   *
   * @param {Object} params - Execution context
   * @param {string} params.sdId - Strategic Directive ID
   * @param {string} params.executionId - Execution ID
   * @returns {Promise<Object>} Validation result (always valid, may include warning)
   */
  async validateSdEncouraged(params) {
    const { sdId, executionId } = params;
    const warnings = [];

    if (this.config.encourageSdId && !sdId) {
      warnings.push(`sd_id not provided for execution ${executionId}. Traceability limited.`);
    }

    return {
      valid: true, // Always valid (encouragement only)
      warnings,
      hasSdId: !!sdId,
      aegis_enabled: this.useAegis
    };
  }

  /**
   * Enforce venture ID requirement - throws if violated
   *
   * @param {Object} params - Execution context
   * @throws {CrewGovernanceViolation} If venture ID missing
   */
  async enforceVentureRequired(params) {
    const result = await this.validateVentureRequired(params);

    if (!result.valid) {
      throw new CrewGovernanceViolation(
        'CREW-001',
        result.issues[0] || 'venture_id is MANDATORY',
        { params, result }
      );
    }

    return result;
  }

  /**
   * Enforce PRD ID requirement - throws if violated
   *
   * @param {Object} params - Execution context
   * @throws {CrewGovernanceViolation} If PRD ID missing
   */
  async enforcePrdRequired(params) {
    const result = await this.validatePrdRequired(params);

    if (!result.valid) {
      throw new CrewGovernanceViolation(
        'CREW-002',
        result.issues[0] || 'prd_id is REQUIRED',
        { params, result }
      );
    }

    return result;
  }

  /**
   * Enforce budget requirement - throws if exhausted
   *
   * @param {Object} params - Budget parameters
   * @throws {CrewGovernanceViolation} If budget exhausted
   */
  async enforceBudget(params) {
    const result = await this.validateBudget(params);

    if (!result.valid) {
      throw new CrewGovernanceViolation(
        'CREW-003',
        result.issues[0] || 'Budget exhausted',
        { params, result }
      );
    }

    return result;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let _adapterInstance = null;

/**
 * Get the singleton CrewGovernanceAdapter instance
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {CrewGovernanceAdapter}
 */
export function getCrewGovernanceAdapter(supabase = null) {
  if (!_adapterInstance) {
    _adapterInstance = new CrewGovernanceAdapter(supabase);
  }
  return _adapterInstance;
}

export default CrewGovernanceAdapter;
