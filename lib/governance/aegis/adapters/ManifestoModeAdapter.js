/**
 * AEGIS Adapter: Manifesto Mode
 *
 * Backward-compatible wrapper that routes Manifesto Mode
 * enforcement through the AEGIS unified governance system.
 *
 * Rules migrated:
 * - MANIF-001: Activation authority (L0_CHAIRMAN only)
 * - MANIF-002: L2+ operation verification when active
 * - MANIF-003: Version update authority
 * - MANIF-004: Deactivation requires mandatory reason
 *
 * @module aegis/adapters/ManifestoModeAdapter
 * @implements SD-AEGIS-GOVERNANCE-001
 */

import { getAegisEnforcer } from '../AegisEnforcer.js';
import { AEGIS_CONSTITUTIONS } from '../index.js';

// =============================================================================
// EXCEPTIONS (for backward compatibility)
// =============================================================================

export class ManifestoViolation extends Error {
  constructor(ruleCode, message, details = {}) {
    super(`MANIFESTO_VIOLATION [${ruleCode}]: ${message}`);
    this.name = 'ManifestoViolation';
    this.ruleCode = ruleCode;
    this.details = details;
    this.isRetryable = false;
  }
}

// =============================================================================
// MANIFESTO MODE ADAPTER
// =============================================================================

export class ManifestoModeAdapter {
  constructor(supabase = null) {
    this.supabase = supabase;
    this.aegisEnforcer = null;
    // AEGIS enforcement active by default (GOV-008)
    // Set USE_AEGIS=false to explicitly disable
    this.useAegis = process.env.USE_AEGIS !== 'false';
    this._initPromise = null;

    // Configuration from original ManifestoMode
    this.config = {
      minActivationAuthority: 'L0_CHAIRMAN',
      l2PlusOperations: [
        'venture_creation',
        'venture_pivot',
        'venture_termination',
        'budget_allocation',
        'agent_deployment',
        'strategic_directive',
        'crew_kickoff',
        'eva_decision'
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
        console.warn('[ManifestoModeAdapter] AEGIS initialization failed:', err.message);
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
   * Validate activation authority
   *
   * @param {Object} params - Activation parameters
   * @param {string} params.authorityLevel - Actor's authority level
   * @param {string} params.activatedBy - Actor ID
   * @returns {Promise<Object>} Validation result
   */
  async validateActivationAuthority(params) {
    const { authorityLevel, activatedBy } = params;

    if (!this.useAegis) {
      return this._legacyValidateActivationAuthority(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateActivationAuthority(params);
    }

    const context = {
      authority_level: authorityLevel,
      activated_by: activatedBy,
      required_authority: this.config.minActivationAuthority,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'MANIF-001',
      context,
      { constitution: AEGIS_CONSTITUTIONS.MANIFESTO_MODE }
    );

    return {
      valid: result.passed,
      authorized: result.passed,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy activation authority validation
   * @private
   */
  _legacyValidateActivationAuthority(params) {
    const { authorityLevel } = params;
    const issues = [];

    if (authorityLevel !== this.config.minActivationAuthority) {
      issues.push(`Only ${this.config.minActivationAuthority} can activate manifesto mode. Provided: ${authorityLevel}`);
    }

    return {
      valid: issues.length === 0,
      authorized: issues.length === 0,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Validate L2+ operation is allowed under manifesto governance
   *
   * @param {Object} params - Operation parameters
   * @param {string} params.operationType - Type of operation
   * @param {string} params.agentId - Agent attempting operation
   * @param {string} params.authorityLevel - Agent's authority level
   * @param {boolean} params.manifestoActive - Whether manifesto is active
   * @returns {Promise<Object>} Validation result
   */
  async validateL2PlusOperation(params) {
    const { operationType, agentId, authorityLevel, manifestoActive } = params;

    if (!this.useAegis) {
      return this._legacyValidateL2PlusOperation(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateL2PlusOperation(params);
    }

    const context = {
      operation_type: operationType,
      agent_id: agentId,
      authority_level: authorityLevel,
      manifesto_active: manifestoActive,
      l2_plus_operations: this.config.l2PlusOperations,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'MANIF-002',
      context,
      { constitution: AEGIS_CONSTITUTIONS.MANIFESTO_MODE }
    );

    return {
      valid: result.passed,
      allowed: result.passed,
      requiresOathEnforcement: manifestoActive && this.config.l2PlusOperations.includes(operationType),
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy L2+ operation validation
   * @private
   */
  _legacyValidateL2PlusOperation(params) {
    const { operationType, manifestoActive } = params;

    // If manifesto not active, all operations allowed
    if (!manifestoActive) {
      return {
        valid: true,
        allowed: true,
        manifestoActive: false,
        requiresOathEnforcement: false,
        issues: [],
        aegis_enabled: false
      };
    }

    // Check if this is an L2+ operation
    const requiresCheck = this.config.l2PlusOperations.includes(operationType);

    return {
      valid: true, // Operations allowed but logged
      allowed: true,
      manifestoActive: true,
      requiresOathEnforcement: requiresCheck,
      issues: [],
      aegis_enabled: false
    };
  }

  /**
   * Validate version update authority
   *
   * @param {Object} params - Version update parameters
   * @param {string} params.authorityLevel - Actor's authority level
   * @param {string} params.updatedBy - Actor ID
   * @param {string} params.newVersion - New version string
   * @param {string} params.changelog - Change description
   * @returns {Promise<Object>} Validation result
   */
  async validateVersionUpdate(params) {
    const { authorityLevel, updatedBy, newVersion, changelog } = params;

    if (!this.useAegis) {
      return this._legacyValidateVersionUpdate(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateVersionUpdate(params);
    }

    const context = {
      authority_level: authorityLevel,
      updated_by: updatedBy,
      new_version: newVersion,
      changelog,
      required_authority: this.config.minActivationAuthority,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'MANIF-003',
      context,
      { constitution: AEGIS_CONSTITUTIONS.MANIFESTO_MODE }
    );

    return {
      valid: result.passed,
      authorized: result.passed,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy version update validation
   * @private
   */
  _legacyValidateVersionUpdate(params) {
    const { authorityLevel } = params;
    const issues = [];

    if (authorityLevel !== this.config.minActivationAuthority) {
      issues.push(`Only ${this.config.minActivationAuthority} can update manifesto version. Provided: ${authorityLevel}`);
    }

    return {
      valid: issues.length === 0,
      authorized: issues.length === 0,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Validate deactivation (requires mandatory reason)
   *
   * @param {Object} params - Deactivation parameters
   * @param {string} params.authorityLevel - Actor's authority level
   * @param {string} params.deactivatedBy - Actor ID
   * @param {string} params.reason - MANDATORY reason for deactivation
   * @returns {Promise<Object>} Validation result
   */
  async validateDeactivation(params) {
    const { authorityLevel, deactivatedBy, reason } = params;

    if (!this.useAegis) {
      return this._legacyValidateDeactivation(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateDeactivation(params);
    }

    const context = {
      authority_level: authorityLevel,
      deactivated_by: deactivatedBy,
      reason,
      required_authority: this.config.minActivationAuthority,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'MANIF-004',
      context,
      { constitution: AEGIS_CONSTITUTIONS.MANIFESTO_MODE }
    );

    return {
      valid: result.passed,
      authorized: result.passed,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy deactivation validation
   * @private
   */
  _legacyValidateDeactivation(params) {
    const { authorityLevel, reason } = params;
    const issues = [];

    if (!reason) {
      issues.push('Deactivation reason is MANDATORY');
    }

    if (authorityLevel !== this.config.minActivationAuthority) {
      issues.push(`Only ${this.config.minActivationAuthority} can deactivate manifesto mode. Provided: ${authorityLevel}`);
    }

    return {
      valid: issues.length === 0,
      authorized: issues.length === 0,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Enforce activation authority - throws if violated
   *
   * @param {Object} params - Activation parameters
   * @throws {ManifestoViolation} If authority insufficient
   */
  async enforceActivationAuthority(params) {
    const result = await this.validateActivationAuthority(params);

    if (!result.valid) {
      throw new ManifestoViolation(
        'MANIF-001',
        result.issues[0] || 'Insufficient authority to activate manifesto',
        { params, result }
      );
    }

    return result;
  }

  /**
   * Enforce deactivation - throws if violated
   *
   * @param {Object} params - Deactivation parameters
   * @throws {ManifestoViolation} If validation fails
   */
  async enforceDeactivation(params) {
    const result = await this.validateDeactivation(params);

    if (!result.valid) {
      throw new ManifestoViolation(
        'MANIF-004',
        result.issues[0] || 'Deactivation validation failed',
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
 * Get the singleton ManifestoModeAdapter instance
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {ManifestoModeAdapter}
 */
export function getManifestoModeAdapter(supabase = null) {
  if (!_adapterInstance) {
    _adapterInstance = new ManifestoModeAdapter(supabase);
  }
  return _adapterInstance;
}

export default ManifestoModeAdapter;
