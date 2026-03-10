/**
 * Capability Gap Analyzer
 * Part of SD-LEO-INFRA-UNIFIED-STRATEGIC-INTELLIGENCE-001-C
 *
 * Compares strategy objective target_capabilities against delivered
 * venture_capabilities to identify gaps that need SDs.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Analyze capability gaps across all active strategy objectives.
 *
 * For each active objective, compares target_capabilities against
 * venture_capabilities (capability_key) to find undelivered capabilities.
 *
 * @param {Object} [options] - Options
 * @param {Object} [options.supabaseClient] - Override Supabase client (for testing)
 * @returns {Promise<{success: boolean, objectives: Array, totalGaps: number, summary: Object}>}
 */
export async function analyzeCapabilityGaps(options = {}) {
  const client = options.supabaseClient || supabase;

  // 1. Get active strategy objectives with target capabilities
  const { data: objectives, error: objErr } = await client
    .from('strategy_objectives')
    .select('id, title, time_horizon, target_capabilities, status')
    .eq('status', 'active');

  if (objErr) {
    return { success: false, error: objErr.message, objectives: [], totalGaps: 0, summary: {} };
  }

  if (!objectives || objectives.length === 0) {
    return { success: true, objectives: [], totalGaps: 0, summary: { message: 'No active strategy objectives', total_objectives: 0, objectives_with_gaps: 0, total_target_capabilities: 0, total_delivered: 0, total_gaps: 0 } };
  }

  // 2. Get all delivered/verified venture capabilities
  const { data: capabilities, error: capErr } = await client
    .from('venture_capabilities')
    .select('capability_key, status')
    .in('status', ['delivered', 'verified', 'active']);

  if (capErr) {
    return { success: false, error: capErr.message, objectives: [], totalGaps: 0, summary: {} };
  }

  const deliveredKeys = new Set((capabilities || []).map(c => c.capability_key));

  // 3. Compute gaps per objective
  let totalGaps = 0;
  const results = objectives.map(obj => {
    const targets = obj.target_capabilities || [];
    const delivered = targets.filter(t => deliveredKeys.has(t));
    const gaps = targets.filter(t => !deliveredKeys.has(t));

    totalGaps += gaps.length;

    return {
      objective_id: obj.id,
      objective_title: obj.title,
      time_horizon: obj.time_horizon,
      target_capabilities: targets,
      delivered_capabilities: delivered,
      gap_capabilities: gaps,
      coverage_pct: targets.length > 0 ? Math.round((delivered.length / targets.length) * 100) : 100,
    };
  });

  // 4. Sort by time_horizon urgency (now first) then by gap count descending
  const horizonOrder = { now: 0, next: 1, later: 2, eventually: 3 };
  results.sort((a, b) => {
    const ha = horizonOrder[a.time_horizon] ?? 4;
    const hb = horizonOrder[b.time_horizon] ?? 4;
    if (ha !== hb) return ha - hb;
    return b.gap_capabilities.length - a.gap_capabilities.length;
  });

  return {
    success: true,
    objectives: results,
    totalGaps,
    summary: {
      total_objectives: objectives.length,
      objectives_with_gaps: results.filter(r => r.gap_capabilities.length > 0).length,
      total_target_capabilities: results.reduce((s, r) => s + r.target_capabilities.length, 0),
      total_delivered: results.reduce((s, r) => s + r.delivered_capabilities.length, 0),
      total_gaps: totalGaps,
    },
  };
}

/**
 * Get gap analysis for a single strategy objective.
 *
 * @param {string} objectiveId - Strategy objective UUID
 * @param {Object} [options] - Options
 * @returns {Promise<Object>} Gap analysis for one objective
 */
export async function analyzeObjectiveGaps(objectiveId, options = {}) {
  const client = options.supabaseClient || supabase;

  const { data: obj, error: objErr } = await client
    .from('strategy_objectives')
    .select('id, title, time_horizon, target_capabilities, status')
    .eq('id', objectiveId)
    .single();

  if (objErr || !obj) {
    return { success: false, error: objErr?.message || 'Objective not found' };
  }

  const targets = obj.target_capabilities || [];
  if (targets.length === 0) {
    return {
      success: true,
      objective_id: obj.id,
      objective_title: obj.title,
      gap_capabilities: [],
      coverage_pct: 100,
    };
  }

  const { data: caps } = await client
    .from('venture_capabilities')
    .select('capability_key')
    .in('capability_key', targets)
    .in('status', ['delivered', 'verified', 'active']);

  const deliveredKeys = new Set((caps || []).map(c => c.capability_key));
  const gaps = targets.filter(t => !deliveredKeys.has(t));

  return {
    success: true,
    objective_id: obj.id,
    objective_title: obj.title,
    time_horizon: obj.time_horizon,
    target_capabilities: targets,
    delivered_capabilities: targets.filter(t => deliveredKeys.has(t)),
    gap_capabilities: gaps,
    coverage_pct: Math.round(((targets.length - gaps.length) / targets.length) * 100),
  };
}

export default { analyzeCapabilityGaps, analyzeObjectiveGaps };
