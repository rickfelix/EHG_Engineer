#!/usr/bin/env node
/**
 * Burn Rate Worker
 *
 * Daily scheduled worker that takes burn rate snapshots using the existing
 * sd:burnrate snapshot logic. Designed to run as an EVA daily task or
 * standalone cron job.
 *
 * Usage:
 *   node scripts/pipeline/burn-rate-worker.js           # Take snapshot
 *   node scripts/pipeline/burn-rate-worker.js --dry-run  # Preview only
 *   node scripts/pipeline/burn-rate-worker.js --history   # Show recent snapshots
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const isDryRun = process.argv.includes('--dry-run');
const isHistory = process.argv.includes('--history');

/**
 * Load active baseline and its items + SD details.
 */
async function loadData() {
  const { data: baseline } = await supabase
    .from('sd_execution_baselines')
    .select('id, baseline_name, is_active, created_at')
    .eq('is_active', true)
    .single();

  if (!baseline) {
    return { baseline: null };
  }

  const { data: items } = await supabase
    .from('sd_baseline_items')
    .select('sd_id, sequence_rank, track, is_ready')
    .eq('baseline_id', baseline.id)
    .order('sequence_rank');

  const sdKeys = (items || []).map(i => i.sd_id);
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, progress_percentage, updated_at')
    .in('sd_key', sdKeys);

  const sdMap = {};
  for (const sd of sds || []) {
    sdMap[sd.sd_key] = sd;
  }

  return { baseline, items: items || [], sdMap };
}

/**
 * Calculate metrics from baseline data.
 */
function calculateMetrics(baseline, items, sdMap) {
  const totalSDs = items.length;
  let completedCount = 0;
  let inProgressCount = 0;

  for (const item of items) {
    const sd = sdMap[item.sd_id];
    if (!sd) continue;
    if (sd.status === 'completed') completedCount++;
    else if (['in_progress', 'active', 'exec_active', 'plan_active'].includes(sd.status)) inProgressCount++;
  }

  const remainingCount = totalSDs - completedCount;
  const completedPct = totalSDs > 0 ? Math.round((completedCount / totalSDs) * 100) : 0;

  const baselineCreated = new Date(baseline.created_at);
  const baselineAgeDays = Math.max(1, Math.round((Date.now() - baselineCreated.getTime()) / (1000 * 60 * 60 * 24)));

  const velocity = completedCount / (baselineAgeDays / 7); // SDs per week

  return {
    totalSDs,
    completedCount,
    inProgressCount,
    remainingCount,
    completedPct,
    baselineAgeDays,
    velocity,
  };
}

/**
 * Take a burn rate snapshot and store it.
 */
async function takeSnapshot() {
  console.log('Burn Rate Worker - Daily Snapshot');
  console.log('='.repeat(50));

  const { baseline, items, sdMap } = await loadData();
  if (!baseline) {
    console.log('No active baseline found. Skipping snapshot.');
    return { success: false, reason: 'no_active_baseline' };
  }

  const metrics = calculateMetrics(baseline, items, sdMap);

  // Calculate forecast
  let forecastDate = null;
  let confidence = 'low';

  if (metrics.velocity > 0) {
    const weeksRemaining = metrics.remainingCount / metrics.velocity;
    const daysRemaining = Math.ceil(weeksRemaining * 7);
    forecastDate = new Date();
    forecastDate.setDate(forecastDate.getDate() + daysRemaining);
    confidence = metrics.completedCount >= 5 ? 'high' :
                 metrics.completedCount >= 2 ? 'medium' : 'low';
  }

  console.log(`Baseline: ${baseline.baseline_name}`);
  console.log(`  Total SDs: ${metrics.totalSDs}`);
  console.log(`  Completed: ${metrics.completedCount} (${metrics.completedPct}%)`);
  console.log(`  In Progress: ${metrics.inProgressCount}`);
  console.log(`  Remaining: ${metrics.remainingCount}`);
  console.log(`  Velocity: ${metrics.velocity.toFixed(2)} SDs/week`);
  console.log(`  Forecast: ${forecastDate?.toLocaleDateString() || 'N/A'} (${confidence})`);

  if (isDryRun) {
    console.log('\n[DRY RUN] Would store snapshot. No changes made.');
    return { success: true, dryRun: true, metrics };
  }

  const snapshot = {
    baseline_id: baseline.id,
    snapshot_date: new Date().toISOString().split('T')[0],
    total_sds_planned: metrics.totalSDs,
    total_sds_completed: metrics.completedCount,
    actual_velocity: metrics.velocity,
    burn_rate_ratio: metrics.velocity > 0 ? 1.0 : 0,
    forecasted_completion_date: forecastDate?.toISOString().split('T')[0] || null,
    confidence_level: confidence,
    notes: `Auto-snapshot by burn-rate-worker at ${metrics.completedPct}% completion`,
  };

  const { error } = await supabase
    .from('sd_burn_rate_snapshots')
    .upsert(snapshot, { onConflict: 'baseline_id,snapshot_date' });

  if (error) {
    console.error(`Error saving snapshot: ${error.message}`);
    return { success: false, reason: error.message };
  }

  console.log(`\nSnapshot saved for ${snapshot.snapshot_date}`);
  return { success: true, date: snapshot.snapshot_date, metrics };
}

/**
 * Show recent snapshot history.
 */
async function showHistory() {
  const { data: snapshots } = await supabase
    .from('sd_burn_rate_snapshots')
    .select('snapshot_date, total_sds_planned, total_sds_completed, actual_velocity, confidence_level, forecasted_completion_date')
    .order('snapshot_date', { ascending: false })
    .limit(14);

  if (!snapshots || snapshots.length === 0) {
    console.log('No snapshots found. Run without --history to create one.');
    return;
  }

  console.log('Burn Rate Snapshot History');
  console.log('='.repeat(80));
  console.log(
    '  Date'.padEnd(14) +
    'Planned'.padEnd(10) +
    'Done'.padEnd(8) +
    'Velocity'.padEnd(12) +
    'Confidence'.padEnd(12) +
    'Forecast'
  );
  console.log('-'.repeat(80));

  for (const s of snapshots) {
    console.log(
      `  ${s.snapshot_date}`.padEnd(14) +
      `${s.total_sds_planned}`.padEnd(10) +
      `${s.total_sds_completed}`.padEnd(8) +
      `${(s.actual_velocity || 0).toFixed(2)}/wk`.padEnd(12) +
      `${s.confidence_level || '-'}`.padEnd(12) +
      `${s.forecasted_completion_date || '-'}`
    );
  }
}

/**
 * Register burn rate worker as an EVA daily round.
 * @param {Object} scheduler - EvaMasterScheduler instance
 */
export function registerBurnRateRound(scheduler) {
  scheduler.registerRound('daily_burn_rate', {
    description: 'Take daily burn rate snapshot for velocity trending',
    cadence: 'daily',
    handler: async () => {
      const { baseline, items, sdMap } = await loadData();
      if (!baseline) return { skipped: true, reason: 'no_active_baseline' };

      const metrics = calculateMetrics(baseline, items, sdMap);

      let forecastDate = null;
      let confidence = 'low';
      if (metrics.velocity > 0) {
        const weeksRemaining = metrics.remainingCount / metrics.velocity;
        const daysRemaining = Math.ceil(weeksRemaining * 7);
        forecastDate = new Date();
        forecastDate.setDate(forecastDate.getDate() + daysRemaining);
        confidence = metrics.completedCount >= 5 ? 'high' :
                     metrics.completedCount >= 2 ? 'medium' : 'low';
      }

      const { error } = await supabase
        .from('sd_burn_rate_snapshots')
        .upsert({
          baseline_id: baseline.id,
          snapshot_date: new Date().toISOString().split('T')[0],
          total_sds_planned: metrics.totalSDs,
          total_sds_completed: metrics.completedCount,
          actual_velocity: metrics.velocity,
          burn_rate_ratio: metrics.velocity > 0 ? 1.0 : 0,
          forecasted_completion_date: forecastDate?.toISOString().split('T')[0] || null,
          confidence_level: confidence,
          notes: 'Auto-snapshot by EVA daily_burn_rate round',
        }, { onConflict: 'baseline_id,snapshot_date' });

      if (error) throw new Error(`Snapshot failed: ${error.message}`);

      return {
        date: new Date().toISOString().split('T')[0],
        velocity: metrics.velocity,
        completed: metrics.completedCount,
        total: metrics.totalSDs,
        confidence,
      };
    },
  });
}

// CLI dispatch
if (isHistory) {
  showHistory().catch(err => { console.error('Fatal:', err); process.exit(1); });
} else {
  takeSnapshot().catch(err => { console.error('Fatal:', err); process.exit(1); });
}

export { takeSnapshot, loadData, calculateMetrics };
