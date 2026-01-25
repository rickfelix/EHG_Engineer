/**
 * Governance Bypass Logger
 *
 * Provides a unified mechanism for logging governance control bypasses
 * to the governance_audit_log table for transparency and learning.
 *
 * Purpose:
 * - Create audit trail for all governance bypasses
 * - Enable pattern analysis to improve governance rules
 * - Support retrospective learning from bypass decisions
 *
 * Usage:
 *   import { logGovernanceBypass, BypassCategory } from './lib/governance-bypass-logger.js';
 *
 *   await logGovernanceBypass({
 *     category: BypassCategory.PRE_COMMIT_HOOK,
 *     control: 'direct-commit-to-main-check',
 *     reason: 'Automated CI/CD bot commit for schema documentation',
 *     context: { workflow: 'schema-docs-update.yml', trigger: 'push' },
 *     changedBy: 'github-actions[bot]'
 *   });
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Categories of governance bypasses for analysis
 */
export const BypassCategory = {
  // Pre-commit and commit hooks
  PRE_COMMIT_HOOK: 'PRE_COMMIT_HOOK',
  COMMIT_HOOK: 'COMMIT_HOOK',

  // CI/CD workflow controls
  WORKFLOW_CHECK: 'WORKFLOW_CHECK',
  REQUIRED_STATUS_CHECK: 'REQUIRED_STATUS_CHECK',

  // Database and RLS
  RLS_POLICY: 'RLS_POLICY',
  DATABASE_TRIGGER: 'DATABASE_TRIGGER',

  // LEO Protocol gates
  QUALITY_GATE: 'QUALITY_GATE',
  VALIDATION_GATE: 'VALIDATION_GATE',
  HANDOFF_GATE: 'HANDOFF_GATE',

  // Sub-agent verdicts
  SUBAGENT_BLOCKER: 'SUBAGENT_BLOCKER',

  // SD completion
  SD_COMPLETION_CHECK: 'SD_COMPLETION_CHECK',

  // Other
  MANUAL_OVERRIDE: 'MANUAL_OVERRIDE'
};

/**
 * Severity levels for bypass events
 */
export const BypassSeverity = {
  LOW: 'LOW',           // Informational bypass (e.g., continue-on-error)
  MEDIUM: 'MEDIUM',     // Controlled bypass with justification
  HIGH: 'HIGH',         // Security-relevant bypass requiring review
  CRITICAL: 'CRITICAL'  // Emergency bypass requiring immediate attention
};

/**
 * Log a governance bypass event to the audit log
 *
 * @param {Object} params - Bypass event parameters
 * @param {string} params.category - BypassCategory enum value
 * @param {string} params.control - Name of the control being bypassed
 * @param {string} params.reason - Human-readable justification
 * @param {Object} params.context - Additional context (JSON-serializable)
 * @param {string} params.changedBy - Who/what initiated the bypass
 * @param {string} [params.severity] - BypassSeverity enum value (default: MEDIUM)
 * @param {string} [params.sdId] - Related Strategic Directive ID if applicable
 * @param {string} [params.prNumber] - Related PR number if applicable
 * @returns {Promise<Object>} Result of the logging operation
 */
export async function logGovernanceBypass({
  category,
  control,
  reason,
  context = {},
  changedBy,
  severity = BypassSeverity.MEDIUM,
  sdId = null,
  prNumber = null
}) {
  // Validate required parameters
  if (!category || !control || !reason || !changedBy) {
    throw new Error('logGovernanceBypass requires: category, control, reason, changedBy');
  }

  // Create Supabase client - prefer service_role_key for full write access to governance_audit_log
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[GovernanceBypass] Missing Supabase credentials - logging to console only');
    console.log('[GovernanceBypass]', JSON.stringify({
      category, control, reason, context, changedBy, severity, sdId, prNumber
    }, null, 2));
    return { success: false, reason: 'missing_credentials' };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Build the audit log record
  const record = {
    table_name: 'governance_bypass',  // Virtual table name for bypass events
    record_id: sdId || `bypass-${Date.now()}`,
    operation: 'STATE_CHANGE',
    old_values: {
      control_status: 'ENFORCED',
      control_name: control
    },
    new_values: {
      control_status: 'BYPASSED',
      control_name: control,
      category,
      severity,
      bypass_reason: reason,
      context,
      sd_id: sdId,
      pr_number: prNumber,
      learning_opportunity: generateLearningOpportunity(category, control, reason)
    },
    changed_by: changedBy,
    change_reason: reason
  };

  try {
    const { data, error } = await supabase
      .from('governance_audit_log')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('[GovernanceBypass] Failed to log:', error.message);
      // Log to console as fallback
      console.log('[GovernanceBypass] Fallback log:', JSON.stringify(record, null, 2));
      return { success: false, error: error.message };
    }

    console.log(`[GovernanceBypass] Logged: ${category}/${control} by ${changedBy}`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error('[GovernanceBypass] Exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Generate learning opportunity text for retrospective analysis
 */
function generateLearningOpportunity(category, _control, _reason) {
  const opportunities = {
    [BypassCategory.PRE_COMMIT_HOOK]:
      'Consider: Should this bypass be codified as an exception rule? Is the pre-commit hook too restrictive for automated processes?',
    [BypassCategory.RLS_POLICY]:
      'Consider: Can RLS policies be updated to allow this access pattern? Should a service role function be created?',
    [BypassCategory.QUALITY_GATE]:
      'Consider: Are quality thresholds calibrated correctly? Should this SD type have different thresholds?',
    [BypassCategory.SUBAGENT_BLOCKER]:
      'Consider: Is this a pre-existing issue or new? Should sub-agent criteria be adjusted for this SD type?',
    [BypassCategory.WORKFLOW_CHECK]:
      'Consider: Should this check be informational vs blocking? Are there environment-specific exceptions needed?'
  };

  return opportunities[category] ||
    'Review this bypass in the next retrospective to determine if governance rules need adjustment.';
}

/**
 * Query bypass patterns for retrospective analysis
 *
 * @param {Object} options - Query options
 * @param {string} [options.category] - Filter by category
 * @param {string} [options.changedBy] - Filter by actor
 * @param {number} [options.days] - Look back period in days (default: 30)
 * @returns {Promise<Array>} Bypass events matching criteria
 */
export async function queryBypassPatterns({ category = null, changedBy = null, days = 30 } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('governance_audit_log')
    .select('*')
    .eq('table_name', 'governance_bypass')
    .gte('changed_at', cutoffDate)
    .order('changed_at', { ascending: false });

  if (category) {
    query = query.eq('new_values->>category', category);
  }

  if (changedBy) {
    query = query.eq('changed_by', changedBy);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to query bypass patterns: ${error.message}`);
  }

  return data;
}

/**
 * Generate bypass analytics for retrospective
 *
 * @param {number} days - Look back period
 * @returns {Promise<Object>} Analytics summary
 */
export async function generateBypassAnalytics(days = 30) {
  const bypasses = await queryBypassPatterns({ days });

  const analytics = {
    total_bypasses: bypasses.length,
    by_category: {},
    by_severity: {},
    by_actor: {},
    top_controls: {},
    learning_opportunities: []
  };

  for (const bypass of bypasses) {
    const category = bypass.new_values?.category || 'UNKNOWN';
    const severity = bypass.new_values?.severity || 'UNKNOWN';
    const control = bypass.new_values?.control_name || 'UNKNOWN';
    const actor = bypass.changed_by || 'UNKNOWN';
    const learning = bypass.new_values?.learning_opportunity;

    analytics.by_category[category] = (analytics.by_category[category] || 0) + 1;
    analytics.by_severity[severity] = (analytics.by_severity[severity] || 0) + 1;
    analytics.by_actor[actor] = (analytics.by_actor[actor] || 0) + 1;
    analytics.top_controls[control] = (analytics.top_controls[control] || 0) + 1;

    if (learning && !analytics.learning_opportunities.includes(learning)) {
      analytics.learning_opportunities.push(learning);
    }
  }

  return analytics;
}

export default {
  logGovernanceBypass,
  queryBypassPatterns,
  generateBypassAnalytics,
  BypassCategory,
  BypassSeverity
};
