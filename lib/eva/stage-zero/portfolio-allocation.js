/**
 * Portfolio-Level Profile Allocation Service
 *
 * Manages portfolio-level target allocation across evaluation profiles.
 * When the portfolio is overweight in one profile style, nudges profile
 * selection toward underrepresented styles for balance.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-G
 */

/**
 * Get current portfolio allocation snapshot.
 *
 * Returns target vs current allocation for each evaluation profile,
 * with gap calculation (positive gap = underrepresented).
 *
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<Array<Object>>} Allocations with { profile_id, profile_name, target_pct, current_pct, gap }
 */
export async function getPortfolioAllocation(deps) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('   Portfolio allocation: No supabase client, returning empty');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('portfolio_profile_allocations')
      .select('id, profile_id, target_pct, current_pct, description')
      .order('target_pct', { ascending: false });

    if (error) {
      logger.warn(`   Portfolio allocation: Query error: ${error.message}`);
      return [];
    }

    // Fetch profile names
    const profileIds = (data || []).map(d => d.profile_id);
    let profileNames = {};

    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('evaluation_profiles')
        .select('id, name')
        .in('id', profileIds);

      if (profiles) {
        profileNames = Object.fromEntries(profiles.map(p => [p.id, p.name]));
      }
    }

    return (data || []).map(d => ({
      profile_id: d.profile_id,
      profile_name: profileNames[d.profile_id] || 'unknown',
      target_pct: parseFloat(d.target_pct) || 0,
      current_pct: parseFloat(d.current_pct) || 0,
      gap: Math.round((parseFloat(d.target_pct) - parseFloat(d.current_pct)) * 100) / 100,
      description: d.description,
    }));
  } catch (err) {
    logger.warn(`   Portfolio allocation: Error: ${err.message}`);
    return [];
  }
}

/**
 * Recommend a profile based on portfolio gaps.
 *
 * When multiple profiles score similarly, nudge toward the profile
 * with the largest positive gap (most underrepresented). If gaps
 * are negligible, return the highest-scoring profile.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} scores - Map of profile_id → score (0-100)
 * @param {Object} [options]
 * @param {number} [options.nudgeWeight=0.20] - How much to weight the gap vs raw score
 * @returns {Promise<Object>} { recommended_profile_id, profile_name, raw_score, nudged_score, gap, reason }
 */
export async function recommendProfile(deps, scores, options = {}) {
  const { logger = console } = deps;
  const nudgeWeight = options.nudgeWeight ?? 0.20;

  if (!scores || Object.keys(scores).length === 0) {
    return { recommended_profile_id: null, reason: 'no_scores_provided' };
  }

  const allocations = await getPortfolioAllocation(deps);

  if (allocations.length === 0) {
    // No allocation data — pick the highest raw score
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return {
      recommended_profile_id: best[0],
      profile_name: null,
      raw_score: best[1],
      nudged_score: best[1],
      gap: 0,
      reason: 'no_allocation_data',
    };
  }

  // Calculate nudged scores
  const candidates = [];

  for (const alloc of allocations) {
    const rawScore = scores[alloc.profile_id] ?? 0;
    const normalizedGap = alloc.gap / 100; // Convert pct to 0-1 range
    const nudgedScore = rawScore * (1 - nudgeWeight) + rawScore * normalizedGap * nudgeWeight * 10;

    candidates.push({
      recommended_profile_id: alloc.profile_id,
      profile_name: alloc.profile_name,
      raw_score: rawScore,
      nudged_score: Math.round(nudgedScore * 100) / 100,
      gap: alloc.gap,
      reason: alloc.gap > 5 ? 'nudged_toward_underrepresented' : 'highest_score',
    });
  }

  // Sort by nudged score descending
  candidates.sort((a, b) => b.nudged_score - a.nudged_score);

  return candidates[0];
}

/**
 * Recalculate current allocation percentages from active ventures.
 *
 * Counts ventures grouped by profile_id in venture_briefs,
 * then updates current_pct in portfolio_profile_allocations.
 *
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<Object>} { updated: number, total_ventures: number }
 */
export async function updateAllocationCounts(deps) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('   Portfolio allocation: No supabase client');
    return { updated: 0, total_ventures: 0 };
  }

  try {
    // Get all ventures with profile_ids
    const { data: ventures, error: vErr } = await supabase
      .from('venture_briefs')
      .select('profile_id')
      .not('profile_id', 'is', null);

    if (vErr) {
      logger.warn(`   Portfolio allocation: Venture query error: ${vErr.message}`);
      return { updated: 0, total_ventures: 0 };
    }

    const total = (ventures || []).length;

    // Count by profile_id
    const counts = {};
    for (const v of (ventures || [])) {
      counts[v.profile_id] = (counts[v.profile_id] || 0) + 1;
    }

    // Get all allocations
    const { data: allocs } = await supabase
      .from('portfolio_profile_allocations')
      .select('id, profile_id');

    let updated = 0;

    for (const alloc of (allocs || [])) {
      const count = counts[alloc.profile_id] || 0;
      const pct = total > 0 ? Math.round((count / total) * 10000) / 100 : 0;

      const { error } = await supabase
        .from('portfolio_profile_allocations')
        .update({ current_pct: pct })
        .eq('id', alloc.id);

      if (!error) updated++;
    }

    return { updated, total_ventures: total };
  } catch (err) {
    logger.warn(`   Portfolio allocation: Update error: ${err.message}`);
    return { updated: 0, total_ventures: 0 };
  }
}
