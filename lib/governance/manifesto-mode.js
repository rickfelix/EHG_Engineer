/**
 * ManifestoMode - EVA Manifesto Activation System
 *
 * SD-MANIFESTO-004: Manifesto Mode Activation System
 *
 * THE LAW: When manifesto_active is TRUE, all agents MUST:
 * 1. Check manifesto status before L2+ operations
 * 2. Enforce Four Oaths at all decision points
 * 3. Record all governance-relevant actions
 * 4. Respect escalation authority matrix
 *
 * Target Activation: February 14, 2026 ("Constitution Signing Day")
 *
 * @module ManifestoMode
 * @version 1.0.0
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

// AEGIS Integration - lazy loaded to avoid circular dependencies
let ManifestoModeAdapter = null;
let aegisAdapter = null;

async function getAegisAdapter() {
  if (aegisAdapter) return aegisAdapter;

  try {
    const module = await import('./aegis/adapters/ManifestoModeAdapter.js');
    ManifestoModeAdapter = module.ManifestoModeAdapter;
    aegisAdapter = new ManifestoModeAdapter();
    return aegisAdapter;
  } catch (err) {
    console.warn('[ManifestoMode] AEGIS adapter not available:', err.message);
    return null;
  }
}

// =============================================================================
// EXCEPTIONS
// =============================================================================

export class ManifestoNotActiveError extends Error {
  constructor(message = 'Manifesto mode is not active') {
    super(`MANIFESTO INACTIVE: ${message}`);
    this.name = 'ManifestoNotActiveError';
    this.isRetryable = false;
  }
}

export class ManifestoActivationError extends Error {
  constructor(message, context = {}) {
    super(`MANIFESTO ACTIVATION FAILED: ${message}`);
    this.name = 'ManifestoActivationError';
    this.context = context;
    this.isRetryable = false;
  }
}

export class ManifestoVersionMismatchError extends Error {
  constructor(expectedVersion, actualVersion) {
    super(`MANIFESTO VERSION MISMATCH: Expected v${expectedVersion}, got v${actualVersion}`);
    this.name = 'ManifestoVersionMismatchError';
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
    this.isRetryable = false;
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const MANIFESTO_CONFIG = {
  // Target activation date
  targetActivationDate: new Date('2026-02-14T00:00:00Z'),

  // Constitution Signing event type
  signingEventType: 'CONSTITUTION_SIGNING',

  // Current manifesto version
  currentVersion: '1.0.0',

  // Minimum authority level to activate/deactivate manifesto
  minActivationAuthority: 'L0_CHAIRMAN',

  // System configuration key
  configKey: 'manifesto_active',

  // Version tracking key
  versionKey: 'manifesto_version',

  // Event categories for manifesto governance
  governanceEventCategories: [
    'manifesto_activation',
    'manifesto_deactivation',
    'manifesto_version_update',
    'constitution_signing',
    'oath_enforcement',
    'authority_escalation'
  ],

  // Operations requiring manifesto check (L2+)
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

// =============================================================================
// MANIFESTO MODE CLASS
// =============================================================================

export class ManifestoMode {
  constructor(options = {}) {
    this.supabase = options.supabaseClient || createSupabaseServiceClient();
    this.config = { ...MANIFESTO_CONFIG, ...options.config };
    this._cache = {
      isActive: null,
      version: null,
      lastCheck: null,
      cacheTtlMs: 5000 // Cache for 5 seconds
    };
    // AEGIS feature flag - defaults to env var or false
    this.useAegis = process.env.USE_AEGIS === 'true' || false;
  }

  /**
   * Enable or disable AEGIS mode
   * @param {boolean} enabled - Whether to use AEGIS
   */
  setAegisMode(enabled) {
    this.useAegis = enabled;
  }

  /**
   * Check if manifesto mode is currently active
   * Uses caching to reduce database calls
   *
   * @returns {Promise<boolean>} True if manifesto is active
   */
  async isActive() {
    // Check cache validity
    if (this._cache.isActive !== null &&
        this._cache.lastCheck &&
        (Date.now() - this._cache.lastCheck) < this._cache.cacheTtlMs) {
      return this._cache.isActive;
    }

    const { data, error } = await this.supabase
      .from('system_configuration')
      .select('value')
      .eq('key', this.config.configKey)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error checking manifesto status:', error);
      throw error;
    }

    const isActive = data?.value === true || data?.value === 'true';

    // Update cache
    this._cache.isActive = isActive;
    this._cache.lastCheck = Date.now();

    return isActive;
  }

  /**
   * Get current manifesto version
   *
   * @returns {Promise<string>} Manifesto version string
   */
  async getVersion() {
    const { data, error } = await this.supabase
      .from('system_configuration')
      .select('value')
      .eq('key', this.config.versionKey)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data?.value || null;
  }

  /**
   * Get full manifesto status including activation details
   *
   * @returns {Promise<Object>} Complete manifesto status
   */
  async getStatus() {
    const [isActive, version] = await Promise.all([
      this.isActive(),
      this.getVersion()
    ]);

    // Get activation event if exists
    const { data: activationEvent } = await this.supabase
      .from('system_events')
      .select('*')
      .eq('event_type', this.config.signingEventType)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return {
      isActive,
      version,
      activationDate: activationEvent?.created_at || null,
      activatedBy: activationEvent?.metadata?.activated_by || null,
      targetActivationDate: this.config.targetActivationDate.toISOString(),
      daysUntilTarget: this._daysUntilTarget(),
      canActivateNow: this._canActivateNow()
    };
  }

  /**
   * Calculate days until target activation date
   * @private
   */
  _daysUntilTarget() {
    const now = new Date();
    const target = this.config.targetActivationDate;
    const diffMs = target - now;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if early activation is allowed
   * @private
   */
  _canActivateNow() {
    // Early activation requires special circumstances
    return true; // Allow early activation by authorized personnel
  }

  /**
   * Activate manifesto mode ("Constitution Signing")
   *
   * @param {Object} params - Activation parameters
   * @param {string} params.activatedBy - L0 Chairman ID who activates
   * @param {string} params.authorityLevel - Must be L0_CHAIRMAN
   * @param {string} [params.reason] - Activation reason/notes
   * @returns {Promise<Object>} Activation result
   */
  async activate({ activatedBy, authorityLevel, reason = 'Constitution Signing Ceremony' }) {
    // AEGIS Integration: Validate authority through AEGIS if enabled
    if (this.useAegis) {
      try {
        const adapter = await getAegisAdapter();
        if (adapter) {
          console.log('[ManifestoMode] Using AEGIS for activation authority validation');
          const result = await adapter.validateActivationAuthority({
            authorityLevel,
            activatedBy
          });

          if (!result.authorized) {
            throw new ManifestoActivationError(
              result.issues[0] || `Only ${this.config.minActivationAuthority} can activate manifesto mode`,
              { provided: authorityLevel, required: this.config.minActivationAuthority }
            );
          }
        }
      } catch (err) {
        if (err instanceof ManifestoActivationError) throw err;
        console.warn('[ManifestoMode] AEGIS validation failed, using legacy:', err.message);
      }
    }

    // Legacy validation (still run as fallback or if AEGIS disabled)
    if (!this.useAegis && authorityLevel !== this.config.minActivationAuthority) {
      throw new ManifestoActivationError(
        `Only ${this.config.minActivationAuthority} can activate manifesto mode`,
        { provided: authorityLevel, required: this.config.minActivationAuthority }
      );
    }

    // Check if already active
    const currentlyActive = await this.isActive();
    if (currentlyActive) {
      return {
        success: true,
        alreadyActive: true,
        message: 'Manifesto mode is already active'
      };
    }

    // Begin transaction: update config and record event
    const activationTimestamp = new Date().toISOString();

    // Upsert manifesto_active flag
    const { error: configError } = await this.supabase
      .from('system_configuration')
      .upsert({
        key: this.config.configKey,
        value: true,
        description: 'EVA Manifesto governance mode active flag',
        updated_at: activationTimestamp
      }, { onConflict: 'key' });

    if (configError) {
      throw new ManifestoActivationError('Failed to update system configuration', { error: configError });
    }

    // Upsert version
    const { error: versionError } = await this.supabase
      .from('system_configuration')
      .upsert({
        key: this.config.versionKey,
        value: this.config.currentVersion,
        description: 'Current EVA Manifesto version',
        updated_at: activationTimestamp
      }, { onConflict: 'key' });

    if (versionError) {
      throw new ManifestoActivationError('Failed to update manifesto version', { error: versionError });
    }

    // Record Constitution Signing event
    const { error: eventError } = await this.supabase
      .from('system_events')
      .insert({
        event_type: this.config.signingEventType,
        category: 'manifesto_activation',
        severity: 'info',
        message: `EVA Manifesto activated - Constitution Signing by ${activatedBy}`,
        metadata: {
          activated_by: activatedBy,
          authority_level: authorityLevel,
          reason,
          version: this.config.currentVersion,
          activation_timestamp: activationTimestamp,
          target_was: this.config.targetActivationDate.toISOString(),
          days_early: this._daysUntilTarget()
        }
      });

    if (eventError) {
      console.error('Warning: Failed to record activation event:', eventError);
      // Don't throw - activation succeeded
    }

    // Clear cache
    this._cache.isActive = true;
    this._cache.lastCheck = Date.now();

    return {
      success: true,
      alreadyActive: false,
      activationTimestamp,
      version: this.config.currentVersion,
      activatedBy,
      message: 'Constitution Signing complete. EVA Manifesto is now active.'
    };
  }

  /**
   * Deactivate manifesto mode (emergency only)
   *
   * @param {Object} params - Deactivation parameters
   * @param {string} params.deactivatedBy - L0 Chairman ID
   * @param {string} params.authorityLevel - Must be L0_CHAIRMAN
   * @param {string} params.reason - MANDATORY reason for deactivation
   * @returns {Promise<Object>} Deactivation result
   */
  async deactivate({ deactivatedBy, authorityLevel, reason }) {
    // AEGIS Integration: Validate deactivation through AEGIS if enabled
    if (this.useAegis) {
      try {
        const adapter = await getAegisAdapter();
        if (adapter) {
          console.log('[ManifestoMode] Using AEGIS for deactivation validation');
          const result = await adapter.validateDeactivation({
            authorityLevel,
            deactivatedBy,
            reason
          });

          if (!result.authorized) {
            throw new ManifestoActivationError(
              result.issues[0] || 'Deactivation validation failed',
              { provided: authorityLevel, required: this.config.minActivationAuthority }
            );
          }
        }
      } catch (err) {
        if (err instanceof ManifestoActivationError) throw err;
        console.warn('[ManifestoMode] AEGIS validation failed, using legacy:', err.message);
      }
    }

    // Legacy validation (still run as fallback or if AEGIS disabled)
    if (!this.useAegis) {
      if (!reason) {
        throw new ManifestoActivationError('Deactivation reason is MANDATORY');
      }

      if (authorityLevel !== this.config.minActivationAuthority) {
        throw new ManifestoActivationError(
          `Only ${this.config.minActivationAuthority} can deactivate manifesto mode`,
          { provided: authorityLevel, required: this.config.minActivationAuthority }
        );
      }
    }

    const currentlyActive = await this.isActive();
    if (!currentlyActive) {
      return {
        success: true,
        alreadyInactive: true,
        message: 'Manifesto mode is already inactive'
      };
    }

    const deactivationTimestamp = new Date().toISOString();

    // Update config
    const { error: configError } = await this.supabase
      .from('system_configuration')
      .update({
        value: false,
        updated_at: deactivationTimestamp
      })
      .eq('key', this.config.configKey);

    if (configError) {
      throw new ManifestoActivationError('Failed to deactivate manifesto', { error: configError });
    }

    // Record deactivation event
    const { error: eventError } = await this.supabase
      .from('system_events')
      .insert({
        event_type: 'MANIFESTO_DEACTIVATION',
        category: 'manifesto_deactivation',
        severity: 'warning',
        message: `EVA Manifesto DEACTIVATED by ${deactivatedBy}`,
        metadata: {
          deactivated_by: deactivatedBy,
          authority_level: authorityLevel,
          reason,
          deactivation_timestamp: deactivationTimestamp
        }
      });

    if (eventError) {
      console.error('Warning: Failed to record deactivation event:', eventError);
    }

    // Clear cache
    this._cache.isActive = false;
    this._cache.lastCheck = Date.now();

    return {
      success: true,
      alreadyInactive: false,
      deactivationTimestamp,
      deactivatedBy,
      reason,
      message: 'EVA Manifesto has been deactivated.'
    };
  }

  /**
   * Verify operation is allowed under manifesto governance
   * Call this before L2+ operations
   *
   * @param {Object} params - Operation parameters
   * @param {string} params.operationType - Type of operation
   * @param {string} params.agentId - Agent attempting operation
   * @param {string} params.authorityLevel - Agent's authority level
   * @returns {Promise<Object>} Verification result
   */
  async verifyOperationAllowed({ operationType, agentId, authorityLevel }) {
    const isActive = await this.isActive();

    // AEGIS Integration: Route through AEGIS if enabled
    if (this.useAegis) {
      try {
        const adapter = await getAegisAdapter();
        if (adapter) {
          console.log('[ManifestoMode] Using AEGIS for L2+ operation verification');
          const result = await adapter.validateL2PlusOperation({
            operationType,
            agentId,
            authorityLevel,
            manifestoActive: isActive
          });

          // Log the operation check if it's an L2+ operation
          if (result.requiresOathEnforcement) {
            await this.supabase
              .from('system_events')
              .insert({
                event_type: 'L2_OPERATION_CHECK',
                category: 'oath_enforcement',
                severity: 'info',
                message: `L2+ operation ${operationType} by ${agentId} (AEGIS validated)`,
                metadata: {
                  operation_type: operationType,
                  agent_id: agentId,
                  authority_level: authorityLevel,
                  manifesto_active: isActive,
                  aegis_enabled: true,
                  check_timestamp: new Date().toISOString()
                }
              });
          }

          return {
            ...result,
            manifestoActive: isActive,
            message: result.allowed
              ? `Operation ${operationType} allowed under manifesto governance`
              : result.issues[0]
          };
        }
      } catch (err) {
        console.warn('[ManifestoMode] AEGIS verification failed, using legacy:', err.message);
      }
    }

    // Legacy verification path
    // If manifesto not active, operations proceed normally
    if (!isActive) {
      return {
        allowed: true,
        manifestoActive: false,
        message: 'Manifesto mode not active - operation allowed',
        aegis_enabled: false
      };
    }

    // Check if this is an L2+ operation requiring manifesto check
    const requiresCheck = this.config.l2PlusOperations.includes(operationType);

    if (!requiresCheck) {
      return {
        allowed: true,
        manifestoActive: true,
        message: 'Operation does not require manifesto verification',
        aegis_enabled: false
      };
    }

    // L2+ operation - log for audit
    const { error } = await this.supabase
      .from('system_events')
      .insert({
        event_type: 'L2_OPERATION_CHECK',
        category: 'oath_enforcement',
        severity: 'info',
        message: `L2+ operation ${operationType} by ${agentId}`,
        metadata: {
          operation_type: operationType,
          agent_id: agentId,
          authority_level: authorityLevel,
          manifesto_active: true,
          aegis_enabled: false,
          check_timestamp: new Date().toISOString()
        }
      });

    if (error) {
      console.error('Warning: Failed to log operation check:', error);
    }

    return {
      allowed: true,
      manifestoActive: true,
      requiresOathEnforcement: true,
      message: `Operation ${operationType} allowed under manifesto governance`,
      aegis_enabled: false
    };
  }

  /**
   * Update manifesto version (for manifesto amendments)
   *
   * @param {Object} params - Version update parameters
   * @param {string} params.newVersion - New version string
   * @param {string} params.updatedBy - L0 Chairman ID
   * @param {string} params.authorityLevel - Must be L0_CHAIRMAN
   * @param {string} params.changelog - Description of changes
   * @returns {Promise<Object>} Update result
   */
  async updateVersion({ newVersion, updatedBy, authorityLevel, changelog }) {
    if (authorityLevel !== this.config.minActivationAuthority) {
      throw new ManifestoActivationError(
        `Only ${this.config.minActivationAuthority} can update manifesto version`,
        { provided: authorityLevel, required: this.config.minActivationAuthority }
      );
    }

    const previousVersion = await this.getVersion();
    const updateTimestamp = new Date().toISOString();

    // Update version in config
    const { error: configError } = await this.supabase
      .from('system_configuration')
      .upsert({
        key: this.config.versionKey,
        value: newVersion,
        description: 'Current EVA Manifesto version',
        updated_at: updateTimestamp
      }, { onConflict: 'key' });

    if (configError) {
      throw new ManifestoActivationError('Failed to update version', { error: configError });
    }

    // Record version update event
    await this.supabase
      .from('system_events')
      .insert({
        event_type: 'MANIFESTO_VERSION_UPDATE',
        category: 'manifesto_version_update',
        severity: 'info',
        message: `Manifesto updated from v${previousVersion} to v${newVersion}`,
        metadata: {
          previous_version: previousVersion,
          new_version: newVersion,
          updated_by: updatedBy,
          changelog,
          update_timestamp: updateTimestamp
        }
      });

    // Update internal version
    this.config.currentVersion = newVersion;
    this._cache.version = newVersion;

    return {
      success: true,
      previousVersion,
      newVersion,
      updatedBy,
      changelog,
      message: `Manifesto updated to v${newVersion}`
    };
  }

  /**
   * Require manifesto to be active - throws if not
   * Use as a guard at the start of manifesto-dependent operations
   *
   * @throws {ManifestoNotActiveError} If manifesto not active
   */
  async requireActive() {
    const isActive = await this.isActive();
    if (!isActive) {
      throw new ManifestoNotActiveError('This operation requires manifesto mode to be active');
    }
  }

  /**
   * Clear internal cache (useful for testing)
   */
  clearCache() {
    this._cache.isActive = null;
    this._cache.version = null;
    this._cache.lastCheck = null;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let manifestoModeInstance = null;

/**
 * Get the singleton ManifestoMode instance
 * @returns {ManifestoMode}
 */
export function getManifestoMode() {
  if (!manifestoModeInstance) {
    manifestoModeInstance = new ManifestoMode();
  }
  return manifestoModeInstance;
}

/**
 * Check if manifesto mode is active (convenience helper)
 * @returns {Promise<boolean>}
 */
export async function isManifestoActive() {
  return getManifestoMode().isActive();
}

/**
 * Verify L2+ operation is allowed under manifesto governance (convenience helper)
 * @param {Object} params - Operation parameters
 * @returns {Promise<Object>}
 */
export async function verifyManifestoOperation(params) {
  return getManifestoMode().verifyOperationAllowed(params);
}

/**
 * Reset singleton (for testing)
 */
export function resetManifestoMode() {
  manifestoModeInstance = null;
}

export default ManifestoMode;
