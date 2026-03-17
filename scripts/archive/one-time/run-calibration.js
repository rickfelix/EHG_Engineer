#!/usr/bin/env node
/**
 * Calibration Report CLI
 *
 * Generates a baseline calibration report from gate signal telemetry data.
 *
 * Usage:
 *   node scripts/run-calibration.js [--high-threshold 80] [--low-threshold 50]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { generateCalibrationReport } from '../lib/eva/experiments/calibration-report.js';

const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const highThreshold = parseInt(getArg('--high-threshold', '35'), 10);
const lowThreshold = parseInt(getArg('--low-threshold', '20'), 10);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  console.log('\n=== Calibration Report ===');
  console.log(`  High threshold: ${highThreshold} | Low threshold: ${lowThreshold}\n`);

  const report = await generateCalibrationReport(
    { supabase, logger: console },
    { highThreshold, lowThreshold },
  );

  console.log(JSON.stringify(report, null, 2));

  // Gate survival baseline (available even without synthesis scores)
  if (report.summary.gate_survival) {
    const gs = report.summary.gate_survival;
    console.log('\n  --- Gate Survival Baseline ---');
    console.log(`  Total gate outcomes: ${gs.total}`);
    console.log(`  Overall survival rate: ${(gs.overall_survival_rate * 100).toFixed(1)}%`);
    for (const [stage, data] of Object.entries(gs.by_stage)) {
      console.log(`    Stage ${stage}: ${data.passed}/${data.total} (${(data.survival_rate * 100).toFixed(1)}%)`);
    }
  }

  // Threshold-level analysis
  if (report.threshold_analysis && !report.threshold_analysis.insufficient_data) {
    const ta = report.threshold_analysis;
    console.log('\n  --- Threshold Analysis ---');
    console.log(`  Evaluated: ${ta.evaluated_count} | Rubber-stamped: ${ta.rubber_stamp_count} | Total: ${ta.total_count}`);
    for (const [id, freq] of Object.entries(ta.frequency)) {
      console.log(`    ${id}: fires ${freq.fire_count}/${freq.total} (${(freq.fire_rate * 100).toFixed(0)}%) | severity: ${JSON.stringify(freq.severity_counts)}`);
    }
    if (Object.keys(ta.by_stage).length > 0) {
      console.log('  By stage:');
      for (const [stage, data] of Object.entries(ta.by_stage)) {
        const thresholdSummary = Object.entries(data.thresholds)
          .map(([id, t]) => `${id}:${t.fire_count}/${t.total}`)
          .join(', ');
        console.log(`    ${stage} (${data.total_ventures} ventures): ${thresholdSummary}`);
      }
    }
  }

  if (report.summary.insufficient_data) {
    console.log(`\n  NOTE: Insufficient scored data for FPR/FNR (${report.accuracy.sample_size} scored / ${report.summary.total_gate_outcomes} total, need 30+ scored)`);
    console.log('  Gate survival data IS available — run go-no-go with survival rates.');
    process.exit(report.summary.total_gate_outcomes >= 30 ? 0 : 1);
  }

  console.log(`\n  FPR: ${report.summary.fpr} | FNR: ${report.summary.fnr} | Scored Samples: ${report.summary.sample_size}`);
  console.log(`  Recommendations: ${report.recommendations.length}`);
  for (const rec of report.recommendations) {
    console.log(`    [${rec.priority}] ${rec.type}: ${rec.target || ''} — ${rec.reason}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
