/**
 * SRIP Quality Check Service
 * SD: SD-LEO-INFRA-SRIP-QUALITY-SCORING-001
 *
 * CRUD operations for the srip_quality_checks table.
 * Provides 6-domain fidelity scoring for site replications.
 *
 * Quality domains: layout, visual_composition, design_system,
 * interaction, technical, accessibility
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export const QUALITY_DOMAINS = [
  'layout',
  'visual_composition',
  'design_system',
  'interaction',
  'technical',
  'accessibility',
];

/**
 * Create a new quality check record.
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.synthesisPromptId - FK to srip_synthesis_prompts
 * @param {Object} params.domainScores - JSONB with per-domain scores {layout: 85, ...}
 * @param {number} params.overallScore - Weighted average 0-100
 * @param {Object} [params.gaps] - JSONB gap analysis per domain
 * @param {number} [params.passThreshold] - Threshold for pass/fail (default 70)
 * @param {string} [params.createdBy] - Creator identifier
 * @returns {Promise<Object>} Created record
 */
export async function createQualityCheck({
  ventureId,
  synthesisPromptId,
  domainScores,
  overallScore,
  gaps = null,
  passThreshold = 70,
  createdBy = 'srip-service',
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_quality_checks')
    .insert({
      venture_id: ventureId,
      synthesis_prompt_id: synthesisPromptId,
      domain_scores: domainScores,
      overall_score: overallScore,
      gaps,
      pass_threshold: passThreshold,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(`createQualityCheck failed: ${error.message}`);
  return data;
}

/**
 * Get a quality check by ID.
 * @param {string} id - Record UUID
 * @returns {Promise<Object|null>}
 */
export async function getQualityCheck(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_quality_checks')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

/**
 * List quality checks for a venture.
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options]
 * @param {string} [options.synthesisPromptId] - Filter by prompt
 * @param {number} [options.limit] - Max results
 * @returns {Promise<Array>}
 */
export async function listQualityChecks(ventureId, { synthesisPromptId, limit = 50 } = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('srip_quality_checks')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (synthesisPromptId) query = query.eq('synthesis_prompt_id', synthesisPromptId);

  const { data, error } = await query;
  if (error) throw new Error(`listQualityChecks failed: ${error.message}`);
  return data || [];
}

/**
 * Get the latest quality check for a synthesis prompt.
 * @param {string} synthesisPromptId - Synthesis prompt UUID
 * @returns {Promise<Object|null>}
 */
export async function getLatestQualityCheck(synthesisPromptId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_quality_checks')
    .select('*')
    .eq('synthesis_prompt_id', synthesisPromptId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

/**
 * Check if a quality check passes the threshold.
 * Uses the `passed` generated column from the database.
 * @param {string} qualityCheckId - Quality check UUID
 * @returns {Promise<boolean>}
 */
export async function checkPassed(qualityCheckId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_quality_checks')
    .select('passed, overall_score, pass_threshold')
    .eq('id', qualityCheckId)
    .single();

  if (error) return false;
  return data.passed;
}

/**
 * Gate synthesis prompt activation based on quality check.
 * If the latest quality check passes, activate the prompt.
 * @param {string} ventureId - Venture UUID
 * @param {string} synthesisPromptId - Prompt to potentially activate
 * @returns {Promise<{activated: boolean, score: number, threshold: number}>}
 */
export async function gatePromptActivation(ventureId, synthesisPromptId) {
  const qualityCheck = await getLatestQualityCheck(synthesisPromptId);

  if (!qualityCheck) {
    return { activated: false, score: 0, threshold: 70, reason: 'No quality check found' };
  }

  if (qualityCheck.passed) {
    // Activate the prompt via the synthesis service
    const supabase = getSupabase();
    await supabase
      .from('srip_synthesis_prompts')
      .update({ status: 'active' })
      .eq('id', synthesisPromptId)
      .eq('venture_id', ventureId);

    // Supersede other active prompts
    await supabase
      .from('srip_synthesis_prompts')
      .update({ status: 'superseded' })
      .eq('venture_id', ventureId)
      .eq('status', 'active')
      .neq('id', synthesisPromptId);

    return {
      activated: true,
      score: qualityCheck.overall_score,
      threshold: qualityCheck.pass_threshold,
    };
  }

  return {
    activated: false,
    score: qualityCheck.overall_score,
    threshold: qualityCheck.pass_threshold,
    reason: `Score ${qualityCheck.overall_score} below threshold ${qualityCheck.pass_threshold}`,
  };
}
