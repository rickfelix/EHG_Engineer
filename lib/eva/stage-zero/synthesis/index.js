/**
 * Stage 0 Synthesis Engine
 *
 * Runs all 9 synthesis components on a PathOutput to enrich it
 * before chairman review. Optionally applies an evaluation profile
 * for weighted scoring.
 *
 * Child F components (1-3):
 * 1. Cross-Reference Intellectual Capital + Outcome History
 * 2. Portfolio-Aware Evaluation
 * 3. Active Problem Reframing
 *
 * Child G components (4-6):
 * 4. Moat Architecture
 * 5. Chairman Constraints
 * 6. Time-Horizon Positioning
 *
 * Child H components (7-8):
 * 7. Venture Archetype Recognition
 * 8. Build Cost Estimation
 *
 * Component 9 (SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-A):
 * 9. Virality Analysis
 *
 * Component 10 (SD-EVA-FEAT-DESIGN-PERSONA-001):
 * 10. Design Evaluation
 *
 * Component 11 (SD-LEO-FIX-BRAINSTORM-NARRATIVE-RISK-001):
 * 11. Narrative Risk Analysis (advisory signal — not in weighted composite)
 *
 * Component 12 (SD-LEO-FEAT-TECHNOLOGY-TRAJECTORY-MODEL-001):
 * 12. Technology Trajectory Model (advisory weight 0.05 in weighted composite)
 *
 * Profile System (SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-B):
 * - Resolves evaluation profile (explicit, active, or legacy defaults)
 * - Calculates weighted venture score from component results
 * - Includes profile metadata + weighted breakdown in output
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-F/G/H
 */

import { crossReferenceIntellectualCapital } from './cross-reference.js';
import { evaluatePortfolioFit } from './portfolio-evaluation.js';
import { reframeProblem } from './problem-reframing.js';
import { designMoat } from './moat-architecture.js';
import { applyChairmanConstraints } from './chairman-constraints.js';
import { assessTimeHorizon } from './time-horizon.js';
import { classifyArchetype } from './archetypes.js';
import { estimateBuildCost } from './build-cost-estimation.js';
import { analyzeVirality } from './virality.js';
import { evaluateDesignPotential } from './design-evaluation.js';
import { analyzeNarrativeRisk } from './narrative-risk.js';
import { analyzeTechTrajectory } from './tech-trajectory.js';
import { resolveProfile, calculateWeightedScore } from '../profile-service.js';

/**
 * Run all 12 synthesis components on a PathOutput.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @param {string} [deps.profileId] - Explicit evaluation profile UUID
 * @returns {Promise<Object>} Enriched venture brief with synthesis results
 */
export async function runSynthesis(pathOutput, deps = {}) {
  const { logger = console, profileId } = deps;

  logger.log('   Running synthesis engine (12/12 components)...');

  // Resolve evaluation profile (parallel with component execution)
  const profilePromise = resolveProfile(deps, profileId).catch(err => {
    logger.warn(`   Warning: Profile resolution failed: ${err.message}`);
    return null;
  });

  // Run all 10 components - grouped by dependency
  // Group 1 (no inter-dependencies): components 1-4, 6-10
  // Group 2 (depends on nothing but run separately): component 5 (chairman constraints)
  const [crossRef, portfolio, reframing, moat, timeHorizon, archetype, buildCost, virality, design, narrativeRisk, techTrajectory] = await Promise.all([
    crossReferenceIntellectualCapital(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Cross-reference failed: ${err.message}`);
      return { component: 'cross_reference', matches: [], lessons: [], relevance_score: 0, summary: `Failed: ${err.message}` };
    }),
    evaluatePortfolioFit(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Portfolio evaluation failed: ${err.message}`);
      return { component: 'portfolio_evaluation', dimensions: {}, composite_score: 0, summary: `Failed: ${err.message}` };
    }),
    reframeProblem(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Problem reframing failed: ${err.message}`);
      return { component: 'problem_reframing', reframings: [], summary: `Failed: ${err.message}` };
    }),
    designMoat(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Moat design failed: ${err.message}`);
      return { component: 'moat_architecture', primary_moat: null, secondary_moats: [], moat_score: 0, summary: `Failed: ${err.message}` };
    }),
    assessTimeHorizon(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Time-horizon assessment failed: ${err.message}`);
      return { component: 'time_horizon', position: 'build_now', confidence: 0, summary: `Failed: ${err.message}` };
    }),
    classifyArchetype(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Archetype classification failed: ${err.message}`);
      return { component: 'archetypes', primary_archetype: 'automator', primary_confidence: 0, summary: `Failed: ${err.message}` };
    }),
    estimateBuildCost(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Build cost estimation failed: ${err.message}`);
      return { component: 'build_cost', complexity: 'moderate', summary: `Failed: ${err.message}` };
    }),
    analyzeVirality(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Virality analysis failed: ${err.message}`);
      return { component: 'virality_analysis', virality_score: 0, k_factor: 0, cycle_time_days: 0, mechanic_type: 'word_of_mouth', channel_fit: 0, shareability: 0, decay_rate: 0, organic_ratio: 0, growth_loops: [], viral_channels: [], compounding_factors: '', risks: [], summary: `Failed: ${err.message}` };
    }),
    evaluateDesignPotential(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Design evaluation failed: ${err.message}`);
      return { component: 'design_evaluation', dimensions: { ux_simplicity: 0, design_differentiation: 0, adoption_friction: 0, design_scalability: 0, aesthetic_moat: 0 }, composite_score: 0, design_risks: [], design_opportunities: [], recommendation: 'design_minimal', summary: `Failed: ${err.message}` };
    }),
    analyzeNarrativeRisk(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Narrative risk analysis failed: ${err.message}`);
      return { component: 'narrative_risk', nr_score: 0, nr_band: 'NR-Unknown', nr_interpretation: 'Analysis unavailable', component_scores: { decision_sensitivity: 0, demand_distortion: 0, hype_persistence: 0, influence_exposure: 0 }, narrative_flags: [], confidence: 0, confidence_caveat: 'Analysis failed.', summary: `Failed: ${err.message}` };
    }),
    analyzeTechTrajectory(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Technology trajectory analysis failed: ${err.message}`);
      return { component: 'tech_trajectory', trajectory_score: 0, axes: { reasoning_autonomy: { current: 0, bull_6m: 0, base_6m: 0, bear_6m: 0, venture_impact: '' }, cost_deflation: { current: 0, bull_6m: 0, base_6m: 0, bear_6m: 0, venture_impact: '' }, multimodal_expansion: { current: 0, bull_6m: 0, base_6m: 0, bear_6m: 0, venture_impact: '' } }, competitive_timing: { signal: 'contested', confidence: 0, window_months: 0, rationale: '' }, next_disruption_event: { event: 'Unknown', estimated_months: 0, invalidation_scope: 'Unknown' }, gap_windows: [], confidence_caveat: 'Analysis failed.', summary: `Failed: ${err.message}`, data_feed_active: false };
    }),
  ]);

  // Chairman constraints run after others (uses pathOutput directly, no inter-dependency)
  const constraints = await applyChairmanConstraints(pathOutput, deps).catch(err => {
    logger.warn(`   Warning: Chairman constraints failed: ${err.message}`);
    return { component: 'chairman_constraints', verdict: 'review', score: 0, summary: `Failed: ${err.message}` };
  });

  // Await profile resolution
  const profile = await profilePromise;

  // Calculate weighted score if profile is available
  // Note: narrative_risk is advisory only — excluded from weighted composite
  const synthesisResults = {
    cross_reference: crossRef,
    portfolio_evaluation: portfolio,
    problem_reframing: reframing,
    moat_architecture: moat,
    chairman_constraints: constraints,
    time_horizon: timeHorizon,
    archetypes: archetype,
    build_cost: buildCost,
    virality: virality,
    design_evaluation: design,
    tech_trajectory: techTrajectory,
  };

  let profileMetadata = null;
  let weightedScore = null;

  if (profile) {
    const scoreResult = calculateWeightedScore(synthesisResults, profile.weights);
    weightedScore = scoreResult;
    profileMetadata = {
      name: profile.name,
      version: profile.version,
      source: profile.source,
      weights_used: profile.weights,
    };
    logger.log(`   Profile: ${profile.name} v${profile.version} (${profile.source}) → weighted score: ${scoreResult.total_score}/100`);
  }

  // Aggregate token usage from all components
  const componentUsages = [crossRef, portfolio, reframing, moat, timeHorizon, archetype, buildCost, virality, design, narrativeRisk, techTrajectory]
    .map(c => c.usage)
    .filter(Boolean);
  const usage = componentUsages.length > 0 ? {
    inputTokens: componentUsages.reduce((sum, u) => sum + (u.inputTokens || 0), 0),
    outputTokens: componentUsages.reduce((sum, u) => sum + (u.outputTokens || 0), 0),
  } : null;

  logger.log(`   Synthesis complete: cross-ref=${crossRef.relevance_score || 0}, portfolio=${portfolio.composite_score || 0}, reframings=${(reframing.reframings || []).length}, moat=${moat.moat_score || 0}, constraints=${constraints.verdict || 'unknown'}, horizon=${timeHorizon.position || 'unknown'}, archetype=${archetype.primary_archetype || 'unknown'}, cost=${buildCost.complexity || 'unknown'}, virality=${virality.virality_score || 0}, design=${design.composite_score || 0}, narrative_risk=${narrativeRisk.nr_score || 0} (${narrativeRisk.nr_band || 'unknown'}), tech_trajectory=${techTrajectory.trajectory_score || 0} (${techTrajectory.competitive_timing?.signal || 'unknown'})`);

  // Build enriched brief
  const recommendedProblem = reframing.recommended_framing?.framing || pathOutput.suggested_problem;

  // Determine maturity based on constraint verdict and time horizon
  const maturity = constraints.verdict === 'fail' ? 'blocked'
    : timeHorizon.position === 'park_and_build_later' ? 'nursery'
    : 'ready';

  return {
    name: pathOutput.suggested_name,
    problem_statement: recommendedProblem,
    solution: pathOutput.suggested_solution,
    target_market: pathOutput.target_market,
    origin_type: pathOutput.origin_type,
    raw_chairman_intent: pathOutput.suggested_problem,
    competitor_ref: pathOutput.competitor_urls,
    blueprint_id: pathOutput.blueprint_id,
    discovery_strategy: pathOutput.discovery_strategy,
    maturity,
    usage,
    metadata: {
      ...pathOutput.metadata,
      synthesis: {
        cross_reference: crossRef,
        portfolio_evaluation: portfolio,
        problem_reframing: reframing,
        moat_architecture: moat,
        chairman_constraints: constraints,
        time_horizon: timeHorizon,
        archetypes: archetype,
        build_cost: buildCost,
        virality: virality,
        design_evaluation: design,
        narrative_risk: narrativeRisk,
        tech_trajectory: techTrajectory,
        components_run: 12,
        components_total: 12,
        profile: profileMetadata,
        weighted_score: weightedScore,
      },
    },
  };
}

export {
  crossReferenceIntellectualCapital,
  evaluatePortfolioFit,
  reframeProblem,
  designMoat,
  applyChairmanConstraints,
  assessTimeHorizon,
  classifyArchetype,
  estimateBuildCost,
  analyzeVirality,
  evaluateDesignPotential,
  analyzeNarrativeRisk,
  analyzeTechTrajectory,
};
