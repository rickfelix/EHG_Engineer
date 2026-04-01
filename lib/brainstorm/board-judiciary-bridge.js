/**
 * Board-Judiciary Bridge
 *
 * Connects board deliberation output to the existing judiciary system.
 * Creates debate sessions, records arguments, and triggers judiciary synthesis
 * with constitutional citations and escalation support.
 */
import { createSupabaseServiceClient } from '../supabase-client.js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createSupabaseServiceClient();

/**
 * Create a debate session for a board deliberation.
 * @param {string} brainstormSessionId - The brainstorm session ID
 * @param {string} topic - The deliberation topic
 * @returns {Promise<string>} The debate session ID
 */
export async function createBoardDebateSession(brainstormSessionId, topic) {
  const { data, error } = await supabase
    .from('debate_sessions')
    .insert({
      conflict_type: 'approach',
      current_phase: 'EXEC',
      conflict_statement: `Board deliberation: ${topic}`,
      source_agents: ['CSO', 'CRO', 'CTO', 'CISO', 'COO', 'CFO'],
      status: 'active',
      round_number: 1,
      max_rounds: 2,
      initiated_by: 'BOARD_GOVERNANCE',
      metadata: {
        brainstorm_session_id: brainstormSessionId,
        topic,
        governance_model: 'board_of_directors_v1'
      }
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create debate session: ${error.message}`);
  return data.id;
}

/**
 * Record a board seat's position as a debate argument.
 * @param {object} params
 * @param {string} params.debateSessionId - Debate session ID
 * @param {string} params.agentCode - Board seat code (CSO, CRO, etc.)
 * @param {number} params.roundNumber - 1 for initial position, 2 for rebuttal
 * @param {string} params.argumentType - 'initial_position', 'rebuttal', or 'specialist_testimony'
 * @param {string} params.summary - Position summary
 * @param {string} params.detailedReasoning - Full position text
 * @param {number} params.confidenceScore - 0-1 confidence
 * @param {string|null} params.inResponseToId - ID of argument being rebutted (Round 2)
 * @param {string[]} params.constitutionCitations - Referenced constitutional rules
 * @returns {Promise<string>} The argument ID
 */
export async function recordBoardArgument({
  debateSessionId,
  agentCode,
  roundNumber,
  argumentType,
  summary,
  detailedReasoning,
  confidenceScore = 0.8,
  inResponseToId = null,
  constitutionCitations = []
}) {
  const { data, error } = await supabase
    .from('debate_arguments')
    .insert({
      debate_session_id: debateSessionId,
      round_number: roundNumber,
      agent_code: agentCode,
      argument_type: argumentType,
      summary,
      detailed_reasoning: detailedReasoning,
      confidence_score: confidenceScore,
      in_response_to_argument_id: inResponseToId,
      constitution_citations: constitutionCitations
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to record argument: ${error.message}`);
  return data.id;
}

/**
 * Extract constitutional citations from a position text.
 * Looks for references to CONST-NNN, PROTOCOL, FOUR_OATHS, DOCTRINE.
 * @param {string} text - Position text to scan
 * @returns {string[]} Array of citation references
 */
export function extractConstitutionalCitations(text) {
  const citations = [];
  const seen = new Set();

  // Match CONST-NNN patterns
  const constMatches = text.matchAll(/CONST-(\d{3})/gi);
  for (const match of constMatches) {
    const citation = `CONST-${match[1]}`;
    if (!seen.has(citation)) {
      seen.add(citation);
      citations.push(citation);
    }
  }

  // Match constitution names
  for (const name of ['PROTOCOL', 'FOUR_OATHS', 'DOCTRINE']) {
    if (text.includes(name) && !seen.has(name)) {
      seen.add(name);
      citations.push(name);
    }
  }

  return citations;
}

/**
 * Record a judiciary verdict synthesizing the board's deliberation.
 * @param {object} params
 * @param {string} params.debateSessionId - Debate session ID
 * @param {string} params.summary - Verdict summary
 * @param {string} params.detailedRationale - Full verdict reasoning
 * @param {Array} params.constitutionCitations - Citations with relevance scores
 * @param {number} params.constitutionalScore - 0-100 constitutional alignment
 * @param {number} params.confidenceScore - 0-1 confidence
 * @param {boolean} params.escalationRequired - Whether chairman override needed
 * @returns {Promise<string>} Verdict ID
 */
export async function recordJudiciaryVerdict({
  debateSessionId,
  summary,
  detailedRationale,
  constitutionCitations = [],
  constitutionalScore = 0.80,
  confidenceScore = 0.8,
  escalationRequired = false
}) {
  const { data, error } = await supabase
    .from('judge_verdicts')
    .insert({
      debate_session_id: debateSessionId,
      verdict_type: escalationRequired ? 'escalate' : 'synthesis',
      summary,
      detailed_rationale: detailedRationale,
      constitution_citations: constitutionCitations,
      constitutional_score: constitutionalScore,
      confidence_score: confidenceScore,
      escalation_required: escalationRequired
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to record verdict: ${error.message}`);

  // Update debate session status
  await supabase
    .from('debate_sessions')
    .update({
      status: escalationRequired ? 'escalated' : 'verdict_rendered',
      resolved_at: new Date().toISOString(),
      resolved_by: 'JUDICIARY'
    })
    .eq('id', debateSessionId);

  return data.id;
}

/**
 * Update a debate session's round number.
 * @param {string} debateSessionId
 * @param {number} roundNumber
 */
export async function updateDebateRound(debateSessionId, roundNumber) {
  await supabase
    .from('debate_sessions')
    .update({ round_number: roundNumber })
    .eq('id', debateSessionId);
}

/**
 * Fetch all arguments for a debate session, organized by round.
 * @param {string} debateSessionId
 * @returns {Promise<{round1: Array, round2: Array, specialists: Array}>}
 */
export async function getDebateArguments(debateSessionId) {
  const { data, error } = await supabase
    .from('debate_arguments')
    .select('*')
    .eq('debate_session_id', debateSessionId)
    .order('round_number', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch arguments: ${error.message}`);

  return {
    round1: (data || []).filter(a => a.round_number === 1 && a.argument_type !== 'specialist_testimony'),
    round2: (data || []).filter(a => a.round_number === 2),
    specialists: (data || []).filter(a => a.argument_type === 'specialist_testimony')
  };
}
