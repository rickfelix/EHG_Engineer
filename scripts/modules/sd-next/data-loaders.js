/**
 * Data Loaders for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { execSync } from 'child_process';

/**
 * Load active baseline and its items
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{baseline: Object|null, items: Array, actuals: Object}>}
 */
export async function loadActiveBaseline(supabase) {
  const { data: baseline, error } = await supabase
    .from('sd_execution_baselines')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error || !baseline) {
    return { baseline: null, items: [], actuals: {} };
  }

  // Load baseline items
  const { data: items } = await supabase
    .from('sd_baseline_items')
    .select('*')
    .eq('baseline_id', baseline.id)
    .order('sequence_rank');

  // Load actuals
  const { data: actuals } = await supabase
    .from('sd_execution_actuals')
    .select('*')
    .eq('baseline_id', baseline.id);

  const actualsMap = {};
  if (actuals) {
    actuals.forEach(a => actualsMap[a.sd_id] = a);
  }

  return {
    baseline,
    items: items || [],
    actuals: actualsMap
  };
}

/**
 * Load recent git activity for SD references
 *
 * @param {Object} supabase - Supabase client
 * @param {string} cwd - Current working directory
 * @returns {Promise<Array>} Array of {sd_id, commits, updated_at}
 */
export async function loadRecentActivity(supabase, cwd) {
  const recentActivity = [];

  // Method 1: Check git commits for SD references (last 7 days)
  try {
    const gitLog = execSync(
      'git log --oneline --since="7 days ago" --format="%s"',
      { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'ignore'] }
    );

    const sdPattern = /SD-[A-Z0-9-]+/g;
    const matches = gitLog.match(sdPattern) || [];
    const sdCounts = {};

    matches.forEach(sd => {
      sdCounts[sd] = (sdCounts[sd] || 0) + 1;
    });

    // Sort by frequency
    Object.entries(sdCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([sd, count]) => {
        recentActivity.push({ sd_id: sd, commits: count });
      });

  } catch {
    // Git not available or error - continue with database fallback
  }

  // Method 2: Check updated_at on SDs (fallback/supplement)
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
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} Array of conflict objects
 */
export async function loadConflicts(supabase) {
  const { data: conflicts } = await supabase
    .from('sd_conflict_matrix')
    .select('*')
    .is('resolved_at', null)
    .eq('conflict_severity', 'blocking');

  return conflicts || [];
}

/**
 * Load pending SD proposals (LEO Protocol v4.4)
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} Array of proposal objects
 */
export async function loadPendingProposals(supabase) {
  try {
    const { data: proposals, error } = await supabase
      .from('sd_proposals')
      .select('*')
      .eq('status', 'pending')
      .order('urgency_level', { ascending: true }) // critical first
      .order('confidence_score', { ascending: false })
      .limit(5);

    if (error) {
      // Table may not exist yet - non-fatal
      return [];
    }

    return proposals || [];
  } catch {
    // Non-fatal - proposals are optional
    return [];
  }
}

/**
 * Load SD hierarchy for parent-child tree display
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{allSDs: Map, sdHierarchy: Map}>}
 */
export async function loadSDHierarchy(supabase) {
  const allSDs = new Map();
  const sdHierarchy = new Map();

  try {
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, parent_sd_id, status, current_phase, progress_percentage, dependencies, is_working_on, metadata, priority')
      .eq('is_active', true)
      .order('created_at');

    if (!sds) return { allSDs, sdHierarchy };

    // Build lookup map and hierarchy
    for (const sd of sds) {
      const sdId = sd.sd_key || sd.id;
      allSDs.set(sdId, sd);
      allSDs.set(sd.id, sd); // Also map by UUID

      if (sd.parent_sd_id) {
        if (!sdHierarchy.has(sd.parent_sd_id)) {
          sdHierarchy.set(sd.parent_sd_id, []);
        }
        sdHierarchy.get(sd.parent_sd_id).push(sd);
      }
    }
  } catch {
    // Non-fatal - continue without hierarchy
  }

  return { allSDs, sdHierarchy };
}

/**
 * Load OKR scorecard and vision
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{vision: Object|null, scorecard: Array}>}
 */
export async function loadOKRScorecard(supabase) {
  try {
    // Load active vision
    const { data: vision } = await supabase
      .from('strategic_vision')
      .select('*')
      .eq('is_active', true)
      .single();

    // Load OKR scorecard
    const { data: scorecard, error } = await supabase
      .from('v_okr_scorecard')
      .select('*')
      .order('sequence');

    if (error) {
      // View may not exist yet - non-fatal
      return { vision, scorecard: [] };
    }

    const okrScorecard = scorecard || [];

    // Load key results with details for each objective
    for (const obj of okrScorecard) {
      const { data: krs } = await supabase
        .from('key_results')
        .select('code, title, current_value, target_value, unit, status, baseline_value, direction')
        .eq('objective_id', obj.objective_id)
        .eq('is_active', true)
        .order('sequence');

      obj.key_results = krs || [];
    }

    return { vision, scorecard: okrScorecard };
  } catch {
    // Non-fatal - OKRs are optional
    return { vision: null, scorecard: [] };
  }
}

/**
 * Count how many baseline items have non-completed SDs
 *
 * @param {Object} supabase - Supabase client
 * @param {Array} baselineItems - Baseline items to check
 * @returns {Promise<number>} Count of actionable items
 */
export async function countActionableBaselineItems(supabase, baselineItems) {
  if (!baselineItems || !baselineItems.length) return 0;

  let actionableCount = 0;
  for (const item of baselineItems) {
    // Use sd_key with fallback to id (for UUID lookups)
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('status, is_active')
      .or(`sd_key.eq.${item.sd_id},id.eq.${item.sd_id}`)
      .single();

    if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
      actionableCount++;
    }
  }
  return actionableCount;
}
