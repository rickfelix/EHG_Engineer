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
import { recordGateResult } from '../../artifact-persistence-service.js';
import { createOrReusePendingDecision } from '../../chairman-decision-watcher.js';

/**
 * Maximum characters per build_brief section to stay under 2000 token budget.
 */
const MAX_SECTION_CHARS = 150;

/**
 * Truncate text to a maximum character length at a word boundary.
 */
function truncate(text, maxLen = MAX_SECTION_CHARS) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(' ', maxLen);
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, maxLen)) + '...';
}

/**
 * Extract a string value from an artifact's data, trying multiple field paths.
 */
function extract(artifact, ...paths) {
  if (!artifact?.artifact_data) return '';
  const data = artifact.artifact_data;
  for (const path of paths) {
    const val = data[path];
    if (typeof val === 'string' && val.length > 0) return truncate(val);
    if (Array.isArray(val) && val.length > 0) {
      return truncate(val.map(v => typeof v === 'string' ? v : v?.name || v?.title || JSON.stringify(v)).join('; '));
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return truncate(JSON.stringify(val));
    }
  }
  return '';
}

/**
 * Synthesize a build brief from already-loaded venture artifacts (stages 1-16).
 * Pure extraction — no LLM calls, no additional DB queries.
 *
 * @param {Object} artifactsByStage - Map of stage number → artifact array
 * @param {Object} requiredArtifacts - Map of stage → required artifact type
 * @returns {Object} build_brief with 12 string sections
 */
export function synthesizeBuildBrief(artifactsByStage, requiredArtifacts) {
  const get = (stage) => {
    const arts = artifactsByStage[stage] || [];
    const reqType = requiredArtifacts[stage];
    return arts.find(a => a.artifact_type === reqType) || arts[0] || null;
  };

  return {
    problem_and_value: extract(get(1), 'problemStatement', 'valueProp', 'description'),
    competitive_edge: extract(get(4), 'stage5Handoff', 'competitors'),
    financial_model: extract(get(5), 'unitEconomics', 'decision', 'assumptions'),
    risk_matrix: extract(get(6), 'highest_risk_factor', 'aggregate_risk_score', 'risks'),
    pricing_strategy: extract(get(7), 'rationale', 'tiers', 'pricing_model'),
    business_model: extract(get(8), 'valuePropositions', 'revenueStreams', 'customerSegments'),
    customer_personas: extract(get(10), 'customerPersonas', 'brandPersonality', 'candidates'),
    brand_identity: extract(get(11), 'visualIdentity', 'brandExpression', 'namingStrategy'),
    gtm_strategy: extract(get(12), 'channels', 'salesModel', 'marketTiers'),
    product_roadmap: extract(get(13), 'vision_statement', 'milestones', 'phases'),
    architecture: extract(get(14), 'architecture_summary', 'layers', 'dataEntities'),
    srip: extract(get(15), 'risks', 'wireframes'),
  };
}

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
    .select('id, lifecycle_stage, artifact_type, is_current, metadata, created_at, artifact_data')
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

  // ── Stitch project precondition (SD-EVA-FIX-WIREFRAME-CONTRACT-AND-SILENT-DEGRADATION-001) ──
  const wireframeGatingEnabled = process.env.EVA_WIREFRAME_GATING_ENABLED === 'true';
  if (wireframeGatingEnabled) {
    // Check venture_stage_work for stitch_project artifact from S15
    const { data: stageWork } = await supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 15)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const stitchStatus = stageWork?.advisory_data?.stitch_hook_status;
    const hasStitchProject = stitchStatus === 'success' || stitchStatus === 'available';
    if (!hasStitchProject) {
      const msg = `[Stage17] BLOCKED: stitch_project artifact missing from S15 (stitch_hook_status=${stitchStatus || 'null'}). ` +
        'EVA_WIREFRAME_GATING_ENABLED=true requires a real Stitch project before blueprint review can proceed.';
      logger.error(msg);
      throw new Error(msg);
    }
    logger.info('[Stage17] Stitch project precondition satisfied');
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

  // Gate recommendation (thresholds configurable via stageConfig)
  const thresholds = stageConfig?.promotion_thresholds || { pass: 70, review: 50, completeness_pass: 80, completeness_review: 60 };
  const criticalGaps = allGaps.filter(g => g.severity === 'critical');
  let gateRecommendation = 'FAIL';
  let gateRationale = '';

  if (overallQuality >= thresholds.pass && criticalGaps.length === 0 && overallCompleteness >= (thresholds.completeness_pass || 80)) {
    gateRecommendation = 'PASS';
    gateRationale = `Quality ${overallQuality}/100, completeness ${overallCompleteness}%. All critical artifacts present.`;
  } else if (overallQuality >= thresholds.review && criticalGaps.length <= 2) {
    gateRecommendation = 'REVIEW_NEEDED';
    gateRationale = `Quality ${overallQuality}/100, completeness ${overallCompleteness}%. ${allGaps.length} gap(s) found, ${criticalGaps.length} critical.`;
  } else {
    gateRationale = `Quality ${overallQuality}/100, completeness ${overallCompleteness}%. ${criticalGaps.length} critical gap(s). Not ready for BUILD.`;
  }

  // ── Conditional Wireframe Gating (Phase 2) ──────────────────
  // When EVA_WIREFRAME_GATING_ENABLED and venture is ui/mixed,
  // wireframes move from supplementary to required at Stage 15.
  // wireframeGatingEnabled already declared above (line 167)
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

  // ── Build Brief Synthesis (SD-LEO-FEAT-STAGE-BUILD-BRIEF-001) ──────
  const build_brief = synthesizeBuildBrief(artifactsByStage, REQUIRED_ARTIFACTS_BY_STAGE);
  logger.info(`[Stage17] Build brief synthesized: ${Object.values(build_brief).filter(v => v.length > 0).length}/12 sections populated`);

  const result = {
    phase_summaries: phaseSummaries,
    overall_quality_score: overallQuality,
    overall_completeness_pct: overallCompleteness,
    critical_gaps: allGaps,
    gate_recommendation: gateRecommendation,
    gate_rationale: gateRationale,
    artifact_count: totalPresent,
    expected_count: totalExpected,
    build_brief,
    reviewed_at: new Date().toISOString(),
    ...(Object.keys(supplementaryArtifacts).length > 0
      ? { supplementary_artifacts: supplementaryArtifacts }
      : {}),
    ...(wireframeGatingEnabled
      ? { wireframe_gating: { enabled: true, venture_type: ventureType, wireframes_required: wireframesRequired } }
      : {}),
  };

  logger.info(`[Stage17] Blueprint review complete: ${gateRecommendation} (quality: ${overallQuality}, completeness: ${overallCompleteness}%)`);

  // ── Gate Result Persistence (SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-B) ──
  // Persist gate evaluation to eva_stage_gate_results for audit trail
  const perPhaseScores = {};
  for (const ps of phaseSummaries) {
    perPhaseScores[ps.phase_key.toLowerCase()] = ps.avg_quality_score;
  }
  try {
    await recordGateResult(supabase, {
      ventureId,
      stageNumber: 17,
      gateType: 'exit',
      passed: gateRecommendation === 'PASS',
      score: overallQuality,
      metadata: JSON.stringify({
        per_phase_scores: perPhaseScores,
        gap_details: allGaps,
        completeness_pct: overallCompleteness,
        gate_recommendation: gateRecommendation,
      }),
    });
    logger.info(`[Stage17] Gate result persisted: ${gateRecommendation} (score: ${overallQuality})`);
  } catch (err) {
    logger.warn(`[Stage17] Gate result persistence failed (non-fatal): ${err.message}`);
  }

  // ── Quality-Dependent Chairman Decision Pre-Creation ──
  // PASS: pre-create approved decision so worker auto-advances
  // REVIEW_NEEDED/FAIL: create pending decision with quality context
  try {
    const briefData = {
      stage: 17,
      gate_recommendation: gateRecommendation,
      overall_quality: overallQuality,
      completeness_pct: overallCompleteness,
      critical_gaps: criticalGaps.length,
      per_phase_scores: perPhaseScores,
    };

    const { id: decisionId } = await createOrReusePendingDecision({
      ventureId,
      stageNumber: 17,
      briefData,
      summary: `Blueprint Review: ${gateRecommendation} (quality: ${overallQuality}, completeness: ${overallCompleteness}%)`,
      supabase,
      logger,
    });

    if (gateRecommendation === 'PASS') {
      // Auto-approve: worker _handleChairmanGate finds approved decision → auto-advances
      await supabase
        .from('chairman_decisions')
        .update({ status: 'approved', decision: 'approve', resolved_at: new Date().toISOString() })
        .eq('id', decisionId);
      logger.info(`[Stage17] PASS — chairman decision auto-approved: ${decisionId}`);
    } else {
      logger.info(`[Stage17] ${gateRecommendation} — chairman decision pending: ${decisionId}`);
    }
  } catch (err) {
    logger.warn(`[Stage17] Chairman decision pre-creation failed (non-fatal): ${err.message}`);
  }

  return result;
}
