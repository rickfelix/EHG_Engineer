/**
 * Budget Manager Module
 * Extracted from lib/agents/base-sub-agent.js (SD-LEO-REFAC-BASE-AGENT-003)
 *
 * Responsibilities:
 * - Supabase client singleton management
 * - Budget checking and validation
 * - Instantiation attempt logging
 */

import { createClient } from '@supabase/supabase-js';
import { BudgetConfigurationException } from './exceptions.js';

/**
 * Supabase client singleton
 */
let _supabaseClient = null;

/**
 * Get Supabase client singleton for budget checks
 * @returns {Object|null} Supabase client instance
 */
export function getSupabaseClient() {
  if (!_supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      _supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
  }
  return _supabaseClient;
}

/**
 * Check budget for a venture
 * @param {string} ventureId - Venture ID to check budget for
 * @returns {Promise<{budgetRemaining: number|null, source: string}>}
 * @throws {BudgetConfigurationException} If budget cannot be verified
 */
export async function checkBudget(ventureId) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    // Industrial Hardening v3.0: FAIL-CLOSED - no client means HALT
    console.error('[BUDGET] FAIL-CLOSED: Supabase client not available - cannot verify budget');
    throw new BudgetConfigurationException(
      'sub-agent-factory',
      ventureId,
      'NO_SUPABASE_CLIENT - Cannot verify budget without database connection'
    );
  }

  // Query venture_token_budgets first
  const { data: budgetData, error: budgetError } = await supabase
    .from('venture_token_budgets')
    .select('budget_remaining, budget_allocated')
    .eq('venture_id', ventureId)
    .single();

  if (!budgetError && budgetData) {
    return {
      budgetRemaining: budgetData.budget_remaining,
      source: 'venture_token_budgets'
    };
  }

  // Fallback to venture_phase_budgets
  const { data: phaseBudgetData, error: phaseError } = await supabase
    .from('venture_phase_budgets')
    .select('budget_remaining, budget_allocated')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!phaseError && phaseBudgetData) {
    return {
      budgetRemaining: phaseBudgetData.budget_remaining,
      source: 'venture_phase_budgets'
    };
  }

  // Industrial Hardening v3.0: FAIL-CLOSED - no record means HALT
  console.error(`[BUDGET] FAIL-CLOSED: No budget record for venture ${ventureId}`);
  throw new BudgetConfigurationException(
    'sub-agent-factory',
    ventureId,
    'NO_BUDGET_RECORD - Venture must have budget tracking configured before agent execution'
  );
}

/**
 * Log instantiation attempt to system_events
 * @param {string} agentId - Agent ID
 * @param {string} ventureId - Venture ID
 * @param {string} status - Status of the attempt
 * @param {Object} details - Additional details
 */
export async function logInstantiationAttempt(agentId, ventureId, status, details = {}) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    // Log to console if Supabase unavailable
    console.log(`[AGENT_INSTANTIATION] ${status}: agent=${agentId}, venture=${ventureId}`, details);
    return;
  }

  try {
    await supabase
      .from('system_events')
      .insert({
        event_type: 'AGENT_INSTANTIATION',
        event_source: 'base-sub-agent',
        severity: status.includes('BLOCKED') || status.includes('FAILED') ? 'error' : 'info',
        details: {
          agent_id: agentId,
          venture_id: ventureId,
          status: status,
          ...details,
          timestamp: new Date().toISOString()
        }
      });
  } catch (err) {
    // Don't fail on logging errors
    console.warn(`[AGENT_INSTANTIATION] Failed to log: ${err.message}`);
  }
}
