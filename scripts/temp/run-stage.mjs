#!/usr/bin/env node
/**
 * Execute a single EVA stage for a venture.
 * Usage: node scripts/temp/run-stage.mjs <stageNumber>
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { executeStage } from '../../lib/eva/stage-execution-engine.js';

const VENTURE_ID = 'd2195c98-b584-428b-9acc-e86dea125fa9';
const stageNumber = parseInt(process.argv[2], 10);

if (!stageNumber || stageNumber < 1 || stageNumber > 25) {
  console.error('Usage: node scripts/temp/run-stage.mjs <stageNumber 1-25>');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Advance venture to this stage
  const { error: advErr } = await supabase.from('ventures')
    .update({ current_lifecycle_stage: stageNumber })
    .eq('id', VENTURE_ID);
  if (advErr) throw new Error(`Failed to advance venture: ${advErr.message}`);

  console.log(`\n=== Executing Stage ${stageNumber} ===`);
  const result = await executeStage({
    stageNumber,
    ventureId: VENTURE_ID,
    dryRun: false,
    supabase,
  });

  const output = result.output || {};
  const SKIP_KEYS = ['sourceProvenance', 'fourBuckets'];
  const keys = Object.keys(output).filter(k => !SKIP_KEYS.includes(k));

  console.log(`Stage ${stageNumber}: SUCCESS`);
  console.log(`  Output keys: ${keys.join(', ')}`);
  if (output.decision) console.log(`  Decision: ${output.decision}`);
  if (output.overallScore !== undefined) console.log(`  Overall Score: ${output.overallScore}`);
  if (output.aggregate_risk_score !== undefined) console.log(`  Aggregate Risk Score: ${output.aggregate_risk_score}`);
  if (output.readiness_pct !== undefined) console.log(`  Readiness %: ${output.readiness_pct}`);
  if (output.runway_months !== undefined) console.log(`  Runway Months: ${output.runway_months}`);
  if (output.total_story_points !== undefined) console.log(`  Story Points: ${output.total_story_points}`);
  if (output.portfolio_score !== undefined) console.log(`  Portfolio Score: ${output.portfolio_score}`);
  if (output.promotion_gate) console.log(`  Promotion Gate Pass: ${output.promotion_gate.pass}`);
  if (output.reality_gate) console.log(`  Reality Gate Pass: ${output.reality_gate.pass}`);

  return result;
}

run().catch(err => {
  console.error(`\nStage ${stageNumber} FAILED:`, err.message);
  if (err.stack) console.error(err.stack.substring(0, 500));
  process.exit(1);
});
