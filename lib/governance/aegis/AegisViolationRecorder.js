/**
 * AegisViolationRecorder - Records violations to the unified audit log
 *
 * Features:
 * - Records violations to aegis_violations table
 * - Supports filtering and querying violations
 * - Handles override with justification
 * - Can auto-create remediation SDs
 *
 * @module AegisViolationRecorder
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';

export class AegisViolationRecorder {
  constructor(options = {}) {
    this.supabase = options.supabase || this._createSupabaseClient();
    this.autoCreateSd = options.autoCreateSd || false;
  }

  /**
   * Create Supabase client
   * @private
   */
  _createSupabaseClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('[AegisViolationRecorder] Supabase credentials not configured');
      return null;
    }

    return createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Record a violation
   * @param {Object} violation - Violation data
   * @param {UUID} violation.rule_id - Rule that was violated
   * @param {UUID} violation.constitution_id - Constitution the rule belongs to
   * @param {string} violation.violation_type - Type of violation
   * @param {string} violation.severity - Severity level
   * @param {string} violation.message - Violation message
   * @param {string} [violation.actor_role] - Role of the actor
   * @param {string} [violation.actor_id] - ID of the actor
   * @param {string} [violation.operation_type] - Type of operation
   * @param {string} [violation.target_table] - Target table
   * @param {UUID} [violation.sd_id] - Related SD ID
   * @param {string} [violation.sd_key] - Related SD key
   * @param {Object} [violation.payload] - Additional payload
   * @returns {Promise<Object>} Recorded violation
   */
  async recordViolation(violation) {
    if (!this.supabase) {
      console.warn('[AegisViolationRecorder] No Supabase client, violation not recorded');
      return { id: null, recorded: false };
    }

    const violationData = {
      rule_id: violation.rule_id,
      constitution_id: violation.constitution_id,
      violation_type: violation.violation_type || 'unknown',
      severity: violation.severity || 'MEDIUM',
      message: violation.message || 'No message provided',
      actor_role: violation.actor_role,
      actor_id: violation.actor_id,
      operation_type: violation.operation_type,
      target_table: violation.target_table,
      sd_id: violation.sd_id,
      sd_key: violation.sd_key,
      prd_id: violation.prd_id,
      venture_id: violation.venture_id,
      payload: violation.payload || {},
      stack_trace: violation.stack_trace,
      status: 'open',
      metadata: violation.metadata || {}
    };

    try {
      const { data, error } = await this.supabase
        .from('aegis_violations')
        .insert(violationData)
        .select()
        .single();

      if (error) {
        console.error('[AegisViolationRecorder] Error recording violation:', error.message);
        return { id: null, recorded: false, error: error.message };
      }

      console.log(`[AegisViolationRecorder] Recorded violation: ${data.id}`);

      // Auto-create SD if enabled and severity is high enough
      if (this.autoCreateSd && (violation.severity === 'CRITICAL' || violation.severity === 'HIGH')) {
        await this._createRemediationSd(data);
      }

      return { id: data.id, recorded: true, violation: data };
    } catch (err) {
      console.error('[AegisViolationRecorder] Exception recording violation:', err.message);
      return { id: null, recorded: false, error: err.message };
    }
  }

  /**
   * Get violations with filters
   * @param {Object} filters - Filter options
   * @param {string} [filters.status] - Filter by status (open, acknowledged, etc.)
   * @param {string} [filters.severity] - Filter by severity
   * @param {string} [filters.constitutionCode] - Filter by constitution
   * @param {string} [filters.sdKey] - Filter by SD key
   * @param {number} [filters.limit] - Max results
   * @param {number} [filters.offset] - Offset for pagination
   * @returns {Promise<Array>} Array of violations
   */
  async getViolations(filters = {}) {
    if (!this.supabase) {
      return [];
    }

    let query = this.supabase
      .from('aegis_violations')
      .select(`
        *,
        rule:aegis_rules(rule_code, rule_name, category),
        constitution:aegis_constitutions(code, name)
      `)
      .order('created_at', { ascending: false });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.severity) {
      query = query.eq('severity', filters.severity);
    }

    if (filters.sdKey) {
      query = query.eq('sd_key', filters.sdKey);
    }

    if (filters.constitutionCode) {
      // Need to filter via join
      query = query.eq('constitution.code', filters.constitutionCode);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[AegisViolationRecorder] Error fetching violations:', error.message);
      return [];
    }

    return data || [];
  }

  /**
   * Get open violations count by constitution
   * @returns {Promise<Object>} Count by constitution
   */
  async getOpenViolationCounts() {
    if (!this.supabase) {
      return {};
    }

    const { data, error } = await this.supabase
      .from('v_aegis_constitution_summary')
      .select('code, open_violations');

    if (error) {
      console.error('[AegisViolationRecorder] Error fetching counts:', error.message);
      return {};
    }

    const counts = {};
    for (const row of data || []) {
      counts[row.code] = row.open_violations;
    }

    return counts;
  }

  /**
   * Acknowledge a violation
   * @param {UUID} violationId - Violation ID
   * @param {string} acknowledgedBy - Who acknowledged
   * @returns {Promise<Object>} Updated violation
   */
  async acknowledgeViolation(violationId, acknowledgedBy) {
    if (!this.supabase) {
      return { success: false, error: 'No Supabase client' };
    }

    const { data, error } = await this.supabase
      .from('aegis_violations')
      .update({
        status: 'acknowledged',
        acknowledged_by: acknowledgedBy,
        acknowledged_at: new Date().toISOString()
      })
      .eq('id', violationId)
      .select()
      .single();

    if (error) {
      console.error('[AegisViolationRecorder] Error acknowledging violation:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, violation: data };
  }

  /**
   * Override a violation with justification
   * @param {UUID} violationId - Violation ID
   * @param {string} justification - Required justification
   * @param {string} overriddenBy - Who is overriding
   * @returns {Promise<Object>} Updated violation
   */
  async overrideViolation(violationId, justification, overriddenBy) {
    if (!this.supabase) {
      return { success: false, error: 'No Supabase client' };
    }

    if (!justification || justification.length < 10) {
      return { success: false, error: 'Justification must be at least 10 characters' };
    }

    const { data, error } = await this.supabase
      .from('aegis_violations')
      .update({
        status: 'overridden',
        override_justification: justification,
        overridden_by: overriddenBy,
        overridden_at: new Date().toISOString()
      })
      .eq('id', violationId)
      .select()
      .single();

    if (error) {
      console.error('[AegisViolationRecorder] Error overriding violation:', error.message);
      return { success: false, error: error.message };
    }

    console.log(`[AegisViolationRecorder] Violation ${violationId} overridden by ${overriddenBy}`);
    return { success: true, violation: data };
  }

  /**
   * Mark a violation as remediated
   * @param {UUID} violationId - Violation ID
   * @param {UUID} [remediationSdId] - SD that remediated this violation
   * @param {string} [remediationSdKey] - SD key
   * @returns {Promise<Object>} Updated violation
   */
  async markRemediated(violationId, remediationSdId = null, remediationSdKey = null) {
    if (!this.supabase) {
      return { success: false, error: 'No Supabase client' };
    }

    const updateData = {
      status: 'remediated'
    };

    if (remediationSdId) {
      updateData.remediation_sd_id = remediationSdId;
    }

    if (remediationSdKey) {
      updateData.remediation_sd_key = remediationSdKey;
    }

    const { data, error } = await this.supabase
      .from('aegis_violations')
      .update(updateData)
      .eq('id', violationId)
      .select()
      .single();

    if (error) {
      console.error('[AegisViolationRecorder] Error marking remediated:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, violation: data };
  }

  /**
   * Mark a violation as false positive
   * @param {UUID} violationId - Violation ID
   * @param {string} justification - Why it's a false positive
   * @param {string} markedBy - Who marked it
   * @returns {Promise<Object>} Updated violation
   */
  async markFalsePositive(violationId, justification, markedBy) {
    if (!this.supabase) {
      return { success: false, error: 'No Supabase client' };
    }

    const { data, error } = await this.supabase
      .from('aegis_violations')
      .update({
        status: 'false_positive',
        override_justification: `FALSE POSITIVE: ${justification}`,
        overridden_by: markedBy,
        overridden_at: new Date().toISOString()
      })
      .eq('id', violationId)
      .select()
      .single();

    if (error) {
      console.error('[AegisViolationRecorder] Error marking false positive:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, violation: data };
  }

  /**
   * Get violation statistics
   * @param {number} [periodDays=30] - Period in days
   * @returns {Promise<Object>} Statistics
   */
  async getStats(periodDays = 30) {
    if (!this.supabase) {
      return {};
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const { data, error } = await this.supabase
      .from('aegis_violations')
      .select('severity, status, created_at')
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('[AegisViolationRecorder] Error fetching stats:', error.message);
      return {};
    }

    const stats = {
      total: data.length,
      bySeverity: {},
      byStatus: {},
      periodDays
    };

    for (const violation of data) {
      // Count by severity
      stats.bySeverity[violation.severity] = (stats.bySeverity[violation.severity] || 0) + 1;

      // Count by status
      stats.byStatus[violation.status] = (stats.byStatus[violation.status] || 0) + 1;
    }

    return stats;
  }

  /**
   * Create a remediation SD for a critical violation
   * @private
   */
  async _createRemediationSd(violation) {
    // This would integrate with the SD creation system
    // For now, just log the intent
    console.log(`[AegisViolationRecorder] Would create remediation SD for violation ${violation.id}`);
    // TODO: Integrate with add-prd-to-database.js or SD creation API
  }
}

export default AegisViolationRecorder;
