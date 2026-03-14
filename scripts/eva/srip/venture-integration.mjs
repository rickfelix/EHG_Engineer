/**
 * SRIP Venture Integration Module
 * SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-D
 *
 * Links SRIP artifacts (site DNA, brand interviews, synthesis prompts, quality checks)
 * to venture stage transitions. When a quality check passes the fidelity threshold,
 * the venture is eligible to advance in its lifecycle.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SRIP_ARTIFACT_TYPES = ['site_dna', 'brand_interview', 'synthesis_prompt', 'quality_check'];

/**
 * Link a SRIP artifact to the venture_artifacts table.
 * @param {string} ventureId
 * @param {string} artifactType - One of SRIP_ARTIFACT_TYPES
 * @param {string} artifactId - UUID of the artifact
 * @param {object} metadata - Additional metadata
 * @param {object} [options]
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function linkArtifact(ventureId, artifactType, artifactId, metadata = {}, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!SRIP_ARTIFACT_TYPES.includes(artifactType)) {
    return { success: false, error: `Invalid artifact type: ${artifactType}` };
  }

  const { data, error } = await supabase
    .from('venture_artifacts')
    .upsert({
      venture_id: ventureId,
      artifact_type: artifactType,
      artifact_id: artifactId,
      source: 'srip',
      metadata: { ...metadata, linked_at: new Date().toISOString() },
    }, { onConflict: 'venture_id,artifact_type,artifact_id' })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

/**
 * Check if a venture is eligible for stage transition based on SRIP quality check.
 * @param {string} ventureId
 * @param {object} [options]
 * @returns {Promise<{eligible: boolean, score?: number, reason?: string}>}
 */
export async function checkStageEligibility(ventureId, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get latest quality check
  const { data: checks } = await supabase
    .from('srip_quality_checks')
    .select('id, overall_score, passed, created_at')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!checks || checks.length === 0) {
    return { eligible: false, reason: 'No quality check found for this venture' };
  }

  const latest = checks[0];
  return {
    eligible: latest.passed === true,
    score: latest.overall_score,
    reason: latest.passed
      ? `Quality check passed with score ${latest.overall_score}%`
      : `Quality check score ${latest.overall_score}% below threshold`,
  };
}

/**
 * Get all SRIP artifacts for a venture.
 * @param {string} ventureId
 * @param {object} [options]
 * @returns {Promise<object[]>}
 */
export async function getVentureArtifacts(ventureId, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, artifact_id, source, metadata, created_at')
    .eq('venture_id', ventureId)
    .eq('source', 'srip')
    .order('created_at', { ascending: true });

  return data || [];
}
