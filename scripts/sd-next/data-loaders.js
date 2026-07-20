/**
 * Data loading functions for SD-next
 * Handles all database queries and external data loading
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { checkUncommittedChanges, getAffectedRepos } from '../../lib/multi-repo/index.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: baseline items feed
// countActionableBaselineItems (iterates every item) and the SD-hierarchy tree walks
// ALL active SDs (a growing table) — a read silently capped at the PostgREST 1000-row
// max would undercount actionable work / hide branches with no error.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

dotenv.config();

const supabase = createSupabaseServiceClient();

export { supabase };

/**
 * Load active baseline and items
 */
export async function loadActiveBaseline() {
  const { data: baseline, error } = await supabase
    .from('sd_execution_baselines')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error || !baseline) {
    return { baseline: null, items: [], actuals: {} };
  }

  let items = [];
  try {
    items = await fetchAllPaginated(() => supabase
      .from('sd_baseline_items')
      .select('*')
      .eq('baseline_id', baseline.id)
      .order('sequence_rank')
      .order('id', { ascending: true }));
  } catch {
    // preserve original fail-open behavior (prior code silently dropped the error)
  }

  let actuals = [];
  try {
    actuals = await fetchAllPaginated(() => supabase
      .from('sd_execution_actuals')
      .select('*')
      .eq('baseline_id', baseline.id)
      .order('id', { ascending: true }));
  } catch {
    // preserve original fail-open behavior
  }

  const actualsMap = {};
  actuals.forEach(a => actualsMap[a.sd_id] = a);

  return { baseline, items, actuals: actualsMap };
}

/**
 * Count actionable baseline items
 */
export async function countActionableBaselineItems(baselineItems) {
  if (!baselineItems || baselineItems.length === 0) return 0;

  let actionableCount = 0;
  for (const item of baselineItems) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('status, is_active')
      .eq('sd_key', item.sd_id)
      .single();

    if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
      actionableCount++;
    }
  }
  return actionableCount;
}

/**
 * Load recent git activity
 */
export async function loadRecentActivity() {
  const recentActivity = [];

  try {
    const gitLog = execSync(
      'git log --oneline --since="7 days ago" --format="%s"',
      { encoding: 'utf8', cwd: process.cwd(), stdio: ['pipe', 'pipe', 'ignore'] }
    );

    const sdPattern = /SD-[A-Z0-9-]+/g;
    const matches = gitLog.match(sdPattern) || [];
    const sdCounts = {};

    matches.forEach(sd => {
      sdCounts[sd] = (sdCounts[sd] || 0) + 1;
    });

    Object.entries(sdCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([sd, count]) => {
        recentActivity.push({ sd_id: sd, commits: count });
      });
  } catch {
    // Git not available
  }

  const { data: recentSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, updated_at')
    .eq('is_active', true)
    .in('status', ['draft', 'active', 'in_progress'])
    .order('updated_at', { ascending: false })
    .limit(5);

  if (recentSDs) {
    recentSDs.forEach(sd => {
      if (!recentActivity.find(a => a.sd_id === sd.sd_key)) {
        recentActivity.push({
          sd_id: sd.sd_key,
          commits: 0,
          updated_at: sd.updated_at
        });
      }
    });
  }

  return recentActivity;
}

/**
 * Load blocking conflicts
 */
export async function loadConflicts() {
  const { data: conflicts } = await supabase
    .from('sd_conflict_matrix')
    .select('*')
    .is('resolved_at', null)
    .eq('conflict_severity', 'blocking');

  return conflicts || [];
}

/**
 * Load multi-repo status (files older than minAgeDays)
 */
export function loadMultiRepoStatus(minAgeDays = 5) {
  try {
    return checkUncommittedChanges(true, { minAgeDays });
  } catch {
    return null;
  }
}

/**
 * Get affected repos for an SD
 */
export function getSDRepos(sd) {
  try {
    return getAffectedRepos({
      title: sd.title || '',
      description: sd.description || '',
      sd_type: sd.sd_type || sd.metadata?.sd_type || 'feature'
    });
  } catch {
    return ['ehg', 'EHG_Engineer'];
  }
}

/**
 * Load pending SD proposals
 */
export async function loadPendingProposals(limit = 5) {
  try {
    const { data: proposals, error } = await supabase
      .from('sd_proposals')
      .select('*')
      .eq('status', 'pending')
      .order('urgency_level', { ascending: true })
      .order('confidence_score', { ascending: false })
      .limit(limit);

    if (error) return [];
    return proposals || [];
  } catch {
    return [];
  }
}

/**
 * Load SD hierarchy for parent-child tree display
 */
export async function loadSDHierarchy() {
  const hierarchy = new Map();
  const allSDs = new Map();

  try {
    const sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, parent_sd_id, status, current_phase, progress_percentage, dependencies, is_working_on, metadata, priority')
      .eq('is_active', true)
      .order('created_at')
      .order('id', { ascending: true }));

    if (!sds.length) return { hierarchy, allSDs };

    for (const sd of sds) {
      const sdId = sd.sd_key || sd.id;
      allSDs.set(sdId, sd);
      allSDs.set(sd.id, sd);

      if (sd.parent_sd_id) {
        if (!hierarchy.has(sd.parent_sd_id)) {
          hierarchy.set(sd.parent_sd_id, []);
        }
        hierarchy.get(sd.parent_sd_id).push(sd);
      }
    }
  } catch {
    // Non-fatal
  }

  return { hierarchy, allSDs };
}

/**
 * Load OKR scorecard
 */
export async function loadOKRScorecard() {
  let vision = null;
  let scorecard = [];

  try {
    // Canonical chairman-approved eva_vision_documents L1
    // (SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-E: repointed off dormant strategic_vision).
    // display.js renders vision.code + vision.statement.substring — map vision_key
    // -> code and the one-line takeaway section -> statement.
    const { data: visionData } = await supabase
      .from('eva_vision_documents')
      .select('id, vision_key, status, statement:sections->>part_xii_the_final_oneline_takeaway')
      .eq('vision_key', 'VISION-EHG-L1-001')
      .eq('status', 'active')
      .eq('chairman_approved', true)
      .single();

    vision = visionData
      ? {
          id: visionData.id,
          status: visionData.status,
          code: visionData.vision_key,
          statement: String(visionData.statement || '')
            .replace(/\*\*/g, '')
            .replace(/^[>\s]+/, '')
            .replace(/\n+\s*---\s*$/, '')
            .trim()
        }
      : null;

    const { data: scorecardData, error } = await supabase
      .from('v_okr_scorecard')
      .select('*')
      .order('sequence');

    if (error) return { vision, scorecard: [] };
    scorecard = scorecardData || [];

    // Load key results for each objective
    for (const obj of scorecard) {
      const { data: krs } = await supabase
        .from('key_results')
        .select('code, title, current_value, target_value, unit, status, baseline_value, direction')
        .eq('objective_id', obj.objective_id)
        .eq('is_active', true)
        .order('sequence');

      obj.key_results = krs || [];
    }
  } catch {
    // Non-fatal
  }

  return { vision, scorecard };
}
