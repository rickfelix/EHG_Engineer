/**
 * Deep Research Budget Controls
 * SD-LEO-FEAT-DEEP-RESEARCH-API-001 (FR-003)
 *
 * Daily budget tracking with pre-submission checks, alerts, and kill-switch.
 * Uses deep_research_budget table for per-provider daily tracking.
 */

import { createClient } from '@supabase/supabase-js';

// Cost estimates per provider (USD per 1K tokens, approximate)
const COST_ESTIMATES = {
  anthropic: { input: 0.003, output: 0.015, thinking: 0.003 },
  openai: { input: 0.01, output: 0.03 },
  google: { input: 0.00125, output: 0.005 },
};

const DEFAULT_DAILY_CAP_USD = parseFloat(process.env.DEEP_RESEARCH_DAILY_CAP_USD || '10');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Estimate cost for a deep research call before submission.
 * @param {string} provider - Provider name
 * @param {number} estimatedInputTokens - Estimated input token count
 * @param {number} estimatedOutputTokens - Estimated output token count
 * @returns {number} Estimated cost in USD
 */
export function estimateCost(provider, estimatedInputTokens = 5000, estimatedOutputTokens = 8000) {
  const rates = COST_ESTIMATES[provider] || COST_ESTIMATES.anthropic;
  return (estimatedInputTokens / 1000) * rates.input + (estimatedOutputTokens / 1000) * rates.output;
}

/**
 * Pre-submission budget check. Blocks if daily cap would be exceeded or kill-switch is active.
 * @param {string} provider - Provider name
 * @param {number} estimatedCost - Estimated cost of the call
 * @returns {Promise<{allowed: boolean, reason?: string, remaining?: number, spent?: number}>}
 */
export async function checkBudget(provider, estimatedCost) {
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  // Check kill switch
  if (process.env.DEEP_RESEARCH_KILL_SWITCH === 'true') {
    return { allowed: false, reason: 'Kill switch is active (DEEP_RESEARCH_KILL_SWITCH=true)' };
  }

  // Get or create today's budget row
  const { data: budget } = await supabase
    .from('deep_research_budget')
    .select('total_cost_usd, call_count, daily_cap_usd, kill_switch')
    .eq('date', today)
    .eq('provider', provider)
    .single();

  const spent = budget?.total_cost_usd || 0;
  const cap = budget?.daily_cap_usd || DEFAULT_DAILY_CAP_USD;

  if (budget?.kill_switch) {
    return { allowed: false, reason: `Kill switch active for ${provider}`, spent, remaining: 0 };
  }

  const remaining = cap - spent;
  if (estimatedCost > remaining) {
    return {
      allowed: false,
      reason: `Daily cap would be exceeded: spent $${spent.toFixed(4)} + estimated $${estimatedCost.toFixed(4)} > cap $${cap.toFixed(2)}`,
      spent,
      remaining,
    };
  }

  // Alert if approaching threshold
  const alertThreshold = budget?.alert_threshold_pct || 0.80;
  const wouldSpend = spent + estimatedCost;
  if (wouldSpend / cap >= alertThreshold) {
    console.log(`⚠️  Deep research budget alert: ${provider} at ${((wouldSpend / cap) * 100).toFixed(0)}% of daily cap ($${wouldSpend.toFixed(4)}/$${cap.toFixed(2)})`);
  }

  return { allowed: true, spent, remaining, cap };
}

/**
 * Record actual cost after a deep research call completes.
 * @param {string} provider - Provider name
 * @param {number} actualCost - Actual cost in USD
 * @returns {Promise<void>}
 */
export async function recordCost(provider, actualCost) {
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  // Upsert: increment today's cost and count
  const { data: existing } = await supabase
    .from('deep_research_budget')
    .select('id, total_cost_usd, call_count')
    .eq('date', today)
    .eq('provider', provider)
    .single();

  if (existing) {
    await supabase
      .from('deep_research_budget')
      .update({
        total_cost_usd: (existing.total_cost_usd || 0) + actualCost,
        call_count: (existing.call_count || 0) + 1,
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('deep_research_budget')
      .insert({
        date: today,
        provider,
        total_cost_usd: actualCost,
        call_count: 1,
        daily_cap_usd: DEFAULT_DAILY_CAP_USD,
      });
  }
}

/**
 * Get budget status for all providers today.
 * @returns {Promise<Object[]>} Array of budget rows
 */
export async function getBudgetStatus() {
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('deep_research_budget')
    .select('provider, total_cost_usd, call_count, daily_cap_usd, kill_switch')
    .eq('date', today);

  return data || [];
}
