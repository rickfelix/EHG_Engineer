/**
 * Brainstorm Retrospective Engine
 *
 * Tracks brainstorm session quality, question effectiveness,
 * and enables self-improving question ordering.
 *
 * Part of SD-LEO-FIX-EXPAND-BRAINSTORM-COMMAND-001
 */

import { createClient } from '@supabase/supabase-js';
import { accumulateFromSession } from '../domain-intelligence/knowledge-accumulator.js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Get a Supabase client instance.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Record a brainstorm session to the database.
 *
 * @param {Object} session
 * @param {string} session.domain - venture|protocol|integration|architecture
 * @param {string} session.topic - Brainstorm topic
 * @param {string} session.mode - structured|conversational
 * @param {string} session.stage - Phase within domain
 * @param {string[]} [session.ventureIds] - Related venture UUIDs
 * @param {boolean} [session.crossVenture] - Spans multiple ventures
 * @param {string} [session.outcomeType] - Outcome classification
 * @param {number} [session.qualityScore] - 0-100 session quality
 * @param {number} [session.crystallizationScore] - 0.0-1.0
 * @param {string} [session.documentPath] - Path to saved document
 * @param {Object} [session.metadata] - Additional metadata
 * @returns {Promise<Object>} Created session record
 */
export async function recordSession(session) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('brainstorm_sessions')
    .insert({
      domain: session.domain,
      topic: session.topic,
      mode: session.mode,
      stage: session.stage,
      venture_ids: session.ventureIds || null,
      cross_venture: session.crossVenture || false,
      outcome_type: session.outcomeType || 'no_action',
      session_quality_score: session.qualityScore || null,
      crystallization_score: session.crystallizationScore || null,
      retrospective_status: 'pending',
      document_path: session.documentPath || null,
      metadata: session.metadata || {},
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to record session: ${error.message}`);
  return data;
}

/**
 * Record individual question interactions for a session.
 *
 * @param {string} sessionId - UUID of the brainstorm session
 * @param {Object[]} interactions - Array of question interactions
 * @param {string} interactions[].questionId - Question ID (e.g., 'v_problem', 'p_friction')
 * @param {string} interactions[].domain - Domain of the question
 * @param {string} interactions[].phase - Phase of the question
 * @param {string} interactions[].outcome - answered|skipped|revised
 * @param {number} [interactions[].answerLength] - Character count of answer
 * @param {number} [interactions[].revisedCount] - Number of revisions
 * @returns {Promise<number>} Count of recorded interactions
 */
export async function recordQuestionInteractions(sessionId, interactions) {
  const supabase = getSupabase();

  const rows = interactions.map(i => ({
    session_id: sessionId,
    question_id: i.questionId,
    domain: i.domain,
    phase: i.phase,
    outcome: i.outcome,
    answer_length: i.answerLength || null,
    revised_count: i.revisedCount || 0,
  }));

  const { error } = await supabase
    .from('brainstorm_question_interactions')
    .insert(rows);

  if (error) throw new Error(`Failed to record interactions: ${error.message}`);
  return rows.length;
}

/**
 * Update question effectiveness scores based on accumulated interactions.
 *
 * Effectiveness is calculated as:
 * - Base: answered_rate (answered / total_sessions)
 * - Bonus: +0.1 per led_to_action occurrence
 * - Penalty: -0.05 per average skip
 * - Weighted by average answer length (longer = more engaged)
 *
 * @param {string} domain - Domain to recalculate
 * @returns {Promise<number>} Count of updated questions
 */
export async function updateQuestionEffectiveness(domain) {
  const supabase = getSupabase();

  // Get all interactions for this domain
  const { data: interactions, error: fetchError } = await supabase
    .from('brainstorm_question_interactions')
    .select('question_id, domain, phase, outcome, answer_length')
    .eq('domain', domain);

  if (fetchError) throw new Error(`Failed to fetch interactions: ${fetchError.message}`);
  if (!interactions || interactions.length === 0) return 0;

  // Group by question_id
  const byQuestion = {};
  for (const row of interactions) {
    if (!byQuestion[row.question_id]) {
      byQuestion[row.question_id] = {
        questionId: row.question_id,
        domain: row.domain,
        phase: row.phase,
        total: 0,
        answered: 0,
        skipped: 0,
        totalAnswerLength: 0,
        answeredCount: 0,
      };
    }
    const q = byQuestion[row.question_id];
    q.total++;
    if (row.outcome === 'answered') {
      q.answered++;
      q.answeredCount++;
      q.totalAnswerLength += row.answer_length || 0;
    } else if (row.outcome === 'skipped') {
      q.skipped++;
    }
  }

  // Get sessions that led to action (sd_created or quick_fix)
  const { data: actionSessions } = await supabase
    .from('brainstorm_sessions')
    .select('id')
    .eq('domain', domain)
    .in('outcome_type', ['sd_created', 'quick_fix']);

  const actionSessionIds = new Set((actionSessions || []).map(s => s.id));

  // Check which questions appeared in action sessions
  const { data: actionInteractions } = await supabase
    .from('brainstorm_question_interactions')
    .select('question_id, session_id')
    .eq('domain', domain)
    .eq('outcome', 'answered');

  const ledToAction = {};
  for (const ai of (actionInteractions || [])) {
    if (actionSessionIds.has(ai.session_id)) {
      ledToAction[ai.question_id] = (ledToAction[ai.question_id] || 0) + 1;
    }
  }

  // Calculate effectiveness and upsert
  let updated = 0;
  for (const q of Object.values(byQuestion)) {
    const answeredRate = q.total > 0 ? q.answered / q.total : 0;
    const skipPenalty = q.total > 0 ? (q.skipped / q.total) * 0.05 : 0;
    const actionBonus = (ledToAction[q.questionId] || 0) * 0.1;
    const avgLength = q.answeredCount > 0 ? q.totalAnswerLength / q.answeredCount : 0;
    const lengthBonus = Math.min(avgLength / 500, 0.2); // Cap at 0.2 for 500+ char answers

    const effectiveness = Math.min(1.0, Math.max(0.0,
      answeredRate + actionBonus - skipPenalty + lengthBonus
    ));

    const { error: upsertError } = await supabase
      .from('brainstorm_question_effectiveness')
      .upsert({
        domain: q.domain,
        question_id: q.questionId,
        effectiveness_score: Math.round(effectiveness * 1000) / 1000,
        total_sessions: q.total,
        answered_count: q.answered,
        skipped_count: q.skipped,
        avg_answer_length: Math.round(avgLength),
        led_to_action_count: ledToAction[q.questionId] || 0,
      }, { onConflict: 'domain,question_id' });

    if (!upsertError) updated++;
  }

  return updated;
}

/**
 * Get questions for a domain ordered by effectiveness.
 *
 * Returns question IDs sorted by effectiveness_score descending.
 * Questions without effectiveness data are returned last (default ordering).
 *
 * @param {string} domain - Domain to query
 * @returns {Promise<Object[]>} Array of { question_id, effectiveness_score }
 */
export async function getEffectiveQuestions(domain) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('brainstorm_question_effectiveness')
    .select('question_id, effectiveness_score, total_sessions, led_to_action_count')
    .eq('domain', domain)
    .order('effectiveness_score', { ascending: false });

  if (error) return [];
  return data || [];
}

/**
 * Find past brainstorm sessions related to a topic.
 *
 * Uses simple keyword matching against stored topics.
 *
 * @param {string} topic - Current brainstorm topic
 * @param {Object} [options]
 * @param {number} [options.limit=5] - Max results
 * @param {string} [options.domain] - Filter by domain
 * @returns {Promise<Object[]>} Related past sessions
 */
export async function findRelatedSessions(topic, options = {}) {
  const supabase = getSupabase();
  const { limit = 5, domain } = options;

  // Extract keywords (words > 3 chars, lowercased)
  const keywords = topic
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 5);

  if (keywords.length === 0) return [];

  let query = supabase
    .from('brainstorm_sessions')
    .select('id, domain, topic, outcome_type, session_quality_score, created_at')
    .order('created_at', { ascending: false })
    .limit(limit * 3); // Fetch extra to filter

  if (domain) query = query.eq('domain', domain);

  const { data, error } = await query;
  if (error || !data) return [];

  // Score each session by keyword overlap with topic
  const scored = data.map(session => {
    const sessionWords = session.topic.toLowerCase().split(/\s+/);
    const overlap = keywords.filter(k => sessionWords.some(w => w.includes(k))).length;
    return { ...session, relevance: overlap };
  });

  return scored
    .filter(s => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

/**
 * Complete a session retrospective.
 *
 * Updates the session with retrospective data and recalculates
 * question effectiveness for the domain.
 *
 * @param {string} sessionId - UUID of the session
 * @param {Object} retroData
 * @param {string} [retroData.createdSdId] - SD created from this session
 * @param {number} [retroData.qualityScore] - Updated quality score
 * @returns {Promise<Object>} Updated session
 */
export async function completeRetrospective(sessionId, retroData = {}) {
  const supabase = getSupabase();

  const patch = { retrospective_status: 'completed' };
  if (retroData.createdSdId) patch.created_sd_id = retroData.createdSdId;
  if (retroData.qualityScore != null) patch.session_quality_score = retroData.qualityScore;

  const { data: session, error: updateError } = await supabase
    .from('brainstorm_sessions')
    .update(patch)
    .eq('id', sessionId)
    .select('domain')
    .single();

  if (updateError) throw new Error(`Failed to update session: ${updateError.message}`);

  // Recalculate effectiveness for the domain
  if (session?.domain) {
    await updateQuestionEffectiveness(session.domain);
  }

  // Domain Intelligence: extract and accumulate knowledge from session
  if (retroData.venture) {
    try {
      const fullSession = await supabase
        .from('brainstorm_sessions')
        .select('id, topic, conclusion, metadata')
        .eq('id', sessionId)
        .single();
      if (fullSession.data) {
        await accumulateFromSession({
          session: fullSession.data,
          venture: retroData.venture,
          supabase,
        });
      }
    } catch (err) {
      // Non-blocking: log but don't fail the retrospective
      console.log(`[DomainIntelligence] Knowledge accumulation skipped: ${err.message}`);
    }
  }

  return session;
}

/**
 * Get sessions with pending retrospectives.
 *
 * @param {Object} [options]
 * @param {number} [options.limit=10] - Max results
 * @returns {Promise<Object[]>} Sessions needing retrospective
 */
export async function getPendingRetrospectives(options = {}) {
  const supabase = getSupabase();
  const { limit = 10 } = options;

  const { data, error } = await supabase
    .from('brainstorm_sessions')
    .select('id, domain, topic, outcome_type, created_at')
    .eq('retrospective_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) return [];
  return data || [];
}
