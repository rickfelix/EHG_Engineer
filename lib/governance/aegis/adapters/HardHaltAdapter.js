/**
 * AEGIS Adapter: Hard Halt Protocol
 *
 * Backward-compatible wrapper that routes Hard Halt Protocol
 * enforcement through the AEGIS unified governance system.
 *
 * Rules migrated:
 * - HALT-001: Dead-man switch timeout check
 * - HALT-002: L2+ operation blocking during halt
 * - HALT-003: Chairman activity tracking
 * - HALT-004: Halt/restore authority validation
 *
 * @module aegis/adapters/HardHaltAdapter
 * @implements SD-AEGIS-GOVERNANCE-001
 */

import { getAegisEnforcer } from '../AegisEnforcer.js';
import { AEGIS_CONSTITUTIONS } from '../index.js';

// =============================================================================
// EXCEPTIONS (for backward compatibility)
// =============================================================================

export class HardHaltViolation extends Error {
  constructor(ruleCode, message, details = {}) {
    super(`HARD_HALT_VIOLATION [${ruleCode}]: ${message}`);
    this.name = 'HardHaltViolation';
    this.ruleCode = ruleCode;
    this.details = details;
    this.isRetryable = false;
  }
}

// =============================================================================
// HARD HALT ADAPTER
// =============================================================================

export class HardHaltAdapter {
  constructor(supabase = null) {
    this.supabase = supabase;
    this.aegisEnforcer = null;
    // AEGIS enforcement active by default (GOV-008)
    // Set USE_AEGIS=false to explicitly disable
    this.useAegis = process.env.USE_AEGIS !== 'false';
    this._initPromise = null;
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
        console.warn('[HardHaltAdapter] AEGIS initialization failed:', err.message);
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
   * Validate dead-man switch status
   *
   * @param {Object} params - Dead-man switch parameters
   * @param {number} params.hoursSinceActivity - Hours since last Chairman activity
   * @param {number} params.warningThreshold - Hours before warning (default 48)
   * @param {number} params.haltThreshold - Hours before auto-halt (default 72)
   * @returns {Promise<Object>} Validation result
   */
  async validateDeadManSwitch(params) {
    const {
      hoursSinceActivity,
      warningThreshold = 48,
      haltThreshold = 72
    } = params;

    if (!this.useAegis) {
      // Legacy validation
      return this._legacyValidateDeadManSwitch(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateDeadManSwitch(params);
    }

    // Build context for AEGIS validation
    const context = {
      hours_since_activity: hoursSinceActivity,
      warning_threshold: warningThreshold,
      halt_threshold: haltThreshold,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'HALT-001',
      context,
      { constitution: AEGIS_CONSTITUTIONS.HARD_HALT }
    );

    return {
      valid: result.passed,
      shouldWarn: hoursSinceActivity >= warningThreshold && hoursSinceActivity < haltThreshold,
      shouldHalt: hoursSinceActivity >= haltThreshold,
      hoursRemaining: Math.max(0, haltThreshold - hoursSinceActivity),
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy dead-man switch validation
   * @private
   */
  _legacyValidateDeadManSwitch(params) {
    const {
      hoursSinceActivity,
      warningThreshold = 48,
      haltThreshold = 72
    } = params;

    const issues = [];
    const shouldWarn = hoursSinceActivity >= warningThreshold && hoursSinceActivity < haltThreshold;
    const shouldHalt = hoursSinceActivity >= haltThreshold;

    if (shouldHalt) {
      issues.push(`Dead-man switch triggered: ${hoursSinceActivity.toFixed(1)}h without Chairman activity (threshold: ${haltThreshold}h)`);
    } else if (shouldWarn) {
      issues.push(`Dead-man switch warning: ${(haltThreshold - hoursSinceActivity).toFixed(1)}h until auto-halt`);
    }

    return {
      valid: !shouldHalt,
      shouldWarn,
      shouldHalt,
      hoursRemaining: Math.max(0, haltThreshold - hoursSinceActivity),
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Validate L2+ operation is allowed (not blocked by halt)
   *
   * @param {Object} params - Operation parameters
   * @param {string} params.agentLevel - Agent level (L1, L2, L3, L4)
   * @param {boolean} params.isHalted - Whether system is currently halted
   * @param {string} params.operationType - Type of operation being attempted
   * @returns {Promise<Object>} Validation result
   */
  async validateOperationAllowed(params) {
    const { agentLevel, isHalted, operationType } = params;

    if (!this.useAegis) {
      return this._legacyValidateOperationAllowed(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateOperationAllowed(params);
    }

    const context = {
      agent_level: agentLevel,
      is_halted: isHalted,
      operation_type: operationType,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'HALT-002',
      context,
      { constitution: AEGIS_CONSTITUTIONS.HARD_HALT }
    );

    return {
      valid: result.passed,
      allowed: result.passed,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy operation allowed validation
   * @private
   */
  _legacyValidateOperationAllowed(params) {
    const { agentLevel, isHalted, operationType } = params;
    const issues = [];

    // L4 (Crews) can complete in-flight tasks even during halt
    if (agentLevel === 'L4' || agentLevel === 'L4_CREW') {
      return {
        valid: true,
        allowed: true,
        issues: [],
        aegis_enabled: false
      };
    }

    // L2+ blocked during halt
    if (isHalted && ['L1', 'L2', 'L3', 'L1_CHAIRMAN', 'L2_CEO', 'L3_VP'].includes(agentLevel)) {
      issues.push(`Operation ${operationType} blocked: System is in Hard Halt state. ${agentLevel} operations are suspended.`);
    }

    return {
      valid: issues.length === 0,
      allowed: issues.length === 0,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Validate halt/restore authority
   *
   * @param {Object} params - Authority parameters
   * @param {string} params.actorLevel - Actor's authority level
   * @param {string} params.action - 'trigger' or 'restore'
   * @returns {Promise<Object>} Validation result
   */
  async validateHaltAuthority(params) {
    const { actorLevel, action } = params;

    if (!this.useAegis) {
      return this._legacyValidateHaltAuthority(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateHaltAuthority(params);
    }

    const context = {
      actor_level: actorLevel,
      action,
      timestamp: new Date().toISOString()
    };

    const ruleCode = action === 'trigger' ? 'HALT-003' : 'HALT-004';
    const result = await this.aegisEnforcer.validate(
      ruleCode,
      context,
      { constitution: AEGIS_CONSTITUTIONS.HARD_HALT }
    );

    return {
      valid: result.passed,
      authorized: result.passed,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy halt authority validation
   * @private
   */
  _legacyValidateHaltAuthority(params) {
    const { actorLevel, action } = params;
    const issues = [];

    // Only Chairman (L0/L1) can trigger/restore halt
    const authorizedLevels = ['L0_CHAIRMAN', 'L1_CHAIRMAN', 'L0', 'L1', 'SYSTEM_DEAD_MAN_SWITCH'];

    if (!authorizedLevels.includes(actorLevel)) {
      issues.push(`Only Chairman authority can ${action} Hard Halt. Actor level: ${actorLevel}`);
    }

    return {
      valid: issues.length === 0,
      authorized: issues.length === 0,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Enforce dead-man switch - throws if violated
   *
   * @param {Object} params - Dead-man switch parameters
   * @throws {HardHaltViolation} If dead-man switch should trigger
   */
  async enforceDeadManSwitch(params) {
    const result = await this.validateDeadManSwitch(params);

    if (!result.valid) {
      throw new HardHaltViolation(
        'HALT-001',
        result.issues[0] || 'Dead-man switch triggered',
        { params, result }
      );
    }

    return result;
  }

  /**
   * Enforce operation allowed - throws if blocked
   *
   * @param {Object} params - Operation parameters
   * @throws {HardHaltViolation} If operation is blocked
   */
  async enforceOperationAllowed(params) {
    const result = await this.validateOperationAllowed(params);

    if (!result.valid) {
      throw new HardHaltViolation(
        'HALT-002',
        result.issues[0] || 'Operation blocked during Hard Halt',
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
 * Get the singleton HardHaltAdapter instance
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {HardHaltAdapter}
 */
export function getHardHaltAdapter(supabase = null) {
  if (!_adapterInstance) {
    _adapterInstance = new HardHaltAdapter(supabase);
  }
  return _adapterInstance;
}

export default HardHaltAdapter;
