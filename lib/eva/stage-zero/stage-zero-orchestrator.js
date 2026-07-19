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
import { createStageZeroDataFeed } from './data-feed.js';
import { generateForecast, calculateVentureScore } from './modeling.js';
import { loadStrategicContext } from './strategic-context-loader.js';
import { getActiveExperiment } from '../experiments/experiment-manager.js';
import { assignVariant } from '../experiments/experiment-assignment.js';
import { evaluateDual, defaultEvaluator } from '../experiments/dual-evaluator.js';

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
 * @param {Object} [deps.dataFeed] - External data feed (constructed here from deps.supabase
 *   when not supplied; a caller-provided feed — e.g. a test double — always wins)
 * @param {Function} [deps.synthesize] - Custom synthesis function (for testing)
 * @returns {Promise<Object>} Stage 0 result
 */
export async function executeStageZero(params, deps = {}) {
  const { path, pathParams = {}, options = {} } = params;
  const { supabase, logger = console, synthesize } = deps;
  const startTime = Date.now();
  const deadline = options.deadline || null;

  // Helper: check remaining time budget before expensive steps
  const checkBudget = (stepName, minMs = 30000) => {
    if (!deadline) return;
    const remaining = deadline - Date.now();
    if (remaining < minMs) {
      throw new Error(`Insufficient time for ${stepName}: ${Math.round(remaining / 1000)}s remaining, need ${Math.round(minMs / 1000)}s`);
    }
  };

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  logger.log('\n══════════════════════════════════════════════════');
  logger.log('   STAGE 0: VENTURE CREATION');
  logger.log('══════════════════════════════════════════════════\n');

  // Step 0: Load strategic context (mission, vision, OKR gaps, themes)
  const strategicContext = await loadStrategicContext(supabase, { logger });
  // SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-B: construct the Stage-0 dataFeed here —
  // the single production injection site. tech-trajectory.js has long accepted deps.dataFeed
  // and called getTechSignals(), but no caller ever built the object; this closes that gap by
  // backing it with Child A's standing reference table. A caller-provided deps.dataFeed (test
  // double) always wins; otherwise build one from the supabase client. It threads through
  // enrichedDeps -> runSynthesis -> analyzeTechTrajectory unchanged.
  const dataFeed = deps.dataFeed || createStageZeroDataFeed(supabase, { logger });
  const enrichedDeps = { ...deps, strategicContext, dataFeed };

  // Step 1: Execute the selected path
  logger.log(`   Path: ${getPathLabel(path)}`);
  logger.log('   ' + '─'.repeat(50));

  checkBudget('path execution', 60000);
  const pathOutput = await routePath(path, pathParams, enrichedDeps);

  if (!pathOutput) {
    return {
      success: false,
      reason: 'Path returned no output',
      duration_ms: Date.now() - startTime,
    };
  }

  // SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001 (CH-3): a router-screened anti-goal
  // disqualification stops the flow BEFORE synthesis — the chairman pre-excluded this
  // class; spending synthesis on it wastes slate slots. The reason is surfaced on the
  // result, never silently dropped.
  if (pathOutput.anti_goal_disqualification) {
    const d = pathOutput.anti_goal_disqualification;
    logger.warn(`   Anti-goal disqualification: ${d.reason}`);
    return {
      success: false,
      reason: `anti_goal_disqualified: ${d.anti_goal}`,
      anti_goal_disqualification: d,
      path_output: pathOutput,
      duration_ms: Date.now() - startTime,
    };
  }

  logger.log('   Path output received');

  // Step 2: Run synthesis (enriches path output with cross-references, portfolio context, etc.)
  let synthesisResult;
  const synthesizeFn = synthesize || runSynthesis;
  if (!options.skipSynthesis) {
    checkBudget('synthesis', 45000);
    logger.log('\n   Running synthesis...');
    synthesisResult = await synthesizeFn(pathOutput, enrichedDeps);
  } else {
    synthesisResult = buildDefaultBrief(pathOutput);
  }

  // Step 2b: Run horizontal forecast (financial projections)
  if (!options.skipSynthesis) {
    try {
      checkBudget('forecast', 30000);
      logger.log('\n   Generating financial forecast...');
      const forecast = await generateForecast(synthesisResult, enrichedDeps);
      const score = calculateVentureScore(forecast);
      synthesisResult.metadata = {
        ...synthesisResult.metadata,
        forecast,
        venture_score: score,
      };
      logger.log(`   Venture score: ${score}/100`);
    } catch (err) {
      logger.warn(`   Warning: Forecast generation failed: ${err.message}`);
      // H7 (Delta-ledger 41a2e6da): a throw here (distinct from generateForecast's own
      // internal catch, which never throws) previously left venture_score entirely
      // ABSENT from metadata — worse than a marked failure, it was silently missing.
      // Stamp an explicit, marked, below-neutral score so the run proceeds honestly.
      synthesisResult.metadata = {
        ...synthesisResult.metadata,
        venture_score: 0,
        forecast_failed: true,
      };
    }
  }

  // Step 2c: Experiment hook (non-blocking)
  let experimentContext = null;
  if (!options.skipExperiments) {
    try {
      const activeExperiment = await getActiveExperiment(enrichedDeps);
      if (activeExperiment && pathOutput.venture_id) {
        logger.log('\n   Active experiment detected: ' + activeExperiment.name);
        const { variant_key, assignment } = await assignVariant(enrichedDeps, {
          ventureId: pathOutput.venture_id,
          experiment: activeExperiment,
        });
        logger.log(`   Assigned to variant: ${variant_key}`);

        // Run dual evaluation in background (non-blocking)
        evaluateDual(enrichedDeps, {
          assignment,
          experiment: activeExperiment,
          synthesisResult,
          evaluateFn: deps.experimentEvaluator || defaultEvaluator,
        }).then(result => {
          logger.log(`   Experiment evaluation complete: ${result.variants_evaluated} variants scored`);
        }).catch(err => {
          logger.warn(`   Experiment evaluation failed (non-blocking): ${err.message}`);
        });

        experimentContext = { experiment_id: activeExperiment.id, variant_key };
      }
    } catch (err) {
      logger.warn(`   Experiment hook failed (non-blocking): ${err.message}`);
    }
  }

  // Step 3: Chairman review
  checkBudget('chairman review', 30000);
  logger.log('\n   Entering chairman review...');
  const reviewResult = await conductChairmanReview(synthesisResult, enrichedDeps);

  if (options.dryRun) {
    logger.log('\n   [DRY RUN] Skipping persistence');
    return {
      ...(pathOutput.result_extras || {}),
      success: true,
      dryRun: true,
      brief: reviewResult.brief,
      decision: reviewResult.decision,
      validation: reviewResult.validation,
      duration_ms: Date.now() - startTime,
    };
  }

  // Step 4: Persist
  const record = await persistVentureBrief(reviewResult, enrichedDeps);

  // Step 5: Pause for the chairman gate if ready
  // SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001: 'ready' no longer means active — the
  // venture is paused behind a PENDING chairman decision; activation happens on his approval
  // (decision-activation.js consumer). The old "Run: eva venture stage 1" instruction was false
  // the moment ready stopped self-approving.
  if (reviewResult.decision === 'ready') {
    logger.log(`\n   Venture paused awaiting chairman decision: ${record.id}`);
    if (record.stage_zero_decision_id) {
      logger.log(`   Pending decision: ${record.stage_zero_decision_id}`);
      logger.log(`   Resolve via: node scripts/eva-decisions.js approve ${record.stage_zero_decision_id} --rationale "..."`);
    }
  } else {
    logger.log(`\n   Venture parked in nursery (${reviewResult.decision}): ${record.id}`);
  }

  logger.log('\n══════════════════════════════════════════════════');
  logger.log(`   STAGE 0 COMPLETE (${Date.now() - startTime}ms)`);
  logger.log('══════════════════════════════════════════════════\n');

  return {
    // SD-LEO-INFRA-ACTIVATE-COMPETITIVE-INTELLIGENCE-001 (FR-2): a path may contribute
    // extra top-level result fields via pathOutput.result_extras (e.g. the competitor
    // teardown's projected differentiation_strategy/delta_gate/sanitization_status).
    // Spread FIRST so the core result fields below can never be clobbered.
    ...(pathOutput.result_extras || {}),
    success: true,
    decision: reviewResult.decision,
    record_id: record.id,
    record_type: reviewResult.decision === 'ready' ? 'venture' : 'nursery_entry',
    // SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001: downstream entry-path callers
    // (venture-intake-gates, clean-clone launch, discovery-mode-versions) surface the pause
    // instead of treating a non-active venture as failed.
    ...(reviewResult.decision === 'ready'
      ? { awaiting_chairman_decision: true, decision_id: record.stage_zero_decision_id || null }
      : {}),
    brief: reviewResult.brief,
    validation: reviewResult.validation,
    experiment: experimentContext,
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
