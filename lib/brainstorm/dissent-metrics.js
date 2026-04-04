/**
 * Dissent Metrics — Deliberation Value Ratio
 * SD: SD-LEO-INFRA-BOARD-DELIBERATION-STRUCTURAL-001B
 *
 * Computes deliberation value ratio from structured_dissent fields
 * and tracks running averages across sessions.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

/**
 * Compute the deliberation value ratio for a single debate session.
 * Ratio = (unique assumptions challenged) / (total arguments)
 *
 * @param {string} debateSessionId - UUID of the debate session
 * @returns {Promise<{ratio: number, uniqueAssumptions: number, totalArguments: number}>}
 */
export async function computeValueRatio(debateSessionId) {
  const supabase = createSupabaseServiceClient();
  const { data: args, error } = await supabase
    .from('debate_arguments')
    .select('structured_dissent')
    .eq('debate_session_id', debateSessionId);

  if (error || !args) return { ratio: 0, uniqueAssumptions: 0, totalArguments: 0 };

  const totalArguments = args.length;
  const assumptions = new Set();
  for (const arg of args) {
    if (arg.structured_dissent?.assumption_challenged) {
      assumptions.add(arg.structured_dissent.assumption_challenged.toLowerCase().trim());
    }
  }

  const uniqueAssumptions = assumptions.size;
  const ratio = totalArguments > 0 ? uniqueAssumptions / totalArguments : 0;

  return { ratio, uniqueAssumptions, totalArguments };
}

/**
 * Get the running average value ratio across the last N debate sessions.
 *
 * @param {number} windowSize - Number of recent sessions to average (default: 10)
 * @returns {Promise<{average: number, sessionCount: number, ratios: number[]}>}
 */
export async function getRunningAverage(windowSize = 10) {
  const supabase = createSupabaseServiceClient();
  const { data: sessions, error } = await supabase
    .from('debate_sessions')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(windowSize);

  if (error || !sessions?.length) return { average: 0, sessionCount: 0, ratios: [] };

  const ratios = [];
  for (const session of sessions) {
    const { ratio } = await computeValueRatio(session.id);
    ratios.push(ratio);
  }

  const average = ratios.length > 0
    ? ratios.reduce((sum, r) => sum + r, 0) / ratios.length
    : 0;

  return { average, sessionCount: ratios.length, ratios };
}
