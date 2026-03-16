/**
 * Operations Cost Governance Auto-Throttle Service
 * SD: SD-LEO-INFRA-OPERATIONS-COST-GOVERNANCE-001
 *
 * Per-venture budget enforcement across 3 categories:
 * AI API, infrastructure, marketing.
 *
 * Three-tier thresholds: 80% warn, 90% throttle, 100% halt.
 * Chairman override mechanism with audit trail.
 * Margin tracking (revenue - costs).
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export const COST_CATEGORIES = ['ai_api', 'infrastructure', 'marketing'];

export const THRESHOLDS = {
  WARNING: 0.80,
  THROTTLE: 0.90,
  HALT: 1.00,
};

/**
 * Create or update a budget for a venture/category.
 * @param {Object} params
 * @param {string} params.ventureId
 * @param {string} params.category - ai_api | infrastructure | marketing
 * @param {number} params.monthlyBudget - Budget amount in cents
 * @param {string} [params.period] - Budget period (default: current month YYYY-MM)
 * @param {string} [params.createdBy]
 * @returns {Promise<Object>}
 */
export async function upsertBudget({
  ventureId,
  category,
  monthlyBudget,
  period = null,
  createdBy = 'ops-cost-service',
}) {
  const supabase = getSupabase();
  const budgetPeriod = period || new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase
    .from('ops_cost_budgets')
    .upsert({
      venture_id: ventureId,
      category,
      monthly_budget: monthlyBudget,
      period: budgetPeriod,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'venture_id,category,period' })
    .select()
    .single();

  if (error) throw new Error(`upsertBudget failed: ${error.message}`);
  return data;
}

/**
 * Get budget for a venture/category/period.
 */
export async function getBudget(ventureId, category, period = null) {
  const supabase = getSupabase();
  const budgetPeriod = period || new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase
    .from('ops_cost_budgets')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('category', category)
    .eq('period', budgetPeriod)
    .single();

  if (error) return null;
  return data;
}

/**
 * Record a cost event.
 * @param {Object} params
 * @param {string} params.ventureId
 * @param {string} params.category
 * @param {number} params.amount - Cost in cents
 * @param {string} [params.description]
 * @param {Object} [params.metadata]
 * @param {string} [params.createdBy]
 * @returns {Promise<Object>}
 */
export async function recordCostEvent({
  ventureId,
  category,
  amount,
  description = null,
  metadata = null,
  createdBy = 'ops-cost-service',
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ops_cost_events')
    .insert({
      venture_id: ventureId,
      category,
      amount,
      description,
      metadata,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(`recordCostEvent failed: ${error.message}`);
  return data;
}

/**
 * Get current spend for a venture/category in the current period.
 * @param {string} ventureId
 * @param {string} category
 * @param {string} [period]
 * @returns {Promise<number>} Total spend in cents
 */
export async function getCurrentSpend(ventureId, category, period = null) {
  const supabase = getSupabase();
  const budgetPeriod = period || new Date().toISOString().slice(0, 7);
  const startDate = `${budgetPeriod}-01`;
  const endDate = budgetPeriod === new Date().toISOString().slice(0, 7)
    ? new Date().toISOString()
    : `${budgetPeriod}-31T23:59:59Z`;

  const { data, error } = await supabase
    .from('ops_cost_events')
    .select('amount')
    .eq('venture_id', ventureId)
    .eq('category', category)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (error) throw new Error(`getCurrentSpend failed: ${error.message}`);
  return (data || []).reduce((sum, row) => sum + (row.amount || 0), 0);
}

/**
 * Check threshold status for a venture/category.
 * @param {string} ventureId
 * @param {string} category
 * @returns {Promise<{status, percentage, budget, spent, action}>}
 */
export async function checkThreshold(ventureId, category) {
  const budget = await getBudget(ventureId, category);
  if (!budget || budget.monthly_budget <= 0) {
    return { status: 'no_budget', percentage: 0, budget: 0, spent: 0, action: 'none' };
  }

  const spent = await getCurrentSpend(ventureId, category);
  const percentage = spent / budget.monthly_budget;

  if (percentage >= THRESHOLDS.HALT) {
    return {
      status: 'halt',
      percentage: Math.round(percentage * 100),
      budget: budget.monthly_budget,
      spent,
      action: 'halt_operations',
      requiresOverride: true,
    };
  }

  if (percentage >= THRESHOLDS.THROTTLE) {
    return {
      status: 'throttle',
      percentage: Math.round(percentage * 100),
      budget: budget.monthly_budget,
      spent,
      action: 'throttle_non_essential',
    };
  }

  if (percentage >= THRESHOLDS.WARNING) {
    return {
      status: 'warning',
      percentage: Math.round(percentage * 100),
      budget: budget.monthly_budget,
      spent,
      action: 'alert_chairman',
    };
  }

  return {
    status: 'ok',
    percentage: Math.round(percentage * 100),
    budget: budget.monthly_budget,
    spent,
    action: 'none',
  };
}

/**
 * Check all categories for a venture.
 * @param {string} ventureId
 * @returns {Promise<Array>}
 */
export async function checkAllThresholds(ventureId) {
  const results = [];
  for (const category of COST_CATEGORIES) {
    const result = await checkThreshold(ventureId, category);
    results.push({ category, ...result });
  }
  return results;
}

/**
 * Record a chairman override for a halted venture/category.
 * @param {Object} params
 * @param {string} params.ventureId
 * @param {string} params.category
 * @param {string} params.reason
 * @param {string} [params.overriddenBy]
 * @returns {Promise<Object>}
 */
export async function recordOverride({
  ventureId,
  category,
  reason,
  overriddenBy = 'chairman',
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ops_cost_overrides')
    .insert({
      venture_id: ventureId,
      category,
      reason,
      overridden_by: overriddenBy,
      overridden_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`recordOverride failed: ${error.message}`);
  return data;
}

/**
 * Calculate margin (revenue - costs) for a venture.
 * @param {string} ventureId
 * @param {string} [period]
 * @returns {Promise<{revenue, totalCosts, margin, marginPercentage}>}
 */
export async function calculateMargin(ventureId, period = null) {
  const supabase = getSupabase();
  const budgetPeriod = period || new Date().toISOString().slice(0, 7);

  // Get revenue from ops_revenue_metrics
  const { data: revenueData } = await supabase
    .from('ops_revenue_metrics')
    .select('mrr')
    .eq('venture_id', ventureId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single();

  const revenue = revenueData?.mrr || 0;

  // Sum costs across all categories
  let totalCosts = 0;
  for (const category of COST_CATEGORIES) {
    totalCosts += await getCurrentSpend(ventureId, category, budgetPeriod);
  }

  const margin = revenue - totalCosts;
  const marginPercentage = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;

  return { revenue, totalCosts, margin, marginPercentage };
}
