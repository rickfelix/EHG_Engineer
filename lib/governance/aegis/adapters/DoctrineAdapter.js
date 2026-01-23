/**
 * AEGIS Adapter: Doctrine of Constraint
 *
 * Adapter for querying and reporting on Doctrine of Constraint violations.
 * Note: The actual enforcement is done via database triggers (Law 1).
 * This adapter provides:
 * 1. Unified access to doctrine violations through AEGIS
 * 2. Pre-validation to avoid hitting database triggers
 * 3. Violation statistics and reporting
 *
 * Rules:
 * - DOC-001: EXEC cannot create Strategic Directives
 * - DOC-002: EXEC cannot modify PRD scope
 * - DOC-003: EXEC cannot log governance events
 * - DOC-004: EXEC cannot modify protocols
 *
 * @module aegis/adapters/DoctrineAdapter
 * @implements SD-AEGIS-GOVERNANCE-001
 */

import { getAegisEnforcer } from '../AegisEnforcer.js';
import { AEGIS_CONSTITUTIONS } from '../index.js';

// =============================================================================
// EXCEPTIONS (for backward compatibility)
// =============================================================================

export class DoctrineViolation extends Error {
  constructor(ruleCode, message, details = {}) {
    super(`DOCTRINE_OF_CONSTRAINT_VIOLATION [${ruleCode}]: ${message}`);
    this.name = 'DoctrineViolation';
    this.ruleCode = ruleCode;
    this.details = details;
    this.isRetryable = false;
  }
}

// =============================================================================
// DOCTRINE ADAPTER
// =============================================================================

export class DoctrineAdapter {
  constructor(supabase = null) {
    this.supabase = supabase;
    this.aegisEnforcer = null;
    // AEGIS validation not yet fully wired up - use legacy logic by default
    // Set to true once AEGIS validators are complete
    this.useAegis = process.env.USE_AEGIS === 'true' || false;
    this._initPromise = null;

    // Tables protected by Doctrine of Constraint
    this.protectedTables = [
      'strategic_directives_v2',
      'product_requirements_v2',
      'chairman_decisions',
      'leo_protocols',
      'leo_protocol_sections'
    ];

    // Forbidden event types for EXEC
    this.forbiddenEventTypes = [
      'SD_CREATED',
      'SD_MODIFIED',
      'SD_SCOPE_EXPANDED',
      'PRD_CREATED',
      'PRD_MODIFIED',
      'PRD_SCOPE_EXPANDED',
      'STRATEGIC_PIVOT',
      'DIRECTIVE_ISSUED',
      'CHAIRMAN_DECISION_CREATED',
      'PROTOCOL_MODIFIED'
    ];
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
        console.warn('[DoctrineAdapter] AEGIS initialization failed:', err.message);
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
   * Pre-validate governance artifact operation (before hitting DB trigger)
   * This allows catching violations early with clear error messages.
   *
   * @param {Object} params - Operation parameters
   * @param {string} params.actorRole - Actor's role (EXEC, PLAN, LEAD)
   * @param {string} params.targetTable - Table being modified
   * @param {string} params.operation - INSERT, UPDATE, DELETE
   * @param {string} [params.sdId] - Optional SD ID
   * @param {string} [params.prdId] - Optional PRD ID
   * @returns {Promise<Object>} Validation result
   */
  async validateGovernanceOperation(params) {
    const { actorRole, targetTable, operation, sdId, prdId } = params;

    if (!this.useAegis) {
      return this._legacyValidateGovernanceOperation(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateGovernanceOperation(params);
    }

    const context = {
      actor_role: actorRole,
      target_table: targetTable,
      operation,
      sd_id: sdId,
      prd_id: prdId,
      protected_tables: this.protectedTables,
      timestamp: new Date().toISOString()
    };

    // Determine which rule to validate based on table
    let ruleCode = 'DOC-001'; // Default: SD creation
    if (targetTable === 'product_requirements_v2') {
      ruleCode = 'DOC-002';
    } else if (targetTable === 'leo_protocols' || targetTable === 'leo_protocol_sections') {
      ruleCode = 'DOC-004';
    }

    const result = await this.aegisEnforcer.validate(
      ruleCode,
      context,
      { constitution: AEGIS_CONSTITUTIONS.DOCTRINE }
    );

    return {
      valid: result.passed,
      allowed: result.passed,
      issues: result.violations.map(v => v.message),
      wouldTriggerDbViolation: !result.passed && actorRole === 'EXEC',
      aegis_enabled: true
    };
  }

  /**
   * Legacy governance operation validation
   * @private
   */
  _legacyValidateGovernanceOperation(params) {
    const { actorRole, targetTable, operation } = params;
    const issues = [];

    // Only EXEC is restricted
    if (actorRole !== 'EXEC') {
      return {
        valid: true,
        allowed: true,
        issues: [],
        wouldTriggerDbViolation: false,
        aegis_enabled: false
      };
    }

    // Check if target table is protected
    if (this.protectedTables.includes(targetTable)) {
      const violationType = this._getViolationType(targetTable, operation);
      issues.push(
        `DOCTRINE_OF_CONSTRAINT_VIOLATION [LAW 1]: EXEC agent cannot ${operation} on ${targetTable}. ` +
        `Violation type: ${violationType}. EXEC executes; they do not create strategy.`
      );
    }

    return {
      valid: issues.length === 0,
      allowed: issues.length === 0,
      issues,
      wouldTriggerDbViolation: issues.length > 0,
      aegis_enabled: false
    };
  }

  /**
   * Pre-validate system event logging (before hitting DB trigger)
   *
   * @param {Object} params - Event parameters
   * @param {string} params.actorRole - Actor's role
   * @param {string} params.eventType - Event type being logged
   * @returns {Promise<Object>} Validation result
   */
  async validateEventLogging(params) {
    const { actorRole, eventType } = params;

    if (!this.useAegis) {
      return this._legacyValidateEventLogging(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateEventLogging(params);
    }

    const context = {
      actor_role: actorRole,
      event_type: eventType,
      forbidden_events: this.forbiddenEventTypes,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'DOC-003',
      context,
      { constitution: AEGIS_CONSTITUTIONS.DOCTRINE }
    );

    return {
      valid: result.passed,
      allowed: result.passed,
      issues: result.violations.map(v => v.message),
      wouldTriggerDbViolation: !result.passed && actorRole === 'EXEC',
      aegis_enabled: true
    };
  }

  /**
   * Legacy event logging validation
   * @private
   */
  _legacyValidateEventLogging(params) {
    const { actorRole, eventType } = params;
    const issues = [];

    // Only EXEC is restricted
    if (actorRole !== 'EXEC') {
      return {
        valid: true,
        allowed: true,
        issues: [],
        wouldTriggerDbViolation: false,
        aegis_enabled: false
      };
    }

    // Check if event type is forbidden
    if (this.forbiddenEventTypes.includes(eventType)) {
      issues.push(
        `DOCTRINE_OF_CONSTRAINT_VIOLATION [LAW 1]: EXEC agent cannot log governance event "${eventType}". ` +
        'EXEC agents may only log implementation events (e.g., TASK_COMPLETED, TEST_PASSED).'
      );
    }

    return {
      valid: issues.length === 0,
      allowed: issues.length === 0,
      issues,
      wouldTriggerDbViolation: issues.length > 0,
      aegis_enabled: false
    };
  }

  /**
   * Get violation type based on table and operation
   * @private
   */
  _getViolationType(tableName, operation) {
    switch (tableName) {
      case 'strategic_directives_v2':
        return operation === 'INSERT' ? 'SD_CREATE' : 'SD_MODIFY';
      case 'product_requirements_v2':
        return operation === 'INSERT' ? 'PRD_CREATE' : 'PRD_MODIFY';
      case 'chairman_decisions':
        return 'CHAIRMAN_DECISION';
      case 'leo_protocols':
      case 'leo_protocol_sections':
        return 'PROTOCOL_MODIFY';
      default:
        return 'GOVERNANCE_ARTIFACT';
    }
  }

  /**
   * Query doctrine violations (unified view through AEGIS)
   *
   * @param {Object} options - Query options
   * @param {number} [options.limit=100] - Max results
   * @param {string} [options.violationType] - Filter by violation type
   * @param {string} [options.actorRole] - Filter by actor role
   * @param {Date} [options.since] - Filter by date
   * @returns {Promise<Object[]>} Violations
   */
  async queryViolations(options = {}) {
    const { limit = 100, violationType, actorRole, since } = options;

    if (!this.supabase) {
      console.warn('[DoctrineAdapter] Supabase not configured');
      return [];
    }

    try {
      let query = this.supabase
        .from('doctrine_constraint_violations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (violationType) {
        query = query.eq('violation_type', violationType);
      }

      if (actorRole) {
        query = query.eq('actor_role', actorRole);
      }

      if (since) {
        query = query.gte('created_at', since.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error('[DoctrineAdapter] Query error:', error.message);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('[DoctrineAdapter] Query exception:', err.message);
      return [];
    }
  }

  /**
   * Get violation statistics
   *
   * @param {Object} options - Options
   * @param {number} [options.days=7] - Days to look back
   * @returns {Promise<Object>} Statistics
   */
  async getViolationStats(options = {}) {
    const { days = 7 } = options;

    if (!this.supabase) {
      return { total: 0, byType: {}, byActor: {} };
    }

    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await this.supabase
        .from('v_doctrine_compliance_summary')
        .select('*')
        .gte('violation_date', since.toISOString());

      if (error) {
        console.error('[DoctrineAdapter] Stats error:', error.message);
        return { total: 0, byType: {}, byActor: {} };
      }

      // Aggregate stats
      const stats = {
        total: 0,
        byType: {},
        byActor: {},
        sdsAffected: new Set(),
        prdsAffected: new Set()
      };

      for (const row of data || []) {
        stats.total += row.violation_count;
        stats.byType[row.violation_type] = (stats.byType[row.violation_type] || 0) + row.violation_count;
        stats.byActor[row.actor_role] = (stats.byActor[row.actor_role] || 0) + row.violation_count;
        if (row.sds_affected) stats.sdsAffected.add(row.sds_affected);
        if (row.prds_affected) stats.prdsAffected.add(row.prds_affected);
      }

      return {
        total: stats.total,
        byType: stats.byType,
        byActor: stats.byActor,
        sdsAffected: stats.sdsAffected.size,
        prdsAffected: stats.prdsAffected.size,
        periodDays: days
      };
    } catch (err) {
      console.error('[DoctrineAdapter] Stats exception:', err.message);
      return { total: 0, byType: {}, byActor: {} };
    }
  }

  /**
   * Enforce governance operation - throws if violated
   *
   * @param {Object} params - Operation parameters
   * @throws {DoctrineViolation} If operation would violate doctrine
   */
  async enforceGovernanceOperation(params) {
    const result = await this.validateGovernanceOperation(params);

    if (!result.valid) {
      throw new DoctrineViolation(
        'DOC-001',
        result.issues[0] || 'Governance operation blocked by Doctrine of Constraint',
        { params, result }
      );
    }

    return result;
  }

  /**
   * Enforce event logging - throws if violated
   *
   * @param {Object} params - Event parameters
   * @throws {DoctrineViolation} If event logging would violate doctrine
   */
  async enforceEventLogging(params) {
    const result = await this.validateEventLogging(params);

    if (!result.valid) {
      throw new DoctrineViolation(
        'DOC-003',
        result.issues[0] || 'Event logging blocked by Doctrine of Constraint',
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
 * Get the singleton DoctrineAdapter instance
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {DoctrineAdapter}
 */
export function getDoctrineAdapter(supabase = null) {
  if (!_adapterInstance) {
    _adapterInstance = new DoctrineAdapter(supabase);
  }
  return _adapterInstance;
}

export default DoctrineAdapter;
