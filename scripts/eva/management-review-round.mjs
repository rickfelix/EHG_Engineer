/**
 * Management Review EVA Round
 *
 * Registers the weekly_management_review round type in EvaMasterScheduler.
 * When triggered (weekly cadence, Friday 9am EST), calls the management
 * review generator to produce a structured artifact.
 *
 * Registration:
 *   Import and call registerManagementReviewRound(scheduler) during
 *   EvaMasterScheduler initialization.
 *
 * Manual trigger:
 *   node scripts/eva/management-review-round.mjs
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

/**
 * The management review round handler.
 * Gathers data from multiple tables and produces a structured review artifact.
 *
 * This is a self-contained handler that duplicates minimal logic from
 * management-review-generator.js so it can run inside the EVA scheduler
 * without spawning a child process.
 */
async function managementReviewHandler(_options = {}) {
  const STALE_THRESHOLD_HOURS = 24;

  // --- Data freshness checks ---
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
    };
  }

  const freshnessChecks = await Promise.all([
    checkFreshness('strategic_directives_v2'),
    checkFreshness('sd_execution_baselines', 'created_at'),
    checkFreshness('okr_key_results'),
    checkFreshness('ventures'),
  ]);

  const staleWarnings = freshnessChecks.filter(f => !f.fresh);

  // --- Gather baseline data ---
  const { data: baseline } = await supabase
    .from('sd_execution_baselines')
    .select('id, baseline_name, is_active, version, created_by, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let baselineData = { active: false, totalItems: 0, version: 1 };
  if (baseline) {
    const { data: items } = await supabase
      .from('sd_baseline_items')
      .select('sd_id, sequence_rank, track, is_ready')
      .eq('baseline_id', baseline.id);

    const readyCount = (items || []).filter(i => i.is_ready).length;
    baselineData = {
      active: true,
      id: baseline.id,
      name: baseline.baseline_name,
      version: baseline.version || 1,
      totalItems: (items || []).length,
      readyItems: readyCount,
    };
  }

  // --- Gather SD data ---
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status, current_phase, sd_type')
    .not('status', 'in', '("cancelled","archived")');

  const statusCounts = {};
  for (const sd of sds || []) {
    statusCounts[sd.status] = (statusCounts[sd.status] || 0) + 1;
  }
  const completed = statusCounts['completed'] || 0;
  const inProgress = (statusCounts['in_progress'] || 0) + (statusCounts['active'] || 0);

  // OKR tables (okr_objectives, okr_key_results) do not exist yet
  const objectives = [];
  const keyResults = [];

  const okrSnapshot = (objectives || []).map(obj => {
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
      })),
      avgKRProgress: avgProgress,
    };
  });

  // --- Gather venture data ---
  const { data: ventures } = await supabase
    .from('ventures')
    .select('id, name, status, current_stage')
    .eq('status', 'active');

  // Table eva_intake_queue does not exist yet
  const intake = [];

  // --- Build narrative ---
  const lines = [];
  lines.push('# Weekly Management Review');
  lines.push(`Review Date: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');

  if (staleWarnings.length > 0) {
    lines.push('## Data Freshness Warnings');
    for (const w of staleWarnings) {
      lines.push(`- ${w.table}: ${w.reason === 'no_data' ? 'No data' : `${w.ageHours}h ago`}`);
    }
    lines.push('');
  }

  lines.push('## Pipeline Status');
  lines.push(`- Intake pending: ${(intake || []).length}`);
  lines.push(`- SDs in-flight: ${inProgress}`);
  lines.push(`- SDs completed: ${completed}`);
  lines.push(`- Baseline: v${baselineData.version} (${baselineData.totalItems} items)`);
  lines.push('');

  lines.push('## OKR Progress');
  for (const obj of okrSnapshot) {
    lines.push(`- ${obj.objective}: ${obj.avgKRProgress}%`);
  }
  lines.push('');

  lines.push('## Ventures');
  for (const v of ventures || []) {
    lines.push(`- ${v.name}: Stage ${v.current_stage}`);
  }

  const narrative = lines.join('\n');

  // --- Store review artifact ---
  const review = {
    review_date: new Date().toISOString().split('T')[0],
    review_type: 'weekly',
    baseline_version_from: baselineData.version || 1,
    baseline_version_to: baselineData.version || 1,
    planned_sds: baselineData.totalItems || 0,
    actual_sds: completed,
    planned_ventures: (ventures || []).length,
    actual_ventures: (ventures || []).filter(v => v.current_stage >= 5).length,
    okr_snapshot: okrSnapshot,
    pipeline_snapshot: {
      intakePending: (intake || []).length,
      sdsInFlight: inProgress,
      sdsCompleted: completed,
      baselineVersion: baselineData.version || 1,
      baselineItems: baselineData.totalItems || 0,
    },
    eva_narrative: narrative,
  };

  const { data: reviewData, error: reviewError } = await supabase
    .from('management_reviews')
    .insert(review)
    .select('id')
    .single();

  if (reviewError) {
    throw new Error(`Failed to store review: ${reviewError.message}`);
  }

  // --- Create baseline version snapshot ---
  let versionCreated = null;
  if (baselineData.active) {
    const { data: versionResult } = await supabase
      .rpc('create_baseline_version', {
        p_baseline_id: baselineData.id,
        p_created_by: 'eva_review',
      });
    versionCreated = versionResult?.version || null;
  }

  return {
    reviewId: reviewData.id,
    reviewDate: review.review_date,
    staleWarnings: staleWarnings.length,
    sdsTotal: (sds || []).length,
    sdsCompleted: completed,
    sdsInFlight: inProgress,
    okrObjectives: (objectives || []).length,
    activeVentures: (ventures || []).length,
    baselineVersion: baselineData.version,
    newBaselineVersion: versionCreated,
  };
}

/**
 * Register the management review round in an EvaMasterScheduler instance.
 * Call this from the scheduler's initialization or _registerDefaultRounds().
 *
 * @param {Object} scheduler - EvaMasterScheduler instance with registerRound()
 */
export function registerManagementReviewRound(scheduler) {
  scheduler.registerRound('weekly_management_review', {
    description: 'Generate weekly management review artifact with baseline comparison, OKR snapshots, and pipeline health',
    cadence: 'weekly',
    handler: managementReviewHandler,
  });
}

// CLI: manual trigger for testing
if (process.argv[1]?.replace(/\\/g, '/').endsWith('management-review-round.mjs')) {
  console.log('Management Review Round - Manual Trigger');
  console.log('='.repeat(50));

  managementReviewHandler()
    .then(result => {
      console.log('\nReview generated:');
      console.log(`  Review ID: ${result.reviewId}`);
      console.log(`  Date: ${result.reviewDate}`);
      console.log(`  Stale warnings: ${result.staleWarnings}`);
      console.log(`  SDs: ${result.sdsTotal} total, ${result.sdsCompleted} completed, ${result.sdsInFlight} in-flight`);
      console.log(`  OKR objectives: ${result.okrObjectives}`);
      console.log(`  Active ventures: ${result.activeVentures}`);
      console.log(`  Baseline version: v${result.baselineVersion}`);
      if (result.newBaselineVersion) {
        console.log(`  New baseline version: v${result.newBaselineVersion}`);
      }
    })
    .catch(err => {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
}

export { managementReviewHandler };
