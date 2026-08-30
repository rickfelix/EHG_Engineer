#!/usr/bin/env node
/**
 * Management Review Generator
 * Aggregates data from existing tables into a structured review artifact
 * stored in management_reviews table.
 *
 * Usage: node scripts/pipeline/management-review-generator.js [--dry-run]
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
// SD-LEO-FEAT-PRE-EXISTING-BUG-001: build the upsert payload via a pure helper that omits the
// non-existent capability_gaps column (which 42703-errored every live run).
import { buildReviewArtifact } from '../../lib/pipeline/management-review-artifact.mjs';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { isFixtureVenture } from '../../lib/chairman/chairman-actionable.mjs';

const supabase = createSupabaseServiceClient();
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

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — totalItems/readyItems/
  // trackDistribution below are computed over every row; a baseline snapshots the whole
  // roadmap, so an unranged read would silently under-report exactly the kind of gauge
  // this SD's incident was about. Paginate; empty-on-error mirrors the prior fail-open.
  let items;
  try {
    items = await fetchAllPaginated(() => supabase
      .from('sd_baseline_items')
      .select('id, sd_id, sequence_rank, track, is_ready')
      .eq('baseline_id', baseline.id)
      .order('id', { ascending: true }));
  } catch {
    items = [];
  }

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
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — status/phase/type counts
  // below are computed over every row; a growing table filtered to exclude only a couple of
  // terminal statuses is NOT bounded. Paginate; empty-on-error mirrors the prior fail-open.
  let sds;
  try {
    sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, current_phase, sd_type, priority')
      .not('status', 'in', '("cancelled","archived")')
      .order('id', { ascending: true }));
  } catch {
    sds = [];
  }

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
  // OKR tables (okr_objectives, okr_key_results) do not exist yet
  const objectives = [];
  const keyResults = [];

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

async function gatherRiskData() {
  const { data: forecasts } = await supabase
    .from('risk_forecasts')
    .select('venture_id, risk_category, predicted_score, confidence, forecast_date')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!forecasts || forecasts.length === 0) return { hasForecasts: false, forecasts: [] };

  // Group by venture
  const byVenture = {};
  for (const f of forecasts) {
    if (!byVenture[f.venture_id]) byVenture[f.venture_id] = [];
    byVenture[f.venture_id].push(f);
  }

  return {
    hasForecasts: true,
    ventureCount: Object.keys(byVenture).length,
    totalForecasts: forecasts.length,
    forecasts: forecasts.slice(0, 20),
  };
}

async function gatherGapData() {
  // Capability gap analysis: strategy objectives vs delivered capabilities
  const { data: objectives } = await supabase
    .from('strategy_objectives')
    .select('id, title, time_horizon, target_capabilities')
    .eq('status', 'active');

  if (!objectives || objectives.length === 0) {
    return { hasGaps: false, gaps_by_objective: [], pending_proposals_count: 0 };
  }

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — every delivered capability is
  // folded into deliveredKeys below; venture_capabilities grows with portfolio size, so an
  // unranged read would silently under-report and inflate the computed gap counts. Paginate;
  // empty-on-error mirrors the prior fail-open.
  let capabilities;
  try {
    capabilities = await fetchAllPaginated(() => supabase
      .from('venture_capabilities')
      .select('id, capability_key') // schema-lint-disable-line: pre-existing column reference, unrelated to FR-6 pagination edits in this file (surfaced by file-level diff scoping)
      .in('status', ['delivered', 'verified', 'active'])
      .order('id', { ascending: true }));
  } catch {
    capabilities = [];
  }

  const deliveredKeys = new Set((capabilities || []).map(c => c.capability_key));

  const gapsByObjective = objectives.map(obj => {
    const targets = obj.target_capabilities || [];
    const gaps = targets.filter(t => !deliveredKeys.has(t));
    return {
      objective: obj.title,
      time_horizon: obj.time_horizon,
      target_count: targets.length,
      delivered_count: targets.length - gaps.length,
      gap_count: gaps.length,
      gap_capabilities: gaps,
    };
  }).filter(o => o.gap_count > 0);

  // Count pending proposals
  const { count } = await supabase
    .from('sd_proposals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return {
    hasGaps: gapsByObjective.length > 0,
    gaps_by_objective: gapsByObjective,
    total_gaps: gapsByObjective.reduce((s, o) => s + o.gap_count, 0),
    pending_proposals_count: count || 0,
  };
}

async function gatherVentureData() {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — activeCount and the rendered
  // venture list below are both derived from this read; ventures grows with the factory's
  // output, so an unranged read would silently under-report past the cap. Paginate;
  // empty-on-error mirrors the prior fail-open.
  let ventures;
  try {
    ventures = await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, name, status, current_stage') // schema-lint-disable-line: pre-existing column reference, unrelated to FR-6 pagination edits in this file (surfaced by file-level diff scoping)
      .eq('status', 'active')
      .order('id', { ascending: true }));
  } catch {
    ventures = [];
  }

  return {
    activeCount: (ventures || []).length,
    ventures: (ventures || []).map(v => ({
      name: v.name,
      stage: v.current_stage,
    })),
  };
}

// QF-20260829-286: chairman commission d4bc1bab (Solomon relay 2544151c, 2026-08-28) — five
// standing Friday-pulse questions, using ONLY existing instruments/cadences (no new dashboard,
// governance loop, or monitoring subsystem). Where no instrument exists (Q5), the caller renders
// UNKNOWN rather than this function inventing tracking to complete the framework.
async function gatherFridayPulseData() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Paginated to match this file's established discipline against silent under-reporting on a
  // table that grows with the factory's output (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001).
  let activeVentures;
  try {
    activeVentures = await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('name, is_demo, orchestrator_state, dwell_days')
      .eq('status', 'active')
      .order('id', { ascending: true }));
  } catch {
    activeVentures = [];
  }
  const blocked = (activeVentures || [])
    .filter(v => !isFixtureVenture(v) && v.orchestrator_state === 'blocked')
    .map(v => ({ name: v.name, ageDays: v.dwell_days }));

  const { count: stageCrossings } = await supabase
    .from('venture_stage_transitions')
    .select('id', { count: 'exact', head: true })
    .gte('approved_at', weekAgo);

  let sdsThisWeek;
  try {
    sdsThisWeek = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('venture_id')
      .gte('created_at', weekAgo));
  } catch {
    sdsThisWeek = [];
  }
  const ventureFacing = (sdsThisWeek || []).filter(s => s.venture_id).length;
  const harnessWork = (sdsThisWeek || []).length - ventureFacing;

  const { count: overrideCount } = await supabase
    .from('bypass_ledger')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', weekAgo);

  // SD-LEO-INFRA-BREAKAGE-ESCAPE-INSTRUMENT-001 (FR-5): reads the KR-2026-07-02 baseline
  // banked by scripts/breakage-escape/compute-catch-rate.mjs --bank. Fails soft (not yet
  // computed) rather than throwing if the instrument has never banked a value -- the pulse
  // must never block on this one field.
  let catchRate = null;
  try {
    const { data: kr } = await supabase
      .from('key_results')
      .select('current_value,status')
      .eq('code', 'KR-2026-07-02')
      .maybeSingle();
    if (kr && kr.current_value > 0) catchRate = kr.current_value;
  } catch {
    catchRate = null;
  }

  return { blocked, stageCrossings, ventureFacing, harnessWork, overrideCount, catchRate };
}

async function gatherPipelineData(baselineData, sdData) {
  // Table eva_intake_queue does not exist yet
  return {
    intakePending: 0,
    baselineVersion: baselineData.version || 0,
    baselineItems: baselineData.totalItems || 0,
    sdsInFlight: sdData.inProgress + sdData.active,
    sdsCompleted: sdData.completed,
    sdsDraft: sdData.draft,
    trackDistribution: baselineData.trackDistribution || {},
  };
}

function buildNarrative(freshnessChecks, baselineData, sdData, okrData, ventureData, pipelineData, gapData, pulseData) {
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

  // QF-20260829-286: chairman commission d4bc1bab — 5 standing weekly questions, existing
  // instruments only. The 3:1-style ratio below is an observation, never a pass/fail target.
  lines.push('');
  lines.push('## Friday Pulse (5 questions)');
  lines.push(`- Blocked real ventures + age: ${pulseData.blocked.length > 0 ? pulseData.blocked.map(v => `${v.name} (${v.ageDays ?? 'unknown'}d)`).join(', ') : 'None'}`);
  lines.push(`- Stage boundary crossed this week: ${pulseData.stageCrossings > 0 ? `Yes (${pulseData.stageCrossings})` : 'No'}`);
  lines.push(`- Venture-facing vs harness-work ratio (7d): ${pulseData.ventureFacing}:${pulseData.harnessWork}`);
  lines.push(`- Gate-decision overrides (7d): ${pulseData.overrideCount}`);
  lines.push('- Blocked-time attribution (chairman/tooling/fleet): UNKNOWN — no instrument exists');
  // SD-LEO-INFRA-BREAKAGE-ESCAPE-INSTRUMENT-001 (FR-5): first day-one consumer of the
  // defect-escape catch-rate instrument (KR-2026-07-02).
  lines.push(`- Breakage catch-rate (KR-2026-07-02): ${pulseData.catchRate != null ? `${pulseData.catchRate}%` : 'not yet computed — run scripts/breakage-escape/compute-catch-rate.mjs --bank'}`);

  if (gapData && gapData.hasGaps) {
    lines.push('');
    lines.push('## Capability Gaps');
    lines.push(`- ${gapData.total_gaps} total gaps across ${gapData.gaps_by_objective.length} objectives`);
    lines.push(`- Pending SD proposals: ${gapData.pending_proposals_count}`);
    for (const obj of gapData.gaps_by_objective) {
      lines.push(`  - ${obj.objective} (${obj.time_horizon}): ${obj.gap_count} gaps — ${obj.gap_capabilities.join(', ')}`);
    }
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
  const [baselineData, sdData, okrData, ventureData, riskData, gapData, pulseData] = await Promise.all([
    gatherBaselineData(),
    gatherSDData(),
    gatherOKRData(),
    gatherVentureData(),
    gatherRiskData(),
    gatherGapData(),
    gatherFridayPulseData(),
  ]);

  const pipelineData = await gatherPipelineData(baselineData, sdData);
  const narrative = buildNarrative(freshnessChecks, baselineData, sdData, okrData, ventureData, pipelineData, gapData, pulseData);

  console.log('\nReview Summary:');
  console.log(`  SDs: ${sdData.total} total, ${sdData.completed} completed, ${sdData.inProgress + sdData.active} in-flight`);
  console.log(`  OKRs: ${okrData.objectiveCount} objectives, ${okrData.keyResultCount} key results`);
  console.log(`  Ventures: ${ventureData.activeCount} active`);
  console.log(`  Baseline: v${baselineData.version || 1} (${baselineData.totalItems || 0} items)`);
  console.log(`  Risk forecasts: ${riskData.hasForecasts ? riskData.totalForecasts + ' across ' + riskData.ventureCount + ' ventures' : 'none'}`);
  console.log(`  Capability gaps: ${gapData.hasGaps ? gapData.total_gaps + ' gaps across ' + gapData.gaps_by_objective.length + ' objectives' : 'none'}`);
  console.log(`  Pending proposals: ${gapData.pending_proposals_count}`);

  if (isDryRun) {
    console.log('\n[DRY RUN] Would insert review artifact. Narrative:');
    console.log(narrative);
    return;
  }

  // Build review artifact (SD-LEO-FEAT-PRE-EXISTING-BUG-001: via the pure helper, which omits the
  // non-existent capability_gaps column — gapData is still surfaced in the summary + narrative above).
  const review = buildReviewArtifact({
    reviewDate: new Date().toISOString().split('T')[0],
    baselineData,
    sdData,
    ventureData,
    okrData,
    riskData,
    pipelineData,
    narrative,
  });

  // Upsert (not insert) so a same-day re-run updates the existing row in place rather than appending
  // a duplicate that would violate the UNIQUE(review_date, review_type) guard
  // (migration 20260610_purge_management_reviews_pollution.sql) with a 23505 —
  // SD-LEO-INFRA-REVIVE-EVA-PURGE-MGMT-REVIEWS-001 FR-2 (second writer site).
  const { data, error } = await supabase
    .from('management_reviews')
    .upsert(review, { onConflict: 'review_date,review_type' })
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
