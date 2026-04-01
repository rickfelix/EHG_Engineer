/**
 * Outcome Tracker — Authority Score Feedback Loop
 * SD: SD-LEO-INFRA-INTELLIGENT-DYNAMIC-BOARD-001-C
 *
 * Traces SD completion back to brainstorm deliberations and updates
 * identity authority scores based on position-to-outcome correlation.
 *
 * Authority deltas:
 *   +2  Position aligned with successful SD outcome
 *   -1  Position aligned with failed SD outcome
 *   +3  Dissent bonus: contrarian position correlated with success
 *
 * Scores clamped to [10, 100] to prevent runaway accumulation or death spiral.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const AUTHORITY_FLOOR = 10;
const AUTHORITY_CEILING = 100;
const DELTA_SUCCESS = 2;
const DELTA_FAILURE = -1;
const DELTA_DISSENT_BONUS = 3;

/**
 * Track the outcome of a completed SD and update participating identity authority scores.
 *
 * @param {string} sdKey - The completed SD's key (e.g., SD-XXX-001)
 * @param {'success' | 'failure'} outcome - Whether the SD succeeded or failed
 * @returns {Promise<object[]>} Array of authority updates applied
 */
export async function trackOutcome(sdKey, outcome) {
  const supabase = createSupabaseServiceClient();
  const updates = [];

  // 1. Find the brainstorm session that created this SD
  const { data: sessions } = await supabase
    .from('brainstorm_sessions')
    .select('id')
    .eq('created_sd_id', sdKey)
    .limit(1);

  if (!sessions?.length) {
    // Try metadata match
    const { data: metaSessions } = await supabase
      .from('brainstorm_sessions')
      .select('id, metadata')
      .not('metadata', 'is', null)
      .limit(50);

    const match = metaSessions?.find(s =>
      s.metadata?.created_sd_key === sdKey || s.metadata?.sd_key === sdKey
    );
    if (!match) return updates;
    sessions.push(match);
  }

  const sessionId = sessions[0].id;

  // 2. Find the debate session linked to this brainstorm
  const { data: debates } = await supabase
    .from('board_debate_sessions')
    .select('id')
    .eq('brainstorm_session_id', sessionId)
    .limit(1);

  if (!debates?.length) return updates;

  const debateId = debates[0].id;

  // 3. Get all Round 1 positions from the debate
  const { data: arguments_ } = await supabase
    .from('debate_arguments')
    .select('id, agent_code, round_number, argument_type, summary, detailed_reasoning')
    .eq('debate_session_id', debateId)
    .eq('round_number', 1)
    .eq('argument_type', 'initial_position');

  if (!arguments_?.length) return updates;

  // 4. Get the judiciary verdict to determine consensus vs dissent
  const { data: verdicts } = await supabase
    .from('judge_verdicts')
    .select('detailed_rationale')
    .eq('debate_session_id', debateId)
    .order('created_at', { ascending: false })
    .limit(1);

  const verdictText = verdicts?.[0]?.detailed_rationale || '';

  // 5. For each participating identity, compute authority delta
  for (const arg of arguments_) {
    const agentCode = arg.agent_code;
    const isDissent = detectDissent(arg, verdictText);

    let delta;
    if (outcome === 'success') {
      delta = isDissent ? DELTA_DISSENT_BONUS : DELTA_SUCCESS;
    } else {
      delta = isDissent ? DELTA_SUCCESS : DELTA_FAILURE; // Dissent on failure = they were right
    }

    const reason = outcome === 'success'
      ? (isDissent ? 'Dissent position validated by successful SD outcome' : 'Position aligned with successful SD outcome')
      : (isDissent ? 'Dissent position validated — SD failed as they warned' : 'Position aligned with failed SD outcome');

    const update = await updateAuthority(agentCode, delta, reason);
    if (update) updates.push(update);
  }

  return updates;
}

/**
 * Update an identity's authority score by a delta amount.
 *
 * @param {string} agentCode - The identity's agent code or name
 * @param {number} delta - Score adjustment (+/-)
 * @param {string} reason - Audit trail reason
 * @returns {Promise<object|null>} Update result or null if identity not found
 */
export async function updateAuthority(agentCode, delta, reason) {
  const supabase = createSupabaseServiceClient();

  // Find the identity by name or legacy_agent_code
  const { data: identities } = await supabase
    .from('specialist_registry')
    .select('name, role, authority_score, total_deliberations, outcome_wins, outcome_losses')
    .or(`name.eq.${agentCode},legacy_agent_code.eq.${agentCode}`)
    .limit(1);

  if (!identities?.length) return null;

  const identity = identities[0];
  const oldScore = identity.authority_score || 50;
  const newScore = Math.max(AUTHORITY_FLOOR, Math.min(AUTHORITY_CEILING, oldScore + delta));

  const updateFields = {
    authority_score: newScore,
    total_deliberations: (identity.total_deliberations || 0) + 1,
    last_selected_at: new Date().toISOString()
  };

  if (delta > 0) {
    updateFields.outcome_wins = (identity.outcome_wins || 0) + 1;
  } else if (delta < 0) {
    updateFields.outcome_losses = (identity.outcome_losses || 0) + 1;
  }

  const { error } = await supabase
    .from('specialist_registry')
    .update(updateFields)
    .eq('role', identity.role);

  if (error) {
    console.error(`[OutcomeTracker] Failed to update ${agentCode}:`, error.message);
    return null;
  }

  return {
    agentCode,
    oldScore,
    newScore,
    delta,
    reason,
    role: identity.role
  };
}

/**
 * Detect whether a position was dissenting (contrarian to the majority).
 * Simple heuristic: if the verdict mentions the agent's concerns as tension points,
 * they were likely dissenting.
 */
function detectDissent(argument, verdictText) {
  if (!verdictText || !argument.agent_code) return false;

  const lower = verdictText.toLowerCase();
  const agentLower = argument.agent_code.toLowerCase();

  // Check if this agent is mentioned in tension/disagreement context
  const tensionPatterns = [
    `${agentLower} disagree`,
    `${agentLower} raised concern`,
    `${agentLower} dissent`,
    `tension.*${agentLower}`,
    `${agentLower}.*contrary`,
    `${agentLower}.*caution`,
    `${agentLower}.*warn`
  ];

  return tensionPatterns.some(pattern => {
    try {
      return new RegExp(pattern, 'i').test(lower);
    } catch {
      return lower.includes(pattern.replace('.*', ''));
    }
  });
}

export { AUTHORITY_FLOOR, AUTHORITY_CEILING, DELTA_SUCCESS, DELTA_FAILURE, DELTA_DISSENT_BONUS };
