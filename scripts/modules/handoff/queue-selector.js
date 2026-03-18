/**
 * QueueSelector — Pure function for claim-aware SD ranking
 *
 * Extracted from orchestrator-completion-hook.js findNextAvailableOrchestrator()
 * and sd-next.js ranking logic. Returns ordered list of workable SDs without
 * display layer.
 *
 * Part of SD-LEO-INFRA-IMPLEMENT-STANDALONE-AUTO-001
 */

/**
 * Find the next workable SD from the queue, excluding claimed and completed SDs.
 *
 * @param {object} supabase - Supabase client
 * @param {object} [options]
 * @param {string} [options.excludeSdId] - SD UUID to exclude (e.g. just-completed)
 * @param {string[]} [options.excludeSdKeys] - Additional sd_keys to exclude (e.g. chain history)
 * @param {boolean} [options.orchestratorsOnly] - Only return top-level SDs (default: false)
 * @returns {Promise<{ sd: object|null, candidates: object[], reason: string }>}
 */
export async function selectNextSD(supabase, options = {}) {
  const { excludeSdId = null, excludeSdKeys = [], orchestratorsOnly = false } = options;

  try {
    // 1. Query claimed SD keys to exclude
    const claimedSdKeys = await getClaimedSdKeys(supabase);

    // 2. Build candidate query
    let query = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, priority, parent_sd_id, category, current_phase')
      .in('status', ['draft', 'in_progress', 'planning', 'active'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(20);

    if (orchestratorsOnly) {
      query = query.is('parent_sd_id', null);
    }

    if (excludeSdId) {
      query = query.neq('id', excludeSdId);
    }

    const { data, error } = await query;

    if (error) {
      return { sd: null, candidates: [], reason: `Query error: ${error.message}` };
    }

    if (!data || data.length === 0) {
      return { sd: null, candidates: [], reason: 'No SDs in queue' };
    }

    // 3. Filter out claimed and excluded SDs
    const allExcluded = new Set([...claimedSdKeys, ...excludeSdKeys]);
    const unclaimed = data.filter(sd => !allExcluded.has(sd.sd_key));

    if (unclaimed.length === 0) {
      return {
        sd: null,
        candidates: [],
        reason: `All ${data.length} candidate(s) are claimed or excluded`
      };
    }

    return {
      sd: unclaimed[0],
      candidates: unclaimed,
      reason: 'Next SD found'
    };
  } catch (err) {
    return { sd: null, candidates: [], reason: `Exception: ${err.message}` };
  }
}

/**
 * Get all currently claimed SD keys across active sessions.
 *
 * @param {object} supabase - Supabase client
 * @returns {Promise<string[]>} Array of claimed sd_key values
 */
export async function getClaimedSdKeys(supabase) {
  try {
    const { data: claimedSessions } = await supabase
      .from('claude_sessions')
      .select('sd_id')
      .not('sd_id', 'is', null)
      .in('status', ['active', 'idle']);
    return (claimedSessions || []).map(s => s.sd_id).filter(Boolean);
  } catch {
    // Fail-open: proceed without claim filtering
    return [];
  }
}
