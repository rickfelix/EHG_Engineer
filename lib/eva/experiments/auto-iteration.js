/**
 * Auto-Iteration Loop
 *
 * Connects prompt promotion to experiment creation and pipeline burst triggering.
 * When a prompt is promoted, automatically:
 * 1. Creates a successor experiment with the winning prompt as champion
 * 2. Generates a new challenger via MetaOptimizer
 * 3. Triggers a pipeline burst via DemandEstimator
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-C
 */

import { EventEmitter } from 'events';
import { generateNextChallenger } from './meta-optimizer.js';
import { evaluatePromotion } from './prompt-promotion.js';

const DEFAULT_CONFIG = {
  maxIterations: 10,          // Safety limit on auto-iteration count
  cooldownMs: 30_000,         // Minimum time between iterations
  autoStart: false,           // Whether to start iteration on construction
};

export class AutoIterationLoop extends EventEmitter {
  /**
   * @param {Object} [config]
   * @param {number} [config.maxIterations=10] - Max auto-iterations before pause
   * @param {number} [config.cooldownMs=30000] - Cooldown between iterations
   * @param {Object} deps
   * @param {Object} deps.supabase - Supabase client
   * @param {Object} [deps.demandEstimator] - DemandEstimator instance
   * @param {Object} [deps.logger] - Logger instance
   */
  constructor(config = {}, deps = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.supabase = deps.supabase;
    this.demandEstimator = deps.demandEstimator || null;
    this.logger = deps.logger || console;

    this._iterationCount = 0;
    this._lastIterationAt = 0;
    this._running = false;
  }

  /**
   * Process a completed experiment — evaluate for promotion, and if promoted,
   * create successor experiment and trigger burst.
   *
   * @param {Object} params
   * @param {string} params.experimentId - Completed experiment ID
   * @param {Object} params.analysis - Output from analyzeExperiment()
   * @param {Object} params.experiment - Experiment record with variants
   * @returns {Promise<Object>} Iteration result
   */
  async processCompletion(params) {
    const { experimentId, analysis, experiment } = params;

    // Step 1: Evaluate for promotion
    const promotionResult = await evaluatePromotion(
      { supabase: this.supabase, logger: this.logger },
      { experimentId, analysis, experiment }
    );

    if (!promotionResult.promoted) {
      this.logger.log(
        `[AutoIteration] Experiment ${experimentId} not promoted: ${promotionResult.reason}`
      );
      this.emit('no-promotion', { experimentId, reason: promotionResult.reason });
      return { iterated: false, reason: promotionResult.reason };
    }

    // Step 2: Check safety limits
    if (this._iterationCount >= this.config.maxIterations) {
      this.logger.warn(
        `[AutoIteration] Max iterations reached (${this.config.maxIterations}) — pausing`
      );
      this.emit('max-iterations', { count: this._iterationCount });
      return { iterated: false, reason: 'max_iterations_reached' };
    }

    const now = Date.now();
    if (now - this._lastIterationAt < this.config.cooldownMs) {
      this.logger.warn('[AutoIteration] Cooldown active — skipping iteration');
      return { iterated: false, reason: 'cooldown_active' };
    }

    // Step 3: Create successor experiment
    const successor = await this._createSuccessorExperiment({
      promotionResult,
      previousExperiment: experiment,
      previousExperimentId: experimentId,
      analysis,
    });

    if (!successor) {
      return { iterated: false, reason: 'successor_creation_failed' };
    }

    // Step 4: Trigger pipeline burst via DemandEstimator
    if (this.demandEstimator) {
      this.demandEstimator.emit('burst-needed', {
        experimentId: successor.id,
        experimentName: successor.name,
        sampleCount: 0,
        target: this.demandEstimator.config?.minSamplesPerExperiment || 20,
        deficit: this.demandEstimator.config?.minSamplesPerExperiment || 20,
        burstBatchSize: this.demandEstimator.config?.burstBatchSize || 12,
        source: 'auto-iteration',
      });
    }

    this._iterationCount++;
    this._lastIterationAt = now;

    this.logger.log(
      `[AutoIteration] Iteration ${this._iterationCount}: ` +
      `promoted ${promotionResult.promptName} → experiment ${successor.id}`
    );

    this.emit('iteration-complete', {
      iteration: this._iterationCount,
      promotedPrompt: promotionResult.promptName,
      successorExperimentId: successor.id,
      successorExperimentName: successor.name,
    });

    return {
      iterated: true,
      iteration: this._iterationCount,
      promotion: promotionResult,
      successorExperiment: successor,
    };
  }

  /**
   * Reset the iteration counter (e.g., on daily reset or manual intervention).
   */
  resetCounter() {
    this._iterationCount = 0;
    this._lastIterationAt = 0;
    this.logger.log('[AutoIteration] Counter reset');
  }

  /**
   * Get current auto-iteration status.
   */
  status() {
    return {
      iterationCount: this._iterationCount,
      maxIterations: this.config.maxIterations,
      lastIterationAt: this._lastIterationAt
        ? new Date(this._lastIterationAt).toISOString()
        : null,
      cooldownMs: this.config.cooldownMs,
    };
  }

  // --- Internal ---

  async _createSuccessorExperiment(params) {
    const { promotionResult, previousExperiment, previousExperimentId, analysis } = params;
    const winnerPromptName = promotionResult.promptName;

    try {
      // Generate next challenger via MetaOptimizer
      const winnerVariant = analysis.per_variant?.[promotionResult.winner];
      const challenger = await generateNextChallenger(
        { supabase: this.supabase, logger: this.logger },
        {
          championPromptName: winnerPromptName,
          previousExperimentId,
          winnerPosterior: winnerVariant?.posterior,
        }
      );

      // Compute successor version
      const prevVersion = previousExperiment?.config?.version || 1;
      const successorName = `${previousExperiment?.name || 'experiment'}_v${prevVersion + 1}`;

      // Create the successor experiment
      const { data: newExp, error } = await this.supabase
        .from('experiments')
        .insert({
          name: successorName,
          status: 'active',
          variants: [
            {
              key: 'champion',
              prompt_name: winnerPromptName,
              description: `Promoted winner from experiment ${previousExperimentId}`,
            },
            {
              key: 'challenger',
              prompt_name: challenger.prompt_name,
              description: challenger.hypothesis,
            },
          ],
          config: {
            version: prevVersion + 1,
            predecessor_experiment_id: previousExperimentId,
            promoted_from: {
              experiment_id: previousExperimentId,
              winner_variant: promotionResult.winner,
              confidence: promotionResult.confidence,
            },
            auto_iteration: true,
            challenger_perturbation: challenger.perturbation_used,
          },
        })
        .select('id, name')
        .single();

      if (error) {
        this.logger.error(`[AutoIteration] Failed to create successor: ${error.message}`);
        this.emit('error', { phase: 'create-successor', error: error.message });
        return null;
      }

      this.logger.log(
        `[AutoIteration] Created successor experiment: ${newExp.name} (${newExp.id})`
      );

      return newExp;
    } catch (err) {
      this.logger.error(`[AutoIteration] Successor creation error: ${err.message}`);
      this.emit('error', { phase: 'create-successor', error: err.message });
      return null;
    }
  }
}
