/**
 * AEGIS Adapter: Compliance Policies
 *
 * Backward-compatible wrapper that routes Compliance Policy
 * enforcement through the AEGIS unified governance system.
 *
 * Rules migrated:
 * - COMP-001: Data retention policy
 * - COMP-002: PII handling requirements
 * - COMP-003: Audit logging requirements
 * - COMP-004: Access control enforcement
 * - COMP-005: Secret management policy
 * - COMP-006: Change management policy
 *
 * @module aegis/adapters/ComplianceAdapter
 * @implements SD-AEGIS-GOVERNANCE-001
 */

import { getAegisEnforcer } from '../AegisEnforcer.js';
import { AEGIS_CONSTITUTIONS } from '../index.js';

// =============================================================================
// EXCEPTIONS (for backward compatibility)
// =============================================================================

export class ComplianceViolation extends Error {
  constructor(ruleCode, message, details = {}) {
    super(`COMPLIANCE_VIOLATION [${ruleCode}]: ${message}`);
    this.name = 'ComplianceViolation';
    this.ruleCode = ruleCode;
    this.details = details;
    this.isRetryable = false;
  }
}

// =============================================================================
// COMPLIANCE ADAPTER
// =============================================================================

export class ComplianceAdapter {
  constructor(supabase = null) {
    this.supabase = supabase;
    this.aegisEnforcer = null;
    // AEGIS validation not yet fully wired up - use legacy logic by default
    // Set to true once AEGIS validators are complete
    this.useAegis = process.env.USE_AEGIS === 'true' || false;
    this._initPromise = null;

    // Compliance policy configuration
    this.policies = {
      // Data retention periods (days)
      retention: {
        audit_logs: 365,
        execution_logs: 90,
        pii_data: 30, // After deletion request
        session_data: 7
      },
      // PII field patterns
      piiPatterns: [
        'email',
        'phone',
        'ssn',
        'social_security',
        'credit_card',
        'card_number',
        'password',
        'secret',
        'api_key',
        'token'
      ],
      // Required audit fields
      requiredAuditFields: [
        'actor',
        'action',
        'timestamp',
        'resource_type',
        'resource_id'
      ],
      // Access control levels
      accessLevels: ['public', 'internal', 'confidential', 'restricted'],
      // Change management categories requiring approval
      approvalRequired: [
        'schema_change',
        'rls_policy_change',
        'trigger_modification',
        'function_modification'
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
        console.warn('[ComplianceAdapter] AEGIS initialization failed:', err.message);
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
   * Validate data retention compliance
   *
   * @param {Object} params - Retention check parameters
   * @param {string} params.dataType - Type of data (audit_logs, execution_logs, etc.)
   * @param {number} params.retentionDays - Current retention period in days
   * @returns {Promise<Object>} Validation result
   */
  async validateDataRetention(params) {
    const { dataType, retentionDays } = params;

    if (!this.useAegis) {
      return this._legacyValidateDataRetention(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateDataRetention(params);
    }

    const context = {
      data_type: dataType,
      retention_days: retentionDays,
      required_retention: this.policies.retention[dataType] || 90,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'COMP-001',
      context,
      { constitution: AEGIS_CONSTITUTIONS.COMPLIANCE }
    );

    return {
      valid: result.passed,
      requiredDays: this.policies.retention[dataType] || 90,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy data retention validation
   * @private
   */
  _legacyValidateDataRetention(params) {
    const { dataType, retentionDays } = params;
    const issues = [];

    const requiredDays = this.policies.retention[dataType] || 90;

    if (retentionDays < requiredDays) {
      issues.push(`Data retention for ${dataType} must be at least ${requiredDays} days. Current: ${retentionDays} days.`);
    }

    return {
      valid: issues.length === 0,
      requiredDays,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Validate PII handling compliance
   *
   * @param {Object} params - PII check parameters
   * @param {Object} params.data - Data being processed
   * @param {string} params.operation - Operation type (store, log, transmit)
   * @param {boolean} params.encrypted - Whether data is encrypted
   * @param {boolean} params.masked - Whether PII fields are masked
   * @returns {Promise<Object>} Validation result
   */
  async validatePiiHandling(params) {
    const { data, operation, encrypted, masked } = params;

    if (!this.useAegis) {
      return this._legacyValidatePiiHandling(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidatePiiHandling(params);
    }

    const piiFields = this._detectPiiFields(data);

    const context = {
      pii_fields: piiFields,
      operation,
      encrypted,
      masked,
      has_pii: piiFields.length > 0,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'COMP-002',
      context,
      { constitution: AEGIS_CONSTITUTIONS.COMPLIANCE }
    );

    return {
      valid: result.passed,
      piiDetected: piiFields,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy PII handling validation
   * @private
   */
  _legacyValidatePiiHandling(params) {
    const { data, operation, encrypted, masked } = params;
    const issues = [];

    const piiFields = this._detectPiiFields(data);

    if (piiFields.length > 0) {
      if (operation === 'log' && !masked) {
        issues.push(`PII fields detected in logging operation without masking: ${piiFields.join(', ')}`);
      }
      if (operation === 'transmit' && !encrypted) {
        issues.push(`PII fields detected in transmission without encryption: ${piiFields.join(', ')}`);
      }
      if (operation === 'store' && !encrypted) {
        issues.push(`PII fields detected in storage without encryption: ${piiFields.join(', ')}`);
      }
    }

    return {
      valid: issues.length === 0,
      piiDetected: piiFields,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Detect PII fields in data
   * @private
   */
  _detectPiiFields(data) {
    if (!data || typeof data !== 'object') return [];

    const detected = [];
    const checkObject = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        const lowerKey = key.toLowerCase();

        // Check if key matches PII patterns
        if (this.policies.piiPatterns.some(pattern => lowerKey.includes(pattern))) {
          detected.push(fullPath);
        }

        // Recursively check nested objects
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          checkObject(value, fullPath);
        }
      }
    };

    checkObject(data);
    return detected;
  }

  /**
   * Validate audit logging compliance
   *
   * @param {Object} params - Audit entry parameters
   * @param {Object} params.auditEntry - The audit log entry
   * @returns {Promise<Object>} Validation result
   */
  async validateAuditLogging(params) {
    const { auditEntry } = params;

    if (!this.useAegis) {
      return this._legacyValidateAuditLogging(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateAuditLogging(params);
    }

    const missingFields = this._findMissingAuditFields(auditEntry);

    const context = {
      audit_entry: auditEntry,
      missing_fields: missingFields,
      required_fields: this.policies.requiredAuditFields,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'COMP-003',
      context,
      { constitution: AEGIS_CONSTITUTIONS.COMPLIANCE }
    );

    return {
      valid: result.passed,
      missingFields,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy audit logging validation
   * @private
   */
  _legacyValidateAuditLogging(params) {
    const { auditEntry } = params;
    const issues = [];

    const missingFields = this._findMissingAuditFields(auditEntry);

    if (missingFields.length > 0) {
      issues.push(`Audit entry missing required fields: ${missingFields.join(', ')}`);
    }

    return {
      valid: issues.length === 0,
      missingFields,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Find missing required audit fields
   * @private
   */
  _findMissingAuditFields(auditEntry) {
    if (!auditEntry) return this.policies.requiredAuditFields;

    return this.policies.requiredAuditFields.filter(field => {
      const value = auditEntry[field];
      return value === undefined || value === null || value === '';
    });
  }

  /**
   * Validate change management compliance
   *
   * @param {Object} params - Change parameters
   * @param {string} params.changeType - Type of change
   * @param {boolean} params.hasApproval - Whether change has approval
   * @param {string} params.approvedBy - Approver ID
   * @param {string} params.changeReason - Reason for change
   * @returns {Promise<Object>} Validation result
   */
  async validateChangeManagement(params) {
    const { changeType, hasApproval, approvedBy, changeReason } = params;

    if (!this.useAegis) {
      return this._legacyValidateChangeManagement(params);
    }

    await this._ensureInitialized();

    if (!this.aegisEnforcer) {
      return this._legacyValidateChangeManagement(params);
    }

    const requiresApproval = this.policies.approvalRequired.includes(changeType);

    const context = {
      change_type: changeType,
      has_approval: hasApproval,
      approved_by: approvedBy,
      change_reason: changeReason,
      requires_approval: requiresApproval,
      timestamp: new Date().toISOString()
    };

    const result = await this.aegisEnforcer.validate(
      'COMP-006',
      context,
      { constitution: AEGIS_CONSTITUTIONS.COMPLIANCE }
    );

    return {
      valid: result.passed,
      requiresApproval,
      issues: result.violations.map(v => v.message),
      aegis_enabled: true
    };
  }

  /**
   * Legacy change management validation
   * @private
   */
  _legacyValidateChangeManagement(params) {
    const { changeType, hasApproval, changeReason } = params;
    const issues = [];

    const requiresApproval = this.policies.approvalRequired.includes(changeType);

    if (requiresApproval && !hasApproval) {
      issues.push(`Change type "${changeType}" requires approval before execution.`);
    }

    if (requiresApproval && !changeReason) {
      issues.push(`Change type "${changeType}" requires documented reason.`);
    }

    return {
      valid: issues.length === 0,
      requiresApproval,
      issues,
      aegis_enabled: false
    };
  }

  /**
   * Enforce data retention - throws if violated
   *
   * @param {Object} params - Retention parameters
   * @throws {ComplianceViolation} If retention is insufficient
   */
  async enforceDataRetention(params) {
    const result = await this.validateDataRetention(params);

    if (!result.valid) {
      throw new ComplianceViolation(
        'COMP-001',
        result.issues[0] || 'Data retention policy violation',
        { params, result }
      );
    }

    return result;
  }

  /**
   * Enforce PII handling - throws if violated
   *
   * @param {Object} params - PII parameters
   * @throws {ComplianceViolation} If PII handling is improper
   */
  async enforcePiiHandling(params) {
    const result = await this.validatePiiHandling(params);

    if (!result.valid) {
      throw new ComplianceViolation(
        'COMP-002',
        result.issues[0] || 'PII handling policy violation',
        { params, result }
      );
    }

    return result;
  }

  /**
   * Enforce change management - throws if violated
   *
   * @param {Object} params - Change parameters
   * @throws {ComplianceViolation} If change management violated
   */
  async enforceChangeManagement(params) {
    const result = await this.validateChangeManagement(params);

    if (!result.valid) {
      throw new ComplianceViolation(
        'COMP-006',
        result.issues[0] || 'Change management policy violation',
        { params, result }
      );
    }

    return result;
  }

  /**
   * Query compliance violations from database
   *
   * @param {Object} options - Query options
   * @param {number} [options.limit=100] - Max results
   * @param {string} [options.policyCode] - Filter by policy code
   * @param {string} [options.severity] - Filter by severity
   * @returns {Promise<Object[]>} Violations
   */
  async queryViolations(options = {}) {
    const { limit = 100, policyCode, severity } = options;

    if (!this.supabase) {
      console.warn('[ComplianceAdapter] Supabase not configured');
      return [];
    }

    try {
      let query = this.supabase
        .from('aegis_violations')
        .select('*')
        .eq('constitution_id', 'const-compliance')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (policyCode) {
        query = query.eq('rule_code', policyCode);
      }

      if (severity) {
        query = query.eq('severity', severity);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[ComplianceAdapter] Query error:', error.message);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('[ComplianceAdapter] Query exception:', err.message);
      return [];
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let _adapterInstance = null;

/**
 * Get the singleton ComplianceAdapter instance
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {ComplianceAdapter}
 */
export function getComplianceAdapter(supabase = null) {
  if (!_adapterInstance) {
    _adapterInstance = new ComplianceAdapter(supabase);
  }
  return _adapterInstance;
}

export default ComplianceAdapter;
