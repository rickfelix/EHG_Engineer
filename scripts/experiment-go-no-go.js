#!/usr/bin/env node
/**
 * Experiment Go/No-Go Decision
 *
 * Reads calibration report and applies decision rules:
 * - Baseline accuracy > 0.7 → Stage 0 already good; experimentation value lower
 * - Baseline accuracy < 0.5 → Strong justification for Phases 2-3
 * - Near zero → Stage 0 needs fundamental redesign
 *
 * Usage:
 *   node scripts/experiment-go-no-go.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { generateCalibrationReport } from '../lib/eva/experiments/calibration-report.js';

const MIN_GATE_OUTCOMES = 10;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function computeAccuracy(fpr, fnr) {
  // Overall accuracy = 1 - average error rate
  return 1 - (fpr + fnr) / 2;
}

function decide(accuracy, fpr, fnr) {
  if (accuracy > 0.7) {
    return {
      decision: 'MONITOR',
      recommendation: 'Stage 0 scoring is already reasonably accurate. Experimentation value is lower — focus on incremental prompt tuning rather than full A/B infrastructure.',
      phase_2_3_priority: 'low',
    };
  }
  if (accuracy < 0.2) {
    return {
      decision: 'REDESIGN',
      recommendation: 'Stage 0 scoring has near-zero predictive accuracy. Fundamental redesign needed before experimentation adds value.',
      phase_2_3_priority: 'deferred',
    };
  }
  if (accuracy < 0.5) {
    return {
      decision: 'GO',
      recommendation: 'Stage 0 scoring accuracy is below 50% — strong justification for Phases 2-3 experimentation to improve evaluation quality.',
      phase_2_3_priority: 'high',
    };
  }
  // 0.5 - 0.7
  return {
    decision: 'GO_CONDITIONAL',
    recommendation: 'Stage 0 scoring is moderate. Phases 2-3 experimentation is justified to identify which dimensions drive accuracy.',
    phase_2_3_priority: 'medium',
  };
}

function decideBySurvival(survivalRate) {
  if (survivalRate > 0.95) {
    return {
      decision: 'GO',
      recommendation: 'Near-100% gate survival suggests gates may be too lenient. Experimentation needed to calibrate kill gate thresholds.',
      phase_2_3_priority: 'high',
    };
  }
  if (survivalRate < 0.3) {
    return {
      decision: 'GO',
      recommendation: 'Low gate survival (<30%) suggests Stage 0 scoring or gate thresholds need adjustment. Experimentation will identify which.',
      phase_2_3_priority: 'high',
    };
  }
  if (survivalRate >= 0.5 && survivalRate <= 0.8) {
    return {
      decision: 'MONITOR',
      recommendation: 'Gate survival rate is in a healthy range (50-80%). Gates appear to be filtering effectively. Experimentation is optional.',
      phase_2_3_priority: 'low',
    };
  }
  return {
    decision: 'GO_CONDITIONAL',
    recommendation: `Gate survival rate of ${(survivalRate * 100).toFixed(1)}% warrants investigation. Experimentation would clarify whether scores predict outcomes.`,
    phase_2_3_priority: 'medium',
  };
}

async function main() {
  console.log('\n=== Experiment Go/No-Go Decision ===\n');

  const report = await generateCalibrationReport({ supabase, logger: console });

  // Gate survival baseline is available even without FPR/FNR
  const gateSurvival = report.summary.gate_survival;
  if (gateSurvival) {
    console.log(`  Gate survival: ${gateSurvival.total} outcomes, ${(gateSurvival.overall_survival_rate * 100).toFixed(1)}% overall rate`);
    for (const [stage, data] of Object.entries(gateSurvival.by_stage)) {
      console.log(`    Stage ${stage}: ${data.passed}/${data.total} survived (${(data.survival_rate * 100).toFixed(1)}%)`);
    }
  }

  let accuracy, result;
  if (report.summary.insufficient_data) {
    // Use gate survival rate as proxy for decision when FPR/FNR unavailable
    if (!gateSurvival || gateSurvival.total < MIN_GATE_OUTCOMES) {
      console.log('\n  DECISION: INSUFFICIENT_DATA');
      console.log(`  Only ${gateSurvival?.total || 0} gate outcomes (need ${MIN_GATE_OUTCOMES}+).`);
      console.log('  Run batch-venture-pipeline.js first to generate gate signals.');
      process.exit(1);
    }
    // Interpret survival rate: 100% pass = gates too lenient, 0% = too strict
    const survRate = gateSurvival.overall_survival_rate;
    accuracy = null;
    result = decideBySurvival(survRate);
    console.log('\n  NOTE: FPR/FNR not available (no synthesis scores). Using gate survival rate.');
  } else {
    accuracy = computeAccuracy(report.summary.fpr, report.summary.fnr);
    result = decide(accuracy, report.summary.fpr, report.summary.fnr);
    console.log(`\n  FPR: ${report.summary.fpr} | FNR: ${report.summary.fnr}`);
    console.log(`  Computed accuracy: ${(accuracy * 100).toFixed(1)}%`);
  }
  console.log(`  Sample size: ${report.summary.sample_size} scored, ${report.summary.total_gate_outcomes} total`);
  console.log(`\n  DECISION: ${result.decision}`);
  console.log(`  ${result.recommendation}`);
  console.log(`  Phase 2-3 priority: ${result.phase_2_3_priority}`);

  // Persist decision to DB
  const decisionRecord = {
    decision_type: 'experiment_go_no_go',
    decision: result.decision,
    recommendation: result.recommendation,
    metrics: {
      fpr: report.summary.fpr,
      fnr: report.summary.fnr,
      accuracy,
      sample_size: report.summary.sample_size,
      total_gate_outcomes: report.summary.total_gate_outcomes,
      gate_survival_rate: gateSurvival?.overall_survival_rate ?? null,
      high_threshold: report.accuracy.high_threshold,
      low_threshold: report.accuracy.low_threshold,
      phase_2_3_priority: result.phase_2_3_priority,
      recommendations_count: report.recommendations.length,
    },
    calibration_report: report,
    decided_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('eva_architecture_decisions')
    .insert(decisionRecord)
    .select('id')
    .single();

  if (error) {
    console.warn(`\n  Warning: Could not persist decision to DB: ${error.message}`);
    console.log('  Decision JSON:');
    console.log(JSON.stringify(decisionRecord, null, 2));
  } else {
    console.log(`\n  Decision persisted: eva_architecture_decisions.id = ${data.id}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
