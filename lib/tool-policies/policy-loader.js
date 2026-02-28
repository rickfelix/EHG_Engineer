/**
 * Policy Loader - Reads agent tool policy profile from database
 * SD: SD-LEO-INFRA-IMPLEMENT-PER-AGENT-001
 *
 * Queries leo_sub_agents.tool_policy_profile for a given agent code
 * and returns the resolved policy from policy-engine (lib/tool-policy.js).
 */

import { getAllowedTools, isValidProfile } from '../tool-policy.js';

/**
 * Load tool policy for an agent from database.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} agentCode - Agent code (e.g., 'RCA', 'DATABASE')
 * @returns {Promise<{profile: string, allowedTools: string[]|null}>}
 */
export async function loadAgentPolicy(supabase, agentCode) {
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('tool_policy_profile')
    .eq('code', agentCode)
    .single();

  if (error || !data) {
    // Default to full profile if agent not found
    return { profile: 'full', allowedTools: null };
  }

  const profile = data.tool_policy_profile || 'full';
  if (!isValidProfile(profile)) {
    console.warn(`[policy-loader] Unknown profile '${profile}' for agent ${agentCode}, defaulting to full`);
    return { profile: 'full', allowedTools: null };
  }

  return { profile, allowedTools: getAllowedTools(profile) };
}

export default { loadAgentPolicy };
