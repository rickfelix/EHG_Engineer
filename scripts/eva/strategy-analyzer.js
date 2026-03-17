#!/usr/bin/env node
/**
 * Strategy Pattern Analyzer
 * SD: SD-LEO-FEAT-ADAPTIVE-DISCOVERY-STRATEGY-001
 *
 * Computes per-strategy performance patterns from gate outcomes.
 * Shows pass rates, average scores, and per-rubric-dimension averages.
 *
 * Usage:
 *   node scripts/eva/strategy-analyzer.js           # Human-readable output
 *   node scripts/eva/strategy-analyzer.js --json     # Machine-readable JSON
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import 'dotenv/config';
import { checkEvolutionThreshold } from '../../lib/eva/stage-zero/strategy-loader.js';

const supabase = createSupabaseServiceClient();

const JSON_MODE = process.argv.includes('--json');

/**
 * Analyze per-strategy performance from gate outcomes.
 */
async function analyzeStrategyPatterns() {
  // Get ventures with discovery strategy metadata
  const { data: ventures, error: vErr } = await supabase
    .from('ventures')
    .select('id, name, status, metadata')
    .not('metadata->stage_zero->origin_metadata->discovery_strategy', 'is', null)
    .neq('status', 'deleted');

  if (vErr) {
    console.error('Error fetching ventures:', vErr.message);
    process.exit(1);
  }

  if (!ventures || ventures.length === 0) {
    const result = { strategies: [], totalVentures: 0, evolutionReady: false };
    if (JSON_MODE) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('No ventures with discovery strategy metadata found.');
    }
    return result;
  }

  // Group ventures by strategy
  const byStrategy = {};
  for (const v of ventures) {
    const strategy = v.metadata?.stage_zero?.origin_metadata?.discovery_strategy;
    if (!strategy) continue;
    if (!byStrategy[strategy]) byStrategy[strategy] = [];
    byStrategy[strategy].push(v);
  }

  // Get gate outcomes for these ventures
  const ventureIds = ventures.map(v => v.id);
  const { data: outcomes, error: oErr } = await supabase
    .from('evaluation_profile_outcomes')
    .select('venture_id, signal_type, outcome')
    .in('venture_id', ventureIds);

  if (oErr) {
    console.error('Error fetching outcomes:', oErr.message);
    process.exit(1);
  }

  // Build outcome map
  const outcomesByVenture = {};
  for (const o of (outcomes || [])) {
    if (!outcomesByVenture[o.venture_id]) outcomesByVenture[o.venture_id] = [];
    outcomesByVenture[o.venture_id].push(o);
  }

  // Compute per-strategy metrics
  const strategyReports = [];
  const rubricDimensions = [
    'market_opportunity', 'revenue_viability', 'unit_economics',
    'execution_feasibility', 'competitive_defensibility'
  ];

  for (const [strategy, strategyVentures] of Object.entries(byStrategy)) {
    let totalOutcomes = 0;
    let passCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    const dimensionSums = {};
    const dimensionCounts = {};

    for (const dim of rubricDimensions) {
      dimensionSums[dim] = 0;
      dimensionCounts[dim] = 0;
    }

    for (const v of strategyVentures) {
      const vOutcomes = outcomesByVenture[v.id] || [];
      totalOutcomes += vOutcomes.length;

      for (const o of vOutcomes) {
        if (o.signal_type === 'pass') passCount++;
        const score = o.outcome?.score;
        if (score != null) {
          scoreSum += Number(score);
          scoreCount++;
        }
      }

      // Extract rubric scores from venture metadata
      const rubricScores = v.metadata?.stage_zero?.rubric_scores;
      if (rubricScores) {
        for (const dim of rubricDimensions) {
          const val = rubricScores[dim];
          if (val != null) {
            dimensionSums[dim] += Number(val);
            dimensionCounts[dim]++;
          }
        }
      }
    }

    const report = {
      strategy,
      ventureCount: strategyVentures.length,
      totalOutcomes,
      passRate: totalOutcomes > 0 ? Math.round((passCount / totalOutcomes) * 1000) / 1000 : null,
      avgScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null,
      dimensions: {},
    };

    for (const dim of rubricDimensions) {
      report.dimensions[dim] = dimensionCounts[dim] > 0
        ? Math.round((dimensionSums[dim] / dimensionCounts[dim]) * 100) / 100
        : null;
    }

    strategyReports.push(report);
  }

  // Sort by pass rate descending
  strategyReports.sort((a, b) => (b.passRate || 0) - (a.passRate || 0));

  // Check evolution threshold
  const threshold = await checkEvolutionThreshold(supabase);

  const result = {
    strategies: strategyReports,
    totalVentures: ventures.length,
    evolutionReady: threshold.ready,
    evolutionThreshold: 20,
    analyzedAt: new Date().toISOString(),
  };

  if (JSON_MODE) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }

  return result;
}

function printReport(result) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DISCOVERY STRATEGY PERFORMANCE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Total ventures: ${result.totalVentures}`);
  console.log(`  Evolution ready: ${result.evolutionReady ? 'YES' : 'NO'} (threshold: ${result.evolutionThreshold})`);

  if (!result.evolutionReady) {
    console.log(`  ⚠️  Insufficient data for strategy evolution (need ${result.evolutionThreshold - result.totalVentures} more ventures)`);
  }

  console.log('');

  for (const s of result.strategies) {
    console.log(`  Strategy: ${s.strategy}`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(`    Ventures:    ${s.ventureCount}`);
    console.log(`    Outcomes:    ${s.totalOutcomes}`);
    console.log(`    Pass rate:   ${s.passRate != null ? (s.passRate * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`    Avg score:   ${s.avgScore != null ? s.avgScore : 'N/A'}`);

    const dims = Object.entries(s.dimensions).filter(([, v]) => v != null);
    if (dims.length > 0) {
      console.log('    Rubric dimensions:');
      for (const [dim, val] of dims) {
        const bar = '█'.repeat(Math.round(val / 10)) + '░'.repeat(10 - Math.round(val / 10));
        console.log(`      ${dim.padEnd(28)} ${bar} ${val}`);
      }
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Analyzed: ${result.analyzedAt}`);
  console.log('═══════════════════════════════════════════════════════');
}

analyzeStrategyPatterns().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
