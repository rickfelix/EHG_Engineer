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
  constitutionCitations = [],
  structuredDissent = null,
  providerUsed = null,
  modelId = null
}) {
  const row = {
    debate_session_id: debateSessionId,
    round_number: roundNumber,
    agent_code: agentCode,
    argument_type: argumentType,
    summary,
    detailed_reasoning: detailedReasoning,
    confidence_score: confidenceScore,
    in_response_to_argument_id: inResponseToId,
    constitution_citations: constitutionCitations
  };
  if (structuredDissent !== null) {
    row.structured_dissent = structuredDissent;
  }
  if (providerUsed || modelId) {
    row.metadata = { provider_used: providerUsed, model_id: modelId };
  }
  const { data, error } = await supabase
    .from('debate_arguments')
    .insert(row)
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

/**
 * Record board votes to the brainstorm_vote_tallies audit table.
 * SD-BRAINSTORM-TALLY-SCORING-ORCHESTRATOR-ORCH-001-B
 *
 * @param {string} debateSessionId - Debate session ID
 * @param {Array<{seatCode: string, picks: Array<{candidate: number, rank: number, reason: string}>}>} votes - Per-seat votes
 * @returns {Promise<number>} Number of vote rows inserted
 */
export async function recordBoardVotes(debateSessionId, votes) {
  const rows = [];
  for (const vote of votes) {
    for (const pick of vote.picks) {
      rows.push({
        debate_session_id: debateSessionId,
        seat_code: vote.seatCode,
        candidate_number: pick.candidate,
        rank_position: pick.rank,
        borda_points: 4 - pick.rank, // rank 1=3pts, rank 2=2pts, rank 3=1pt
        reason: pick.reason || null
      });
    }
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from('brainstorm_vote_tallies')
    .insert(rows);

  if (error) throw new Error(`Failed to record board votes: ${error.message}`);
  return rows.length;
}

/**
 * Resolve ties between candidates with equal Borda scores.
 * Tie-breaking precedence:
 *   1. Most #1 rank votes
 *   2. Highest confidence sum from voting seats
 *   3. Lower candidate number (stable sort)
 *
 * @param {Array<{number: number, score: number, firstPlaceVotes: number}>} candidates
 * @returns {Array} Candidates sorted with ties broken deterministically
 */
export function resolveTies(candidates) {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.firstPlaceVotes || 0) !== (a.firstPlaceVotes || 0)) return (b.firstPlaceVotes || 0) - (a.firstPlaceVotes || 0);
    if ((b.confidenceSum || 0) !== (a.confidenceSum || 0)) return (b.confidenceSum || 0) - (a.confidenceSum || 0);
    return a.number - b.number; // stable: lower candidate number wins
  });
}
