/**
 * First Experiment Runner — Orchestrates the first end-to-end A/B experiment
 * using the Stage Zero evaluation pipeline.
 *
 * Lifecycle: create → assign → evaluate → analyze → report
 *
 * SD-MAN-ORCH-STAGE-ZERO-COLD-001-E
 *
 * @module lib/eva/experiments/first-experiment-runner
 */

import { createExperiment, startExperiment, stopExperiment } from './experiment-manager.js';
import { assignVariant } from './experiment-assignment.js';
import { evaluateDual, promptAwareEvaluator } from './dual-evaluator.js';
import { getExperimentOutcomes } from './dual-evaluator.js';
import { analyzeExperiment, generateReport } from './bayesian-analyzer.js';
import { generateProxyScores } from './proxy-metric-engine.js';

/**
 * Run the first live A/B experiment end-to-end.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} params
 * @param {string[]} params.ventureIds - Venture UUIDs to include
 * @param {string} [params.promptName] - Variant prompt name from leo_prompts (default: 'stage-00-acquirability-v2')
 * @param {Object} [params.analysisConfig] - Override Bayesian analyzer config
 * @returns {Promise<Object>} Experiment results with statistical analysis
 */
export async function runFirstExperiment(deps, params) {
  const { supabase, logger = console } = deps;
  const {
    ventureIds,
    promptName = 'stage-00-acquirability-v2',
    analysisConfig = {},
  } = params;

  if (!ventureIds || ventureIds.length === 0) {
    throw new Error('At least one ventureId is required');
  }

  const timeline = { started_at: new Date().toISOString() };

  // Step 1: Create experiment
  logger.log('   [Experiment] Creating experiment...');
  const experiment = await createExperiment(deps, {
    name: 'stage-zero-first-ab-test',
    hypothesis: 'An alternative evaluation prompt produces higher-quality venture scores than the default prompt',
    variants: [
      { key: 'control', label: 'Default Evaluation', weight: 1 },
      { key: 'variant_a', label: 'Alternative Prompt', weight: 1, prompt_name: promptName },
    ],
  });
  timeline.experiment_created = new Date().toISOString();

  // Step 2: Start experiment
  const runningExperiment = await startExperiment(deps, experiment.id);
  timeline.experiment_started = new Date().toISOString();

  // Step 3: Assign ventures to variants
  logger.log(`   [Experiment] Assigning ${ventureIds.length} ventures...`);
  const assignments = [];
  for (const ventureId of ventureIds) {
    const result = await assignVariant(deps, {
      ventureId,
      experiment: runningExperiment,
    });
    assignments.push(result);
  }
  timeline.assignments_complete = new Date().toISOString();

  // Step 4: Evaluate each venture with dual evaluator
  logger.log('   [Experiment] Running dual evaluations...');
  const evaluationResults = [];
  let provenanceSummary = { real: 0, proxy: 0 };

  for (const { assignment } of assignments) {
    // Build synthesis result — use proxy scores for cold-start
    const proxyScores = generateProxyScores(assignment.venture_id);
    const synthesisResult = buildSynthesisResult(proxyScores);
    provenanceSummary.proxy++;

    const evalResult = await evaluateDual(deps, {
      assignment,
      experiment: runningExperiment,
      synthesisResult,
      evaluateFn: promptAwareEvaluator,
    });

    evaluationResults.push({
      venture_id: assignment.venture_id,
      variant_key: assignment.variant_key,
      ...evalResult,
    });
  }
  timeline.evaluations_complete = new Date().toISOString();

  // Step 5: Collect outcomes and run Bayesian analysis
  logger.log('   [Experiment] Running Bayesian analysis...');
  const outcomes = await getExperimentOutcomes(deps, experiment.id);

  const analysis = analyzeExperiment(deps, {
    experiment: runningExperiment,
    outcomes,
    config: analysisConfig,
  });
  timeline.analysis_complete = new Date().toISOString();

  // Step 6: Stop experiment
  await stopExperiment(deps, experiment.id);
  timeline.experiment_stopped = new Date().toISOString();

  // Step 7: Generate report
  const report = generateReport(analysis);

  return {
    experiment_id: experiment.id,
    experiment_name: experiment.name,
    ventures_count: ventureIds.length,
    assignments: assignments.map(a => ({
      venture_id: a.assignment.venture_id,
      variant_key: a.variant_key,
      cached: a.cached,
    })),
    evaluations: evaluationResults.map(e => ({
      venture_id: e.venture_id,
      variants_evaluated: e.variants_evaluated,
      variants_failed: e.variants_failed,
    })),
    analysis,
    report,
    provenance: provenanceSummary,
    timeline,
  };
}

/**
 * Build a synthesis result object from proxy scores.
 * Maps proxy component scores to the metadata format expected by evaluators.
 *
 * @param {Array<{component: string, score: number, provenance: string}>} proxyScores
 * @returns {Object} Synthesis result with metadata
 */
function buildSynthesisResult(proxyScores) {
  const scoreMap = {};
  let totalScore = 0;

  for (const entry of proxyScores) {
    scoreMap[entry.component] = entry.score;
    totalScore += entry.score;
  }

  const avgScore = proxyScores.length > 0 ? totalScore / proxyScores.length : 0;

  return {
    metadata: {
      venture_score: Math.round(avgScore),
      chairman_confidence: scoreMap['chairman-constraints'] || 50,
      synthesis_quality: scoreMap['narrative-risk'] || 50,
      component_scores: scoreMap,
      provenance: 'proxy',
    },
  };
}
