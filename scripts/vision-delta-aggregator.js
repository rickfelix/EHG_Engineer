#!/usr/bin/env node

/**
 * Vision Delta Aggregator
 *
 * Analyzes eva_vision_scores to compute per-dimension deltas between
 * first and corrected scores. Writes weak dimensions (mean delta > 20
 * across 3+ SDs) to issue_patterns with category='vision_delta'.
 *
 * Also detects regression cases (negative deltas) and logs warnings.
 *
 * Part of SD-LEO-INFRA-HEAL-VISION-DELTA-002
 *
 * Usage:
 *   node scripts/vision-delta-aggregator.js [--dry-run] [--verbose]
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DELTA_THRESHOLD = 20;
const MIN_SD_COUNT = 3;
const REGRESSION_THRESHOLD = -10;

/**
 * Fetch all vision scores ordered by sd_id and iteration
 */
async function fetchVisionScores() {
  const { data, error } = await supabase
    .from('eva_vision_scores')
    .select('id, sd_id, iteration, total_score, dimension_scores, threshold_action, scored_at')
    .order('sd_id')
    .order('iteration', { ascending: true });

  if (error) throw new Error(`Failed to fetch vision scores: ${error.message}`);
  return data || [];
}

/**
 * Group scores by sd_id and compute per-dimension deltas
 */
function computeDeltas(scores) {
  const grouped = {};
  for (const score of scores) {
    if (!grouped[score.sd_id]) grouped[score.sd_id] = [];
    grouped[score.sd_id].push(score);
  }

  const dimensionDeltas = {};
  const regressions = [];
  let sdsWithMultiple = 0;
  let sdsFirstPass = 0;

  for (const [sdId, sdScores] of Object.entries(grouped)) {
    if (sdScores.length < 2) {
      sdsFirstPass++;
      continue;
    }
    sdsWithMultiple++;

    const first = sdScores[0];
    const last = sdScores[sdScores.length - 1];

    if (!first.dimension_scores || !last.dimension_scores) continue;

    const allDimKeys = new Set([
      ...Object.keys(first.dimension_scores),
      ...Object.keys(last.dimension_scores)
    ]);

    for (const dimKey of allDimKeys) {
      const firstDim = first.dimension_scores[dimKey];
      const lastDim = last.dimension_scores[dimKey];
      if (!firstDim || !lastDim) continue;

      const firstScore = firstDim.score ?? 0;
      const lastScore = lastDim.score ?? 0;
      const delta = lastScore - firstScore;
      const dimName = lastDim.name || dimKey;

      if (!dimensionDeltas[dimKey]) dimensionDeltas[dimKey] = [];
      dimensionDeltas[dimKey].push({ sd_id: sdId, delta, first: firstScore, last: lastScore, name: dimName });

      if (delta <= REGRESSION_THRESHOLD) {
        regressions.push({ sd_id: sdId, dimension: dimKey, name: dimName, delta, first: firstScore, last: lastScore });
      }
    }
  }

  return { dimensionDeltas, regressions, sdsWithMultiple, sdsFirstPass };
}

/**
 * Identify weak dimensions: mean delta > threshold across enough SDs
 */
function identifyWeakDimensions(dimensionDeltas) {
  const weak = [];

  for (const [dimKey, deltas] of Object.entries(dimensionDeltas)) {
    const positiveDeltas = deltas.filter(d => d.delta > 0);
    if (positiveDeltas.length < MIN_SD_COUNT) continue;

    const meanDelta = positiveDeltas.reduce((sum, d) => sum + d.delta, 0) / positiveDeltas.length;
    if (meanDelta < DELTA_THRESHOLD) continue;

    weak.push({
      dimension_key: dimKey,
      dimension_name: positiveDeltas[0].name,
      mean_delta: Math.round(meanDelta * 10) / 10,
      max_delta: Math.max(...positiveDeltas.map(d => d.delta)),
      sd_count: positiveDeltas.length,
      affected_sds: positiveDeltas.map(d => d.sd_id)
    });
  }

  weak.sort((a, b) => b.mean_delta - a.mean_delta);
  return weak;
}

/**
 * Write weak dimensions to issue_patterns table
 */
async function writeToIssuePatterns(weakDimensions, dryRun = false) {
  if (weakDimensions.length === 0) {
    console.log('   No weak dimensions found above threshold.');
    return [];
  }

  const written = [];

  for (const dim of weakDimensions) {
    const { data: existing } = await supabase
      .from('issue_patterns')
      .select('pattern_id, occurrence_count, metadata')
      .eq('category', 'vision_delta')
      .like('issue_summary', `%${dim.dimension_name}%`)
      .limit(1);

    const patternData = {
      category: 'vision_delta',
      severity: dim.mean_delta >= 40 ? 'high' : 'medium',
      issue_summary: `Architecture gap: ${dim.dimension_name} (${dim.dimension_key}) — mean delta +${dim.mean_delta} across ${dim.sd_count} SDs`,
      occurrence_count: dim.sd_count,
      trend: 'stable',
      status: 'active',
      metadata: {
        dimension_key: dim.dimension_key,
        dimension_name: dim.dimension_name,
        mean_delta: dim.mean_delta,
        max_delta: dim.max_delta,
        sd_count: dim.sd_count,
        affected_sds: dim.affected_sds.slice(0, 10),
        aggregated_at: new Date().toISOString(),
        source: 'vision-delta-aggregator'
      }
    };

    if (dryRun) {
      console.log(`   [DRY-RUN] Would write: ${patternData.issue_summary}`);
      written.push(patternData);
      continue;
    }

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('issue_patterns')
        .update({
          occurrence_count: dim.sd_count,
          severity: patternData.severity,
          issue_summary: patternData.issue_summary,
          metadata: patternData.metadata
        })
        .eq('pattern_id', existing[0].pattern_id);

      if (error) {
        console.error(`   Failed to update ${existing[0].pattern_id}: ${error.message}`);
      } else {
        console.log(`   Updated: ${existing[0].pattern_id} — ${dim.dimension_name}`);
        written.push({ ...patternData, pattern_id: existing[0].pattern_id, action: 'updated' });
      }
    } else {
      const patternId = `PAT-VDELTA-${dim.dimension_key}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const { error } = await supabase
        .from('issue_patterns')
        .insert({ ...patternData, pattern_id: patternId });

      if (error) {
        console.error(`   Failed to insert ${patternId}: ${error.message}`);
      } else {
        console.log(`   Created: ${patternId} — ${dim.dimension_name}`);
        written.push({ ...patternData, pattern_id: patternId, action: 'created' });
      }
    }
  }

  return written;
}

/**
 * Fetch top N watch points for SD creation advisory
 * Called by leo-create-sd.js
 */
export async function getVisionWatchPoints(supabaseClient, limit = 3) {
  const { data, error } = await (supabaseClient || supabase)
    .from('issue_patterns')
    .select('pattern_id, issue_summary, severity, occurrence_count, metadata')
    .eq('category', 'vision_delta')
    .eq('status', 'active')
    .order('occurrence_count', { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) return [];

  return data.map(p => ({
    dimension: p.metadata?.dimension_name || 'unknown',
    key: p.metadata?.dimension_key || 'unknown',
    mean_delta: p.metadata?.mean_delta || 0,
    sd_count: p.occurrence_count,
    severity: p.severity
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  console.log('\n' + '═'.repeat(60));
  console.log('  VISION DELTA AGGREGATOR');
  console.log('═'.repeat(60));
  if (dryRun) console.log('  Mode: DRY-RUN (no database writes)\n');

  console.log('📊 Fetching vision scores...');
  const scores = await fetchVisionScores();
  console.log(`   Found ${scores.length} total scores`);

  console.log('\n📐 Computing dimension deltas...');
  const { dimensionDeltas, regressions, sdsWithMultiple, sdsFirstPass } = computeDeltas(scores);
  const total = sdsWithMultiple + sdsFirstPass;
  console.log(`   SDs with multiple iterations: ${sdsWithMultiple}`);
  console.log(`   SDs first-pass only: ${sdsFirstPass}`);
  console.log(`   First-pass rate: ${total > 0 ? Math.round(sdsFirstPass / total * 100) : 0}%`);

  console.log(`\n🔍 Identifying weak dimensions (delta > ${DELTA_THRESHOLD}, ${MIN_SD_COUNT}+ SDs)...`);
  const weakDimensions = identifyWeakDimensions(dimensionDeltas);

  if (weakDimensions.length > 0) {
    console.log(`   Found ${weakDimensions.length} weak dimension(s):\n`);
    console.log('   ' + '─'.repeat(56));
    console.log('   Dimension                    Mean Δ   Max Δ   SDs');
    console.log('   ' + '─'.repeat(56));
    for (const dim of weakDimensions) {
      const name = dim.dimension_name.padEnd(30).slice(0, 30);
      console.log(`   ${name}  +${String(dim.mean_delta).padStart(4)}   +${String(dim.max_delta).padStart(4)}   ${dim.sd_count}`);
    }
    console.log('   ' + '─'.repeat(56));
  } else {
    console.log('   No weak dimensions found above threshold.');
  }

  console.log('\n💾 Writing to issue_patterns...');
  const written = await writeToIssuePatterns(weakDimensions, dryRun);

  if (regressions.length > 0) {
    console.log(`\n⚠️  REGRESSION WARNINGS (${regressions.length} cases):`);
    console.log('   ' + '─'.repeat(56));
    for (const reg of regressions.slice(0, 10)) {
      console.log(`   ${reg.sd_id}: ${reg.name} (${reg.dimension}) ${reg.first} → ${reg.last} (${reg.delta})`);
    }
    if (regressions.length > 10) console.log(`   ... and ${regressions.length - 10} more`);
    console.log('   ' + '─'.repeat(56));
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  console.log(`   Total scores analyzed: ${scores.length}`);
  console.log(`   SDs needing correction: ${sdsWithMultiple} (${Math.round(sdsWithMultiple / Math.max(1, total) * 100)}%)`);
  console.log(`   Weak dimensions found: ${weakDimensions.length}`);
  console.log(`   Patterns written: ${written.length}`);
  console.log(`   Regressions detected: ${regressions.length}`);
  console.log('═'.repeat(60));

  if (verbose) {
    console.log('\n📋 DIMENSION DETAIL:');
    for (const [key, deltas] of Object.entries(dimensionDeltas)) {
      const posDeltas = deltas.filter(d => d.delta > 0);
      if (posDeltas.length === 0) continue;
      const mean = posDeltas.reduce((s, d) => s + d.delta, 0) / posDeltas.length;
      console.log(`   ${key} (${deltas[0]?.name}): mean=+${mean.toFixed(1)}, count=${posDeltas.length}`);
    }
  }

  const top3 = weakDimensions.slice(0, 3);
  if (top3.length > 0) {
    console.log('\n🎯 TOP 3 WATCH POINTS (for SD creation):');
    for (const dim of top3) {
      console.log(`   • ${dim.dimension_name}: +${dim.mean_delta} avg gap across ${dim.sd_count} SDs`);
    }
  }
}

// CLI entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
                     process.argv[1]?.endsWith('vision-delta-aggregator.js');

if (isMainModule) {
  main().catch(err => {
    console.error('Vision Delta Aggregator failed:', err.message);
    process.exit(1);
  });
}

export { fetchVisionScores, computeDeltas, identifyWeakDimensions, writeToIssuePatterns };
