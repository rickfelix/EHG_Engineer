/**
 * Strategy Loader — Dynamic discovery strategy loading from database
 * SD: SD-LEO-FEAT-ADAPTIVE-DISCOVERY-STRATEGY-001
 *
 * Replaces hardcoded VALID_STRATEGIES with DB-driven strategy loading.
 * Falls back to hardcoded strategies if DB query fails or returns empty.
 */

const FALLBACK_STRATEGIES = ['trend_scanner', 'democratization_finder', 'capability_overhang', 'nursery_reeval'];

/**
 * Load active discovery strategies from the database.
 * Falls back to hardcoded strategies on error or empty result.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string[]>} Array of active strategy keys
 */
export async function loadActiveStrategies(supabase) {
  try {
    const { data, error } = await supabase
      .from('discovery_strategies')
      .select('strategy_key')
      .eq('is_active', true)
      .order('strategy_key', { ascending: true });

    if (error || !data || data.length === 0) {
      return [...FALLBACK_STRATEGIES];
    }

    return data.map(s => s.strategy_key);
  } catch {
    return [...FALLBACK_STRATEGIES];
  }
}

/**
 * Check if there are enough ventures to support strategy evolution.
 * Minimum threshold: 20 ventures with discovery_strategy metadata.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{ready: boolean, totalVentures: number}>}
 */
export async function checkEvolutionThreshold(supabase) {
  const THRESHOLD = 20;

  try {
    const { count, error } = await supabase
      .from('ventures')
      .select('id', { count: 'exact', head: true })
      .not('metadata->stage_zero->origin_metadata->discovery_strategy', 'is', null)
      .neq('status', 'deleted');

    if (error) {
      return { ready: false, totalVentures: 0 };
    }

    return {
      ready: (count || 0) >= THRESHOLD,
      totalVentures: count || 0,
    };
  } catch {
    return { ready: false, totalVentures: 0 };
  }
}

/**
 * Validate that a strategy key is active in the database.
 * Falls back to checking FALLBACK_STRATEGIES on error.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} strategyKey - Strategy key to validate
 * @returns {Promise<boolean>}
 */
export async function isValidStrategy(supabase, strategyKey) {
  const activeStrategies = await loadActiveStrategies(supabase);
  return activeStrategies.includes(strategyKey);
}

export { FALLBACK_STRATEGIES };
