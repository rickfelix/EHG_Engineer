/**
 * Stage 0 Synthesis Engine
 *
 * Runs all 8 synthesis components on a PathOutput to enrich it
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
import { resolveProfile, calculateWeightedScore } from '../profile-service.js';

/**
 * Run all 8 synthesis components on a PathOutput.
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

  logger.log('   Running synthesis engine (8/8 components)...');

  // Resolve evaluation profile (parallel with component execution)
  const profilePromise = resolveProfile(deps, profileId).catch(err => {
    logger.warn(`   Warning: Profile resolution failed: ${err.message}`);
    return null;
  });

  // Run all 8 components - grouped by dependency
  // Group 1 (no inter-dependencies): components 1-4, 6-8
  // Group 2 (depends on nothing but run separately): component 5 (chairman constraints)
  const [crossRef, portfolio, reframing, moat, timeHorizon, archetype, buildCost] = await Promise.all([
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
  ]);

  // Chairman constraints run after others (uses pathOutput directly, no inter-dependency)
  const constraints = await applyChairmanConstraints(pathOutput, deps).catch(err => {
    logger.warn(`   Warning: Chairman constraints failed: ${err.message}`);
    return { component: 'chairman_constraints', verdict: 'review', score: 0, summary: `Failed: ${err.message}` };
  });

  // Await profile resolution
  const profile = await profilePromise;

  // Calculate weighted score if profile is available
  const synthesisResults = {
    cross_reference: crossRef,
    portfolio_evaluation: portfolio,
    problem_reframing: reframing,
    moat_architecture: moat,
    chairman_constraints: constraints,
    time_horizon: timeHorizon,
    archetypes: archetype,
    build_cost: buildCost,
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

  logger.log(`   Synthesis complete: cross-ref=${crossRef.relevance_score || 0}, portfolio=${portfolio.composite_score || 0}, reframings=${(reframing.reframings || []).length}, moat=${moat.moat_score || 0}, constraints=${constraints.verdict || 'unknown'}, horizon=${timeHorizon.position || 'unknown'}, archetype=${archetype.primary_archetype || 'unknown'}, cost=${buildCost.complexity || 'unknown'}`);

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
        components_run: 8,
        components_total: 8,
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
};
