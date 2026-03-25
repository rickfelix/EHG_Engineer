/**
 * Per-Venture Cost Tracker
 * SD-LEO-INFRA-VENTURE-LEO-BUILD-001-N
 *
 * Pluggable cost collector pattern for per-venture infrastructure cost
 * aggregation. Stub collectors for Supabase/Vercel/LLM costs.
 * Budget threshold alerting.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export const DEFAULT_BUDGET = 500; // $500/month per venture

/**
 * Registry of cost collectors.
 * Each collector: async (ventureId, period) => { cost: number, currency: string, source: string, details?: object }
 * @type {Map<string, function>}
 */
const collectors = new Map();

/**
 * Register a cost collector.
 * @param {string} name - Unique collector name
 * @param {function} fn - Async collector function (ventureId, period) => { cost, currency, source }
 */
export function registerCollector(name, fn) {
  collectors.set(name, fn);
}

/**
 * Remove a collector.
 * @param {string} name
 */
export function removeCollector(name) {
  collectors.delete(name);
}

/**
 * Clear all collectors (for testing).
 */
export function clearCollectors() {
  collectors.clear();
}

/**
 * Get registered collector names.
 * @returns {string[]}
 */
export function getCollectorNames() {
  return Array.from(collectors.keys());
}

// --- Stub Collectors ---

/** Stub: Supabase compute costs (returns $0 until real API wired) */
async function supabaseComputeCollector(ventureId, _period) {
  return { cost: 0, currency: 'USD', source: 'supabase_compute', details: { note: 'Stub — shared Supabase, no per-venture billing yet' } };
}

/** Stub: Vercel bandwidth costs (returns $0 until real API wired) */
async function vercelBandwidthCollector(ventureId, _period) {
  return { cost: 0, currency: 'USD', source: 'vercel_bandwidth', details: { note: 'Stub — Vercel billing API not yet integrated' } };
}

/** Stub: LLM token costs (returns $0 until real tracking wired) */
async function llmTokenCollector(ventureId, _period) {
  return { cost: 0, currency: 'USD', source: 'llm_tokens', details: { note: 'Stub — LLM token tracking not yet per-venture' } };
}

// Register default stubs
registerCollector('supabase_compute', supabaseComputeCollector);
registerCollector('vercel_bandwidth', vercelBandwidthCollector);
registerCollector('llm_tokens', llmTokenCollector);

// --- Aggregation ---

/**
 * Track costs for a venture by invoking all registered collectors.
 *
 * @param {string} ventureId - Venture UUID
 * @param {object} [options]
 * @param {string} [options.period] - Billing period (default: current month YYYY-MM)
 * @param {number} [options.budget] - Budget threshold (default: DEFAULT_BUDGET)
 * @returns {Promise<{ totalCost: number, breakdown: object, period: string, overBudget: boolean, amountOver: number, alerts: string[], warnings: string[] }>}
 */
export async function trackVentureCosts(ventureId, options = {}) {
  const now = new Date();
  const period = options.period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const budget = options.budget ?? DEFAULT_BUDGET;
  const breakdown = {};
  const warnings = [];
  let totalCost = 0;

  for (const [name, collector] of collectors) {
    try {
      const result = await collector(ventureId, period);
      const cost = typeof result.cost === 'number' ? result.cost : 0;
      breakdown[name] = { cost, currency: result.currency || 'USD', details: result.details || null };
      totalCost += cost;
    } catch (err) {
      warnings.push(`Collector "${name}" failed: ${err.message}`);
      breakdown[name] = { cost: 0, currency: 'USD', error: err.message };
    }
  }

  totalCost = Math.round(totalCost * 100) / 100;
  const overBudget = totalCost > budget;
  const amountOver = overBudget ? Math.round((totalCost - budget) * 100) / 100 : 0;
  const alerts = [];

  if (overBudget) {
    alerts.push(`Venture ${ventureId} cost $${totalCost} exceeds $${budget} budget by $${amountOver}`);
  }

  return { totalCost, breakdown, period, overBudget, amountOver, alerts, warnings };
}

/**
 * Write cost tracking data to venture_stage_work advisory_data.
 *
 * @param {object} supabase - Supabase client
 * @param {string} ventureId
 * @param {number} lifecycleStage - Stage number
 * @param {object} costData - From trackVentureCosts
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function writeCostToAdvisoryData(supabase, ventureId, lifecycleStage, costData) {
  try {
    const { data: existing } = await supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', lifecycleStage)
      .maybeSingle();

    const currentAdvisory = existing?.advisory_data || {};
    const updatedAdvisory = {
      ...currentAdvisory,
      cost_tracking: {
        ...costData,
        tracked_at: new Date().toISOString(),
      },
    };

    if (existing) {
      const { error } = await supabase
        .from('venture_stage_work')
        .update({ advisory_data: updatedAdvisory })
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', lifecycleStage);
      if (error) return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
