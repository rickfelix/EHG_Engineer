/**
 * QueueSelector — Pure function for claim-aware SD ranking
 *
 * Extracted from orchestrator-completion-hook.js findNextAvailableOrchestrator()
 * and sd-next.js ranking logic. Returns ordered list of workable SDs without
 * display layer.
 *
 * Part of SD-LEO-INFRA-IMPLEMENT-STANDALONE-AUTO-001
 */

import { fetchAllPaginated } from '../../../lib/db/fetch-all-paginated.mjs';
import { classifyAllDispatchIneligibility, CLAIM_WRITE_FENCE_AXES } from '../../../lib/fleet/claim-eligibility.cjs';

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
    // SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 (FR-1): metadata is selected so the
    // authority-fence check below can actually see requires_human_action. sd_type is
    // DELIBERATELY NOT selected/read for eligibility purposes here -- the general
    // classifier's orchestratorParent axis (claim-eligibility.cjs:191-193) fires on
    // sd_type==='orchestrator' and would wrongly refuse legitimate orchestrator-type
    // candidates when orchestratorsOnly is set, which is precisely this function's own
    // purpose in that mode (live-measured: 3/20 real candidates wrongly refused). Using
    // CLAIM_WRITE_FENCE_AXES below avoids that axis by construction.
    let query = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, priority, parent_sd_id, category, current_phase, metadata')
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

    // 4. FR-1: refuse any candidate the authority fence catches (requires_human_action,
    // needs_coordinator_review, not_before_hold, lead_blocker_active,
    // chairman_ratification_pending) -- classifyAllDispatchIneligibility over
    // CLAIM_WRITE_FENCE_AXES, never the general classifier (see the select() comment above
    // for why sd_type/orchestratorParent must stay out of this check).
    const eligible = unclaimed.filter(
      (sd) => !classifyAllDispatchIneligibility(sd).find((r) => CLAIM_WRITE_FENCE_AXES.has(r))
    );

    if (eligible.length === 0) {
      return {
        sd: null,
        candidates: [],
        reason: `All ${unclaimed.length} unclaimed candidate(s) are authority-fenced`
      };
    }

    return {
      sd: eligible[0],
      candidates: eligible,
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
    // Count/truncation discipline (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6):
    // paginate — a capped read could hide live claims and hand out an already-claimed
    // SD. Failure → catch below (fail-open, no claim filtering — unchanged).
    const claimedSessions = await fetchAllPaginated(() => supabase
      .from('claude_sessions')
      .select('sd_key, id')
      .not('sd_key', 'is', null)
      .in('status', ['active', 'idle'])
      .order('id')); // unique-key tiebreaker for stable pagination
    return (claimedSessions || []).map(s => s.sd_key).filter(Boolean);
  } catch {
    // Fail-open: proceed without claim filtering
    return [];
  }
}
