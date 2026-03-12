/**
 * Pipeline Executor
 *
 * Runs a single synthetic venture through the full Stage 0 pipeline:
 * 1. Insert venture into database with is_synthetic=true
 * 2. Execute Stage 0 evaluation (non-interactive)
 * 3. Record gate signals for experiment tracking
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-A
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Whether the execution completed without error
 * @property {string} ventureId - Database ID of the created venture
 * @property {string} archetype - Archetype key used
 * @property {Object} [stageZeroResult] - Result from executeStageZero
 * @property {string} [error] - Error message if failed
 * @property {number} durationMs - Total execution time
 */

export class PipelineExecutor {
  /**
   * @param {Object} deps - Injected dependencies
   * @param {Object} deps.supabase - Supabase client
   * @param {Object} [deps.logger] - Logger instance
   * @param {Function} [deps.executeStageZero] - Stage 0 executor function
   * @param {Function} [deps.recordGateSignal] - Gate signal recorder
   */
  constructor(deps = {}) {
    this.supabase = deps.supabase;
    this.logger = deps.logger || console;
    this.executeStageZero = deps.executeStageZero;
    this.recordGateSignal = deps.recordGateSignal;
  }

  /**
   * Execute a single synthetic venture through the pipeline.
   *
   * @param {Object} ventureData - Venture data from SyntheticVentureFactory
   * @returns {Promise<ExecutionResult>}
   */
  async execute(ventureData) {
    const start = Date.now();
    const result = {
      success: false,
      ventureId: null,
      archetype: ventureData.archetype,
      durationMs: 0,
    };

    try {
      // Step 1: Insert synthetic venture into database
      const ventureId = await this._insertVenture(ventureData);
      result.ventureId = ventureId;

      // Step 2: Execute Stage 0 evaluation
      if (this.executeStageZero) {
        const stageZeroResult = await this._runStageZero(ventureId, ventureData);
        result.stageZeroResult = stageZeroResult;

        // Step 3: Record gate signal for experiment tracking
        if (this.recordGateSignal && stageZeroResult) {
          await this._recordSignal(ventureId, stageZeroResult);
        }
      } else {
        this.logger.log('   [PipelineExecutor] executeStageZero not provided — skipping evaluation');
      }

      result.success = true;
    } catch (error) {
      result.error = error.message;
      this.logger.error(`   [PipelineExecutor] Failed for ${ventureData.name}: ${error.message}`);
    }

    result.durationMs = Date.now() - start;
    return result;
  }

  /**
   * Insert a synthetic venture into the ventures table.
   */
  async _insertVenture(ventureData) {
    if (!this.supabase) {
      throw new Error('supabase client is required');
    }

    // Build insert payload — only include fields the ventures table accepts
    const payload = {
      name: ventureData.name,
      description: ventureData.description,
      problem_statement: ventureData.problem_statement,
      target_market: ventureData.target_market,
      origin_type: ventureData.origin_type,
      current_lifecycle_stage: 0,
      status: 'active',
      archetype: ventureData.archetype,
      metadata: {
        ...ventureData.metadata,
        synthetic_metadata: ventureData.synthetic_metadata,
        is_synthetic: true,
      },
    };

    const { data, error } = await this.supabase
      .from('ventures')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Venture insert failed: ${error.message}`);
    }

    this.logger.log(`   [PipelineExecutor] Created venture ${data.id} (${ventureData.archetype})`);
    return data.id;
  }

  /**
   * Run Stage 0 evaluation on the venture.
   */
  async _runStageZero(ventureId, ventureData) {
    const params = {
      path: 'discovery_mode',
      pathParams: {
        suggested_name: ventureData.name,
        suggested_problem: ventureData.problem_statement,
        suggested_solution: ventureData.metadata?.stage_zero?.solution || '',
        target_market: ventureData.target_market,
        origin_type: ventureData.origin_type,
      },
      options: {
        nonInteractive: true,
        skipExperiments: false,
      },
    };

    const deps = {
      supabase: this.supabase,
      logger: this.logger,
    };

    const result = await this.executeStageZero(params, deps);

    this.logger.log(`   [PipelineExecutor] Stage 0 result: ${result.success ? 'SUCCESS' : 'FAILED'} — decision: ${result.decision}`);
    return result;
  }

  /**
   * Record a gate signal for experiment outcome tracking.
   */
  async _recordSignal(ventureId, stageZeroResult) {
    try {
      await this.recordGateSignal(
        { supabase: this.supabase, logger: this.logger },
        {
          ventureId,
          gateBoundary: 'stage_0_synthetic',
          signalType: 'pipeline_execution',
          outcome: stageZeroResult.success ? 'pass' : 'fail',
          profile: {
            decision: stageZeroResult.decision,
            duration_ms: stageZeroResult.duration_ms,
            source: 'synthetic_pipeline',
          },
        }
      );
    } catch (error) {
      // Non-blocking: gate signal failure shouldn't fail the pipeline
      this.logger.warn(`   [PipelineExecutor] Gate signal recording failed (non-fatal): ${error.message}`);
    }
  }
}
