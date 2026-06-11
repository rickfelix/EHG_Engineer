#!/usr/bin/env node

/**
 * Vision Score Baseline Analyzer
 * SD: SD-CONTEXTAWARE-VISION-SCORING-DYNAMIC-ORCH-001-B
 *
 * Queries vision_scoring_audit_log to analyze Phase 1 dynamic threshold
 * effectiveness. Produces a statistical report with recommendations.
 *
 * Usage:
 *   node scripts/eva/vision-baseline-analyzer.js
 *   node scripts/eva/vision-baseline-analyzer.js --json
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

const MIN_SAMPLE_SIZE = 10;

/**
 * Query and analyze vision scoring audit data.
 * @param {Object} supabase
 * @returns {Promise<Object>} Analysis report
 */
export async function analyzeBaseline(supabase) {
  const { data: rows, error } = await supabase
    .from('vision_scoring_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) throw new Error(`Failed to query audit log: ${error.message}`);

  const total = rows?.length || 0;

  if (total === 0) {
    return {
      status: 'empty',
      total_evaluations: 0,
      warning: 'No audit data found. Run vision scoring gates to populate.',
      recommendation: 'Collect at least 10 evaluations before drawing conclusions.',
    };
  }

  // Verdict distribution
  const verdictCounts = {};
  for (const row of rows) {
    verdictCounts[row.verdict] = (verdictCounts[row.verdict] || 0) + 1;
  }

  // Threshold adjustment stats
  const adjustedRows = rows.filter(r => r.adjusted_threshold !== r.base_threshold);
  const adjustmentRatio = adjustedRows.length / total;

  // Floor rule triggers
  const floorTriggers = rows.filter(r => r.floor_rule_triggered);
  const floorRate = floorTriggers.length / total;

  // SD type breakdown
  const sdTypeCounts = {};
  for (const row of rows) {
    sdTypeCounts[row.sd_type] = (sdTypeCounts[row.sd_type] || 0) + 1;
  }

  // Addressable dimension stats
  const dimRatios = rows
    .filter(r => r.total_dims > 0)
    .map(r => r.addressable_count / r.total_dims);
  const avgDimRatio = dimRatios.length > 0
    ? dimRatios.reduce((a, b) => a + b, 0) / dimRatios.length
    : 0;

  // Pass rate for adjusted vs non-adjusted
  const adjustedPassRate = adjustedRows.length > 0
    ? adjustedRows.filter(r => r.verdict === 'pass' || r.verdict === 'pass_override').length / adjustedRows.length
    : null;
  const nonAdjustedRows = rows.filter(r => r.adjusted_threshold === r.base_threshold);
  const nonAdjustedPassRate = nonAdjustedRows.length > 0
    ? nonAdjustedRows.filter(r => r.verdict === 'pass' || r.verdict === 'pass_override').length / nonAdjustedRows.length
    : null;

  // Phase 3 recommendation
  let recommendation;
  if (total < MIN_SAMPLE_SIZE) {
    recommendation = 'INSUFFICIENT_DATA: Collect more evaluations before deciding on Phase 3.';
  } else if (floorRate > 0.2) {
    recommendation = 'CONSIDER_NA_EXCLUSION: High floor rule trigger rate suggests many SDs have too few addressable dimensions. N/A exclusion model may be more appropriate.';
  } else if (adjustmentRatio > 0.5 && adjustedPassRate !== null && adjustedPassRate > 0.8) {
    recommendation = 'DYNAMIC_THRESHOLD_EFFECTIVE: Adjustment is widely used and passing. Current approach is working. Consider dimension metadata enrichment for finer granularity.';
  } else {
    recommendation = 'CONTINUE_MONITORING: Current data does not strongly indicate a need for Phase 3 changes. Continue collecting data.';
  }

  return {
    status: 'complete',
    total_evaluations: total,
    sample_sufficient: total >= MIN_SAMPLE_SIZE,
    verdict_distribution: verdictCounts,
    threshold_adjustment: {
      adjusted_count: adjustedRows.length,
      non_adjusted_count: nonAdjustedRows.length,
      adjustment_ratio: Math.round(adjustmentRatio * 100) / 100,
      adjusted_pass_rate: adjustedPassRate !== null ? Math.round(adjustedPassRate * 100) / 100 : null,
      non_adjusted_pass_rate: nonAdjustedPassRate !== null ? Math.round(nonAdjustedPassRate * 100) / 100 : null,
    },
    floor_rule: {
      trigger_count: floorTriggers.length,
      trigger_rate: Math.round(floorRate * 100) / 100,
    },
    dimension_coverage: {
      avg_addressable_ratio: Math.round(avgDimRatio * 100) / 100,
    },
    sd_type_breakdown: sdTypeCounts,
    recommendation,
  };
}

// CLI entry point
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('vision-baseline-analyzer.js')) {
  const jsonMode = process.argv.includes('--json');

  (async () => {
    try {
      const supabase = createSupabaseServiceClient();
      const report = await analyzeBaseline(supabase);

      if (jsonMode) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log('\n=== Vision Score Baseline Analysis ===\n');
        console.log(`Total evaluations: ${report.total_evaluations}`);
        if (report.status === 'empty') {
          console.log(`Warning: ${report.warning}`);
        } else {
          console.log(`Sample sufficient: ${report.sample_sufficient ? 'Yes' : 'No (need ' + MIN_SAMPLE_SIZE + ')'}`);
          console.log('\nVerdict Distribution:');
          for (const [v, c] of Object.entries(report.verdict_distribution)) {
            console.log(`  ${v}: ${c} (${Math.round(c / report.total_evaluations * 100)}%)`);
          }
          console.log('\nThreshold Adjustment:');
          console.log(`  Adjusted: ${report.threshold_adjustment.adjusted_count} (${report.threshold_adjustment.adjustment_ratio * 100}%)`);
          console.log(`  Adjusted pass rate: ${report.threshold_adjustment.adjusted_pass_rate !== null ? (report.threshold_adjustment.adjusted_pass_rate * 100) + '%' : 'N/A'}`);
          console.log(`  Non-adjusted pass rate: ${report.threshold_adjustment.non_adjusted_pass_rate !== null ? (report.threshold_adjustment.non_adjusted_pass_rate * 100) + '%' : 'N/A'}`);
          console.log('\nFloor Rule:');
          console.log(`  Triggers: ${report.floor_rule.trigger_count} (${report.floor_rule.trigger_rate * 100}%)`);
          console.log(`\nAvg addressable dim ratio: ${report.dimension_coverage.avg_addressable_ratio}`);
          console.log(`\nSD Type Breakdown: ${JSON.stringify(report.sd_type_breakdown)}`);
          console.log(`\nRecommendation: ${report.recommendation}`);
        }
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  })();
}
