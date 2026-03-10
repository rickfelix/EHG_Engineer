#!/usr/bin/env node
/**
 * Strategy Weight Calculator
 *
 * Computes strategy_weight for baseline items by combining:
 * 1. OKR impact score (from priority-scorer.js)
 * 2. Strategy objective multiplier (linked objectives boost)
 * 3. Time horizon urgency (Now > Next > Later > Eventually)
 *
 * Formula:
 *   strategy_weight = okr_impact * strategy_multiplier * time_horizon_urgency
 *
 * Where:
 *   - okr_impact: 0-50 from calculateOKRImpact()
 *   - strategy_multiplier: 1.0 (no objective) to 3.0 (active + high health)
 *   - time_horizon_urgency: 0.5-3.0 from WEIGHTS.timeHorizon
 *
 * Max strategy_weight: 150 (matches WEIGHTS.maxPoints.strategyWeight)
 *
 * Usage:
 *   import { calculateStrategyWeight, batchCalculateWeights } from './strategy-weight-calculator.js';
 */

import { calculateOKRImpact, WEIGHTS } from './priority-scorer.js';

/**
 * Calculate strategy_weight for a single SD.
 *
 * @param {Object} params
 * @param {string} params.sdKey - SD key
 * @param {Array} params.okrAlignments - OKR alignments for this SD
 * @param {Map|Object} params.keyResults - KR lookup
 * @param {Array} params.strategyObjectives - All active strategy objectives
 * @returns {Object} { weight, breakdown }
 */
export function calculateStrategyWeight({ sdKey, okrAlignments = [], keyResults = {}, strategyObjectives = [] }) {
  const breakdown = {
    okrImpact: 0,
    strategyMultiplier: 1.0,
    timeHorizonUrgency: 1.0,
    linkedObjectives: [],
    weight: 0,
  };

  // 1. OKR Impact (0-50)
  const okrResult = calculateOKRImpact(okrAlignments, keyResults);
  breakdown.okrImpact = okrResult.totalScore;

  // 2. Strategy Objective Multiplier
  // Find which strategy objectives link to the same OKR objectives as this SD
  const sdOkrIds = new Set();
  for (const alignment of okrAlignments) {
    if (alignment.key_result_id) {
      sdOkrIds.add(alignment.key_result_id);
    }
  }

  // Also look for strategy objectives that have OKR IDs matching the SD's KR objective_ids
  const sdObjectiveIds = new Set();
  for (const alignment of okrAlignments) {
    const kr = keyResults instanceof Map
      ? keyResults.get(alignment.key_result_id)
      : keyResults[alignment.key_result_id];
    if (kr?.objective_id) {
      sdObjectiveIds.add(kr.objective_id);
    }
  }

  let maxMultiplier = 1.0;
  for (const obj of strategyObjectives) {
    if (obj.status !== 'active') continue;

    // Check if any of the strategy objective's linked OKR IDs overlap with the SD's OKR objective IDs
    const linkedIds = obj.linked_okr_ids || [];
    const hasOverlap = linkedIds.some(id => sdObjectiveIds.has(id) || sdOkrIds.has(id));

    if (hasOverlap) {
      // Health-based multiplier
      const healthBoost = obj.health_indicator === 'red' ? 1.5 :
                          obj.health_indicator === 'yellow' ? 1.2 :
                          obj.health_indicator === 'green' ? 1.0 : 1.0;

      const objMultiplier = 2.0 * healthBoost; // Base 2x for linked, up to 3x for red health
      maxMultiplier = Math.max(maxMultiplier, objMultiplier);

      breakdown.linkedObjectives.push({
        id: obj.id,
        title: obj.title,
        health: obj.health_indicator,
        multiplier: objMultiplier,
      });
    }
  }

  breakdown.strategyMultiplier = Math.min(maxMultiplier, 3.0);

  // 3. Time Horizon Urgency
  // Use the most urgent time horizon from linked strategy objectives
  let maxUrgency = WEIGHTS.timeHorizon.default;
  for (const obj of breakdown.linkedObjectives) {
    const fullObj = strategyObjectives.find(o => o.id === obj.id);
    if (fullObj?.time_horizon) {
      const urgency = WEIGHTS.timeHorizon[fullObj.time_horizon] || WEIGHTS.timeHorizon.default;
      maxUrgency = Math.max(maxUrgency, urgency);
    }
  }
  breakdown.timeHorizonUrgency = maxUrgency;

  // Calculate final weight (capped at 150)
  const rawWeight = breakdown.okrImpact * breakdown.strategyMultiplier * breakdown.timeHorizonUrgency;
  breakdown.weight = Math.min(Math.round(rawWeight * 10) / 10, WEIGHTS.maxPoints.strategyWeight);

  return breakdown;
}

/**
 * Batch calculate strategy_weight for all SDs in a baseline.
 *
 * @param {Object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase
 * @param {Array} params.sdKeys - List of SD keys to calculate for
 * @returns {Promise<Map<string, Object>>} Map of sdKey -> weight breakdown
 */
export async function batchCalculateWeights({ supabase, sdKeys }) {
  // Load strategy objectives
  const { data: strategyObjectives } = await supabase
    .from('strategy_objectives')
    .select('id, title, description, time_horizon, status, health_indicator, linked_okr_ids')
    .eq('status', 'active');

  // Load OKR alignments for these SDs
  const { data: alignments } = await supabase
    .from('sd_key_result_alignment')
    .select('sd_id, key_result_id, contribution_type, contribution_weight')
    .in('sd_id', sdKeys);

  // Group alignments by SD
  const alignmentsBySd = {};
  for (const a of alignments || []) {
    if (!alignmentsBySd[a.sd_id]) alignmentsBySd[a.sd_id] = [];
    alignmentsBySd[a.sd_id].push(a);
  }

  // Load key results
  const { data: krs } = await supabase
    .from('key_results')
    .select('id, code, title, status, objective_id, current_value, target_value');

  const keyResults = new Map();
  for (const kr of krs || []) {
    keyResults.set(kr.id, kr);
  }

  // Calculate for each SD
  const results = new Map();
  for (const sdKey of sdKeys) {
    const result = calculateStrategyWeight({
      sdKey,
      okrAlignments: alignmentsBySd[sdKey] || [],
      keyResults,
      strategyObjectives: strategyObjectives || [],
    });
    results.set(sdKey, result);
  }

  return results;
}

/**
 * Update strategy_weight on sd_baseline_items for a given baseline.
 *
 * @param {Object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase
 * @param {string} params.baselineId
 * @returns {Promise<{updated: number, skipped: number}>}
 */
export async function updateBaselineStrategyWeights({ supabase, baselineId }) {
  // Get all items in the baseline
  const { data: items } = await supabase
    .from('sd_baseline_items')
    .select('id, sd_id, strategy_weight')
    .eq('baseline_id', baselineId);

  if (!items || items.length === 0) {
    return { updated: 0, skipped: 0 };
  }

  const sdKeys = items.map(i => i.sd_id);
  const weights = await batchCalculateWeights({ supabase, sdKeys });

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const result = weights.get(item.sd_id);
    if (!result || result.weight === 0) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('sd_baseline_items')
      .update({ strategy_weight: result.weight })
      .eq('id', item.id);

    if (!error) updated++;
    else skipped++;
  }

  return { updated, skipped };
}

export default {
  calculateStrategyWeight,
  batchCalculateWeights,
  updateBaselineStrategyWeights,
};
