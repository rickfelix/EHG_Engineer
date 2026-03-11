#!/usr/bin/env node
/**
 * Experiment Baseline - Stage Zero Experimentation Framework
 *
 * SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-A (Phase 1)
 *
 * 1. Backfills actual_death_stage in stage_of_death_predictions from venture data
 * 2. Calls calibratePredictions() to compute accuracy metrics
 * 3. Refreshes stage_zero_experiment_telemetry materialized view
 * 4. Outputs go/no-go accuracy report as JSON
 *
 * Usage: node scripts/experiment-baseline.js [--threshold=0.6] [--dry-run]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { calibratePredictions } from '../lib/eva/stage-zero/stage-of-death-predictor.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const thresholdArg = args.find(a => a.startsWith('--threshold='));
const GO_THRESHOLD = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : 0.6;

async function backfillActualDeathStage() {
  console.log('Phase 1: Backfilling actual_death_stage...');

  // Find ventures that were killed (have a kill gate failure recorded)
  const { data: killedVentures, error: kvErr } = await supabase
    .from('evaluation_profile_outcomes')
    .select('venture_id, gate_boundary')
    .eq('signal_type', 'fail')
    .order('evaluated_at', { ascending: true });

  if (kvErr) {
    console.error('  Error fetching kill signals:', kvErr.message);
    return { backfilled: 0, errors: [kvErr.message] };
  }

  if (!killedVentures?.length) {
    console.log('  No kill signals found — nothing to backfill');
    return { backfilled: 0, errors: [] };
  }

  // Extract stage number from gate_boundary (e.g., "stage_3" → 3)
  const ventureDeathStages = new Map();
  for (const kv of killedVentures) {
    const match = kv.gate_boundary.match(/stage_(\d+)/);
    if (match) {
      // First failure is the actual death stage
      if (!ventureDeathStages.has(kv.venture_id)) {
        ventureDeathStages.set(kv.venture_id, parseInt(match[1], 10));
      }
    }
  }

  console.log(`  Found ${ventureDeathStages.size} ventures with kill gate failures`);

  let backfilled = 0;
  const errors = [];

  for (const [ventureId, deathStage] of ventureDeathStages) {
    if (dryRun) {
      console.log(`  [DRY RUN] Would set actual_death_stage=${deathStage} for venture ${ventureId.slice(0, 8)}`);
      backfilled++;
      continue;
    }

    const { error } = await supabase
      .from('stage_of_death_predictions')
      .update({ actual_death_stage: deathStage })
      .eq('venture_id', ventureId);

    if (error) {
      errors.push({ venture_id: ventureId, error: error.message });
    } else {
      backfilled++;
    }
  }

  console.log(`  Backfilled: ${backfilled}, Errors: ${errors.length}`);
  return { backfilled, errors };
}

async function runCalibration() {
  console.log('\nPhase 2: Running calibration...');

  // Fetch predictions that have actual_death_stage set
  const { data: predictions, error } = await supabase
    .from('stage_of_death_predictions')
    .select('venture_id, predicted_death_stage, actual_death_stage, archetype_key')
    .not('actual_death_stage', 'is', null);

  if (error) {
    console.error('  Error fetching predictions:', error.message);
    return null;
  }

  if (!predictions?.length) {
    console.log('  No predictions with actual outcomes — insufficient data for calibration');
    return calibratePredictions([]);
  }

  // Map to calibratePredictions format
  const calibrationInput = predictions.map(p => ({
    venture_id: p.venture_id,
    predicted_stage: p.predicted_death_stage,
    actual_stage: p.actual_death_stage,
    actual_outcome: 'killed',
    archetype: p.archetype_key,
  }));

  console.log(`  Calibrating with ${calibrationInput.length} predictions`);
  return calibratePredictions(calibrationInput);
}

async function refreshMaterializedView() {
  console.log('\nPhase 3: Refreshing materialized view...');

  if (dryRun) {
    console.log('  [DRY RUN] Would refresh stage_zero_experiment_telemetry');
    return true;
  }

  const { error } = await supabase.rpc('refresh_stage_zero_telemetry');

  if (error) {
    // Fallback: try direct SQL if RPC doesn't exist
    console.warn(`  RPC refresh failed (${error.message}), view may need manual refresh`);
    return false;
  }

  console.log('  Materialized view refreshed');
  return true;
}

function buildReport(backfillResult, calibration, viewRefreshed) {
  const sampleSize = calibration?.total_predictions || 0;
  const accuracyScore = calibration?.accuracy_score || 0;

  // Simple confidence interval based on sample size
  const confidenceInterval = sampleSize > 0
    ? Math.round((1.96 * Math.sqrt(accuracyScore * (1 - accuracyScore) / sampleSize)) * 1000) / 1000
    : 0;

  const recommendation = sampleSize === 0
    ? 'INSUFFICIENT_DATA'
    : accuracyScore >= GO_THRESHOLD ? 'GO' : 'NO_GO';

  return {
    timestamp: new Date().toISOString(),
    phase: 'Phase 1: Telemetry & Baseline',
    sd: 'SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-A',
    backfill: {
      ventures_backfilled: backfillResult.backfilled,
      errors: backfillResult.errors.length,
    },
    calibration: {
      accuracy_score: accuracyScore,
      mean_absolute_error: calibration?.mean_absolute_error || 0,
      directional_accuracy: calibration?.directional_accuracy || 0,
      sample_size: sampleSize,
      confidence_interval: confidenceInterval,
      per_archetype: calibration?.per_archetype || {},
    },
    materialized_view_refreshed: viewRefreshed,
    decision: {
      recommendation,
      threshold: GO_THRESHOLD,
      rationale: recommendation === 'INSUFFICIENT_DATA'
        ? 'No predictions with actual outcomes available. Collect more data before Phase 2.'
        : recommendation === 'GO'
          ? `Accuracy score (${accuracyScore}) meets threshold (${GO_THRESHOLD}). Proceed to Phase 2 prompt A/B testing.`
          : `Accuracy score (${accuracyScore}) below threshold (${GO_THRESHOLD}). Additional data collection recommended.`,
    },
    dry_run: dryRun,
  };
}

async function main() {
  console.log('=== Stage Zero Experiment Baseline ===');
  console.log(`Threshold: ${GO_THRESHOLD} | Dry Run: ${dryRun}\n`);

  const backfillResult = await backfillActualDeathStage();
  const calibration = await runCalibration();
  const viewRefreshed = await refreshMaterializedView();
  const report = buildReport(backfillResult, calibration, viewRefreshed);

  console.log('\n=== Go/No-Go Report ===');
  console.log(JSON.stringify(report, null, 2));

  return report;
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
