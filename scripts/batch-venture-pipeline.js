#!/usr/bin/env node
/**
 * Batch Venture Pipeline
 *
 * Generates synthetic ventures and processes them through Stage 3 kill gate
 * to produce gate signal data for calibration analysis.
 *
 * Usage:
 *   node scripts/batch-venture-pipeline.js --batch-size 35 [--dry-run] [--seed 12345]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { SyntheticVentureFactory } from '../lib/eva/pipeline-runner/synthetic-venture-factory.js';
import { generateForecast, calculateVentureScore } from '../lib/eva/stage-zero/modeling.js';
import { run as runOrchestrator } from '../lib/eva/eva-orchestrator.js';

const args = process.argv.slice(2);
const batchSize = parseInt(getArg('--batch-size', '35'), 10);
const dryRun = args.includes('--dry-run');
const seed = parseInt(getArg('--seed', String(Date.now())), 10);

function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const logger = {
  log: (...a) => console.log(...a),
  info: (...a) => console.log(...a),
  debug: (...a) => {},
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

async function main() {
  console.log('\n=== Batch Venture Pipeline ===');
  console.log(`  Batch size: ${batchSize} | Seed: ${seed} | Dry run: ${dryRun}\n`);

  // Step 1: Generate synthetic ventures
  const factory = new SyntheticVentureFactory();
  const { ventures, metadata } = factory.createBatch(batchSize, { seed });

  console.log(`  Generated ${ventures.length} ventures (entropy: ${metadata.normalizedEntropy.toFixed(2)})`);
  console.log(`  Archetypes: ${JSON.stringify(metadata.archetypeDistribution)}\n`);

  if (dryRun) {
    console.log('  [DRY RUN] Would insert and process these ventures:');
    for (const v of ventures) {
      console.log(`    - ${v.name} (${v.archetype})`);
    }
    return;
  }

  // Step 2: Insert and process each venture
  const results = { passed: 0, failed: 0, errored: 0, ventureIds: [] };

  for (let i = 0; i < ventures.length; i++) {
    const v = ventures[i];
    if ((i + 1) % 5 === 0 || i === 0) {
      console.log(`  Processing venture ${i + 1}/${ventures.length}...`);
    }

    try {
      // Insert venture
      const payload = {
        name: v.name,
        description: v.description,
        problem_statement: v.problem_statement,
        target_market: v.target_market,
        origin_type: v.origin_type,
        current_lifecycle_stage: 1,
        status: 'active',
        archetype: v.archetype,
        metadata: {
          ...v.metadata,
          synthetic_metadata: v.synthetic_metadata,
          is_synthetic: true,
          batch_id: metadata.batchId,
        },
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('ventures')
        .insert(payload)
        .select('id')
        .single();

      if (insertErr) {
        console.error(`    ERROR inserting ${v.name}: ${insertErr.message}`);
        results.errored++;
        continue;
      }

      const ventureId = inserted.id;
      results.ventureIds.push(ventureId);

      // Set autonomy level to L2 (Supervised) so gates auto-approve for batch processing
      const { error: autoErr } = await supabase
        .from('eva_ventures')
        .upsert({ venture_id: ventureId, name: v.name, autonomy_level: 'L2', status: 'active' }, { onConflict: 'venture_id' });
      if (autoErr) logger.warn(`    Autonomy setup failed: ${autoErr.message}`);

      // Stage 0 scoring: generate forecast → venture_score for calibration predictor
      let ventureScore = null;
      try {
        const brief = {
          name: v.name,
          problem_statement: v.problem_statement,
          solution: v.description,
          target_market: v.target_market,
          metadata: { synthesis: { archetypes: { primary_archetype: v.archetype } } },
        };
        const forecast = await generateForecast(brief, { logger });
        ventureScore = calculateVentureScore(forecast);
        logger.log(`    Stage 0 score: ${ventureScore}/100`);

        // Store in stage_zero_requests so materialized view picks it up
        await supabase.from('stage_zero_requests').insert({
          venture_id: ventureId,
          status: 'completed',
          result: { venture_score: ventureScore, forecast_summary: forecast.summary },
          completed_at: new Date().toISOString(),
        });
      } catch (scoreErr) {
        logger.warn(`    Stage 0 scoring failed (non-fatal): ${scoreErr.message}`);
      }

      // Process through stages 1→2→3 (kill gate) via orchestrator
      try {
        const orchResult = await runOrchestrator(
          { ventureId, options: { autoProceed: true, maxStages: 4, skipChairmanReview: true } },
          { supabase, logger },
        );

        if (orchResult.status === 'failed' || orchResult.status === 'blocked') {
          results.failed++;
          console.log(`    ${v.name}: ${orchResult.status} (stage ${orchResult.stageId || '?'})`);
        } else {
          results.passed++;
        }
      } catch (orchErr) {
        console.error(`    ERROR processing ${v.name}: ${orchErr.message}`);
        results.errored++;
      }
    } catch (err) {
      console.error(`    FATAL for ${v.name}: ${err.message}`);
      results.errored++;
    }
  }

  // Step 3: Refresh telemetry materialized view
  console.log('\n  Refreshing telemetry materialized view...');
  try {
    const { error: refreshErr } = await supabase.rpc('refresh_experiment_telemetry');
    if (refreshErr) throw new Error(refreshErr.message);
    console.log('  Materialized view refreshed.');
  } catch (e) {
    logger.warn(`  View refresh failed: ${e.message}. Run: node scripts/tmp-refresh-telemetry.cjs`);
  }

  // Step 4: Check results
  const { data: signalCount } = await supabase
    .from('evaluation_profile_outcomes')
    .select('id', { count: 'exact', head: true })
    .eq('gate_boundary', 'stage_3');

  console.log('\n=== Results ===');
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Errored: ${results.errored}`);
  console.log(`  Gate signals (stage_3): ${signalCount?.length ?? 'unknown'}`);
  console.log(`  Venture IDs: ${results.ventureIds.length} created`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
