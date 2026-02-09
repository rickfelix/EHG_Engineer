/**
 * Stage 0 Synthesis Engine
 *
 * Runs all synthesis components on a PathOutput to enrich it
 * before chairman review. Components from children F, G, H.
 *
 * Child F components (this release):
 * 1. Cross-Reference Intellectual Capital + Outcome History
 * 2. Portfolio-Aware Evaluation
 * 3. Active Problem Reframing
 *
 * Children G, H components (future):
 * 4. Moat Analysis
 * 5. Constraints Assessment
 * 6. Time-Horizon Positioning
 * 7. Archetype Detection
 * 8. Build Cost Estimation
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-F
 */

import { crossReferenceIntellectualCapital } from './cross-reference.js';
import { evaluatePortfolioFit } from './portfolio-evaluation.js';
import { reframeProblem } from './problem-reframing.js';

/**
 * Run all available synthesis components on a PathOutput.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Enriched venture brief with synthesis results
 */
export async function runSynthesis(pathOutput, deps = {}) {
  const { logger = console } = deps;

  logger.log('   Running synthesis engine (3/8 components)...');

  // Run all three Child F components
  const [crossRef, portfolio, reframing] = await Promise.all([
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
  ]);

  logger.log(`   Synthesis complete: cross-ref=${crossRef.relevance_score || 0}, portfolio=${portfolio.composite_score || 0}, reframings=${(reframing.reframings || []).length}`);

  // Build enriched brief
  const recommendedProblem = reframing.recommended_framing?.framing || pathOutput.suggested_problem;

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
    maturity: 'ready',
    metadata: {
      ...pathOutput.metadata,
      synthesis: {
        cross_reference: crossRef,
        portfolio_evaluation: portfolio,
        problem_reframing: reframing,
        components_run: 3,
        components_total: 8,
      },
    },
  };
}

export { crossReferenceIntellectualCapital, evaluatePortfolioFit, reframeProblem };
