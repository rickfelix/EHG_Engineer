/**
 * Blueprint Quality Scoring — Database Persistence Layer.
 * Stores and retrieves quality assessments from blueprint_quality_assessments.
 * Seeds default rubrics into blueprint_templates.quality_rubric.
 *
 * @module lib/eva/blueprint-scoring/persistence
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import dotenv from 'dotenv';
import { ARTIFACT_TYPES, RUBRIC_DEFINITIONS } from './rubric-definitions.js';
import { scoreArtifact } from './quality-scorer.js';
import { checkConsistency } from './consistency-checker.js';
import { calculateReadiness } from './readiness-calculator.js';
import { evaluateGate } from './gate-engine.js';

dotenv.config();

function getSupabase() {
  return createSupabaseServiceClient();
}

/**
 * Score all artifacts for a venture and store results in blueprint_quality_assessments.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Record<string, object>} artifacts - Artifact content keyed by type
 * @param {Object} [options]
 * @param {string} [options.assessorModel] - Model identifier
 * @returns {Promise<{assessments: Array, readiness: Object, gate: Object}>}
 */
export async function scoreAndPersist(ventureId, artifacts, options = {}) {
  const { assessorModel = 'blueprint-quality-scorer' } = options;
  const supabase = getSupabase();

  // 1. Score each artifact
  const artifactScores = [];
  const assessments = [];

  for (const type of ARTIFACT_TYPES) {
    const content = artifacts[type];
    if (!content) continue;

    const result = scoreArtifact(type, content);
    artifactScores.push({ artifactType: type, total: result.total });

    const gateDecision = result.total >= 70 ? 'pass' : result.total >= 50 ? 'retry' : 'fail';

    const { data, error } = await supabase
      .from('blueprint_quality_assessments')
      .insert({
        venture_id: ventureId,
        artifact_type: type,
        assessment_scores: Object.fromEntries(result.dimensions.map((d) => [d.name, d.score])),
        overall_score: result.total,
        gate_decision: gateDecision,
        assessor_model: assessorModel,
        metadata: { rubric_version: result.rubricVersion },
      })
      .select()
      .single();

    if (error) throw new Error(`Assessment insert failed for ${type}: ${error.message}`);
    assessments.push(data);
  }

  // 2. Consistency check
  const consistencyResult = checkConsistency(artifacts);

  // 3. Readiness score
  const readiness = calculateReadiness(artifactScores, consistencyResult);

  // 4. Gate decision
  const gate = evaluateGate(readiness, artifactScores.map((s) => {
    const result = scoreArtifact(s.artifactType, artifacts[s.artifactType]);
    return { artifactType: s.artifactType, dimensions: result.dimensions };
  }));

  // 5. Store aggregate readiness assessment
  const { data: readinessRecord, error: readinessError } = await supabase
    .from('blueprint_quality_assessments')
    .insert({
      venture_id: ventureId,
      artifact_type: '_readiness_aggregate',
      assessment_scores: readiness.artifactSubscores,
      overall_score: readiness.readinessScore,
      gate_decision: gate.decision,
      assessor_model: assessorModel,
      metadata: {
        consistency_penalty: readiness.consistencyPenalty,
        missing_artifacts: readiness.missingArtifacts,
        remediation_count: gate.remediationItems.length,
        breakdown: readiness.breakdown,
      },
      notes: gate.remediationItems.length > 0
        ? `${gate.remediationItems.length} remediation items`
        : 'All artifacts meet quality thresholds',
    })
    .select()
    .single();

  if (readinessError) throw new Error(`Readiness insert failed: ${readinessError.message}`);

  return {
    assessments,
    readiness: { ...readiness, id: readinessRecord.id },
    gate,
  };
}

/**
 * Get latest readiness assessment for a venture.
 *
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<Object|null>}
 */
export async function getLatestReadiness(ventureId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('blueprint_quality_assessments')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('artifact_type', '_readiness_aggregate')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

/**
 * Get latest assessment for a specific artifact type.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} artifactType - Artifact type
 * @returns {Promise<Object|null>}
 */
export async function getLatestAssessment(ventureId, artifactType) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('blueprint_quality_assessments')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('artifact_type', artifactType)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

/**
 * List all assessments for a venture.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options]
 * @param {number} [options.limit] - Max results (default 50)
 * @returns {Promise<Array>}
 */
export async function listAssessments(ventureId, { limit = 50 } = {}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('blueprint_quality_assessments')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listAssessments failed: ${error.message}`);
  return data || [];
}

/**
 * Seed default rubrics into blueprint_templates for any artifact types
 * with empty or missing quality_rubric.
 *
 * @returns {Promise<{seeded: number, skipped: number}>}
 */
export async function seedDefaultRubrics() {
  const supabase = getSupabase();
  let seeded = 0;
  let skipped = 0;

  for (const [artifactType, rubric] of Object.entries(RUBRIC_DEFINITIONS)) {
    const rubricData = {
      dimensions: rubric.dimensions.map((d) => ({
        name: d.name,
        weight: d.weight,
        criteria: d.criteria,
        scoring_levels: d.scoring_levels,
      })),
      min_pass_score: rubric.min_pass_score,
      version: rubric.version,
    };

    const { data: existing } = await supabase
      .from('blueprint_templates')
      .select('id, quality_rubric')
      .eq('artifact_type', artifactType)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (existing && (!existing.quality_rubric || !existing.quality_rubric.dimensions)) {
      const { error } = await supabase
        .from('blueprint_templates')
        .update({ quality_rubric: rubricData })
        .eq('id', existing.id);
      if (!error) seeded++;
      else skipped++;
    } else if (!existing) {
      const { error } = await supabase
        .from('blueprint_templates')
        .insert({
          artifact_type: artifactType,
          archetype: 'default',
          template_content: {},
          quality_rubric: rubricData,
          version: 1,
          created_by: 'blueprint-quality-scorer',
        });
      if (!error) seeded++;
      else skipped++;
    } else {
      skipped++;
    }
  }

  return { seeded, skipped };
}
