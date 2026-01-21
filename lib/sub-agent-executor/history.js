/**
 * History & Query Functions
 * Retrieves execution and validation history from database
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

import { getSupabaseClient } from './supabase-client.js';

/**
 * Get validation history for a sub-agent
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID (optional)
 * @param {number} limit - Number of results to return (default: 10)
 * @returns {Promise<Array>} Validation history
 */
export async function getValidationHistory(code, sdId = null, limit = 10) {
  const supabase = await getSupabaseClient();

  let query = supabase
    .from('subagent_validation_results')
    .select('*')
    .eq('sub_agent_code', code);

  if (sdId) {
    query = query.eq('sd_id', sdId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn(`Failed to get validation history: ${error.message}`);
    return [];
  }

  return data || [];
}

/**
 * Get sub-agent execution history
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID (optional)
 * @param {number} limit - Number of results to return (default: 10)
 * @returns {Promise<Array>} Execution history
 */
export async function getSubAgentHistory(code, sdId = null, limit = 10) {
  const supabase = await getSupabaseClient();

  let query = supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sub_agent_code', code);

  if (sdId) {
    query = query.eq('sd_id', sdId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get sub-agent history: ${error.message}`);
  }

  return data || [];
}

/**
 * Get all sub-agent results for an SD
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} All sub-agent results for this SD with grouping
 */
export async function getAllSubAgentResultsForSD(sdId) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get sub-agent results for ${sdId}: ${error.message}`);
  }

  // Group by verdict for easy filtering
  const grouped = {
    critical: data.filter(r => r.verdict === 'BLOCKED' || r.verdict === 'FAIL'),
    warnings: data.filter(r => r.verdict === 'CONDITIONAL_PASS' || r.warnings?.length > 0),
    passed: data.filter(r => r.verdict === 'PASS'),
    pending: data.filter(r => r.verdict === 'PENDING' || r.verdict === 'MANUAL_REQUIRED'),
    errors: data.filter(r => r.verdict === 'ERROR')
  };

  return {
    all: data,
    grouped,
    summary: {
      total: data.length,
      critical: grouped.critical.length,
      warnings: grouped.warnings.length,
      passed: grouped.passed.length,
      pending: grouped.pending.length,
      errors: grouped.errors.length
    }
  };
}

/**
 * List all available sub-agents from database
 * @returns {Promise<Array>} All sub-agents
 */
export async function listAllSubAgents() {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('code, name, priority, metadata')
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to list sub-agents: ${error.message}`);
  }

  return data || [];
}
