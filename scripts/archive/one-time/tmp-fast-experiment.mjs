#!/usr/bin/env node
/**
 * Fast Experiment Simulator
 *
 * Generates synthetic ventures, scores them via LLM rubric,
 * then simulates gate decisions deterministically (no stage analysis LLM calls).
 * Records outcomes to evaluation_profile_outcomes + stage_zero_requests
 * so calibration report can compute real FPR/FNR.
 */
import 'dotenv/config';
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.GOOGLE_AI_API_KEY = '';
process.env.LLM_PROVIDER = 'openai';

import { createClient } from '@supabase/supabase-js';
import { SyntheticVentureFactory } from '../lib/eva/pipeline-runner/synthetic-venture-factory.js';
import { generateForecast, calculateVentureScore, calculateStageWeightedScore } from '../lib/eva/stage-zero/modeling.js';
import { evaluateDecision } from '../lib/eva/decision-filter-engine.js';

const args = process.argv.slice(2);
const batchSize = parseInt(getArg('--batch-size', '50'), 10);
const seed = parseInt(getArg('--seed', String(Date.now())), 10);
const dryRun = args.includes('--dry-run');

function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}
function ts() { return new Date().toISOString().slice(11, 23); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const logger = {
  log: (...a) => console.log(`[${ts()}]`, ...a),
  info: (...a) => console.log(`[${ts()}]`, ...a),
  debug: () => {},
  warn: (...a) => console.warn(`[${ts()}] WARN`, ...a),
  error: (...a) => console.error(`[${ts()}] ERROR`, ...a),
};

process.on('unhandledRejection', (r) => { console.error(`[${ts()}] UNHANDLED:`, r); });
process.on('uncaughtException', (e) => { console.error(`[${ts()}] UNCAUGHT:`, e); process.exit(1); });

async function main() {
  const startTime = Date.now();
  console.log(`\n=== Fast Experiment Simulator ===`);
  console.log(`  Batch: ${batchSize} | Seed: ${seed} | Dry run: ${dryRun}`);
  console.log(`  Started: ${new Date().toISOString()}\n`);

  // Resolve requested_by FK
  const { data: ex } = await supabase.from('stage_zero_requests').select('requested_by').limit(1);
  const requestedBy = ex?.[0]?.requested_by;
  if (!requestedBy) { console.error('No requested_by found'); process.exit(1); }

  const factory = new SyntheticVentureFactory();
  const { ventures, metadata } = factory.createBatch(batchSize, { seed });
  console.log(`  Generated ${ventures.length} ventures (entropy: ${metadata.normalizedEntropy.toFixed(2)})`);
  console.log(`  Archetypes: ${JSON.stringify(metadata.archetypeDistribution)}\n`);

  if (dryRun) {
    for (const v of ventures) console.log(`    - ${v.name} (${v.archetype})`);
    return;
  }

  const results = { passed: 0, failed: 0, errored: 0, scores: [], details: [] };
  const KILL_GATES = [3, 5];

  for (let i = 0; i < ventures.length; i++) {
    const v = ventures[i];
    const t0 = Date.now();

    try {
      // 1. Insert venture
      const { data: inserted, error: insertErr } = await supabase.from('ventures').insert({
        name: v.name, description: v.description, problem_statement: v.problem_statement,
        target_market: v.target_market, origin_type: v.origin_type,
        current_lifecycle_stage: 1, status: 'active', archetype: v.archetype,
        metadata: { ...v.metadata, synthetic_metadata: v.synthetic_metadata, is_synthetic: true, batch_id: metadata.batchId },
      }).select('id').single();
      if (insertErr) { logger.error(`Insert failed: ${v.name} — ${insertErr.message}`); results.errored++; continue; }
      const ventureId = inserted.id;

      // 2. Score via LLM rubric (the only LLM call)
      const brief = {
        name: v.name, problem_statement: v.problem_statement, solution: v.description,
        target_market: v.target_market,
        metadata: { synthesis: { archetypes: { primary_archetype: v.archetype } } },
      };
      const forecast = await generateForecast(brief, { logger });
      const score = calculateVentureScore(forecast);
      const score10 = Math.round((score / 10) * 10) / 10;
      results.scores.push(score);

      // 3. Store score
      await supabase.from('stage_zero_requests').insert({
        venture_id: ventureId, requested_by: requestedBy, status: 'completed',
        result: { venture_score: score, rubric_scores: forecast.rubric_scores, forecast_summary: forecast.summary },
        completed_at: new Date().toISOString(),
      });

      // 4. Simulate gate decisions deterministically (no stage analysis needed)
      // Evaluate ALL gates independently (no break on first fail) to ensure
      // every stage gets sufficient sample size for calibration.
      let killed = false;
      const silentLogger = { log: () => {}, info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
      for (const gateStage of KILL_GATES) {
        // Compute stage-weighted score (Stage 5 emphasizes financial dimensions)
        const stageScore100 = forecast.rubric_scores
          ? calculateStageWeightedScore(forecast.rubric_scores, forecast.confidence || 30, gateStage)
          : score;
        const stageScore10 = Math.round((stageScore100 / 10) * 10) / 10;

        const stageInput = { stage: String(gateStage), score: stageScore10 };
        const filterResult = evaluateDecision(stageInput, { preferences: {}, logger: silentLogger });

        const signalType = filterResult.auto_proceed ? 'pass' : 'fail';
        const triggerTypes = filterResult.triggers.map(t => t.type);

        // Record to evaluation_profile_outcomes (same as recordGateSignal)
        await supabase.from('evaluation_profile_outcomes').insert({
          venture_id: ventureId,
          gate_boundary: `stage_${gateStage}`,
          signal_type: signalType,
          outcome: {
            score: stageScore10,
            default_score: score10,
            stage_weighted_score: stageScore100,
            auto_proceed: filterResult.auto_proceed,
            recommendation: filterResult.recommendation,
            triggers: triggerTypes,
            simulated: true,
            batch_id: metadata.batchId,
          },
          evaluated_at: new Date().toISOString(),
        });

        if (!filterResult.auto_proceed) {
          killed = true;
          // Continue evaluating remaining gates (don't break)
        }
      }

      if (killed) results.failed++;
      else results.passed++;

      const rubric = forecast.rubric_scores;
      const dims = rubric ? Object.entries(rubric).map(([k, v]) => `${k.slice(0, 3)}=${v?.score || v}`).join(',') : '';
      const elapsed = Date.now() - t0;
      const fate = killed ? 'KILLED' : 'PASSED';
      console.log(`[${ts()}] ${String(i + 1).padStart(3)}/${batchSize} ${fate.padEnd(6)} score=${score}/100 (${score10}/10) [${dims}] ${v.name.slice(0, 40)} (${elapsed}ms)`);

      results.details.push({ name: v.name, score, fate, ventureId });

    } catch (err) {
      logger.error(`FATAL ${v.name}: ${err.message}`);
      results.errored++;
    }
  }

  // Refresh telemetry view
  console.log(`\n[${ts()}] Refreshing materialized view...`);
  const { error: refreshErr } = await supabase.rpc('refresh_experiment_telemetry');
  console.log(`[${ts()}] View refresh: ${refreshErr?.message || 'OK'}`);

  const totalMs = Date.now() - startTime;
  console.log(`\n=== RESULTS ===`);
  console.log(`  Passed: ${results.passed} | Failed: ${results.failed} | Errored: ${results.errored}`);
  console.log(`  Scores: [${results.scores.join(', ')}]`);
  if (results.scores.length > 0) {
    const avg = results.scores.reduce((a, b) => a + b, 0) / results.scores.length;
    const min = Math.min(...results.scores);
    const max = Math.max(...results.scores);
    console.log(`  Score stats: min=${min} max=${max} avg=${avg.toFixed(1)} range=${max - min}`);
  }
  console.log(`  Pass rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  console.log(`  Total time: ${(totalMs / 1000).toFixed(1)}s (${(totalMs / 1000 / 60).toFixed(1)}m)`);
  console.log(`  Avg per venture: ${(totalMs / batchSize / 1000).toFixed(1)}s`);
  console.log(`  Finished: ${new Date().toISOString()}`);
}

main().catch(err => { console.error(`[${ts()}] FATAL:`, err); process.exit(1); });
