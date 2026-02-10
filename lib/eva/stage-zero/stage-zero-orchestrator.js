/**
 * Stage 0 Orchestrator
 *
 * Coordinates the full Stage 0 venture creation flow:
 * 1. Present entry path options
 * 2. Execute selected path
 * 3. Run synthesis step (enriches path output)
 * 4. Conduct chairman review
 * 5. Persist result (venture or nursery entry)
 * 6. Hand off to Stage 1 if approved
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-B
 */

import { routePath, ENTRY_PATHS, PATH_OPTIONS, listDiscoveryStrategies } from './path-router.js';
import { conductChairmanReview, persistVentureBrief } from './chairman-review.js';
import { runSynthesis } from './synthesis/index.js';
import { generateForecast, calculateVentureScore } from './modeling.js';

/**
 * Execute the full Stage 0 flow.
 *
 * @param {Object} params
 * @param {string} params.path - Entry path key (from ENTRY_PATHS)
 * @param {Object} params.pathParams - Parameters for the selected path
 * @param {Object} [params.options] - Additional options
 * @param {boolean} [params.options.nonInteractive=false] - Skip interactive prompts
 * @param {boolean} [params.options.dryRun=false] - Skip persistence
 * @param {boolean} [params.options.skipSynthesis=false] - Skip synthesis (for testing)
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @param {Function} [deps.synthesize] - Custom synthesis function (for testing)
 * @returns {Promise<Object>} Stage 0 result
 */
export async function executeStageZero(params, deps = {}) {
  const { path, pathParams = {}, options = {} } = params;
  const { supabase, logger = console, synthesize } = deps;
  const startTime = Date.now();

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  logger.log('\n══════════════════════════════════════════════════');
  logger.log('   STAGE 0: VENTURE CREATION');
  logger.log('══════════════════════════════════════════════════\n');

  // Step 1: Execute the selected path
  logger.log(`   Path: ${getPathLabel(path)}`);
  logger.log('   ' + '─'.repeat(50));

  const pathOutput = await routePath(path, pathParams, deps);

  if (!pathOutput) {
    return {
      success: false,
      reason: 'Path returned no output',
      duration_ms: Date.now() - startTime,
    };
  }

  logger.log('   Path output received');

  // Step 2: Run synthesis (enriches path output with cross-references, portfolio context, etc.)
  let synthesisResult;
  const synthesizeFn = synthesize || runSynthesis;
  if (!options.skipSynthesis) {
    logger.log('\n   Running synthesis...');
    synthesisResult = await synthesizeFn(pathOutput, deps);
  } else {
    synthesisResult = buildDefaultBrief(pathOutput);
  }

  // Step 2b: Run horizontal forecast (financial projections)
  if (!options.skipSynthesis) {
    try {
      logger.log('\n   Generating financial forecast...');
      const forecast = await generateForecast(synthesisResult, deps);
      const score = calculateVentureScore(forecast);
      synthesisResult.metadata = {
        ...synthesisResult.metadata,
        forecast,
        venture_score: score,
      };
      logger.log(`   Venture score: ${score}/100`);
    } catch (err) {
      logger.warn(`   Warning: Forecast generation failed: ${err.message}`);
    }
  }

  // Step 3: Chairman review
  logger.log('\n   Entering chairman review...');
  const reviewResult = await conductChairmanReview(synthesisResult, deps);

  if (options.dryRun) {
    logger.log('\n   [DRY RUN] Skipping persistence');
    return {
      success: true,
      dryRun: true,
      brief: reviewResult.brief,
      decision: reviewResult.decision,
      validation: reviewResult.validation,
      duration_ms: Date.now() - startTime,
    };
  }

  // Step 4: Persist
  const record = await persistVentureBrief(reviewResult, deps);

  // Step 5: Hand off to Stage 1 if ready
  if (reviewResult.decision === 'ready') {
    logger.log(`\n   Venture ready for Stage 1: ${record.id}`);
    logger.log('   Run: eva venture stage 1 --venture ' + record.id);
  } else {
    logger.log(`\n   Venture parked in nursery (${reviewResult.decision}): ${record.id}`);
  }

  logger.log('\n══════════════════════════════════════════════════');
  logger.log(`   STAGE 0 COMPLETE (${Date.now() - startTime}ms)`);
  logger.log('══════════════════════════════════════════════════\n');

  return {
    success: true,
    decision: reviewResult.decision,
    record_id: record.id,
    record_type: reviewResult.decision === 'ready' ? 'venture' : 'nursery_entry',
    brief: reviewResult.brief,
    validation: reviewResult.validation,
    duration_ms: Date.now() - startTime,
  };
}

/**
 * Build a default venture brief from path output (when synthesis is not available).
 *
 * @param {Object} pathOutput - The path output
 * @returns {Object} Venture brief shape
 */
function buildDefaultBrief(pathOutput) {
  return {
    name: pathOutput.suggested_name,
    problem_statement: pathOutput.suggested_problem,
    solution: pathOutput.suggested_solution,
    target_market: pathOutput.target_market,
    origin_type: pathOutput.origin_type,
    raw_chairman_intent: pathOutput.suggested_problem,
    competitor_ref: pathOutput.competitor_urls,
    blueprint_id: pathOutput.blueprint_id,
    discovery_strategy: pathOutput.discovery_strategy,
    maturity: 'ready',
    metadata: pathOutput.metadata,
  };
}

/**
 * Get display label for a path key.
 */
function getPathLabel(pathKey) {
  const option = PATH_OPTIONS.find(o => o.key === pathKey);
  return option ? option.label : pathKey;
}

export { ENTRY_PATHS, PATH_OPTIONS, listDiscoveryStrategies };
