#!/usr/bin/env node
/**
 * Management Review Generator
 * Aggregates data from existing tables into a structured review artifact
 * stored in management_reviews table.
 *
 * Usage: node scripts/pipeline/management-review-generator.js [--dry-run]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const STALE_THRESHOLD_HOURS = 24;
const isDryRun = process.argv.includes('--dry-run');
const isHistory = process.argv.includes('--history');

async function checkFreshness(tableName, timestampCol = 'updated_at') {
  const { data } = await supabase
    .from(tableName)
    .select(timestampCol)
    .order(timestampCol, { ascending: false })
    .limit(1)
    .single();

  if (!data) return { table: tableName, fresh: false, reason: 'no_data' };

  const lastUpdate = new Date(data[timestampCol]);
  const ageHours = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
  return {
    table: tableName,
    fresh: ageHours <= STALE_THRESHOLD_HOURS,
    ageHours: Math.round(ageHours * 10) / 10,
    lastUpdate: lastUpdate.toISOString(),
  };
}

async function gatherBaselineData() {
  const { data: baseline } = await supabase
    .from('sd_execution_baselines')
    .select('id, baseline_name, is_active, version, created_by, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!baseline) return { active: false };

  const { data: items } = await supabase
    .from('sd_baseline_items')
    .select('sd_id, sequence_rank, track, is_ready')
    .eq('baseline_id', baseline.id);

  const readyCount = (items || []).filter(i => i.is_ready).length;
  const trackCounts = {};
  for (const item of items || []) {
    trackCounts[item.track || 'unknown'] = (trackCounts[item.track || 'unknown'] || 0) + 1;
  }

  return {
    active: true,
    id: baseline.id,
    name: baseline.baseline_name,
    version: baseline.version || 1,
    totalItems: (items || []).length,
    readyItems: readyCount,
    trackDistribution: trackCounts,
  };
}

async function gatherSDData() {
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status, current_phase, sd_type, priority')
    .not('status', 'in', '("cancelled","archived")');

  const statusCounts = {};
  const phaseCounts = {};
  const typeCounts = {};

  for (const sd of sds || []) {
    statusCounts[sd.status] = (statusCounts[sd.status] || 0) + 1;
    phaseCounts[sd.current_phase || 'unknown'] = (phaseCounts[sd.current_phase || 'unknown'] || 0) + 1;
    typeCounts[sd.sd_type || 'unknown'] = (typeCounts[sd.sd_type || 'unknown'] || 0) + 1;
  }

  return {
    total: (sds || []).length,
    statusCounts,
    phaseCounts,
    typeCounts,
    completed: statusCounts['completed'] || 0,
    inProgress: statusCounts['in_progress'] || 0,
    active: statusCounts['active'] || 0,
    draft: statusCounts['draft'] || 0,
  };
}

async function gatherOKRData() {
  const { data: objectives } = await supabase
    .from('okr_objectives')
    .select('id, title, status, progress')
    .eq('status', 'active');

  const { data: keyResults } = await supabase
    .from('okr_key_results')
    .select('id, objective_id, title, status, current_value, target_value, progress');

  const snapshot = (objectives || []).map(obj => {
    const krs = (keyResults || []).filter(kr => kr.objective_id === obj.id);
    const avgProgress = krs.length > 0
      ? Math.round(krs.reduce((sum, kr) => sum + (kr.progress || 0), 0) / krs.length)
      : 0;
    return {
      objective: obj.title,
      objectiveProgress: obj.progress || 0,
      keyResults: krs.map(kr => ({
        title: kr.title,
        status: kr.status,
        progress: kr.progress || 0,
        current: kr.current_value,
        target: kr.target_value,
      })),
      avgKRProgress: avgProgress,
    };
  });

  return {
    objectiveCount: (objectives || []).length,
    keyResultCount: (keyResults || []).length,
    snapshot,
  };
}

async function gatherVentureData() {
  const { data: ventures } = await supabase
    .from('ventures')
    .select('id, name, status, current_stage')
    .eq('status', 'active');

  return {
    activeCount: (ventures || []).length,
    ventures: (ventures || []).map(v => ({
      name: v.name,
      stage: v.current_stage,
    })),
  };
}

async function gatherPipelineData(baselineData, sdData) {
  const { data: intake } = await supabase
    .from('eva_intake_queue')
    .select('id')
    .eq('status', 'pending');

  return {
    intakePending: (intake || []).length,
    baselineVersion: baselineData.version || 0,
    baselineItems: baselineData.totalItems || 0,
    sdsInFlight: sdData.inProgress + sdData.active,
    sdsCompleted: sdData.completed,
    sdsDraft: sdData.draft,
    trackDistribution: baselineData.trackDistribution || {},
  };
}

function buildNarrative(freshnessChecks, baselineData, sdData, okrData, ventureData, pipelineData) {
  const staleWarnings = freshnessChecks.filter(f => !f.fresh);
  const lines = [];

  lines.push('# Weekly Management Review');
  lines.push(`Review Date: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');

  if (staleWarnings.length > 0) {
    lines.push('## Data Freshness Warnings');
    for (const w of staleWarnings) {
      lines.push(`- ${w.table}: ${w.reason === 'no_data' ? 'No data available' : `Last updated ${w.ageHours}h ago`}`);
    }
    lines.push('');
  }

  lines.push('## Pipeline Status');
  lines.push(`- Intake pending: ${pipelineData.intakePending}`);
  lines.push(`- SDs in-flight: ${pipelineData.sdsInFlight}`);
  lines.push(`- SDs completed: ${pipelineData.sdsCompleted}`);
  lines.push(`- Baseline version: v${pipelineData.baselineVersion} (${pipelineData.baselineItems} items)`);
  lines.push('');

  lines.push('## OKR Progress');
  for (const obj of okrData.snapshot) {
    lines.push(`- ${obj.objective}: ${obj.avgKRProgress}%`);
    for (const kr of obj.keyResults) {
      lines.push(`  - ${kr.title}: ${kr.progress}% (${kr.status})`);
    }
  }
  lines.push('');

  lines.push('## Ventures');
  for (const v of ventureData.ventures) {
    lines.push(`- ${v.name}: Stage ${v.stage}`);
  }

  return lines.join('\n');
}

async function generateReview() {
  console.log('Management Review Generator');
  console.log('='.repeat(50));

  // Data freshness checks
  const freshnessChecks = await Promise.all([
    checkFreshness('strategic_directives_v2'),
    checkFreshness('sd_execution_baselines', 'created_at'),
    checkFreshness('okr_key_results'),
    checkFreshness('ventures'),
  ]);

  console.log('\nData Freshness:');
  for (const check of freshnessChecks) {
    const icon = check.fresh ? '✅' : '⚠️';
    console.log(`  ${icon} ${check.table}: ${check.fresh ? 'Fresh' : 'STALE'} (${check.ageHours || 0}h)`);
  }

  // Gather all data in parallel
  const [baselineData, sdData, okrData, ventureData] = await Promise.all([
    gatherBaselineData(),
    gatherSDData(),
    gatherOKRData(),
    gatherVentureData(),
  ]);

  const pipelineData = await gatherPipelineData(baselineData, sdData);
  const narrative = buildNarrative(freshnessChecks, baselineData, sdData, okrData, ventureData, pipelineData);

  console.log('\nReview Summary:');
  console.log(`  SDs: ${sdData.total} total, ${sdData.completed} completed, ${sdData.inProgress + sdData.active} in-flight`);
  console.log(`  OKRs: ${okrData.objectiveCount} objectives, ${okrData.keyResultCount} key results`);
  console.log(`  Ventures: ${ventureData.activeCount} active`);
  console.log(`  Baseline: v${baselineData.version || 1} (${baselineData.totalItems || 0} items)`);

  if (isDryRun) {
    console.log('\n[DRY RUN] Would insert review artifact. Narrative:');
    console.log(narrative);
    return;
  }

  // Build review artifact
  const review = {
    review_date: new Date().toISOString().split('T')[0],
    review_type: 'weekly',
    baseline_version_from: baselineData.version || 1,
    baseline_version_to: baselineData.version || 1,
    planned_sds: baselineData.totalItems || 0,
    actual_sds: sdData.completed,
    planned_ventures: ventureData.activeCount,
    actual_ventures: ventureData.ventures.filter(v => v.stage >= 5).length,
    okr_snapshot: okrData.snapshot,
    risk_snapshot: null,
    strategy_health: null,
    pipeline_snapshot: pipelineData,
    eva_narrative: narrative,
    eva_proposals: null,
  };

  const { data, error } = await supabase
    .from('management_reviews')
    .insert(review)
    .select('id')
    .single();

  if (error) {
    console.error('\nError inserting review:', error.message);
    process.exit(1);
  }

  console.log(`\n✅ Review stored: ${data.id}`);

  // Create baseline version snapshot
  if (baselineData.active) {
    const { data: versionResult } = await supabase
      .rpc('create_baseline_version', {
        p_baseline_id: baselineData.id,
        p_created_by: 'eva_review',
      });
    if (versionResult) {
      console.log(`✅ Baseline version created: v${versionResult.version}`);
    }
  }

  return data.id;
}

async function showHistory() {
  const { data: reviews } = await supabase
    .from('management_reviews')
    .select('id, review_date, review_type, planned_sds, actual_sds, overall_score, created_at')
    .order('review_date', { ascending: false })
    .limit(10);

  if (!reviews || reviews.length === 0) {
    console.log('No management reviews found.');
    return;
  }

  console.log('Management Review History');
  console.log('='.repeat(70));
  console.log('  Date'.padEnd(14) + 'Type'.padEnd(10) + 'Planned'.padEnd(10) + 'Actual'.padEnd(10) + 'Score');
  console.log('-'.repeat(70));

  for (const r of reviews) {
    console.log(
      `  ${r.review_date}`.padEnd(14) +
      `${r.review_type}`.padEnd(10) +
      `${r.planned_sds || '-'}`.padEnd(10) +
      `${r.actual_sds || '-'}`.padEnd(10) +
      `${r.overall_score || '-'}`
    );
  }
}

if (isHistory) {
  showHistory().catch(err => { console.error('Fatal:', err); process.exit(1); });
} else {
  generateReview().catch(err => { console.error('Fatal:', err); process.exit(1); });
}
