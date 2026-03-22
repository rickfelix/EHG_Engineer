/**
 * Stage 17 Analysis Step - Blueprint Review Aggregation
 * Phase: THE BLUEPRINT (Stages 13-17)
 * Part of SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001
 *
 * Aggregates all venture artifacts from stages 1-16, computes
 * per-phase quality scores, identifies missing required artifacts,
 * and produces a gate recommendation.
 *
 * Unlike other analysis steps, this does NOT call an LLM —
 * it performs deterministic aggregation over existing artifacts.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review
 */

import { ARTIFACT_TYPES } from '../../artifact-types.js';
import { fetchSripSummary } from '../../eva-orchestrator-helpers.js';

/**
 * Phase groupings for the Blueprint Review.
 * Maps venture lifecycle phases to their stage ranges.
 */
const PHASE_GROUPINGS = {
  THE_TRUTH:     { start: 1, end: 5,  label: 'The Truth' },
  THE_ENGINE:    { start: 6, end: 9,  label: 'The Engine' },
  THE_IDENTITY:  { start: 10, end: 12, label: 'The Identity' },
  THE_BLUEPRINT: { start: 13, end: 16, label: 'The Blueprint' },
};

/**
 * Required artifacts per stage (primary artifact for completeness check).
 * Maps stage number → artifact type string from ARTIFACT_TYPES.
 */
const REQUIRED_ARTIFACTS_BY_STAGE = {
  1: ARTIFACT_TYPES.TRUTH_IDEA_BRIEF,
  2: ARTIFACT_TYPES.TRUTH_AI_CRITIQUE,
  3: ARTIFACT_TYPES.TRUTH_VALIDATION_DECISION,
  4: ARTIFACT_TYPES.TRUTH_COMPETITIVE_ANALYSIS,
  5: ARTIFACT_TYPES.TRUTH_FINANCIAL_MODEL,
  6: ARTIFACT_TYPES.ENGINE_RISK_MATRIX,
  7: ARTIFACT_TYPES.ENGINE_PRICING_MODEL,
  8: ARTIFACT_TYPES.ENGINE_BUSINESS_MODEL_CANVAS,
  9: ARTIFACT_TYPES.ENGINE_EXIT_STRATEGY,
  10: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND,
  11: ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL,
  12: ARTIFACT_TYPES.IDENTITY_GTM_SALES_STRATEGY,
  13: ARTIFACT_TYPES.BLUEPRINT_PRODUCT_ROADMAP,
  14: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL,
  15: ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK,
  16: ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT,
};

/**
 * Analyze stage 17 — Blueprint Review aggregation.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {Object} params.supabase - Supabase client
 * @param {Object} [params.stageConfig] - Stage config (for required artifacts)
 * @param {Object} [params.logger] - Logger
 * @returns {Promise<Object>} Blueprint review summary
 */
export async function analyzeStage17({
  ventureId,
  supabase,
  stageConfig,
  logger = console,
} = {}) {
  if (!ventureId || !supabase) {
    throw new Error('analyzeStage17 requires ventureId and supabase client');
  }

  logger.info(`[Stage17] Blueprint review for venture ${ventureId}`);

  // Fetch all current artifacts for stages 1-16
  const { data: artifacts, error } = await supabase
    .from('venture_artifacts')
    .select('id, lifecycle_stage, artifact_type, is_current, metadata, created_at')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .gte('lifecycle_stage', 1)
    .lte('lifecycle_stage', 16)
    .order('lifecycle_stage', { ascending: true });

  if (error) {
    logger.error('[Stage17] Failed to fetch artifacts', error);
    throw new Error(`Blueprint review artifact fetch failed: ${error.message}`);
  }

  // Build stage → artifacts map
  const artifactsByStage = {};
  for (const art of (artifacts || [])) {
    if (!artifactsByStage[art.lifecycle_stage]) {
      artifactsByStage[art.lifecycle_stage] = [];
    }
    artifactsByStage[art.lifecycle_stage].push(art);
  }

  // Compute per-phase summaries
  const phaseSummaries = [];
  const allGaps = [];
  let totalQuality = 0;
  let totalExpected = 0;
  let totalPresent = 0;

  for (const [phaseKey, { start, end, label }] of Object.entries(PHASE_GROUPINGS)) {
    const stageRange = [];
    let phaseQualitySum = 0;
    let phaseQualityCount = 0;
    let phaseExpected = 0;
    let phasePresent = 0;
    const phaseGaps = [];

    for (let stage = start; stage <= end; stage++) {
      stageRange.push(stage);
      const stageArtifacts = artifactsByStage[stage] || [];
      const requiredType = REQUIRED_ARTIFACTS_BY_STAGE[stage];

      if (requiredType) {
        phaseExpected++;
        totalExpected++;
        const found = stageArtifacts.find(a => a.artifact_type === requiredType);
        if (found) {
          phasePresent++;
          totalPresent++;
          const qScore = found.metadata?.quality_score;
          if (typeof qScore === 'number') {
            phaseQualitySum += qScore;
            phaseQualityCount++;
          }
        } else {
          phaseGaps.push({
            phase: label,
            stage,
            artifact_type: requiredType,
            severity: stage <= 5 ? 'critical' : 'high',
          });
          allGaps.push({
            phase: label,
            stage,
            artifact_type: requiredType,
            severity: stage <= 5 ? 'critical' : 'high',
          });
        }
      }

      // Count quality scores from all artifacts (not just required)
      for (const art of stageArtifacts) {
        const qScore = art.metadata?.quality_score;
        if (typeof qScore === 'number' && art.artifact_type !== (requiredType || '')) {
          phaseQualitySum += qScore;
          phaseQualityCount++;
        }
      }
    }

    const avgQuality = phaseQualityCount > 0
      ? Math.round((phaseQualitySum / phaseQualityCount) * 10) / 10
      : 0;
    const completeness = phaseExpected > 0
      ? Math.round((phasePresent / phaseExpected) * 1000) / 10
      : 100;

    totalQuality += phaseQualitySum;

    phaseSummaries.push({
      phase: label,
      phase_key: phaseKey,
      stages: stageRange,
      artifact_count: phasePresent,
      expected_count: phaseExpected,
      completeness_pct: completeness,
      avg_quality_score: avgQuality,
      gaps: phaseGaps,
    });
  }

  // Overall metrics
  const overallCompleteness = totalExpected > 0
    ? Math.round((totalPresent / totalExpected) * 1000) / 10
    : 0;

  // Compute overall quality as weighted average of phase scores
  const phasesWithScores = phaseSummaries.filter(p => p.avg_quality_score > 0);
  const overallQuality = phasesWithScores.length > 0
    ? Math.round(
        (phasesWithScores.reduce((sum, p) => sum + p.avg_quality_score, 0) / phasesWithScores.length) * 10
      ) / 10
    : 0;

  // Gate recommendation
  const criticalGaps = allGaps.filter(g => g.severity === 'critical');
  let gateRecommendation = 'FAIL';
  let gateRationale = '';

  if (overallQuality >= 70 && criticalGaps.length === 0 && overallCompleteness >= 80) {
    gateRecommendation = 'PASS';
    gateRationale = `Quality ${overallQuality}/100, completeness ${overallCompleteness}%. All critical artifacts present.`;
  } else if (overallQuality >= 50 && criticalGaps.length <= 2) {
    gateRecommendation = 'REVIEW_NEEDED';
    gateRationale = `Quality ${overallQuality}/100, completeness ${overallCompleteness}%. ${allGaps.length} gap(s) found, ${criticalGaps.length} critical.`;
  } else {
    gateRationale = `Quality ${overallQuality}/100, completeness ${overallCompleteness}%. ${criticalGaps.length} critical gap(s). Not ready for BUILD.`;
  }

  // ── Conditional Wireframe Gating (Phase 2) ──────────────────
  // When EVA_WIREFRAME_GATING_ENABLED and venture is ui/mixed,
  // wireframes move from supplementary to required at Stage 15.
  const wireframeGatingEnabled = process.env.EVA_WIREFRAME_GATING_ENABLED === 'true';
  let ventureType = null;
  if (wireframeGatingEnabled) {
    try {
      const { data: venture } = await supabase
        .from('ventures')
        .select('venture_type')
        .eq('id', ventureId)
        .single();
      ventureType = venture?.venture_type;
    } catch {
      // Non-fatal: venture_type lookup failure falls back to non-gated
    }
  }
  const wireframesRequired = wireframeGatingEnabled
    && (ventureType === 'ui' || ventureType === 'mixed');

  // If wireframes are required, add to completeness calculation
  if (wireframesRequired) {
    const stageArtifacts15 = artifactsByStage[15] || [];
    const hasWireframes = stageArtifacts15.some(
      a => a.artifact_type === ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES
    );
    totalExpected++;
    const blueprintPhase = phaseSummaries.find(p => p.phase_key === 'THE_BLUEPRINT');
    if (blueprintPhase) blueprintPhase.expected_count++;
    if (hasWireframes) {
      totalPresent++;
      if (blueprintPhase) {
        blueprintPhase.artifact_count++;
        blueprintPhase.completeness_pct = blueprintPhase.expected_count > 0
          ? Math.round((blueprintPhase.artifact_count / blueprintPhase.expected_count) * 1000) / 10
          : 100;
      }
    } else {
      const gap = {
        phase: 'The Blueprint',
        stage: 15,
        artifact_type: ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES,
        severity: 'high',
      };
      allGaps.push(gap);
      if (blueprintPhase) blueprintPhase.gaps.push(gap);
    }
    // Recalculate overall completeness
    const newCompleteness = totalExpected > 0
      ? Math.round((totalPresent / totalExpected) * 1000) / 10
      : 0;
    // Recalculate gate recommendation with wireframe gating
    if (newCompleteness < 80 || allGaps.filter(g => g.severity === 'critical').length > 0) {
      if (gateRecommendation === 'PASS') {
        gateRecommendation = hasWireframes ? 'PASS' : 'REVIEW_NEEDED';
        gateRationale = `Quality ${overallQuality}/100, completeness ${newCompleteness}%. Wireframe gating active (venture_type: ${ventureType}).`;
      }
    }
    logger.info(`[Stage17] Wireframe gating active: venture_type=${ventureType}, wireframes=${hasWireframes ? 'present' : 'missing'}`);
  }

  // ── Supplementary Artifacts (informational, non-gating) ──────
  const supplementaryArtifacts = {};

  // SRIP brand interview summary for IDENTITY phase
  const sripSummary = await fetchSripSummary(supabase, ventureId);
  if (sripSummary) {
    supplementaryArtifacts.srip_summary = sripSummary;
    logger.info('[Stage17] SRIP summary included as supplementary artifact');
  }

  // Wireframe artifacts for BLUEPRINT phase (supplementary when not required)
  if (!wireframesRequired) {
    try {
      const { data: wireframeArt } = await supabase
        .from('venture_artifacts')
        .select('id, metadata, created_at')
        .eq('venture_id', ventureId)
        .eq('artifact_type', ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES)
        .eq('is_current', true)
        .limit(1)
        .maybeSingle();

      if (wireframeArt) {
        supplementaryArtifacts.wireframes = {
          artifact_id: wireframeArt.id,
          screen_count: wireframeArt.metadata?.screen_count ?? null,
          created_at: wireframeArt.created_at,
          has_data: true,
        };
        logger.info('[Stage17] Wireframe artifact included as supplementary artifact');
      }
    } catch {
      // Non-fatal: wireframe lookup failure does not affect review
    }
  }

  const result = {
    phase_summaries: phaseSummaries,
    overall_quality_score: overallQuality,
    overall_completeness_pct: overallCompleteness,
    critical_gaps: allGaps,
    gate_recommendation: gateRecommendation,
    gate_rationale: gateRationale,
    artifact_count: totalPresent,
    expected_count: totalExpected,
    reviewed_at: new Date().toISOString(),
    ...(Object.keys(supplementaryArtifacts).length > 0
      ? { supplementary_artifacts: supplementaryArtifacts }
      : {}),
    ...(wireframeGatingEnabled
      ? { wireframe_gating: { enabled: true, venture_type: ventureType, wireframes_required: wireframesRequired } }
      : {}),
  };

  logger.info(`[Stage17] Blueprint review complete: ${gateRecommendation} (quality: ${overallQuality}, completeness: ${overallCompleteness}%)`);

  return result;
}
