#!/usr/bin/env node
/**
 * Baseline Insertion Hook
 *
 * Event-driven hook that inserts a newly created SD into the active baseline
 * with intelligent positioning using dependency-graph.js and priority-scorer.js.
 * Cascade reordering adjusts downstream sequence_rank values.
 *
 * Design:
 * - Fire-and-forget: failure does not block SD creation workflow
 * - Idempotent: re-triggering does not create duplicates
 * - No SD gets sequence_rank=9999 after insertion
 *
 * Usage:
 *   node scripts/pipeline/baseline-insertion-hook.js <sd-key>
 *   node scripts/pipeline/baseline-insertion-hook.js <sd-key> --dry-run
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  buildGraph,
  detectCycles,
  topologicalSortByPriority,
  getDependencyDepths,
} from '../lib/dependency-graph.js';
// eslint-disable-next-line import/no-named-as-default-member
import priorityScorer from '../lib/priority-scorer.js';
const { calculatePriorityScore, calculateStrategyWeight, assignTrack } = priorityScorer;

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const isDryRun = process.argv.includes('--dry-run');

/**
 * Get the active baseline.
 */
async function getActiveBaseline() {
  const { data, error } = await supabase
    .from('sd_execution_baselines')
    .select('id, baseline_name, version, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to query baseline: ${error.message}`);
  }
  return data;
}

/**
 * Check if the SD is already in the baseline (idempotency).
 */
async function isAlreadyInBaseline(baselineId, sdKey) {
  const { data } = await supabase
    .from('sd_baseline_items')
    .select('id, sequence_rank')
    .eq('baseline_id', baselineId)
    .eq('sd_id', sdKey)
    .limit(1);

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Load all current baseline items + SD data for scoring.
 */
async function loadBaselineContext(baselineId) {
  // Load existing baseline items
  const { data: items } = await supabase
    .from('sd_baseline_items')
    .select('sd_id, sequence_rank, track, is_ready')
    .eq('baseline_id', baselineId)
    .order('sequence_rank');

  // Load all SDs that are in the baseline (for dependency graph)
  const sdKeys = (items || []).map(i => i.sd_id);
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select(`
      id, sd_key, title, status, priority, sd_type, category,
      dependencies, rolled_triage, readiness, parent_sd_id
    `)
    .in('sd_key', sdKeys);

  // Load OKR alignments for scoring
  const { data: alignments } = await supabase
    .from('sd_key_result_alignment')
    .select('sd_id, key_result_id, contribution_type, contribution_weight');

  const alignmentsBySd = {};
  for (const a of alignments || []) {
    if (!alignmentsBySd[a.sd_id]) alignmentsBySd[a.sd_id] = [];
    alignmentsBySd[a.sd_id].push(a);
  }

  // Load key results for OKR scoring
  const { data: krs } = await supabase
    .from('key_results')
    .select('id, code, title, status');

  const keyResults = new Map();
  for (const kr of krs || []) {
    keyResults.set(kr.id, kr);
  }

  // Load strategy objectives for strategy_weight computation
  const { data: stratObjs } = await supabase
    .from('strategy_objectives')
    .select('id, time_horizon, status')
    .in('status', ['active', 'paused']);

  const strategyObjectives = new Map();
  for (const obj of stratObjs || []) {
    strategyObjectives.set(obj.id, obj);
  }

  // Load baseline items' strategy_objective_id for existing linkages
  const { data: baselineStratLinks } = await supabase
    .from('sd_baseline_items')
    .select('sd_id, strategy_objective_id, strategy_weight, time_horizon')
    .eq('baseline_id', baselineId)
    .not('strategy_objective_id', 'is', null);

  const strategyLinks = {};
  for (const link of baselineStratLinks || []) {
    strategyLinks[link.sd_id] = link;
  }

  return { items: items || [], sds: sds || [], alignmentsBySd, keyResults, strategyObjectives, strategyLinks };
}

/**
 * Calculate optimal insertion position for the new SD.
 * Uses dependency graph + priority scoring to find the right rank.
 */
function calculateInsertionPosition(newSd, existingSds, existingItems, alignmentsBySd, keyResults) {
  // Build combined SD list (existing + new)
  const allSds = [...existingSds, newSd];

  // Build dependency graph
  const graph = buildGraph(allSds);
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    console.warn('Warning: Cycle detected involving new SD, using priority-only positioning');
  }

  // Calculate priority scores for all SDs
  const scores = {};
  for (const sd of allSds) {
    const sdAlignments = alignmentsBySd[sd.sd_key] || [];
    const score = calculatePriorityScore(sd, sdAlignments, keyResults);
    scores[sd.sd_key] = score.total;
  }

  // Get dependency depths
  const depths = getDependencyDepths(graph);

  // Generate ideal ordering using topological sort + priority
  const idealOrder = topologicalSortByPriority(graph, scores);

  // Find where the new SD lands in the ideal order
  const newSdIndex = idealOrder.indexOf(newSd.sd_key);
  if (newSdIndex === -1) {
    // Fallback: use priority score to find position among existing items
    return findPositionByScore(scores[newSd.sd_key], existingItems, scores);
  }

  // Map to actual sequence_rank based on surrounding items
  // The new SD's rank should be between its neighbors in the ideal order
  const predecessors = idealOrder.slice(0, newSdIndex);
  const successors = idealOrder.slice(newSdIndex + 1);

  // Find the highest rank among predecessors that exist in the baseline
  const itemsByKey = {};
  for (const item of existingItems) {
    itemsByKey[item.sd_id] = item;
  }

  let insertAfterRank = 0;
  for (const pred of predecessors.reverse()) {
    if (itemsByKey[pred]) {
      insertAfterRank = itemsByKey[pred].sequence_rank;
      break;
    }
  }

  let insertBeforeRank = Infinity;
  for (const succ of successors) {
    if (itemsByKey[succ]) {
      insertBeforeRank = itemsByKey[succ].sequence_rank;
      break;
    }
  }

  // Target rank is between the two neighbors
  const targetRank = insertAfterRank + 1;

  return {
    rank: targetRank,
    needsCascade: insertBeforeRank <= targetRank,
    cascadeFromRank: targetRank,
    score: scores[newSd.sd_key],
    depth: depths.get(newSd.sd_key) || 0,
  };
}

/**
 * Fallback: position by priority score alone.
 */
function findPositionByScore(newScore, existingItems, scores) {
  // Find the first item with a lower score — insert before it
  for (const item of existingItems) {
    const itemScore = scores[item.sd_id] || 0;
    if (newScore > itemScore) {
      return {
        rank: item.sequence_rank,
        needsCascade: true,
        cascadeFromRank: item.sequence_rank,
        score: newScore,
        depth: 0,
      };
    }
  }

  // Lowest priority: append at end
  const maxRank = existingItems.length > 0
    ? Math.max(...existingItems.map(i => i.sequence_rank))
    : 0;

  return {
    rank: maxRank + 1,
    needsCascade: false,
    cascadeFromRank: null,
    score: newScore,
    depth: 0,
  };
}

/**
 * Cascade reorder: increment sequence_rank for all items at or above the target rank.
 */
async function cascadeReorder(baselineId, fromRank) {
  // Get all items that need to shift
  const { data: itemsToShift } = await supabase
    .from('sd_baseline_items')
    .select('id, sd_id, sequence_rank')
    .eq('baseline_id', baselineId)
    .gte('sequence_rank', fromRank)
    .order('sequence_rank', { ascending: false }); // Process highest first to avoid conflicts

  if (!itemsToShift || itemsToShift.length === 0) return 0;

  // Update each item's rank (highest first to avoid unique constraint issues)
  for (const item of itemsToShift) {
    await supabase
      .from('sd_baseline_items')
      .update({ sequence_rank: item.sequence_rank + 1 })
      .eq('id', item.id);
  }

  return itemsToShift.length;
}

/**
 * Insert the new SD into the baseline.
 * Computes strategy_weight from OKR alignment + strategy objective time_horizon.
 */
async function insertIntoBaseline(baselineId, sdKey, sd, position, ctx) {
  const track = assignTrack(sd);
  const node = position.depth || 0;

  // Compute strategy_weight from OKR alignments + strategy objective linkage
  const sdAlignments = ctx.alignmentsBySd[sdKey] || [];
  let strategyWeight = 0;
  let strategyObjectiveId = null;
  let timeHorizon = null;

  // Find strategy objective linked to this SD (via existing baseline linkage)
  const existingLink = ctx.strategyLinks[sdKey];
  if (existingLink && existingLink.strategy_objective_id) {
    strategyObjectiveId = existingLink.strategy_objective_id;
    const obj = ctx.strategyObjectives.get(strategyObjectiveId);
    if (obj) {
      timeHorizon = obj.time_horizon;
      strategyWeight = calculateStrategyWeight(sdAlignments, ctx.keyResults, timeHorizon);
    }
  } else if (sdAlignments.length > 0) {
    // No explicit link but has OKR alignments — compute with default time_horizon
    strategyWeight = calculateStrategyWeight(sdAlignments, ctx.keyResults, '');
  }

  const item = {
    baseline_id: baselineId,
    sd_id: sdKey,
    sequence_rank: position.rank,
    track: track.track,
    track_name: track.trackName,
    dependency_health_score: 1.0,
    is_ready: true,
    strategy_weight: strategyWeight,
    strategy_objective_id: strategyObjectiveId,
    time_horizon: timeHorizon,
    notes: `Auto-inserted by baseline-insertion-hook. Score: ${position.score}, depth: ${node}, strategy_weight: ${strategyWeight}.`,
  };

  const { error } = await supabase
    .from('sd_baseline_items')
    .insert(item);

  if (error) {
    throw new Error(`Failed to insert baseline item: ${error.message}`);
  }

  return item;
}

/**
 * Main: Insert an SD into the active baseline with intelligent positioning.
 */
async function insertSD(sdKey) {
  console.log(`Baseline Insertion Hook: ${sdKey}`);
  console.log('='.repeat(50));

  // 1. Get active baseline
  const baseline = await getActiveBaseline();
  if (!baseline) {
    console.log('No active baseline found. Skipping insertion.');
    return { success: false, reason: 'no_active_baseline' };
  }
  console.log(`Baseline: ${baseline.baseline_name} (v${baseline.version || 1})`);

  // 2. Idempotency check
  const existing = await isAlreadyInBaseline(baseline.id, sdKey);
  if (existing) {
    console.log(`SD already in baseline at rank ${existing.sequence_rank}. No action needed.`);
    return { success: true, reason: 'already_exists', rank: existing.sequence_rank };
  }

  // 3. Load the new SD
  const { data: newSd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select(`
      id, sd_key, title, status, priority, sd_type, category,
      dependencies, rolled_triage, readiness, parent_sd_id
    `)
    .eq('sd_key', sdKey)
    .single();

  if (sdError || !newSd) {
    console.error(`SD not found: ${sdKey}`);
    return { success: false, reason: 'sd_not_found' };
  }
  console.log(`SD: ${newSd.title} (${newSd.sd_type}, ${newSd.priority})`);

  // 4. Load baseline context for scoring
  const ctx = await loadBaselineContext(baseline.id);
  console.log(`Context: ${ctx.items.length} existing items, ${ctx.sds.length} SDs loaded`);

  // 5. Calculate insertion position
  const position = calculateInsertionPosition(
    newSd, ctx.sds, ctx.items, ctx.alignmentsBySd, ctx.keyResults
  );
  console.log(`Position: rank ${position.rank}, score ${position.score}, depth ${position.depth}`);

  if (isDryRun) {
    console.log('\n[DRY RUN] Would insert:');
    console.log(`  SD: ${sdKey} at rank ${position.rank}`);
    console.log(`  Cascade: ${position.needsCascade ? `Yes (from rank ${position.cascadeFromRank})` : 'No'}`);
    return { success: true, dryRun: true, rank: position.rank };
  }

  // 6. Cascade reorder if needed
  if (position.needsCascade) {
    const shifted = await cascadeReorder(baseline.id, position.cascadeFromRank);
    console.log(`Cascade: shifted ${shifted} items`);
  }

  // 7. Insert (with strategy_weight computation)
  const item = await insertIntoBaseline(baseline.id, sdKey, newSd, position, ctx);
  console.log(`Inserted: ${sdKey} at rank ${position.rank}, track ${item.track}, strategy_weight: ${item.strategy_weight}`);

  return {
    success: true,
    sdKey,
    rank: position.rank,
    track: item.track,
    score: position.score,
    cascaded: position.needsCascade,
  };
}

// CLI dispatch
const sdKey = process.argv[2];
if (!sdKey || sdKey.startsWith('--')) {
  console.log('Baseline Insertion Hook');
  console.log('  Usage: node scripts/pipeline/baseline-insertion-hook.js <sd-key> [--dry-run]');
  console.log('');
  console.log('  Inserts an SD into the active baseline with intelligent positioning.');
  console.log('  Uses dependency graph + priority scoring for optimal rank.');
  console.log('  Cascade reordering adjusts downstream items.');
  process.exit(0);
}

insertSD(sdKey).catch(err => {
  // Fire-and-forget: log error but don't crash the calling workflow
  console.error('Baseline insertion hook error:', err.message);
  process.exit(1);
});

export { insertSD };
